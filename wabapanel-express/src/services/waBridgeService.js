/**
 * waBridgeService.js — 面板 ↔ yuncang-proxy WhatsApp 常驻桥接客户端
 *
 * 六段凭证号由 yuncang-proxy 用 whatsmeow 常驻持有会话。面板侧把这些号建成
 * external_api 槽位（backend='wa_bridge'），复用收件箱/群发/机器人/号池；
 * 外发不走 external_api 的 endpoint POST（会被 SSRF 校验挡掉环回地址），而是
 * 由本服务内部直调 yuncang（平台可控、本机环回，安全）。入站由 yuncang 回推
 * 面板 /api/webhook/extapi/:wsId/:slotId?secret=，复用 externalApiInbound。
 */
const waFactory = require('./waFactoryService'); // 复用 yuncang baseUrl 解析

// yuncang 回推入站用的面板地址：本机直连后端（绕开公网 DNS/TLS）
function panelWebhookBase() {
  const host = process.env.HOST && process.env.HOST !== '0.0.0.0' ? process.env.HOST : '127.0.0.1';
  const port = process.env.PORT || 5000;
  return `http://${host}:${port}`;
}

async function base() {
  const cfg = await waFactory.getConfig();
  return cfg.baseUrl;
}

async function call(path, body, timeoutMs = 45000) {
  const url = `${await base()}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (data.code !== 0) throw new Error(data.message || `yuncang 返回错误(${res.status})`);
  return data.data;
}

// 六段凭证登录并常驻；成功返回 { jid, phone }
async function login({ phone, noisePriv, identityPriv, hash, platform, proxy, wsId, slotId, secret }) {
  const cfg = await waFactory.getConfig();
  if (!cfg.enabled) throw new Error('六段凭证号接入未启用');
  return call('/api/wa/bridge/login', {
    phone, noisePriv, identityPriv, hash,
    platform: platform || cfg.defaultPlatform,
    proxy: cfg.allowProxy ? (proxy || '') : '',
    wsId: String(wsId), slotId, secret,
    webhook: panelWebhookBase(),
  }, (cfg.timeoutMs || 35000) + 10000);
}

// 外发文本（external_api sendMessage 对 backend=='wa_bridge' 的槽调用）
async function send(wsId, slotId, to, text) {
  return call('/api/wa/bridge/send', { wsId: String(wsId), slotId, to, text }, 25000);
}

async function logout(wsId, slotId) {
  return call('/api/wa/bridge/logout', { wsId: String(wsId), slotId }, 10000).catch(() => null);
}

async function sessions() {
  const url = `${await base()}/api/wa/bridge/sessions`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = await res.json().catch(() => ({}));
  return (data && data.data) || [];
}

module.exports = { login, send, logout, sessions, panelWebhookBase };
