const router = require('express').Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const tgUser = require('../services/tgUserService');

router.use(protect, workspaceAccess);

// QR login (like Telegram Desktop) — scan from Telegram app > Settings > Devices
router.post('/connect-qr', async (req, res) => {
  try {
    const status = await tgUser.startQrLogin(req.workspace._id, req.body || {});
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Start login: sends the OTP code to the phone's Telegram app
router.post('/connect', async (req, res) => {
  try {
    const { apiId, apiHash, phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required' });
    const status = await tgUser.startLogin(req.workspace._id, { apiId, apiHash, phone });
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Submit the OTP code
router.post('/code', async (req, res) => {
  try {
    if (!req.body.code) return res.status(400).json({ success: false, message: 'Code is required' });
    tgUser.submitCode(req.workspace._id, req.body.code);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// Submit the 2FA password (if the account has one)
router.post('/password', async (req, res) => {
  try {
    if (!req.body.password) return res.status(400).json({ success: false, message: 'Password is required' });
    tgUser.submitPassword(req.workspace._id, req.body.password);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

router.get('/status', async (req, res) => {
  try {
    const status = await tgUser.getStatus(req.workspace._id);
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Logout and remove the session
router.post('/disconnect', async (req, res) => {
  try {
    await tgUser.disconnect(req.workspace._id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== 号池 v2：多槽位管理（主槽 slotId='default'，附加槽存 tgPersonalSlots）=====

// 列出全部槽位（default 首位，含运行时状态）
router.get('/slots', async (req, res) => {
  try {
    const slots = await tgUser.listSlots(req.workspace._id);
    res.json({ success: true, data: slots });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 新建附加槽位
router.post('/slots', async (req, res) => {
  try {
    const data = await tgUser.createSlot(req.workspace._id, (req.body || {}).label);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 按槽位 QR 登录（语义同 /connect-qr）
router.post('/slots/:slotId/connect-qr', async (req, res) => {
  try {
    const status = await tgUser.startQrLogin(req.workspace._id, req.body || {}, req.params.slotId);
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 按槽位验证码登录（语义同 /connect）
router.post('/slots/:slotId/connect', async (req, res) => {
  try {
    const { apiId, apiHash, phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required' });
    const status = await tgUser.startLogin(req.workspace._id, { apiId, apiHash, phone }, req.params.slotId);
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 按槽位提交 OTP（语义同 /code）
router.post('/slots/:slotId/code', async (req, res) => {
  try {
    if (!req.body.code) return res.status(400).json({ success: false, message: 'Code is required' });
    tgUser.submitCode(req.workspace._id, req.body.code, req.params.slotId);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// 按槽位提交 2FA 密码（语义同 /password）
router.post('/slots/:slotId/password', async (req, res) => {
  try {
    if (!req.body.password) return res.status(400).json({ success: false, message: 'Password is required' });
    tgUser.submitPassword(req.workspace._id, req.body.password, req.params.slotId);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// 按槽位查询状态（语义同 /status）
router.get('/slots/:slotId/status', async (req, res) => {
  try {
    const status = await tgUser.getStatus(req.workspace._id, req.params.slotId);
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 按槽位登出（语义同 /disconnect；附加槽保留元素，只清 session）
router.post('/slots/:slotId/disconnect', async (req, res) => {
  try {
    await tgUser.disconnect(req.workspace._id, req.params.slotId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 删除附加槽位（断开 + 清 session + 移除元素；default 不可删）
// 槽位设置（前端契约）：label / enabled（default 槽不支持，仅附加槽）
router.put('/slots/:slotId/settings', async (req, res) => {
  try {
    const { slotId } = req.params;
    if (slotId === 'default') return res.status(400).json({ success: false, message: '主号不支持此设置入口' });
    const Workspace = require('../models/Workspace');
    const set = {};
    if (req.body.label !== undefined) set['tgPersonalSlots.$[s].label'] = String(req.body.label).slice(0, 50);
    if (req.body.enabled !== undefined) set['tgPersonalSlots.$[s].enabled'] = !!req.body.enabled;
    if (!Object.keys(set).length) return res.status(400).json({ success: false, message: '没有要更新的字段' });
    const r = await Workspace.updateOne(
      { _id: req.workspace._id, 'tgPersonalSlots.slotId': slotId },
      { $set: set }, { arrayFilters: [{ 's.slotId': slotId }] });
    if (!r.matchedCount) return res.status(404).json({ success: false, message: '槽位不存在' });
    res.json({ success: true, message: '已保存' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/slots/:slotId', async (req, res) => {
  try {
    await tgUser.deleteSlot(req.workspace._id, req.params.slotId);
    res.json({ success: true });
  } catch (e) {
    const code = /不可删除/.test(e.message) ? 400 : 500;
    res.status(code).json({ success: false, message: e.message });
  }
});

// 号池开关：写 tgPersonalPoolEnabled
router.put('/pool', async (req, res) => {
  try {
    const enabled = !!(req.body || {}).enabled;
    const Workspace = require('../models/Workspace');
    await Workspace.findByIdAndUpdate(req.workspace._id, { tgPersonalPoolEnabled: enabled });
    res.json({ success: true, data: { enabled } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
