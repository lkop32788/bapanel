const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const waQr = require('../services/waQrService');

router.use(protect, workspaceAccess);
router.use(requireFeature('whatsappQr'));

// Start (or resume) a QR session for this workspace
router.post('/connect', async (req, res) => {
  try {
    await waQr.startSession(req.workspace._id);
    const status = await waQr.getStatus(req.workspace._id);
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Poll connection status + QR image
router.get('/status', async (req, res) => {
  try {
    const status = await waQr.getStatus(req.workspace._id);
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Restart the socket to pull messages received while offline
router.post('/sync', async (req, res) => {
  try {
    await waQr.syncSession(req.workspace._id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Set a custom daily send limit (0 = automatic warm-up schedule)
router.post('/settings', async (req, res) => {
  try {
    const value = await waQr.setDailyLimit(req.workspace._id, req.body.dailyLimit);
    res.json({ success: true, data: { dailyLimit: value } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Send a free-form message to any number (no template needed)
router.post('/send-new', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    const text = String(req.body.text || '').trim();
    if (!phone || phone.length < 7) return res.status(400).json({ success: false, message: 'Enter a valid phone number with country code' });
    if (!text) return res.status(400).json({ success: false, message: 'Message text is required' });

    await waQr.sendMessage(req.workspace._id, phone, { type: 'text', text });

    const Contact = require('../models/Contact');
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');
    const contact = await Contact.findOneAndUpdate(
      { workspace: req.workspace._id, phone },
      { $setOnInsert: { workspace: req.workspace._id, phone, name: req.body.name || `WA ${phone}`, source: 'whatsapp_qr' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const conversation = await Conversation.findOneAndUpdate(
      { workspace: req.workspace._id, contact: contact._id, channel: 'whatsapp_qr' },
      {
        $set: { lastMessage: text.slice(0, 200), lastMessageAt: new Date(), status: 'active' },
        $setOnInsert: { workspace: req.workspace._id, contact: contact._id, channel: 'whatsapp_qr' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const message = await Message.create({
      workspace: req.workspace._id, conversation: conversation._id, contact: contact._id,
      direction: 'outbound', type: 'text', text, status: 'sent',
      metadata: { source: 'whatsapp_qr' },
    });
    if (global.io) {
      global.io.to(`workspace:${req.workspace._id}`).emit('new_message', { message, conversationId: conversation._id });
      global.io.to(`workspace:${req.workspace._id}`).emit('conversation_updated', conversation);
    }
    res.json({ success: true, data: { conversationId: conversation._id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Logout and remove the session
router.post('/disconnect', async (req, res) => {
  try {
    await waQr.disconnect(req.workspace._id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== 号池多槽位（2026-10-20）=====
// 旧端点（上面）保持原样 = 操作 default 槽；以下按 slotId 操作具体槽位。

// 校验槽位存在：default 永远有效，附加槽必须在 waQrSlots 里
async function slotExists(workspaceId, slotId) {
  if (slotId === 'default') return true;
  const Workspace = require('../models/Workspace');
  return !!(await Workspace.exists({ _id: workspaceId, 'waQrSlots.slotId': slotId }));
}

// 槽位列表（default 永远在首位，合并运行时状态）
router.get('/slots', async (req, res) => {
  try {
    const slots = await waQr.listSlots(req.workspace._id);
    res.json({ success: true, data: slots });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 新建附加槽位
router.post('/slots', async (req, res) => {
  try {
    const { slotId } = await waQr.createSlot(req.workspace._id, req.body.label);
    res.json({ success: true, message: '号码槽位已创建', data: { slotId } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 指定槽位连接（等价旧 /connect）
router.post('/slots/:slotId/connect', async (req, res) => {
  try {
    const slotId = req.params.slotId;
    if (!(await slotExists(req.workspace._id, slotId))) return res.status(404).json({ success: false, message: '槽位不存在' });
    await waQr.startSession(req.workspace._id, slotId);
    const status = await waQr.getStatus(req.workspace._id, slotId);
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 指定槽位状态轮询（含 qr 字段供扫码）
router.get('/slots/:slotId/status', async (req, res) => {
  try {
    const slotId = req.params.slotId;
    if (!(await slotExists(req.workspace._id, slotId))) return res.status(404).json({ success: false, message: '槽位不存在' });
    const status = await waQr.getStatus(req.workspace._id, slotId);
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 指定槽位登出断开（会清理该槽绑定的会话数据，同旧 /disconnect 语义）
router.post('/slots/:slotId/disconnect', async (req, res) => {
  try {
    const slotId = req.params.slotId;
    if (!(await slotExists(req.workspace._id, slotId))) return res.status(404).json({ success: false, message: '槽位不存在' });
    await waQr.disconnect(req.workspace._id, slotId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 删除附加槽位（default 不可删）
router.delete('/slots/:slotId', async (req, res) => {
  try {
    const slotId = req.params.slotId;
    if (slotId === 'default') return res.status(400).json({ success: false, message: '默认号码不可删除' });
    if (!(await slotExists(req.workspace._id, slotId))) return res.status(404).json({ success: false, message: '槽位不存在' });
    await waQr.deleteSlot(req.workspace._id, slotId);
    res.json({ success: true, message: '号码槽位已删除' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 槽位设置：label / dailyLimit / enabled。
// default 槽只支持 dailyLimit（label 固定为主号、enabled 由连接状态管理）。
router.put('/slots/:slotId/settings', async (req, res) => {
  try {
    const slotId = req.params.slotId;
    if (!(await slotExists(req.workspace._id, slotId))) return res.status(404).json({ success: false, message: '槽位不存在' });
    const out = {};
    if (req.body.dailyLimit !== undefined) {
      out.dailyLimit = await waQr.setDailyLimit(req.workspace._id, req.body.dailyLimit, slotId);
    }
    if (slotId !== 'default') {
      const Workspace = require('../models/Workspace');
      const $set = {};
      if (req.body.label !== undefined) { $set['waQrSlots.$[s].label'] = String(req.body.label || '').slice(0, 60); out.label = $set['waQrSlots.$[s].label']; }
      if (req.body.enabled !== undefined) { $set['waQrSlots.$[s].enabled'] = !!req.body.enabled; out.enabled = !!req.body.enabled; }
      if (Object.keys($set).length) {
        await Workspace.updateOne({ _id: req.workspace._id }, { $set }, { arrayFilters: [{ 's.slotId': slotId }] });
      }
    }
    res.json({ success: true, message: '槽位设置已保存', data: out });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 号池总开关（waQrPoolEnabled）
router.put('/pool', async (req, res) => {
  try {
    const enabled = !!req.body.enabled;
    const Workspace = require('../models/Workspace');
    await Workspace.updateOne({ _id: req.workspace._id }, { $set: { waQrPoolEnabled: enabled } });
    res.json({ success: true, message: enabled ? '号池已开启' : '号池已关闭', data: { enabled } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
