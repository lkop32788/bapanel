const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess, denyAgent } = require('../middleware/auth');
const {
  getConversations, getConversation, getMessages, sendMessage, startConversationByPhone, startConversationByEmail,
  startConversation, assignConversation, resolveConversation, markAsRead, toggleAI,
} = require('../controllers/conversationController');

router.use(protect, workspaceAccess);
router.use(requireFeature('chat'));
router.get('/', getConversations);
router.get('/search-messages', require('../controllers/conversationController').searchMessages);
router.get('/unread-counts', require('../controllers/conversationController').getUnreadCounts);
// SEC-AGENT：全量/单条导出是管理功能，客服不可用
router.get('/export-all', denyAgent, require('../controllers/conversationController').exportAllChats);
router.get('/:id/export', denyAgent, require('../controllers/conversationController').exportConversation);
router.post('/', startConversation);
router.post('/by-phone', startConversationByPhone);
router.post('/by-email', startConversationByEmail);
router.get('/stickers/library', async (req, res) => {
  try {
    const Message = require('../models/Message');
    const rows = await Message.find({
      workspace: req.workspace._id,
      type: 'sticker',
      'media.url': { $exists: true, $ne: '' },
    }).select('media createdAt direction').sort({ createdAt: -1 }).limit(300).lean();
    const seen = new Set();
    const stickers = [];
    for (const m of rows) {
      const url = m.media && m.media.url;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      stickers.push({ url, mimetype: (m.media && m.media.mimetype) || 'image/webp' });
      if (stickers.length >= 60) break;
    }
    res.json({ success: true, data: stickers });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});
router.get('/:id', getConversation);
router.post('/:id/ai-summary', async (req, res) => {
  try {
    // SEC-IDOR：校验会话归属本工作区（原先直接透传 id，可跨租户读他人聊天摘要）；客服同样受范围限制
    const Conversation = require('../models/Conversation');
    const scope = (req.user.role === 'agent' && req.user.inboxScope === 'assigned') ? { assignedAgent: req.user._id } : {};
    const owned = await Conversation.exists({ _id: req.params.id, workspace: req.workspace._id, ...scope });
    if (!owned) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const summary = await require('../services/aiFeatures').summarizeConversation({ workspaceId: req.workspace._id, conversationId: req.params.id });
    res.json({ success: true, data: { summary } });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});
router.get('/:id/messages', getMessages);
router.post('/:id/messages', sendMessage);
router.post('/:id/react', require('../controllers/conversationController').reactMessage);
router.post('/:id/presence', require('../controllers/conversationController').subscribePresence);
router.patch('/:id/assign', assignConversation);
router.put('/:id/assign', assignConversation);
router.patch('/:id/resolve', resolveConversation);
router.put('/:id/resolve', resolveConversation);
router.put('/:id/read', markAsRead);

router.patch('/:id/ai-toggle', toggleAI);
router.patch('/:id/pin', require('../controllers/conversationController').pinConversation);
// SEC-AGENT：删除会话是管理功能，客服不可用
router.delete('/:id', denyAgent, require('../controllers/conversationController').deleteConversation);

// 原 POST /:id/schedule（定时消息）已删除：供应商死代码——不校验 workspace（跨租户
// IDOR），且发送链路调用不存在的方法从未真正发出过消息（SEC-M1）。
module.exports = router;
