// 外部通道（external_api）管理端路由 —— 平台级配置，按商户（workspaceId）维护。
// 商户不是开发者：endpoint/apiKey/webhookSecret 这类对接配置只出现在管理后台，
// 商户端以「专线通道」名义收发，零配置。
const router = require('express').Router();
const { protect, adminOnly } = require('../middleware/auth');
const extSvc = require('../services/externalApiService');

router.use(protect, adminOnly);

// 列出商户的全部通道
router.get('/:workspaceId/slots', async (req, res) => {
  try {
    const data = await extSvc.listSlots(req.params.workspaceId);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 为商户新建通道
router.post('/:workspaceId/slots', async (req, res) => {
  try {
    const data = await extSvc.createSlot(req.params.workspaceId, (req.body || {}).label);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 更新通道配置（endpoint / apiKey / authHeader / label / enabled）
router.put('/:workspaceId/slots/:slotId/settings', async (req, res) => {
  try {
    await extSvc.updateSlot(req.params.workspaceId, req.params.slotId, req.body || {});
    res.json({ success: true, message: '已保存' });
  } catch (e) {
    const code = /不存在|没有|只允许|无效|内网/.test(e.message) ? 400 : 500;
    res.status(code).json({ success: false, message: e.message });
  }
});

// 连通性测试：POST { type:'connectivity_test' } 到通道 endpoint，报告 HTTP 状态与耗时
router.post('/:workspaceId/slots/:slotId/test', async (req, res) => {
  try {
    const data = await extSvc.testSlot(req.params.workspaceId, req.params.slotId);
    res.json({ success: true, data });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// 重置入站 webhook 密钥（泄露后轮换；旧 URL 立即失效）
router.post('/:workspaceId/slots/:slotId/rotate-secret', async (req, res) => {
  try {
    const data = await extSvc.rotateSecret(req.params.workspaceId, req.params.slotId);
    res.json({ success: true, data });
  } catch (e) {
    const code = /不存在/.test(e.message) ? 404 : 500;
    res.status(code).json({ success: false, message: e.message });
  }
});

// 删除通道（同时清掉绑定该通道的会话绑定）
router.delete('/:workspaceId/slots/:slotId', async (req, res) => {
  try {
    await extSvc.deleteSlot(req.params.workspaceId, req.params.slotId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
