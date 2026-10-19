const path = require('path');
const fs = require('fs');

// WhatsApp by QR channel (unofficial, WhatsApp Web protocol via Baileys).
// One socket per workspace. Includes a safety engine: warm-up daily caps,
// human-like random delays and typing presence to reduce ban risk.
//
// ===== 多槽位号池（2026-10-20）=====
// 一个 workspace 可以绑定多个网页版 WhatsApp 号码（槽位）：
// - 主槽位 slotId='default'：数据沿用 Workspace.waQr 子文档，会话目录沿用
//   wa_sessions/<wsId>/（零迁移，现有连接完全不受影响）
// - 附加槽位：数据存 Workspace.waQrSlots[] 数组元素，会话目录
//   wa_sessions/<wsId>__<slotId>/
// 所有导出函数在原参数后追加可选 slotId（缺省 'default'，行为与旧版一致）。
// 入站消息创建的 conversation 会绑定 waNumberId='qr:<slotId>'（已有非空不覆盖）。

const SESSIONS_DIR = path.join(__dirname, '..', '..', 'wa_sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// Warm-up schedule: max outbound messages per day since first connect.
const WARMUP_CAPS = [25, 40, 60, 90, 130, 180, 250, 350, 450, 600, 750, 900, 1000, 1000];
const MIN_DELAY_MS = 5000;
const MAX_DELAY_MS = 15000;

const sessions = new Map(); // `${workspaceId}:${slotId}` -> { sock, status, qr, phone, queue, sending, slotId }

// 内存状态 key：workspaceId + 槽位
function skey(workspaceId, slotId) {
  return `${String(workspaceId)}:${slotId || 'default'}`;
}

// 槽位会话目录：default 沿用旧目录（零迁移），附加槽用 <wsId>__<slotId>
function authDirFor(workspaceId, slotId) {
  const id = String(workspaceId);
  return (!slotId || slotId === 'default') ? path.join(SESSIONS_DIR, id) : path.join(SESSIONS_DIR, `${id}__${slotId}`);
}

function getState(workspaceId, slotId = 'default') {
  const key = skey(workspaceId, slotId);
  if (!sessions.has(key)) sessions.set(key, { sock: null, status: 'disconnected', qr: null, phone: '', queue: [], sending: false, lidMap: {}, nameMap: {}, groupMap: {}, msgStore: new Map(), slotId: slotId || 'default' });
  return sessions.get(key);
}

// 读取槽位的持久化子文档：default = ws.waQr，附加槽 = waQrSlots 数组元素
function slotDocOf(ws, slotId) {
  if (!ws) return null;
  if (!slotId || slotId === 'default') return ws.waQr || {};
  return (ws.waQrSlots || []).find((s) => s.slotId === slotId) || null;
}

// 原子更新槽位字段：default 写 waQr.*（老代码路径），附加槽用 arrayFilters 定位
async function updateSlotFields(workspaceId, slotId, fields) {
  const Workspace = require('../models/Workspace');
  const $set = {};
  if (!slotId || slotId === 'default') {
    for (const [k, v] of Object.entries(fields)) $set[`waQr.${k}`] = v;
    return Workspace.updateOne({ _id: workspaceId }, { $set }).catch(() => {});
  }
  for (const [k, v] of Object.entries(fields)) $set[`waQrSlots.$[s].${k}`] = v;
  return Workspace.updateOne({ _id: workspaceId }, { $set }, { arrayFilters: [{ 's.slotId': slotId }] }).catch(() => {});
}

function dayCap(warmupStartedAt) {
  if (!warmupStartedAt) return WARMUP_CAPS[0];
  const days = Math.floor((Date.now() - new Date(warmupStartedAt).getTime()) / 86400000);
  return WARMUP_CAPS[Math.min(days, WARMUP_CAPS.length - 1)];
}

// --- Bad-MAC / decrypt-failure loop breaker ---
// A corrupt QR signal session keeps failing to decrypt incoming messages
// (Baileys marks them CIPHERTEXT and asks the phone for resends). Left alone
// this pins a CPU core and floods logs. When failures cross a threshold within
// a short window we clear ONLY this workspace's signal keys and ask the user to
// re-scan. Chat history, contacts and other channels are never touched, and a
// healthy session (which resets the counter on every successful connect) never
// trips this.
const DECRYPT_FAIL_LIMIT = 30;
const DECRYPT_FAIL_WINDOW_MS = 2 * 60 * 1000;

async function resetSessionForRescan(id, slotId, state) {
  if (state.rescanResetting) return;
  state.rescanResetting = true;
  console.log(`[waQr:${id}:${slotId}] decrypt-failure loop (x${state.decryptFailCount}) — clearing session keys, re-scan needed`);
  try { if (state.sock) { try { state.sock.ev.removeAllListeners(); } catch (e) { /* noop */ } try { state.sock.end(); } catch (e) { /* noop */ } } } catch (e) { /* noop */ }
  state.sock = null;
  state.status = 'rescan_needed';
  state.qr = null;
  state.decryptFailCount = 0;
  state.decryptFailFirst = 0;
  try { fs.rmSync(authDirFor(id, slotId), { recursive: true, force: true }); } catch (e) { /* noop */ }
  await updateSlotFields(id, slotId, { status: 'rescan_needed' });
  if (global.io) global.io.to(`workspace:${id}`).emit('waqr:status', { status: 'rescan_needed', slotId, message: 'Session error - please re-scan the QR code' });
  setTimeout(() => { state.rescanResetting = false; startSession(id, slotId).catch(() => {}); }, 3000);
}

function noteDecryptFailure(id, slotId, state) {
  const now = Date.now();
  if (!state.decryptFailFirst || now - state.decryptFailFirst > DECRYPT_FAIL_WINDOW_MS) {
    state.decryptFailFirst = now;
    state.decryptFailCount = 0;
  }
  state.decryptFailCount = (state.decryptFailCount || 0) + 1;
  if (now - (state.decryptFailLastLog || 0) > 15000) {
    state.decryptFailLastLog = now;
    console.log(`[waQr:${id}:${slotId}] decrypt failure x${state.decryptFailCount} in window`);
  }
  if (state.decryptFailCount >= DECRYPT_FAIL_LIMIT && !state.rescanResetting) {
    resetSessionForRescan(id, slotId, state).catch(() => {});
  }
}

// Per-workspace-slot in-flight guard: startSession awaits (auth state load,
// version fetch) before it sets state.sock, so without this two concurrent
// calls (user double-click, restoreAll racing a manual connect, reconnect
// timers) would both pass the `state.sock` check and open TWO sockets on the
// SAME auth folder, corrupting the session.
const startInFlight = new Map(); // `${workspaceId}:${slotId}` -> Promise<state>

async function startSession(workspaceId, slotId = 'default') {
  const id = String(workspaceId);
  const state = getState(id, slotId);
  if (state.sock) return state;
  const key = skey(id, slotId);
  const inFlight = startInFlight.get(key);
  if (inFlight) return inFlight;
  const promise = doStartSession(id, slotId, state);
  startInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    startInFlight.delete(key);
  }
}

