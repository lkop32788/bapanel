/**
 * externalApiService.js — 外部 API 占位渠道适配器
 *
 * 运营者在渠道页为每个槽位配置：
 *   endpoint   — 面板外发消息时 POST 到这个 URL（保存和发送时都过 SSRF 校验）
 *   apiKey     — 鉴权密钥（放进 authHeader 请求头）
 *   authHeader — 默认 "Authorization"（值: Bearer <apiKey>；自定义头则直接放 key）
 *
 * 外发消息体（面板 → 第三方 API）：
 *   { to, type: 'text'|'image'|'video'|'audio'|'document', text, media: { url, caption } }
 *   期望响应（任一形状）：{ messageId } / { id } / { data: { messageId } }
 *
 * 入站消息体（第三方 → 面板 POST /api/webhook/extapi/:wsId/:slotId?secret=<webhookSecret>）：
 *   消息   { from, type, text, messageId, media: { url, caption } }
 *   状态   { event: 'status', messageId, status: 'sent'|'delivered'|'read'|'failed' }
 */

const axios = require('axios');
const crypto = require('crypto');
const Workspace = require('../models/Workspace');
const assertSafeOutboundUrl = require('../utils/safeOutboundUrl');

const MASK = '••••';

// ---------- 槽位 CRUD ----------

async function listSlots(workspaceId) {
  const ws = await Workspace.findById(workspaceId).select('+externalApiSlots');
  if (!ws) throw new Error('Workspace not found');
  return (ws.externalApiSlots || []).map((s) => ({
    slotId: s.slotId,
    label: s.label,
    endpoint: s.endpoint,
    apiKey: s.apiKey ? MASK : '',       // 不回显明文
    authHeader: s.authHeader || 'Authorization',
    webhookSecret: s.webhookSecret,     // 运营者要拿去配给第三方，必须回显
    enabled: s.enabled,
    status: s.endpoint ? 'configured' : 'unconfigured',
    lastError: s.lastError || '',
    lastSentAt: s.lastSentAt,
    lastInboundAt: s.lastInboundAt,
  }));
}

async function createSlot(workspaceId, label) {
  const slotId = crypto.randomBytes(5).toString('hex');
  const webhookSecret = crypto.randomBytes(16).toString('hex');
  await Workspace.findByIdAndUpdate(workspaceId, {
    $push: {
      externalApiSlots: {
        slotId,
        label: String(label || `外部 API ${slotId.slice(0, 4)}`).slice(0, 50),
        endpoint: '',
        apiKey: '',
        authHeader: 'Authorization',
        webhookSecret,
        enabled: true,
      },
    },
  });
  return { slotId, webhookSecret };
}

async function updateSlot(workspaceId, slotId, fields) {
  const set = {};
  if (fields.label !== undefined) set['externalApiSlots.$[s].label'] = String(fields.label).slice(0, 50);
  if (fields.enabled !== undefined) set['externalApiSlots.$[s].enabled'] = !!fields.enabled;
  if (fields.authHeader !== undefined) {
    const h = String(fields.authHeader).trim();
    if (h && !/^[A-Za-z0-9-]{1,64}$/.test(h)) throw new Error('认证头名称只允许字母/数字/连字符');
    set['externalApiSlots.$[s].authHeader'] = h || 'Authorization';
  }
  // 前端回显的是掩码，收到掩码表示"未改动"，不能存成密钥
  if (fields.apiKey !== undefined && fields.apiKey !== MASK) {
    set['externalApiSlots.$[s].apiKey'] = String(fields.apiKey);
  }
  if (fields.endpoint !== undefined) {
    const ep = String(fields.endpoint).trim();
    if (ep) await assertSafeOutboundUrl(ep, '外部 API endpoint'); // SEC-SSRF
    set['externalApiSlots.$[s].endpoint'] = ep;
    set['externalApiSlots.$[s].lastError'] = '';
  }
  if (!Object.keys(set).length) throw new Error('没有要更新的字段');
  const r = await Workspace.updateOne(
    { _id: workspaceId, 'externalApiSlots.slotId': slotId },
    { $set: set },
    { arrayFilters: [{ 's.slotId': slotId }] }
  );
  if (!r.matchedCount) throw new Error('槽位不存在');
}

