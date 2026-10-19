// Telegram 个人号渠道（GramJS，官方 MTProto API）。
// 号池 v2（2026-10-20）：支持一个 workspace 登录多个 TG 个人号（多槽位）。
// - 主槽位 slotId='default'：StringSession 等持久化沿用 Workspace.tgPersonal 子文档（向后兼容）
// - 附加槽位：持久化在 Workspace.tgPersonalSlots[]，apiId/apiHash 共用主槽（tgPersonal.apiId/apiHash）配置
// - 内存状态按 `${workspaceId}:${slotId}` 分键；所有旧导出追加可选 slotId 参数，缺省 'default' 行为不变
const sessions = new Map(); // `${workspaceId}:${slotId}` -> { client, status, phone, username, error, pending, qr, handlerAttached }

const DEFAULT_SLOT = 'default';

// QR 登录的默认应用凭据（Telegram Desktop 公开的凭据）；可被 env 或 workspace 配置覆盖。
const DEFAULT_API_ID = process.env.TG_API_ID || '2040';
const DEFAULT_API_HASH = process.env.TG_API_HASH || 'b18441a1ff607e10a989891a5462e627';

// 内存状态：按 workspace + 槽位 取；不存在则初始化为 disconnected
function getState(workspaceId, slotId = DEFAULT_SLOT) {
  const key = `${String(workspaceId)}:${String(slotId || DEFAULT_SLOT)}`;
  if (!sessions.has(key)) sessions.set(key, { client: null, status: 'disconnected', phone: '', username: '', error: '', pending: {} });
  return sessions.get(key);
}

function waitFor(state, kind) {
  state.status = kind === 'code' ? 'awaiting_code' : 'awaiting_password';
  return new Promise((resolve) => { state.pending[kind] = resolve; });
}

async function buildClient(sessionStr, apiId, apiHash) {
  const { TelegramClient } = require('telegram');
  const { StringSession } = require('telegram/sessions');
  const client = new TelegramClient(new StringSession(sessionStr || ''), Number(apiId), String(apiHash), {
    connectionRetries: 5,
  });
  return client;
}

// 槽位字段持久化：default 走 tgPersonal.* 老路径；附加槽走 tgPersonalSlots.$[s].*（arrayFilters 定位）
async function persistSlot(workspaceId, slotId, fields) {
  const Workspace = require('../models/Workspace');
  if (slotId === DEFAULT_SLOT) {
    const $set = {};
    for (const [k, v] of Object.entries(fields)) $set[`tgPersonal.${k}`] = v;
    await Workspace.findByIdAndUpdate(workspaceId, $set);
  } else {
    const $set = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k === 'apiId' || k === 'apiHash') continue; // 附加槽共用主槽 apiId/apiHash，不单独存
      $set[`tgPersonalSlots.$[s].${k}`] = v;
    }
    if (Object.keys($set).length) {
      await Workspace.updateOne(
        { _id: workspaceId },
        { $set },
        { arrayFilters: [{ 's.slotId': String(slotId) }] }
      );
    }
  }
}

// 读取槽位的 apiId/apiHash：附加槽沿用主槽（tgPersonal）配置，缺省回退 env/内置默认值
async function resolveApiCreds(workspaceId, override = {}) {
  let apiId = override.apiId;
  let apiHash = override.apiHash;
  if (!apiId || !apiHash) {
    const Workspace = require('../models/Workspace');
    const ws = await Workspace.findById(workspaceId).select('tgPersonal.apiId tgPersonal.apiHash');
    apiId = apiId || (ws && ws.tgPersonal && ws.tgPersonal.apiId) || DEFAULT_API_ID;
    apiHash = apiHash || (ws && ws.tgPersonal && ws.tgPersonal.apiHash) || DEFAULT_API_HASH;
  }
  return { apiId, apiHash };
}

// 校验附加槽位存在（default 槽免查）
async function assertSlotExists(workspaceId, slotId) {
  if (slotId === DEFAULT_SLOT) return;
  const Workspace = require('../models/Workspace');
  const ws = await Workspace.findOne({ _id: workspaceId, 'tgPersonalSlots.slotId': String(slotId) }).select('_id');
  if (!ws) throw new Error(`槽位不存在：${slotId}`);
}