async function doStartSession(id, slotId, state) {
  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
  const pino = require('pino');
  const authDir = authDirFor(id, slotId);
  const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  const sock = makeWASocket({
    version,
    auth: authState,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['红浪漫', 'Chrome', '120.0'],
    syncFullHistory: true,
    // Keep this linked device "offline" so the phone stays the primary receiver.
    // If the desktop advertises itself online, the phone routes messages to it;
    // when the desktop intermittently fails to decrypt, both sides get stuck on
    // "Waiting for this message". Staying offline lets the phone deliver reliably
    // while we still receive messages via messages.upsert.
    markOnlineOnConnect: false,
    // Ask promptly for a resend when an incoming message can't be decrypted.
    retryRequestDelayMs: 250,
    // When a recipient can't decrypt a message their phone asks for a resend;
    // without this the message stays stuck at "Waiting for this message".
    getMessage: async (key) => state.msgStore.get(key?.id)?.message || undefined,
  });
  state.sock = sock;
  state.status = 'connecting';

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    // Stale-socket guard: if this socket has been replaced (syncSession,
    // rescan reset, disconnect, or a newer connect), ignore its events so a
    // dying socket can't null the new socket's state or schedule a duplicate
    // reconnect on top of it.
    if (state.sock !== sock) return;
    const { connection, lastDisconnect, qr } = update;
    if (connection || qr) console.log(`[waQr:${id}:${slotId}] connection=${connection || 'qr'} code=${lastDisconnect?.error?.output?.statusCode || ''}`);
    if (qr) {
      state.qr = qr;
      state.status = 'qr';
      if (global.io) global.io.to(`workspace:${id}`).emit('waqr:status', { status: 'qr', slotId });
    }
    if (connection === 'open') {
      state.qr = null;
      state.status = 'connected';
      state.decryptFailCount = 0;
      state.decryptFailFirst = 0;
      state.rescanResetting = false;
      state.phone = (sock.user?.id || '').split(':')[0].split('@')[0];
      const Workspace = require('../models/Workspace');
      const ws = await Workspace.findById(id);
      if (ws) {
        if (slotId === 'default') {
          // 主槽位：沿用老字段 + rotation-link 快照同步（保持原有行为）
          ws.waQr = ws.waQr || {};
          ws.waQr.enabled = true;
          ws.waQr.status = 'connected';
          const phoneChanged = ws.waQr.phone && ws.waQr.phone !== state.phone;
          ws.waQr.phone = state.phone;
          if (!ws.waQr.warmupStartedAt) ws.waQr.warmupStartedAt = new Date();
          await ws.save();
          if (phoneChanged) {
            // Keep rotation-link snapshots pointing at the workspace's current number after a re-scan
            try {
              await require('../models/RotationLink').updateMany(
                { 'numbers.workspace': id },
                { $set: { 'numbers.$[n].phone': state.phone } },
                { arrayFilters: [{ 'n.workspace': id }] }
              );
            } catch (e) { /* noop */ }
          }
        } else {
          // 附加槽位：只写 waQrSlots 对应元素，不碰 rotation-link（它跟踪主号）
          const slot = (ws.waQrSlots || []).find((s) => s.slotId === slotId);
          if (slot) {
            slot.status = 'connected';
            slot.phone = state.phone;
            if (!slot.warmupStartedAt) slot.warmupStartedAt = new Date();
            await ws.save();
          }
        }
      }
      if (global.io) global.io.to(`workspace:${id}`).emit('waqr:status', { status: 'connected', phone: state.phone, slotId });
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      state.sock = null;
      if (code === DisconnectReason.loggedOut) {
        state.status = 'disconnected';
        state.qr = null;
        try { fs.rmSync(authDirFor(id, slotId), { recursive: true, force: true }); } catch (e) { /* noop */ }
        if (slotId === 'default') {
          await updateSlotFields(id, 'default', { enabled: false, status: 'logged_out' });
        } else {
          await updateSlotFields(id, slotId, { status: 'logged_out' });
        }
        await purgeQrData(id, slotId);
        if (global.io) global.io.to(`workspace:${id}`).emit('waqr:status', { status: 'logged_out', slotId });
      } else {
        state.status = 'reconnecting';
        setTimeout(() => startSession(id, slotId).catch(() => {}), 5000);
      }
    }
  });

  // Track LID (anonymous jid) -> phone-number jid mappings, and the
  // phone's saved / profile name so the inbox shows a name, not a number.
  sock.ev.on('contacts.upsert', (contacts) => {
    for (const c of contacts || []) {
      if (c.lid && c.id && String(c.id).endsWith('@s.whatsapp.net')) state.lidMap[c.lid] = c.id;
      recordContactName(state, c);
    }
  });
  sock.ev.on('contacts.update', (contacts) => {
    for (const c of contacts || []) recordContactName(state, c);
  });
  const recordGroups = (groups) => {
    for (const g of groups || []) { if (g && g.id && g.subject) state.groupMap[g.id] = g.subject; }
  };
  sock.ev.on('groups.upsert', recordGroups);
  sock.ev.on('groups.update', recordGroups);

  // Presence (online / last seen) for open 1:1 chats — QR/Web WhatsApp only.
  sock.ev.on('presence.update', ({ id: jid, presences }) => {
    try {
      if (!global.io || !presences || String(jid).endsWith('@g.us')) return;
      const phone = String(jid).replace(/@.*/, '');
      const pres = presences[jid] || Object.values(presences)[0];
      if (!pres) return;
      const status = pres.lastKnownPresence || '';
      const online = status === 'available' || status === 'composing' || status === 'recording';
      global.io.to(`workspace:${id}`).emit('waqr:presence', { phone, online, status, lastSeen: pres.lastSeen || null });
    } catch (e) { /* noop */ }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;
    for (const m of messages) {
      if (m && m.messageStubType === 2) { noteDecryptFailure(id, slotId, state); continue; } // CIPHERTEXT = failed to decrypt
      try { await handleIncoming(id, m, state); } catch (e) { console.log(`[waQr:${id}:${slotId}] incoming error:`, e.message); }
    }
  });

  // Delivery/read receipts for outbound messages - updates status so the panel
  // shows sent/delivered/read, and logs acks (useful to spot a number that is
  // connected but whose messages never actually deliver, i.e. a restricted number).
  sock.ev.on('messages.update', async (updates) => {
    const STATUS = { 0: 'failed', 1: 'pending', 2: 'sent', 3: 'delivered', 4: 'read', 5: 'read' };
    for (const u of updates || []) {
      const st = u.update && u.update.status;
      if (st === undefined || st === null) continue;
      const label = STATUS[st] || String(st);
      console.log(`[waQr:${id}:${slotId}] ack ${u.key && u.key.id} status=${st}(${label})`);
      try {
        const Message = require('../models/Message');
        const msg = await Message.findOneAndUpdate({ waMessageId: `qr_${u.key && u.key.id}` }, { status: label }, { new: true });
        if (msg && global.io) global.io.to(`workspace:${id}`).emit('message_status', { messageId: msg._id, conversationId: msg.conversation, status: label });
      } catch (e) { /* noop */ }
    }
  });

  // Import existing chats/messages when the account first pairs
  sock.ev.on('messaging-history.set', async (ev) => {
    try {
      for (const c of ev.contacts || []) {
        if (c.lid && c.id && String(c.id).endsWith('@s.whatsapp.net')) state.lidMap[c.lid] = c.id;
        recordContactName(state, c);
      }
      for (const ch of ev.chats || []) {
        const lid = ch.lidJid || (String(ch.id || '').endsWith('@lid') ? ch.id : null);
        const pn = ch.pnJid || null;
        if (lid && pn) state.lidMap[lid] = pn;
        if (String(ch.id || '').endsWith('@g.us') && (ch.name || ch.subject)) state.groupMap[ch.id] = ch.name || ch.subject;
      }
      await importHistory(id, ev.messages || [], state);
    } catch (e) { console.log(`[waQr:${id}:${slotId}] history error:`, e.message); }
  });

  return state;
}

