/**
 * externalApiService.js — 外部 API 占位渠道适配器
 *
 * 运营者在渠道页为每个槽位配置：
 *   endpoint  — 面板外发消息时 POST 到这个 URL
 *   apiKey    — 鉴权密钥（放进 authHeader 请求头）
 *   authHeader — 默认 "Authorization"（值: Bearer <apiKey>）
 *
 * 外发消息体（面板 → 第三方 API）：
 *   { to, type, text, media: { url, caption } }
 *
 * 入站消息体（第三方 → 面板 webhook /api/webhook/extapi/:wsId/:slotId）：
 *   { from, type, text, messageId, timestamp }
 */

const axios = require('axios');
const Workspace = require('../models/Workspace');
const { v4: uuidv4 } = require('uuid');

// ---------- 槽位 CRUD ----------

async function listSlots(workspaceId) {
  const ws = await Workspace.findById(workspaceId).select('externalApiSlots externalApiPoolEnabled externalApiPoolCursor');
  if (!ws) throw new Error('Workspace not found');
  return (ws.externalApiSlots || []).map((s) => ({
    slotId: s.slotId,
    label: s.label,
    endpoint: s.endpoint,
    apiKey: s.apiKey ? '••••' : '',   // 不回显明文
    authHeader: s.authHeader || 'Authorization',
    enabled: s.enabled,
    status: s.endpoint ? 'configured' : 'unconfigured',
  }));
}

async function createSlot(workspaceId, label) {
  const slotId = uuidv4().replace(/-/g, '').slice(0, 10);
  await Workspace.findByIdAndUpdate(workspaceId, {
    $push: {
      externalApiSlots: {
        slotId,
        label: label || `外部 API ${slotId.slice(0, 4)}`,
        endpoint: '',
        apiKey: '',
        authHeader: 'Authorization',
        enabled: true,
      },
    },
  });
  return { slotId };
}

async function updateSlot(workspaceId, slotId, fields) {
  const set = {};
  const allowed = ['label', 'endpoint', 'apiKey', 'authHeader', 'enabled'];
  for (const k of allowed) {
    if (fields[k] !== undefined) set[`externalApiSlots.$[s].${k}`] = fields[k];
  }
  if (!Object.keys(set).length) throw new Error('没有要更新的字段');
  const r = await Workspace.updateOne(
    { _id: workspaceId, 'externalApiSlots.slotId': slotId },
    { $set: set },
    { arrayFilters: [{ 's.slotId': slotId }] }
  );
  if (!r.matchedCount) throw new Error('槽位不存在');
}

async function deleteSlot(workspaceId, slotId) {
  await Workspace.findByIdAndUpdate(workspaceId, {
    $pull: { externalApiSlots: { slotId } },
  });
}

// ---------- 号池轮询 ----------

async function pickPoolSlot(workspaceId) {
  const ws = await Workspace.findById(workspaceId).select('externalApiSlots externalApiPoolCursor');
  if (!ws) return null;
  const usable = (ws.externalApiSlots || []).filter((s) => s.enabled && s.endpoint);
  if (!usable.length) return null;
  const idx = (ws.externalApiPoolCursor || 0) % usable.length;
  await Workspace.findByIdAndUpdate(workspaceId, { $inc: { externalApiPoolCursor: 1 } });
  return usable[idx].slotId;
}

// ---------- 发消息 ----------

async function sendMessage(workspaceId, to, payload, slotId) {
  const ws = await Workspace.findById(workspaceId).select('externalApiSlots');
  if (!ws) throw new Error('Workspace not found');
  const slot = (ws.externalApiSlots || []).find((s) => s.slotId === slotId);
  if (!slot) throw new Error(`外部 API 槽位 ${slotId} 不存在`);
  if (!slot.endpoint) throw new Error(`槽位 ${slotId} 未配置 endpoint`);

  const headers = { 'Content-Type': 'application/json' };
  if (slot.apiKey) {
    const headerName = slot.authHeader || 'Authorization';
    headers[headerName] = headerName.toLowerCase() === 'authorization'
      ? `Bearer ${slot.apiKey}`
      : slot.apiKey;
  }

  const body = { to, ...payload };
  const resp = await axios.post(slot.endpoint, body, { headers, timeout: 15000 });
  return resp.data;
}

module.exports = { listSlots, createSlot, updateSlot, deleteSlot, pickPoolSlot, sendMessage };