async function onConnected(workspaceId, slotId, state) {
  const me = await state.client.getMe();
  state.status = 'connected';
  state.phone = me.phone || state.phone;
  state.username = me.username || '';
  state.error = '';
  const sessionStr = state.client.session.save();
  // StringSession 持久化：default → tgPersonal.session；附加槽 → tgPersonalSlots 对应元素
  await persistSlot(workspaceId, slotId, {
    enabled: true,
    status: 'connected',
    phone: state.phone,
    username: state.username,
    session: sessionStr,
  });
  attachIncoming(workspaceId, slotId, state);
  if (global.io) global.io.to(`workspace:${workspaceId}`).emit('tgpersonal:status', { slotId, status: 'connected', phone: state.phone });
  console.log(`[tgUser:${workspaceId}:${slotId}] connected as +${state.phone} @${state.username}`);
}

function attachIncoming(workspaceId, slotId, state) {
  if (state.handlerAttached) return;
  state.handlerAttached = true;
  const { NewMessage } = require('telegram/events');
  state.client.addEventHandler(async (event) => {
    try { await handleIncoming(workspaceId, slotId, state, event); }
    catch (e) { console.error(`[tgUser:${workspaceId}:${slotId}] incoming error:`, e.message); }
  }, new NewMessage({ incoming: true }));
}