// Resolves the contact phone number from a message key. WhatsApp may use
// anonymous LID jids; prefer the real phone-number jid when available.
function resolvePhone(key, lidMap) {
  let jid = key.remoteJid || '';
  if (jid.endsWith('@lid')) jid = key.remoteJidAlt || key.senderPn || (lidMap && lidMap[jid]) || '';
  if (!jid.endsWith('@s.whatsapp.net')) return null;
  const phone = jid.split('@')[0].split(':')[0];
  if (!phone || phone === '0' || phone.length < 7) return null; // skip WhatsApp system accounts
  return phone;
}

// Record a contact's saved (address-book) or profile name from Baileys events.
function recordContactName(state, c) {
  if (!c || !c.id || !String(c.id).endsWith('@s.whatsapp.net')) return;
  const ph = String(c.id).split('@')[0].split(':')[0];
  const nm = c.name || c.notify || c.verifiedName;
  if (ph && nm) state.nameMap[ph] = nm;
}

// Prefer the phone's saved/profile name over the raw number.
function resolveName(phone, pushName, nameMap) {
  return (nameMap && nameMap[phone]) || pushName || `WA ${phone}`;
}

// Group subject name, cached; falls back to a metadata fetch then a short id.
async function getGroupName(sock, groupMap, jid) {
  if (groupMap && groupMap[jid]) return groupMap[jid];
  try {
    const md = sock && (await sock.groupMetadata(jid));
    if (md && md.subject) { groupMap[jid] = md.subject; return md.subject; }
  } catch (e) { /* noop */ }
  return `Group ${String(jid).split('@')[0].slice(-6)}`;
}

function unwrapMsg(msg) {
  if (!msg || typeof msg !== 'object') return msg || {};
  return msg.ephemeralMessage?.message
    || msg.viewOnceMessage?.message
    || msg.viewOnceMessageV2?.message
    || msg.viewOnceMessageV2Extension?.message
    || msg.documentWithCaptionMessage?.message
    || msg.editedMessage?.message
    || msg;
}

function extractText(raw) {
  const msg = unwrapMsg(raw);
  const poll = msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3;
  if (poll) {
    const opts = (poll.options || []).map((o) => '• ' + (o.optionName || o.name || o)).filter(Boolean).join('\n');
    return '📊 Poll: ' + (poll.name || '') + (opts ? '\n' + opts : '');
  }
  if (msg.locationMessage) {
    const l = msg.locationMessage;
    return '📍 Location' + (l.name ? ': ' + l.name : '') + ((l.degreesLatitude || l.degreesLongitude) ? ` (${l.degreesLatitude}, ${l.degreesLongitude})` : '');
  }
  if (msg.liveLocationMessage) return '📍 Live location';
  if (msg.contactMessage) return '👤 ' + (msg.contactMessage.displayName || 'Contact');
  if (msg.contactsArrayMessage) return '👤 ' + ((msg.contactsArrayMessage.contacts || []).map((c) => c.displayName).filter(Boolean).join(', ') || 'Contacts');
  return msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption
    || msg.documentMessage?.caption || msg.documentMessage?.fileName
    || msg.buttonsResponseMessage?.selectedDisplayText || msg.templateButtonReplyMessage?.selectedDisplayText
    || msg.listResponseMessage?.title || '';
}

// Id of a tapped button/list row (native-flow, template or list replies).
function extractButtonId(msg) {
  if (msg.buttonsResponseMessage?.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId;
  if (msg.templateButtonReplyMessage?.selectedId) return msg.templateButtonReplyMessage.selectedId;
  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) return msg.listResponseMessage.singleSelectReply.selectedRowId;
  const params = msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (params) { try { return JSON.parse(params).id || ''; } catch { return ''; } }
  return '';
}

