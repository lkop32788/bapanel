const router = require('express').Router();
const { verifyWebhook, handleWhatsAppWebhook } = require('../controllers/webhookController');
const { verifyFacebookLeadWebhook, handleFacebookLeadWebhook } = require('../controllers/facebookLeadController');
const { handleWebhook: handleChatAppWebhook } = require('../controllers/chatAppWebhookController');

router.get('/whatsapp', verifyWebhook);
router.post('/whatsapp', handleWhatsAppWebhook);
router.get('/facebook-leads', verifyFacebookLeadWebhook);
router.post('/facebook-leads', handleFacebookLeadWebhook);
// Aliyun Chat App Message Service (public, one URL for every workspace —
// routed internally by CustSpaceId; see chatAppWebhookController).
// SEC-PUB：设置了 CHATAPP_WEBHOOK_SECRET 环境变量后，阿里云控制台的回调 URL
// 需带 ?secret=<该值>，否则拒绝（未设置保持兼容——阿里 CAMS 无标准签名机制）
router.post('/chatapp', (req, res, next) => {
  const s = process.env.CHATAPP_WEBHOOK_SECRET;
  if (s && String(req.query.secret || '') !== s) return res.sendStatus(401);
  next();
}, handleChatAppWebhook);

// Telegram bot webhook (public, one per workspace)
router.post('/telegram/:workspaceId', async (req, res) => {
  res.sendStatus(200);
  try {
    const Workspace = require('../models/Workspace');
    const workspace = await Workspace.findById(req.params.workspaceId);
    if (!workspace || !workspace.telegram?.enabled || !workspace.telegram?.botToken) return;
    // SEC-PUB：校验 Telegram secret_token（setWebhook 时注册的 HMAC 派生值；
    // secretSynced 未置位的老 webhook 由启动 Fixup 重新注册后才强制）
    if (workspace.telegram.secretSynced) {
      const expect = require('../services/telegramService').webhookSecret(workspace._id);
      if (String(req.headers['x-telegram-bot-api-secret-token'] || '') !== expect) {
        console.warn('[Telegram] webhook secret mismatch, update dropped:', req.params.workspaceId);
        return;
      }
    }
    const io = req.app.get('io') || global.io;
    await require('../services/telegramService').handleUpdate(workspace, req.body, io);
  } catch (e) {
    console.error('[Telegram] webhook error:', e.message);
  }
});

module.exports = router;
