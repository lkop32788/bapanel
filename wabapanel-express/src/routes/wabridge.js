// 商户端「六段凭证号」：whatsmeow 常驻桥接号的导入/列表/删除。
// 号本体是 external_api 槽位(backend='wa_bridge')，收发复用 external_api；
// 这里只做自助导入与管理。实际会话常驻在 yuncang-proxy。
const router = require('express').Router();
const crypto = require('crypto');
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const extSvc = require('../services/externalApiService');
const waBridge = require('../services/waBridgeService');

router.use(protect, workspaceAccess);
router.use(requireFeature('whatsappQr'));

// 解析六段凭证：JSON {phone,noisePriv,identityPriv,hash} 或逗号格式
// phone,noisePub,noisePriv,identPub,identPriv,hash（可带 |proxy 尾部）
function parseSeg6(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (raw[0] === '{') {
    try {
      const o = JSON.parse(raw);
      if (o.phone && o.noisePriv && o.identityPriv && o.hash) {
        return { phone: o.phone, noisePriv: o.noisePriv, identityPriv: o.identityPriv, hash: o.hash, platform: o.platform, proxy: o.proxy };
      }
    } catch { /* 按逗号解析 */ }
    return null;
  }
  const parts = raw.split('|');
  const segs = parts[0].split(',').map((s) => s.trim());
  const proxy = parts[1] || '';
  if (segs.length >= 6) {
    return { phone: segs[0], noisePriv: segs[2], identityPriv: segs[4], hash: segs[5], proxy };
  }
  return null;
}

// 导入：生成 slotId+secret → 建槽位 → yuncang 常驻登录；登录失败回滚槽位
router.post('/import', async (req, res) => {
  try {
    const b = req.body || {};
    const cred = (b.phone && b.noisePriv && b.identityPriv && b.hash)
      ? { phone: b.phone, noisePriv: b.noisePriv, identityPriv: b.identityPriv, hash: b.hash, platform: b.platform, proxy: b.proxy }
      : parseSeg6(b.raw);
    if (!cred) return res.status(400).json({ success: false, message: '凭据格式无法识别（需 phone/noisePriv/identityPriv/hash 或逗号六段）' });
    if (b.platform) cred.platform = b.platform;

    const wsId = req.workspace._id;
    const slotId = 'b' + crypto.randomBytes(5).toString('hex');
    const secret = crypto.randomBytes(16).toString('hex');

    // 先建槽位（含 secret），入站 webhook 才能验签；登录失败再删
    await extSvc.createBridgeSlot(wsId, { slotId, label: b.label, webhookSecret: secret });
    try {
      const data = await waBridge.login({ ...cred, wsId, slotId, secret });
      // 回填 jid/phone
      const Workspace = require('../models/Workspace');
      await Workspace.updateOne(
        { _id: wsId, 'externalApiSlots.slotId': slotId },
        { $set: { 'externalApiSlots.$[s].jid': data.jid || '', 'externalApiSlots.$[s].phone': data.phone || '' } },
        { arrayFilters: [{ 's.slotId': slotId }] }
      ).catch(() => {});
      res.json({ success: true, message: '登录成功，已加入号池', data: { slotId, jid: data.jid, phone: data.phone } });
    } catch (e) {
      await extSvc.deleteSlot(wsId, slotId).catch(() => {}); // 回滚
      res.status(500).json({ success: false, message: e.message });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 列表：槽位 + yuncang 实时在线状态
router.get('/slots', async (req, res) => {
  try {
    const slots = await extSvc.listBridgeSlots(req.workspace._id);
    let live = [];
    try { live = await waBridge.sessions(); } catch { /* yuncang 不可达时忽略 */ }
    const liveBy = {};
    for (const s of live) liveBy[`${s.wsId}:${s.slotId}`] = s;
    const wsId = String(req.workspace._id);
    const out = slots.map((s) => {
      const l = liveBy[`${wsId}:${s.slotId}`];
      return { ...s, status: l ? (l.connected ? 'connected' : (l.status || 'disconnected')) : 'disconnected' };
    });
    res.json({ success: true, data: out });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 删除：yuncang 下线 + 移除槽位
router.delete('/slots/:slotId', async (req, res) => {
  try {
    const wsId = req.workspace._id;
    const slotId = req.params.slotId;
    await waBridge.logout(wsId, slotId).catch(() => {});
    await extSvc.deleteSlot(wsId, slotId);
    res.json({ success: true, message: '号码已下线并移除' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