async function importHistory(workspaceId, messages, state) {
  const lidMap = state.lidMap;
  const nameMap = state.nameMap;
  const slotId = state.slotId || 'default';
  const Contact = require('../models/Contact');
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');
  let imported = 0;
  const skips = { group: 0, noPhone: 0, noText: 0, dupe: 0 };
  for (const m of messages) {
    if (imported >= 500) break;
    const jid = m.key?.remoteJid || '';
    if (jid === 'status@broadcast') { skips.group++; continue; }
    const isGroup = jid.endsWith('@g.us');
    let phone, name, contactExtra;
    if (isGroup) {
      phone = jid;
      name = await getGroupName(state.sock, state.groupMap, jid);
      contactExtra = { isGroup: true, waId: jid };
    } else {
      phone = resolvePhone(m.key, lidMap);
      if (!phone) { skips.noPhone++; continue; }
      name = resolveName(phone, m.pushName, nameMap);
      contactExtra = {};
    }
    const msg = m.message || {};
    let text = extractText(msg);
    if (!text) { skips.noText++; continue; }
    if (isGroup && !m.key.fromMe) {
      const sp = String(m.key.participant || m.participant || '').split('@')[0].split(':')[0];
      const sn = resolveName(sp, m.pushName, nameMap);
      if (sn) text = `~${sn}: ${text}`;
    }
    const waMessageId = `qr_${m.key.id}`;
    if (await Message.findOne({ workspace: workspaceId, waMessageId })) { skips.dupe++; continue; }
    const ts = new Date((Number(m.messageTimestamp) || Math.floor(Date.now() / 1000)) * 1000);
    const contact = await Contact.findOneAndUpdate(
      { workspace: workspaceId, phone },
      { $setOnInsert: { workspace: workspaceId, phone, name, source: 'whatsapp_qr', ...contactExtra } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const conversation = await Conversation.findOneAndUpdate(
      { workspace: workspaceId, contact: contact._id, channel: 'whatsapp_qr' },
      // 新建会话绑定收消息的槽位（已存在的不覆盖）
      { $setOnInsert: { workspace: workspaceId, contact: contact._id, channel: 'whatsapp_qr', status: 'active', waNumberId: `qr:${slotId}` }, $max: { lastMessageAt: ts } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const doc = await Message.create({
      workspace: workspaceId, conversation: conversation._id, contact: contact._id,
      direction: m.key.fromMe ? 'outbound' : 'inbound', type: 'text', text,
      waMessageId, status: m.key.fromMe ? 'sent' : 'delivered',
      metadata: { source: 'whatsapp_qr', history: true },
    });
    await Message.updateOne({ _id: doc._id }, { $set: { createdAt: ts } }, { timestamps: false });
    await Conversation.updateOne(
      { _id: conversation._id, $or: [{ lastMessageAt: { $lte: ts } }, { lastMessageAt: null }] },
      { $set: { lastMessage: text.slice(0, 200), lastMessageAt: ts } }
    );
    imported++;
  }
  console.log(`[waQr:${workspaceId}:${slotId}] history import: ${imported} of ${messages.length} messages (skips: ${JSON.stringify(skips)})`);
  if (imported > 0 && global.io) {
    global.io.to(`workspace:${workspaceId}`).emit('conversation_updated', {});
  }
}

async function handleIncoming(workspaceId, m, state) {
  const lidMap = state.lidMap;
  const nameMap = state.nameMap;
  const slotId = state.slotId || 'default';
  const jid = m.key.remoteJid || '';
  if (jid === 'status@broadcast') return;
  const isGroup = jid.endsWith('@g.us');
  const outbound = !!m.key.fromMe;
  if (outbound && !isGroup) return; // 1:1 outbound is recorded by the send path
  const phone = isGroup ? jid : resolvePhone(m.key, lidMap);
  if (!phone) { console.log(`[waQr:${workspaceId}:${slotId}] skip incoming, unresolved key:`, JSON.stringify(m.key)); return; }
  const msg = unwrapMsg(m.message || {});
  let text = extractText(msg);
  const buttonId = extractButtonId(msg);
  const mediaType = msg.imageMessage ? 'image' : msg.videoMessage ? 'video' : msg.audioMessage ? 'audio' : msg.documentMessage ? 'document' : msg.stickerMessage ? 'sticker' : null;
  if (!text && !buttonId && !mediaType) return;
  if (isGroup && !outbound && text) {
    const sp = String(m.key.participant || m.participant || '').split('@')[0].split(':')[0];
    const sn = resolveName(sp, m.pushName, nameMap);
    if (sn) text = `~${sn}: ${text}`;
  }

  const Contact = require('../models/Contact');
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');
  const name = isGroup ? await getGroupName(state.sock, state.groupMap, jid) : resolveName(phone, m.pushName, nameMap);
  const hasRealName = name !== `WA ${phone}`;
  let contactUpdate;
  if (isGroup) {
    contactUpdate = { $set: { workspace: workspaceId, phone, name, lastMessageAt: new Date() }, $setOnInsert: { source: 'whatsapp_qr', isGroup: true, waId: jid } };
  } else {
    contactUpdate = hasRealName
      ? { $set: { workspace: workspaceId, phone, name, source: 'whatsapp_qr', lastMessageAt: new Date() } }
      : { $set: { workspace: workspaceId, phone, source: 'whatsapp_qr', lastMessageAt: new Date() }, $setOnInsert: { name } };
  }
  const contact = await Contact.findOneAndUpdate(
    { workspace: workspaceId, phone },
    contactUpdate,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // WhatsApp profile photo (DP): only Web/QR exposes it. Fetch once when missing.
  if (!isGroup && !contact.avatar && state.sock) {
    try {
      const ppUrl = await state.sock.profilePictureUrl(`${phone}@s.whatsapp.net`, 'image').catch(() => null);
      if (ppUrl) { contact.avatar = ppUrl; await contact.save(); }
    } catch (e) { /* noop */ }
  }

  const convUpdate = {
    $set: { lastMessage: text || `[${mediaType}]`, lastMessageAt: new Date(), status: 'active' },
    // 入站绑定槽位：新建会话写 waNumberId='qr:<slotId>'
    $setOnInsert: { workspace: workspaceId, contact: contact._id, channel: 'whatsapp_qr', waNumberId: `qr:${slotId}` },
  };
  if (!outbound) convUpdate.$inc = { unreadCount: 1 };
  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspaceId, contact: contact._id, channel: 'whatsapp_qr' },
    convUpdate,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  // 老会话没绑定号的补绑到本次收消息的槽位（已有非空 waNumberId 不覆盖）
  if (!conversation.waNumberId) {
    try {
      await Conversation.updateOne(
        { _id: conversation._id, $or: [{ waNumberId: null }, { waNumberId: '' }] },
        { $set: { waNumberId: `qr:${slotId}` } }
      );
      conversation.waNumberId = `qr:${slotId}`;
    } catch (e) { /* noop */ }
  }

  const waMessageId = `qr_${m.key.id}`;
  if (await Message.findOne({ workspace: workspaceId, waMessageId })) return;
  const message = await Message.create({
    workspace: workspaceId, conversation: conversation._id, contact: contact._id,
    direction: outbound ? 'outbound' : 'inbound', type: mediaType || 'text', text: text || (buttonId ? '[button reply]' : `[${mediaType} received]`),
    waMessageId, status: outbound ? 'sent' : 'delivered',
    metadata: { source: 'whatsapp_qr' },
  });

  if (global.io) {
    global.io.to(`workspace:${workspaceId}`).emit('new_message', { message, conversationId: conversation._id });
    global.io.to(`workspace:${workspaceId}`).emit('conversation_updated', conversation);
  }
  if (!outbound) { try { require('../controllers/pushController').notifyWorkspace(workspaceId, { title: (contact && (contact.name || contact.phone)) || 'New message', body: (text || '[media]').slice(0, 120), url: '/client/chat', tag: String(conversation._id) }); } catch (e) { /* noop */ } }
  // Rotation-link session attribution: inbound text containing [CODE] counts once per contact+link per 24h
  if (!outbound && !isGroup && text) {
    try {
      const mt = text.match(/\[([A-Z2-9]{6})\]/);
      if (mt) {
        const RotationLink = require('../models/RotationLink');
        const RotationHit = require('../models/RotationHit');
        const rl = await RotationLink.findOne({ code: mt[1], isActive: true, 'numbers.workspace': workspaceId });
        if (rl) {
          const since = new Date(Date.now() - 24 * 3600 * 1000);
          const visitorPhone = String(contact.phone || '').replace(/\D/g, '');
          // Dedupe by the visitor's phone across workspaces: the same person routed to two numbers counts once
          const dup = await RotationHit.exists({
            link: rl._id, kind: 'session', at: { $gt: since },
            $or: [{ contactPhone: visitorPhone }, { contact: contact._id }],
          });
          const num = rl.numbers.find((x) => String(x.workspace) === String(workspaceId));
          if (!dup && num) await RotationHit.create({ link: rl._id, workspace: workspaceId, phone: num.phone, kind: 'session', contact: contact._id, contactPhone: visitorPhone });
        }
      }
    } catch (e) { /* never break message processing */ }
  }
  const Workspace = require('../models/Workspace');
  const workspace = await Workspace.findById(workspaceId);
  if (workspace) {

    if (!isGroup && !outbound && (text || buttonId)) {
      // Opt-out / opt-in (STOP / START) first, so an unsubscribing contact gets
      // the confirmation instead of an automation reply.
      let optOutHandled = false;
      try {
        const oo = await require('./optOut').handleInbound({
          workspace,
          contact,
          text: String(text || '').toLowerCase().trim(),
          // 退订确认从收到消息的同一槽位回复（客户视角不换号）
          wa: { sendTextMessage: (to, body) => sendMessage(workspaceId, to, { type: 'text', text: body }, slotId) },
        });
        optOutHandled = oo.changed;
        if (oo.changed && global.io) {
          global.io.to(`workspace:${workspaceId}`).emit('conversation_updated', conversation);
        }
      } catch (e) { console.error(`[waQr:${workspaceId}:${slotId}] optOut:`, e.message); }
      if (!optOutHandled) {
        require('./qrAutomation')
          .processIncoming({ workspace, conversation, contact, phone, text, buttonId })
          .catch((e) => console.error(`[waQr:${workspaceId}:${slotId}] automation error:`, e.message));
      }
    }
  }
}

// Safety engine: enforce warm-up daily cap and queue sends with random delays.
// 日限额/预热按槽位独立：default 读写 waQr 子文档，附加槽读写 waQrSlots 元素。
async function checkAndCountSend(workspaceId, slotId = 'default') {
  const Workspace = require('../models/Workspace');
  const ws = await Workspace.findById(workspaceId);
  const today = new Date().toISOString().slice(0, 10);
  if (slotId === 'default') {
    if (!ws || !ws.waQr?.enabled) throw new Error('WhatsApp by QR is not connected');
    ws.waQr = ws.waQr || {};
    if (ws.waQr.sentDate !== today) { ws.waQr.sentDate = today; ws.waQr.sentToday = 0; }
    // A custom daily limit (set by the user at their own risk) overrides the warm-up cap
    const cap = ws.waQr.dailyLimit > 0 ? ws.waQr.dailyLimit : dayCap(ws.waQr.warmupStartedAt);
    if ((ws.waQr.sentToday || 0) >= cap) {
      throw new Error(`Daily safety limit reached (${cap} messages). Limit increases automatically as the number warms up.`);
    }
    ws.waQr.sentToday = (ws.waQr.sentToday || 0) + 1;
    await ws.save();
    return;
  }
  const slot = ws && (ws.waQrSlots || []).find((s) => s.slotId === slotId);
  if (!slot || slot.enabled === false) throw new Error('WhatsApp by QR is not connected');
  if (slot.sentDate !== today) { slot.sentDate = today; slot.sentToday = 0; }
  const cap = slot.dailyLimit > 0 ? slot.dailyLimit : dayCap(slot.warmupStartedAt);
  if ((slot.sentToday || 0) >= cap) {
    throw new Error(`Daily safety limit reached (${cap} messages). Limit increases automatically as the number warms up.`);
  }
  slot.sentToday = (slot.sentToday || 0) + 1;
  await ws.save();
}

function processQueue(workspaceId, slotId = 'default') {
  const state = getState(workspaceId, slotId);
  if (state.sending || state.queue.length === 0) return;
  state.sending = true;
  const job = state.queue.shift();
  const run = async () => {
    try {
      const sock = state.sock;
      if (!sock || state.status !== 'connected') throw new Error('WhatsApp by QR is not connected');
      const jid = String(job.phone).endsWith('@g.us') ? String(job.phone) : (String(job.phone).replace(/\D/g, '') + '@s.whatsapp.net');
      // Human-like: show typing briefly before sending
      try {
        await sock.presenceSubscribe(jid);
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(r => setTimeout(r, 1500 + Math.random() * 2500));
        await sock.sendPresenceUpdate('paused', jid);
      } catch (e) { /* noop */ }
      // Native-flow buttons break delivery on some numbers (recipient sees
      // "Waiting for this message"), so deliver as plain text (numbered
      // options) which works everywhere.
      const result = job.buttonsPayload
        ? await sock.sendMessage(jid, { text: job.buttonsPayload.text })
        : await sock.sendMessage(jid, job.content, job.options || {});
      if (result?.key?.id && result.message) {
        state.msgStore.set(result.key.id, result);
        if (state.msgStore.size > 500) state.msgStore.delete(state.msgStore.keys().next().value);
      }
      job.resolve(result);
    } catch (e) {
      job.reject(e);
    } finally {
      const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
      setTimeout(() => { state.sending = false; processQueue(workspaceId, slotId); }, state.queue.length > 0 ? delay : 0);
    }
  };
  run();
}

// Unofficial native-flow buttons (the trick other QR panels use). Renders as
// real tappable buttons on most devices; the numbered-text fallback is already
// part of the body text for devices that don't render it.
async function sendNativeButtons(sock, jid, { text, footer, buttons }) {
  const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
  const msg = generateWAMessageFromContent(jid, {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: proto.Message.InteractiveMessage.create({
          body: proto.Message.InteractiveMessage.Body.create({ text: text || '' }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: footer || '' }),
          header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: (buttons || []).slice(0, 10).map((b) => ({
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({ display_text: String(b.title || '').slice(0, 25), id: b.id }),
            })),
          }),
        }),
      },
    },
  }, { userJid: sock.user?.id });
  await sock.relayMessage(jid, msg.message, {
    messageId: msg.key.id,
    // "biz" node makes phones render native-flow buttons from non-business accounts
    additionalNodes: [{
      tag: 'biz',
      attrs: {},
      content: [{
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { name: 'quick_reply' } }],
      }],
    }],
  });
  return msg;
}