async function rotateSecret(workspaceId, slotId) {
  const webhookSecret = crypto.randomBytes(16).toString('hex');
  const r = await Workspace.updateOne(
    { _id: workspaceId, 'externalApiSlots.slotId': slotId },
    { $set: { 'externalApiSlots.$[s].webhookSecret': webhookSecret } },
    { arrayFilters: [{ 's.slotId': slotId }] }
  );
  if (!r.matchedCount) throw new Error('槽位不存在');
  return { webhookSecret };
}

async function deleteSlot(workspaceId, slotId) {
  await Workspace.findByIdAndUpdate(workspaceId, {
    $pull: { externalApiSlots: { slotId } },
  });
  // 清掉绑定该槽的会话（置空后下次发送自动从池重新取号），否则这些会话永远发不出
  const Conversation = require('../models/Conversation');
  await Conversation.updateMany(
    { workspace: workspaceId, channel: 'external_api', waNumberId: `ext:${slotId}` },
    { $set: { waNumberId: '' } }
  );
}

// 六段凭证号（wa_bridge）：建槽位（backend 标记 + jid/phone），复用 external_api 收发
async function createBridgeSlot(workspaceId, { slotId, label, jid, phone, webhookSecret }) {
  await Workspace.findByIdAndUpdate(workspaceId, {
    $push: {
      externalApiSlots: {
        slotId,
        label: String(label || `六段号 ${slotId.slice(0, 4)}`).slice(0, 50),
        endpoint: '', apiKey: '', authHeader: 'Authorization',
        webhookSecret, enabled: true,
        backend: 'wa_bridge', jid: jid || '', phone: phone || '',
      },
    },
  });
}

async function listBridgeSlots(workspaceId) {
  const ws = await Workspace.findById(workspaceId).select('+externalApiSlots');
  if (!ws) return [];
  return (ws.externalApiSlots || [])
    .filter((s) => s.backend === 'wa_bridge')
    .map((s) => ({
      slotId: s.slotId, label: s.label, phone: s.phone, jid: s.jid,
      enabled: s.enabled, lastError: s.lastError || '',
      lastInboundAt: s.lastInboundAt, lastSentAt: s.lastSentAt,
    }));
}

async function getSlot(workspaceId, slotId) {
  const ws = await Workspace.findById(workspaceId).select('+externalApiSlots');
  if (!ws) throw new Error('Workspace not found');
  const slot = (ws.externalApiSlots || []).find((s) => s.slotId === slotId);
  if (!slot) throw new Error(`外部 API 槽位 ${slotId} 不存在`);
  return slot;
}

// ---------- 号池轮询 ----------

async function pickPoolSlot(workspaceId) {
  const ws = await Workspace.findByIdAndUpdate(
    workspaceId,
    { $inc: { externalApiPoolCursor: 1 } },        // 原子推进游标（并发不重号）
    { new: true, select: '+externalApiSlots externalApiPoolCursor' }
  );
  if (!ws) return null;
  const usable = (ws.externalApiSlots || []).filter((s) => s.enabled && s.endpoint);
  if (!usable.length) return null;
  return usable[(ws.externalApiPoolCursor - 1) % usable.length].slotId;
}

// 可用槽位列表（externalApiSlots 是 select:false，必须显式取）
async function usableSlots(workspaceId) {
  const ws = await Workspace.findById(workspaceId).select('+externalApiSlots');
  return ((ws && ws.externalApiSlots) || []).filter((s) => s.enabled && s.endpoint);
}

// ---------- 发消息 ----------

const markSlot = (workspaceId, slotId, set) =>
  Workspace.updateOne(
    { _id: workspaceId, 'externalApiSlots.slotId': slotId },
    { $set: Object.fromEntries(Object.entries(set).map(([k, v]) => [`externalApiSlots.$[s].${k}`, v])) },
    { arrayFilters: [{ 's.slotId': slotId }] }
  ).catch(() => {});

