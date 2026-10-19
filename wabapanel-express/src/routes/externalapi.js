const router = require('express').Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const extSvc = require('../services/externalApiService');

router.use(protect, workspaceAccess);

// 列出全部槽位
router.get('/slots', async (req, res) => {
  try {
    const data = await extSvc.listSlots(req.workspace._id);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 新建槽位
router.post('/slots', async (req, res) => {
  try {
    const data = await extSvc.createSlot(req.workspace._id, (req.body || {}).label);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 更新槽位配置（endpoint / apiKey / authHeader / label / enabled）
router.put('/slots/:slotId/settings', async (req, res) => {
  try {
    await extSvc.updateSlot(req.workspace._id, req.params.slotId, req.body || {});
    res.json({ success: true, message: '已保存' });
  } catch (e) {
    const code = /不存在|没有/.test(e.message) ? 400 : 500;
    res.status(code).json({ success: false, message: e.message });
  }
});

// 删除槽位
router.delete('/slots/:slotId', async (req, res) => {
  try {
    await extSvc.deleteSlot(req.workspace._id, req.params.slotId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 号池开关
router.put('/pool', async (req, res) => {
  try {
    const enabled = !!(req.body || {}).enabled;
    const Workspace = require('../models/Workspace');
    await Workspace.findByIdAndUpdate(req.workspace._id, { externalApiPoolEnabled: enabled });
    res.json({ success: true, data: { enabled } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