// Public send API. Returns the Baileys send result.
// slotId 缺省 'default'：老调用方（会话控制器、机器人流程等）行为完全不变。
async function sendMessage(workspaceId, phone, { type = 'text', text, media, buttons, footer, contextMessageId, contextFromMe, contextText }, slotId = 'default') {
  const id = String(workspaceId);
  const state = getState(id, slotId);
  if (!state.sock || state.status !== 'connected') throw new Error('WhatsApp by QR is not connected (scan the QR on the Channels page)');
  await checkAndCountSend(id, slotId);

  let content;
  // SEC-SSRF：Baileys 会在服务端拉取 media.url，禁止指向内网
  if (media && media.url) await require('../utils/safeOutboundUrl')(media.url, '媒体地址');
  if (type === 'image') content = { image: { url: media.url }, caption: media.caption || text || '' };
  else if (type === 'video') content = { video: { url: media.url }, caption: media.caption || text || '' };
  else if (type === 'audio') content = { audio: { url: media.url }, mimetype: 'audio/mp4' };
  else if (type === 'document') content = { document: { url: media.url }, fileName: media.filename || 'document', caption: media.caption || '' };
  else content = { text: text || '' };

  const options = {};
  if (contextMessageId) {
    const jid = String(phone).includes('@') ? phone : (String(phone).replace(/\D/g, '') + '@s.whatsapp.net');
    options.quoted = { key: { remoteJid: jid, fromMe: !!contextFromMe, id: contextMessageId }, message: { conversation: contextText || '' } };
  }
  return new Promise((resolve, reject) => {
    if (type === 'buttons') state.queue.push({ phone, buttonsPayload: { text: text || '', footer: footer || '', buttons: buttons || [] }, resolve, reject });
    else state.queue.push({ phone, content, options, resolve, reject });
    processQueue(id, slotId);
  });
}