function buildHeaders(slot) {
  const headers = { 'Content-Type': 'application/json' };
  if (slot.apiKey) {
    const name = slot.authHeader || 'Authorization';
    headers[name] = name.toLowerCase() === 'authorization' ? `Bearer ${slot.apiKey}` : slot.apiKey;
  }
  return headers;
}

// 返回 { messageId }：把第三方各种响应形状归一化
function extractMessageId(data) {
  if (!data || typeof data !== 'object') return '';
  return String(data.messageId || data.message_id || data.id || data.data?.messageId || data.data?.id || '');
}

async function sendMessage(workspaceId, to, payload, slotId) {
  const slot = await getSlot(workspaceId, slotId);
  if (!slot.enabled) throw new Error(`槽位 ${slot.label || slotId} 已停用`);

  // 六段凭证号（whatsmeow 常驻）：外发内部直调 yuncang，不走 endpoint POST。
  // 一期仅文本；媒体二期。
  if (slot.backend === 'wa_bridge') {
    const text = payload.text || (payload.media && payload.media.caption) || '';
    if (!text) throw new Error('六段凭证号一期仅支持文本消息');
    try {
      const r = await require('./waBridgeService').send(workspaceId, slotId, to, text);
      markSlot(workspaceId, slotId, { lastSentAt: new Date(), lastError: '' });
      return { messageId: String((r && r.messageId) || ''), raw: r };
    } catch (e) {
      markSlot(workspaceId, slotId, { lastError: String(e.message).slice(0, 500) });
      throw new Error(`六段凭证号发送失败（${slot.label || slotId}）：${e.message}`);
    }
  }

  if (!slot.endpoint) throw new Error(`槽位 ${slot.label || slotId} 未配置 endpoint`);
  await assertSafeOutboundUrl(slot.endpoint, '外部 API endpoint'); // SEC-SSRF：DNS 可能变，发送时复检

  const body = { to: String(to), type: payload.type || 'text' };
  if (payload.text) body.text = payload.text;
  if (payload.media && payload.media.url) body.media = { url: payload.media.url, caption: payload.media.caption || '' };

  try {
    const resp = await axios.post(slot.endpoint, body, {
      headers: buildHeaders(slot),
      timeout: 15000,
      maxRedirects: 0,            // SEC-SSRF：禁止重定向绕过校验
      validateStatus: (s) => s >= 200 && s < 300,
    });
    markSlot(workspaceId, slotId, { lastSentAt: new Date(), lastError: '' });
    return { messageId: extractMessageId(resp.data), raw: resp.data };
  } catch (e) {
    const detail = e.response
      ? `HTTP ${e.response.status}: ${JSON.stringify(e.response.data || '').slice(0, 300)}`
      : e.message;
    markSlot(workspaceId, slotId, { lastError: detail.slice(0, 500) });
    throw new Error(`外部 API 发送失败（${slot.label || slotId}）：${detail}`);
  }
}

// 连通性测试：POST { type:'connectivity_test' }，只报告 HTTP 结果不入库
async function testSlot(workspaceId, slotId) {
  const slot = await getSlot(workspaceId, slotId);
  if (!slot.endpoint) throw new Error('槽位未配置 endpoint');
  await assertSafeOutboundUrl(slot.endpoint, '外部 API endpoint');
  const started = Date.now();
  try {
    const resp = await axios.post(slot.endpoint, { type: 'connectivity_test' }, {
      headers: buildHeaders(slot), timeout: 10000, maxRedirects: 0, validateStatus: () => true,
    });
    const ok = resp.status >= 200 && resp.status < 300;
    if (ok) markSlot(workspaceId, slotId, { lastError: '' });
    return { ok, httpStatus: resp.status, latencyMs: Date.now() - started };
  } catch (e) {
    return { ok: false, httpStatus: 0, latencyMs: Date.now() - started, error: e.message };
  }
}

module.exports = {
  listSlots, createSlot, updateSlot, deleteSlot, rotateSecret, getSlot,
  pickPoolSlot, usableSlots, sendMessage, testSlot,
  createBridgeSlot, listBridgeSlots,
};
