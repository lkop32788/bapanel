/**
 * waFactoryService.js — Baileys 转换 API 客户端
 *
 * 平台运营者在「管理 → Baileys 转换 API」里配置工厂服务地址/开关；实际服务由
 * yuncang-proxy 提供（Go + whatsmeow），端点：
 *   GET  /api/wa/health         健康检查
 *   POST /api/wa/seg6-login     六段凭证登录 → 返回 Baileys creds.json
 *   POST /api/wa/seg6-convert   仅格式转换（不实际登录）
 *
 * 六段凭证（phone/noisePriv/identityPriv/hash）经工厂登录校验后，转换成 Baileys
 * 的 creds.json，面板写入 wa_sessions/<wsId>/<slotId>/ 即可当普通扫码号使用。
 */
const SystemSettings = require('../models/SystemSettings');

// 默认与 saverUsdtService 一致，走本机 yuncang-proxy
const DEFAULT_URL = (process.env.YUNCANG_URL || 'http://127.0.0.1:5090').replace(/\/+$/, '');

async function getConfig() {
  const s = await SystemSettings.findOne().select('waFactory').lean().catch(() => null);
  const wf = (s && s.waFactory) || {};
  const baseUrl = String(wf.baseUrl || '').trim().replace(/\/+$/, '') || DEFAULT_URL;
  return {
    enabled: !!wf.enabled,
    baseUrl,
    defaultPlatform: wf.defaultPlatform || '0',
    allowProxy: wf.allowProxy !== false,
    timeoutMs: Number(wf.timeoutMs) > 0 ? Number(wf.timeoutMs) : 35000,
  };
}

// 健康检查（供 admin 页「测试连接」用）
async function health() {
  const { baseUrl, enabled } = await getConfig();
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/wa/health`, { signal: AbortSignal.timeout(6000) });
    let body = null;
    try { body = await res.json(); } catch { /* 非 JSON */ }
    return {
      ok: res.ok && !!(body && body.ok),
      httpStatus: res.status,
      latencyMs: Date.now() - started,
      baseUrl,
      enabled,
      service: (body && body.service) || '',
    };
  } catch (e) {
    return { ok: false, httpStatus: 0, latencyMs: Date.now() - started, baseUrl, enabled, error: e.message };
  }
}

// 六段凭证 → Baileys creds（登录校验）。供商户侧上传入口后续调用。
async function seg6Login({ phone, noisePriv, identityPriv, hash, platform, proxy }) {
  const cfg = await getConfig();
  if (!cfg.enabled) throw new Error('Baileys 转换 API 未启用');
  const res = await fetch(`${cfg.baseUrl}/api/wa/seg6-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone, noisePriv, identityPriv, hash,
      platform: platform || cfg.defaultPlatform,
      proxy: cfg.allowProxy ? (proxy || '') : '',
    }),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (data.code !== 0) throw new Error(data.message || '六段凭证登录失败');
  return data.data; // { jid, phone, platform, creds, credsB64 }
}

// 仅格式转换（不实际登录），用于预览/离线导入
async function seg6Convert({ phone, noisePriv, identityPriv, hash }) {
  const cfg = await getConfig();
  const res = await fetch(`${cfg.baseUrl}/api/wa/seg6-convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, noisePriv, identityPriv, hash }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (data.code !== 0) throw new Error(data.message || '格式转换失败');
  return data.data;
}

module.exports = { getConfig, health, seg6Login, seg6Convert, DEFAULT_URL };