async function getStatus(workspaceId, slotId = 'default') {
  const id = String(workspaceId);
  const state = getState(id, slotId);
  let qrDataUrl = null;
  if (state.qr) {
    const QRCode = require('qrcode');
    qrDataUrl = await QRCode.toDataURL(state.qr, { width: 280, margin: 1 });
  }
  const Workspace = require('../models/Workspace');
  const ws = await Workspace.findById(id).lean();
  const doc = slotDocOf(ws, slotId) || {};
  const today = new Date().toISOString().slice(0, 10);
  const sentToday = doc.sentDate === today ? (doc.sentToday || 0) : 0;
  return {
    slotId,
    label: slotId === 'default' ? '' : (doc.label || ''),
    status: state.status,
    phone: state.phone || doc.phone || '',
    qr: qrDataUrl,
    warmupStartedAt: doc.warmupStartedAt || null,
    warmupDay: doc.warmupStartedAt ? Math.min(Math.floor((Date.now() - new Date(doc.warmupStartedAt).getTime()) / 86400000) + 1, WARMUP_CAPS.length) : 1,
    warmupTotalDays: WARMUP_CAPS.length,
    todayCap: doc.dailyLimit > 0 ? doc.dailyLimit : dayCap(doc.warmupStartedAt),
    customLimit: doc.dailyLimit || 0,
    sentToday,
  };
}