async function handleIncoming(workspaceId, slotId, state, event) {
  const m = event.message;
  if (!m || m.out) return;
  if (!event.isPrivate) return; // 只处理一对一私聊
  const sender = await m.getSender();
  if (!sender || sender.className !== 'User' || sender.bot) return;

  const chatId = String(sender.id);
  const name = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.username || `TG ${chatId}`;
  const text = m.message || '';
  const mediaType = m.photo ? 'image' : m.video ? 'video' : m.voice || m.audio ? 'audio' : m.document ? 'document' : null;
  if (!text && !mediaType) return;

  const Contact = require('../models/Contact');
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');

  const contact = await Contact.findOneAndUpdate(
    { workspace: workspaceId, phone: chatId },
    { $set: { name, lastMessageAt: new Date() }, $setOnInsert: { workspace: workspaceId, phone: chatId, source: 'manual' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  // 入站绑定槽位：新会话直接写 waNumberId='tgp:<slotId>'；老会话仅在为空时补写（非空不覆盖）
  const slotTag = 'tgp:' + String(slotId);
  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspaceId, contact: contact._id, channel: 'telegram_personal' },
    {
      $set: { lastMessage: text || `[${mediaType}]`, lastMessageAt: new Date(), status: 'active' },
      $setOnInsert: { workspace: workspaceId, contact: contact._id, channel: 'telegram_personal', waNumberId: slotTag },
      $inc: { unreadCount: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (!conversation.waNumberId) {
    // 老会话尚未绑定槽位 → 原子补写（条件带空值防止并发覆盖已有绑定）
    await Conversation.updateOne(
      { _id: conversation._id, $or: [{ waNumberId: '' }, { waNumberId: null }, { waNumberId: { $exists: false } }] },
      { $set: { waNumberId: slotTag } }
    );
    conversation.waNumberId = slotTag;
  }
  const waMessageId = `tgp_${m.id}`;
  if (await Message.findOne({ workspace: workspaceId, waMessageId })) return;
  const message = await Message.create({
    workspace: workspaceId, conversation: conversation._id, contact: contact._id,
    direction: 'inbound', type: mediaType || 'text', text: text || `[${mediaType} received]`,
    waMessageId, status: 'delivered',
    metadata: { source: 'telegram_personal', tgSlotId: String(slotId) },
  });
  if (global.io) {
    const populated = await Conversation.findById(conversation._id)
      .populate({ path: 'contact', select: 'name phone avatar profileName' });
    global.io.to(`workspace:${workspaceId}`).emit('new_message', { message, conversationId: conversation._id });
    global.io.to(`workspace:${workspaceId}`).emit('conversation_updated', populated || conversation);
  }
  const Workspace = require('../models/Workspace');
  const workspace = await Workspace.findById(workspaceId);
  if (workspace && text) {
    require('./qrAutomation')
      .processIncoming({ workspace, conversation, contact, phone: chatId, text })
      .catch((e) => console.error(`[tgUser:${workspaceId}:${slotId}] automation error:`, e.message));
  }
}

// QR 登录（同 Telegram Desktop）：展示二维码，用户在手机 TG 的 设置 > 设备 > 登录新设备 里扫码。
// slotId 可选，缺省操作主槽位。
async function startQrLogin(workspaceId, opts = {}, slotId = DEFAULT_SLOT) {
  const id = String(workspaceId);
  slotId = String(slotId || DEFAULT_SLOT);
  await assertSlotExists(id, slotId);
  const state = getState(id, slotId);
  if (state.status === 'connected') return getStatus(id, slotId);
  if (state.client) { try { await state.client.disconnect(); } catch { /* noop */ } }

  const { apiId, apiHash } = await resolveApiCreds(id, opts);
  // apiId/apiHash 只存主槽（附加槽共用）；传了 override 时与旧行为一致地写回主槽
  if (slotId === DEFAULT_SLOT || opts.apiId || opts.apiHash) {
    const Workspace = require('../models/Workspace');
    await Workspace.findByIdAndUpdate(id, { 'tgPersonal.apiId': String(apiId), 'tgPersonal.apiHash': String(apiHash) });
  }

  state.client = await buildClient('', apiId, apiHash);
  state.status = 'connecting';
  state.error = '';
  state.qr = '';
  state.pending = {};
  state.handlerAttached = false;

  await state.client.connect();
  const QRCode = require('qrcode');
  state.client.signInUserWithQrCode(
    { apiId: Number(apiId), apiHash: String(apiHash) },
    {
      qrCode: async (code) => {
        const token = Buffer.from(code.token).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        state.qr = await QRCode.toDataURL(`tg://login?token=${token}`, { margin: 1, width: 300 });
        state.status = 'qr';
        if (global.io) global.io.to(`workspace:${id}`).emit('tgpersonal:qr', { slotId, qr: state.qr });
      },
      password: async () => { state.qr = ''; return waitFor(state, 'password'); },
      onError: (err) => {
        console.error(`[tgUser:${id}:${slotId}] qr login error:`, err.message);
        state.status = 'error';
        state.error = err.message;
        state.qr = '';
        return true;
      },
    }
  ).then(() => onConnected(id, slotId, state)).catch((e) => {
    if (state.status !== 'connected') { state.status = 'error'; state.error = e.message; state.qr = ''; }
  });

  // 稍等首个 QR token 就绪
  for (let i = 0; i < 40 && state.status === 'connecting'; i++) await new Promise(r => setTimeout(r, 250));
  return getStatus(id, slotId);
}

// 验证码登录：向用户的 Telegram/手机发送 OTP。slotId 可选，缺省操作主槽位。
async function startLogin(workspaceId, { apiId, apiHash, phone }, slotId = DEFAULT_SLOT) {
  const id = String(workspaceId);
  slotId = String(slotId || DEFAULT_SLOT);
  await assertSlotExists(id, slotId);
  const state = getState(id, slotId);
  if (state.status === 'connected') return getStatus(id, slotId);
  if (state.client) { try { await state.client.disconnect(); } catch { /* noop */ } }

  const creds = await resolveApiCreds(id, { apiId, apiHash });
  apiId = creds.apiId; apiHash = creds.apiHash;
  if (slotId === DEFAULT_SLOT) {
    const Workspace = require('../models/Workspace');
    await Workspace.findByIdAndUpdate(id, { 'tgPersonal.apiId': String(apiId), 'tgPersonal.apiHash': String(apiHash), 'tgPersonal.phone': String(phone) });
  } else {
    // 附加槽只记录手机号；apiId/apiHash 共用主槽
    await persistSlot(id, slotId, { phone: String(phone) });
  }

  state.client = await buildClient('', apiId, apiHash);
  state.phone = String(phone).replace(/[^\d+]/g, '');
  state.status = 'connecting';
  state.error = '';
  state.handlerAttached = false;

  state.client.start({
    phoneNumber: async () => state.phone,
    phoneCode: async () => waitFor(state, 'code'),
    password: async () => waitFor(state, 'password'),
    onError: (err) => {
      console.error(`[tgUser:${id}:${slotId}] login error:`, err.message);
      state.status = 'error';
      state.error = err.message;
      return true; // 停止重试
    },
  }).then(() => onConnected(id, slotId, state)).catch((e) => {
    state.status = 'error';
    state.error = e.message;
  });

  // 稍等 OTP 发出，让状态变为 awaiting_code
  for (let i = 0; i < 40 && state.status === 'connecting'; i++) await new Promise(r => setTimeout(r, 250));
  return getStatus(id, slotId);
}

function submitCode(workspaceId, code, slotId = DEFAULT_SLOT) {
  const state = getState(workspaceId, slotId);
  if (!state.pending.code) throw new Error('No pending code request — click Connect first');
  const resolve = state.pending.code;
  delete state.pending.code;
  state.status = 'verifying';
  resolve(String(code).trim());
}

function submitPassword(workspaceId, password, slotId = DEFAULT_SLOT) {
  const state = getState(workspaceId, slotId);
  if (!state.pending.password) throw new Error('No pending password request');
  const resolve = state.pending.password;
  delete state.pending.password;
  state.status = 'verifying';
  resolve(String(password));
}

async function getStatus(workspaceId, slotId = DEFAULT_SLOT) {
  const state = getState(workspaceId, slotId);
  return { status: state.status, phone: state.phone, username: state.username, error: state.error, qr: state.status === 'qr' ? (state.qr || '') : '' };
}

// 解析聊天对象：Telegram 用户 id、@username 或手机号。
async function resolveEntity(client, chatId) {
  const bigInt = require('big-integer');
  const raw = String(chatId).trim();
  try { return await client.getInputEntity(raw.startsWith('@') ? raw : bigInt(raw)); } catch { /* try below */ }
  if (/^\+?\d{7,15}$/.test(raw)) {
    const phone = raw.startsWith('+') ? raw : '+' + raw;
    try { return await client.getInputEntity(phone); } catch { /* try below */ }
    const { Api } = require('telegram');
    const res = await client.invoke(new Api.contacts.ImportContacts({
      contacts: [new Api.InputPhoneContact({ clientId: bigInt(0), phone, firstName: phone, lastName: '' })],
    }));
    if (res.users && res.users.length) return res.users[0];
    throw new Error(`No Telegram account found for ${phone} (the number may not be on Telegram, or its privacy settings hide it)`);
  }
  throw new Error(`Could not find Telegram chat "${raw}"`);
}

// 发送消息。槽位可通过 opts.slotId 指定（会话绑定 'tgp:<slotId>' 时由调用方解析传入），
// 也可用第 4 个参数传入；两者都缺省时走主槽位，旧调用方行为不变。
async function send(workspaceId, chatId, { type = 'text', text, media, slotId: optSlotId } = {}, slotId = DEFAULT_SLOT) {
  const id = String(workspaceId);
  const slot = String(optSlotId || slotId || DEFAULT_SLOT);
  const state = getState(id, slot);
  if (!state.client || state.status !== 'connected') {
    throw new Error(slot === DEFAULT_SLOT
      ? 'Personal Telegram is not connected (connect it on the Channels page)'
      : `Telegram 个人号槽位 ${slot} 未连接（请在渠道页重新登录该账号）`);
  }
  const entity = await resolveEntity(state.client, chatId);
  if (['image', 'video', 'audio', 'document'].includes(type) && media?.url) {
    const axios = require('axios');
    const { CustomFile } = require('telegram/client/uploads');
    const r = await axios.get(media.url, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(r.data);
    const name = media.filename || media.url.split('/').pop().split('?')[0] || 'file';
    const file = new CustomFile(name, buf.length, '', buf);
    const sent = await state.client.sendFile(entity, { file, caption: media.caption || text || '', forceDocument: type === 'document' });
    return { id: sent.id };
  }
  const sent = await state.client.sendMessage(entity, { message: text || '' });
  return { id: sent.id };
}

// 登出并清除会话。slotId 可选，缺省操作主槽位。
async function disconnect(workspaceId, slotId = DEFAULT_SLOT) {
  const id = String(workspaceId);
  slotId = String(slotId || DEFAULT_SLOT);
  const state = getState(id, slotId);
  if (state.client) {
    try { await state.client.invoke(new (require('telegram').Api.auth.LogOut)()); } catch { /* noop */ }
    try { await state.client.disconnect(); } catch { /* noop */ }
  }
  sessions.delete(`${id}:${slotId}`);
  if (slotId === DEFAULT_SLOT) {
    const Workspace = require('../models/Workspace');
    await Workspace.findByIdAndUpdate(id, { 'tgPersonal.enabled': false, 'tgPersonal.status': 'disconnected', 'tgPersonal.session': '' });
  } else {
    // 附加槽：保留元素（可重新登录），只清状态和 session；enabled 置 false 使其退出号池
    await persistSlot(id, slotId, { enabled: false, status: 'disconnected', session: '' });
  }
}

// ===== 号池 v2：槽位管理 =====

// 列出所有槽位（default 首位），合并内存运行时状态（status/phone/username 以运行时为准）
async function listSlots(workspaceId) {
  const Workspace = require('../models/Workspace');
  const ws = await Workspace.findById(workspaceId).select('tgPersonal tgPersonalSlots');
  if (!ws) throw new Error('Workspace not found');
  const out = [];
  const main = ws.tgPersonal || {};
  const mainState = getState(workspaceId, DEFAULT_SLOT);
  out.push({
    slotId: DEFAULT_SLOT,
    label: '主账号',
    status: mainState.client ? mainState.status : (main.status || 'disconnected'),
    phone: mainState.phone || main.phone || '',
    username: mainState.username || main.username || '',
    enabled: !!main.enabled,
    isDefault: true,
  });
  for (const s of (ws.tgPersonalSlots || [])) {
    const st = getState(workspaceId, s.slotId);
    out.push({
      slotId: s.slotId,
      label: s.label || '',
      status: st.client ? st.status : (s.status || 'disconnected'),
      phone: st.phone || s.phone || '',
      username: st.username || s.username || '',
      enabled: s.enabled !== false,
      isDefault: false,
    });
  }
  return out;
}

// 新建附加槽位，返回 {slotId}
async function createSlot(workspaceId, label) {
  const Workspace = require('../models/Workspace');
  const slotId = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const r = await Workspace.updateOne(
    { _id: workspaceId },
    { $push: { tgPersonalSlots: { slotId, label: String(label || '').trim(), status: 'disconnected', phone: '', username: '', session: '', enabled: true } } }
  );
  if (!r.matchedCount) throw new Error('Workspace not found');
  return { slotId };
}

// 删除附加槽位：断开运行时连接 → 清 session → 从数组移除。default 不可删。
async function deleteSlot(workspaceId, slotId) {
  slotId = String(slotId || '');
  if (!slotId || slotId === DEFAULT_SLOT) throw new Error('主账号槽位不可删除');
  const id = String(workspaceId);
  const key = `${id}:${slotId}`;
  const state = sessions.get(key);
  if (state && state.client) {
    try { await state.client.invoke(new (require('telegram').Api.auth.LogOut)()); } catch { /* noop */ }
    try { await state.client.disconnect(); } catch { /* noop */ }
  }
  sessions.delete(key);
  const Workspace = require('../models/Workspace');
  // 过滤条件带上 slotId：matchedCount=0 即槽位不存在（timestamps 会让空 $pull 的 modifiedCount 也为 1，不能用它判断）
  const r = await Workspace.updateOne(
    { _id: workspaceId, 'tgPersonalSlots.slotId': slotId },
    { $pull: { tgPersonalSlots: { slotId } } }
  );
  if (!r.matchedCount) throw new Error(`槽位不存在：${slotId}`);
}

// 号池轮询取号：在 已连接 且 enabled 的槽位（含 default）间用 $inc 游标原子轮询。
// 无可用槽位返回 ''（由调用方回退/报错）。注意：是否启用号池（tgPersonalPoolEnabled）由调用方判断。
async function pickPoolSlot(workspaceId) {
  const Workspace = require('../models/Workspace');
  const ws = await Workspace.findById(workspaceId).select('tgPersonal.enabled tgPersonalSlots');
  if (!ws) return '';
  const candidates = [];
  const mainState = getState(workspaceId, DEFAULT_SLOT);
  if (ws.tgPersonal && ws.tgPersonal.enabled && mainState.status === 'connected') candidates.push(DEFAULT_SLOT);
  for (const s of (ws.tgPersonalSlots || [])) {
    if (s.enabled === false) continue;
    const st = getState(workspaceId, s.slotId);
    if (st.status === 'connected') candidates.push(s.slotId);
  }
  if (!candidates.length) return '';
  // $inc 原子自增游标，多进程/并发下也能均匀分摊
  const updated = await Workspace.findByIdAndUpdate(
    workspaceId,
    { $inc: { tgPersonalPoolCursor: 1 } },
    { new: true, select: 'tgPersonalPoolCursor' }
  );
  const cursor = (updated && updated.tgPersonalPoolCursor) || 0;
  return candidates[((cursor % candidates.length) + candidates.length) % candidates.length];
}

// 启动时恢复所有已保存会话：主槽（tgPersonal）+ session 非空的附加槽（tgPersonalSlots）。
async function restoreAll() {
  const Workspace = require('../models/Workspace');
  const list = await Workspace.find({
    $or: [
      { 'tgPersonal.enabled': true, 'tgPersonal.session': { $ne: '' } },
      { tgPersonalSlots: { $elemMatch: { session: { $nin: ['', null] } } } },
    ],
  }).select('tgPersonal tgPersonalSlots');
  for (const ws of list) {
    const id = String(ws._id);
    const apiId = (ws.tgPersonal && ws.tgPersonal.apiId) || DEFAULT_API_ID;
    const apiHash = (ws.tgPersonal && ws.tgPersonal.apiHash) || DEFAULT_API_HASH;
    // 主槽位
    if (ws.tgPersonal && ws.tgPersonal.enabled && ws.tgPersonal.session) {
      await restoreSlot(id, DEFAULT_SLOT, ws.tgPersonal.session, ws.tgPersonal.phone, apiId, apiHash);
    }
    // 附加槽位（apiId/apiHash 共用主槽配置）
    for (const s of (ws.tgPersonalSlots || [])) {
      if (!s.session) continue;
      await restoreSlot(id, s.slotId, s.session, s.phone, apiId, apiHash);
    }
  }
}

// 恢复单个槽位的已保存会话；授权失效则标记 logged_out
async function restoreSlot(workspaceId, slotId, sessionStr, phone, apiId, apiHash) {
  try {
    const state = getState(workspaceId, slotId);
    if (state.client) return;
    state.client = await buildClient(sessionStr, apiId, apiHash);
    state.phone = phone || '';
    state.status = 'connecting';
    await state.client.connect();
    if (await state.client.isUserAuthorized()) await onConnected(workspaceId, slotId, state);
    else {
      state.status = 'disconnected';
      await persistSlot(workspaceId, slotId, { enabled: false, status: 'logged_out' });
    }
  } catch (e) { console.error(`[tgUser:${workspaceId}:${slotId}] restore failed:`, e.message); }
}

module.exports = {
  startLogin, startQrLogin, submitCode, submitPassword, getStatus, send, disconnect, restoreAll,
  // 号池 v2
  listSlots, createSlot, deleteSlot, pickPoolSlot,
};