// Permanently delete all QR-channel data (chats, messages, contacts) for a
// workspace SLOT. Called only on a real logout / manual disconnect — never on
// a transient reconnect — so a brief network drop never wipes data. Contacts
// that still have a conversation on any other channel (Cloud API, etc.) are
// kept.
// 多槽位下按槽清理：default 槽也清理 waNumberId 为空的历史会话（多槽之前
// 创建的 QR 会话都没有绑定号，视为主号数据，保持旧行为）；附加槽只清理
// waNumberId='qr:<slotId>' 的会话，互不影响。
async function purgeQrData(workspaceId, slotId = 'default') {
  const mongoose = require('mongoose');
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');
  const Contact = require('../models/Contact');
  try {
    const bindFilter = slotId === 'default'
      ? { $in: [null, '', 'qr:default'] }
      : `qr:${slotId}`;
    const convs = await Conversation.find({ workspace: workspaceId, channel: 'whatsapp_qr', waNumberId: bindFilter }).select('_id contact').lean();
    if (!convs.length) return;
    const convIds = convs.map(c => c._id);
    const contactIds = [...new Set(convs.map(c => c.contact && String(c.contact)).filter(Boolean))]
      .map(s => new mongoose.Types.ObjectId(s));
    const msgRes = await Message.deleteMany({ workspace: workspaceId, conversation: { $in: convIds } });
    await Conversation.deleteMany({ _id: { $in: convIds } });
    let contactsDeleted = 0;
    for (const cid of contactIds) {
      const remaining = await Conversation.countDocuments({ workspace: workspaceId, contact: cid });
      if (remaining === 0) { await Contact.deleteOne({ _id: cid, workspace: workspaceId }); contactsDeleted++; }
    }
    console.log(`[waQr:${workspaceId}:${slotId}] purged QR data on disconnect: conversations=${convIds.length} messages=${msgRes.deletedCount || 0} contacts=${contactsDeleted}`);
  } catch (e) {
    console.error(`[waQr:${workspaceId}:${slotId}] purgeQrData failed:`, e.message);
  }
}

async function disconnect(workspaceId, slotId = 'default') {
  const id = String(workspaceId);
  const state = getState(id, slotId);
  // Detach first (intentional close): the close handler then bails via the
  // stale-socket guard, so a manual disconnect can never auto-reconnect or
  // double-run the logged-out cleanup below.
  const oldSock = state.sock;
  state.sock = null;
  try { if (oldSock) await oldSock.logout(); } catch (e) { /* noop */ }
  try { if (oldSock) oldSock.end(); } catch (e) { /* noop */ }
  state.status = 'disconnected';
  state.qr = null;
  state.phone = '';
  try { fs.rmSync(authDirFor(id, slotId), { recursive: true, force: true }); } catch (e) { /* noop */ }
  if (slotId === 'default') {
    await updateSlotFields(id, 'default', { enabled: false, status: 'disconnected' });
  } else {
    await updateSlotFields(id, slotId, { status: 'disconnected', phone: '' });
  }
  await purgeQrData(id, slotId);
}

// Set a custom daily send limit (0 = automatic warm-up schedule).
async function setDailyLimit(workspaceId, limit, slotId = 'default') {
  const value = Math.max(0, Math.min(2000, parseInt(limit, 10) || 0));
  await updateSlotFields(workspaceId, slotId, { dailyLimit: value });
  return value;
}

// Restart the socket without logging out. WhatsApp re-delivers messages
// received while the server was offline, like reopening WhatsApp Web.
async function syncSession(workspaceId, slotId = 'default') {
  const id = String(workspaceId);
  const state = getState(id, slotId);
  // Detach first: once state.sock no longer points at the old socket, its
  // close handler bails (stale-socket guard) instead of nulling the new
  // socket or scheduling a competing reconnect.
  const oldSock = state.sock;
  state.sock = null;
  state.status = 'reconnecting';
  try { if (oldSock) oldSock.end(); } catch (e) { /* noop */ }
  return startSession(id, slotId);
}

// Restore sessions for previously-connected workspaces on boot.
// 同时恢复两种目录形态：wa_sessions/<wsId>/（default 槽）和
// wa_sessions/<wsId>__<slotId>/（附加槽）。
async function restoreAll() {
  const Workspace = require('../models/Workspace');
  const list = await Workspace.find({ $or: [{ 'waQr.enabled': true }, { 'waQrSlots.0': { $exists: true } }] })
    .select('_id waQr waQrSlots').lean();
  for (const ws of list) {
    const id = String(ws._id);
    if (ws.waQr && ws.waQr.enabled && fs.existsSync(authDirFor(id, 'default'))) {
      startSession(id, 'default').catch(() => {});
    }
    for (const slot of ws.waQrSlots || []) {
      if (slot.enabled === false) continue;
      if (fs.existsSync(authDirFor(id, slot.slotId))) startSession(id, slot.slotId).catch(() => {});
    }
  }
}

async function subscribePresence(workspaceId, phone, slotId = 'default') {
  const id = String(workspaceId);
  const state = getState(id, slotId);
  if (!state.sock || state.status !== 'connected') return false;
  const jid = String(phone).includes('@') ? phone : (String(phone).replace(/\D/g, '') + '@s.whatsapp.net');
  try { await state.sock.presenceSubscribe(jid); return true; } catch (e) { return false; }
}

async function sendReaction(workspaceId, phone, targetId, emoji, fromMe, slotId = 'default') {
  const id = String(workspaceId);
  const state = getState(id, slotId);
  if (!state.sock || state.status !== 'connected') {
    throw new Error('WhatsApp by QR is not connected (scan the QR on the Channels page)');
  }
  const jid = String(phone).includes('@') ? phone : (String(phone).replace(/\D/g, '') + '@s.whatsapp.net');
  return state.sock.sendMessage(jid, { react: { text: emoji || '', key: { remoteJid: jid, fromMe: !!fromMe, id: targetId } } });
}

// ===== 号池槽位管理（新增导出）=====

// 列出全部槽位（default 永远在首位），合并运行时内存状态（status/phone）。
async function listSlots(workspaceId) {
  const Workspace = require('../models/Workspace');
  const id = String(workspaceId);
  const ws = await Workspace.findById(id).select('waQr waQrSlots waQrPoolEnabled').lean();
  const today = new Date().toISOString().slice(0, 10);
  const build = (slotId, doc, isDefault) => {
    const st = sessions.get(skey(id, slotId));
    return {
      slotId,
      label: isDefault ? (doc.label || '主号') : (doc.label || ''),
      status: (st && st.status) || doc.status || 'disconnected',
      phone: (st && st.phone) || doc.phone || '',
      enabled: isDefault ? !!doc.enabled : doc.enabled !== false,
      dailyLimit: doc.dailyLimit || 0,
      sentToday: doc.sentDate === today ? (doc.sentToday || 0) : 0,
      todayCap: doc.dailyLimit > 0 ? doc.dailyLimit : dayCap(doc.warmupStartedAt),
      isDefault,
    };
  };
  const rows = [build('default', (ws && ws.waQr) || {}, true)];
  for (const s of (ws && ws.waQrSlots) || []) rows.push(build(s.slotId, s, false));
  return rows;
}

// 新建附加槽位；slotId = 'n' + 随机短串（避免与 'default' 和 Mongo 字段名冲突）。
async function createSlot(workspaceId, label) {
  const Workspace = require('../models/Workspace');
  const slotId = 'n' + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 4);
  await Workspace.updateOne(
    { _id: workspaceId },
    { $push: { waQrSlots: { slotId, label: String(label || '').slice(0, 60), status: 'disconnected', phone: '', enabled: true, dailyLimit: 1000, sentToday: 0, sentDate: '' } } }
  );
  return { slotId };
}

// 删除附加槽位：断开会话（含删会话目录、清该槽的会话数据）后移除数组元素。
// default 槽不可删（走旧的 /disconnect）。
async function deleteSlot(workspaceId, slotId) {
  if (!slotId || slotId === 'default') throw new Error('默认号码不可删除');
  const Workspace = require('../models/Workspace');
  const id = String(workspaceId);
  await disconnect(id, slotId); // 登出 + 删 wa_sessions 目录 + 清理该槽会话数据
  await Workspace.updateOne({ _id: id }, { $pull: { waQrSlots: { slotId } } });
  sessions.delete(skey(id, slotId));
  startInFlight.delete(skey(id, slotId));
}

// 当前"可用"槽位列表：enabled + 运行时已连接 + 今日未达日限额（含 default）。
async function usableSlots(workspaceId) {
  const Workspace = require('../models/Workspace');
  const id = String(workspaceId);
  const ws = await Workspace.findById(id).select('waQr waQrSlots').lean();
  if (!ws) return [];
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  const check = (slotId, doc, enabled) => {
    if (!enabled) return;
    const st = sessions.get(skey(id, slotId));
    if (!st || st.status !== 'connected') return;
    const sent = doc.sentDate === today ? (doc.sentToday || 0) : 0;
    const cap = doc.dailyLimit > 0 ? doc.dailyLimit : dayCap(doc.warmupStartedAt);
    if (sent >= cap) return;
    out.push(slotId);
  };
  check('default', ws.waQr || {}, !!(ws.waQr && ws.waQr.enabled));
  for (const s of ws.waQrSlots || []) check(s.slotId, s, s.enabled !== false);
  return out;
}

// 号池取槽：在可用槽位间用 $inc waQrPoolCursor 原子轮询；全部不可用返回 ''
// （由调用方决定失败还是自动暂停）。
async function pickPoolSlot(workspaceId) {
  const Workspace = require('../models/Workspace');
  const id = String(workspaceId);
  const usable = await usableSlots(id);
  if (!usable.length) return '';
  if (usable.length === 1) return usable[0];
  const upd = await Workspace.findByIdAndUpdate(id, { $inc: { waQrPoolCursor: 1 } }, { new: true }).select('waQrPoolCursor').lean();
  const cursor = (upd && upd.waQrPoolCursor) || 0;
  return usable[((cursor % usable.length) + usable.length) % usable.length];
}

// 指定槽位的发送适配器：接口与 botFlowEngine.getSender 的 QR 分支一致
// （sendText/sendMedia/sendInteractive，交互按钮降级为编号选项文本），供号池
// 群发（qrCampaign）按槽发送 preset 使用。
function makeSlotSender(workspace, conversation, slotId) {
  const wsId = workspace._id;
  const wrap = async (fn) => {
    try {
      const r = await fn();
      return { success: true, data: { messages: [{ id: `qr_${r?.key?.id || ''}` }] } };
    } catch (e) {
      console.error(`[QRPool:${wsId}:${slotId}] send failed:`, e.message);
      return { success: false, error: { message: e.message } };
    }
  };
  const sender = {
    sendTextMessage: (to, text) => wrap(() => sendMessage(wsId, to, { type: 'text', text }, slotId)),
    sendMediaMessage: (to, type, url, caption) => wrap(() => sendMessage(wsId, to, { type, media: { url, caption: caption || '' } }, slotId)),
    sendTemplateMessage: async () => ({ success: false, error: { message: 'Templates are not supported on the WhatsApp QR channel' } }),
    // 交互按钮/列表在 QR 渠道按编号选项文本发送；回复的编号/标题由入站映射回选项 id
    sendInteractiveMessage: (to, interactive) => wrap(async () => {
      const opts = [];
      for (const b of interactive?.action?.buttons || []) {
        if (b?.reply?.id) opts.push({ id: b.reply.id, title: b.reply.title || '' });
      }
      for (const s of interactive?.action?.sections || []) {
        for (const row of s?.rows || []) {
          if (row?.id) opts.push({ id: row.id, title: row.title || '', description: row.description || '' });
        }
      }
      let text = '';
      if (interactive?.header?.type === 'text' && interactive.header.text) text += `*${interactive.header.text}*\n\n`;
      text += interactive?.body?.text || '';
      if (interactive?.action?.parameters?.url) text += `\n${interactive.action.parameters.url}`;
      if (opts.length) {
        text += '\n\n' + opts.map((o, i) => `${i + 1}. ${o.title}${o.description ? ' — ' + o.description : ''}`).join('\n');
        text += '\n\nReply with the option number.';
        require('./qrAutomation').rememberOptions(conversation._id, opts);
      }
      if (interactive?.footer?.text) text += `\n\n_${interactive.footer.text}_`;
      sender.lastSentText = text;
      const h = interactive?.header;
      const mediaLink = h && h.type && h.type !== 'text' && h[h.type]?.link;
      if (mediaLink) return sendMessage(wsId, to, { type: h.type, media: { url: mediaLink, caption: text } }, slotId);
      return sendMessage(wsId, to, { type: 'text', text }, slotId);
    }),
  };
  return sender;
}

// 仅供脱机自测使用（不要在业务代码调用）：伪造槽位运行时状态，
// 用于不启动 Baileys 连接时验证 usableSlots/pickPoolSlot 轮询逻辑。
function _testSetState(workspaceId, slotId, patch) {
  Object.assign(getState(workspaceId, slotId), patch || {});
}

module.exports = {
  startSession, sendMessage, sendReaction, subscribePresence, getStatus, disconnect, restoreAll, syncSession, setDailyLimit,
  // 号池多槽位
  listSlots, createSlot, deleteSlot, usableSlots, pickPoolSlot, makeSlotSender,
  _testSetState,
};
