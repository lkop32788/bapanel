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

// ===== 外部 API 占位渠道入站 webhook =====
// POST /api/webhook/extapi/:workspaceId/:slotId?secret=<webhookSecret>
// 验签：?secret= 或 x-webhook-secret 头必须等于槽位的 webhookSecret（timing-safe），
// 否则任何知道 wsId 的人都能往收件箱注入消息。验签通过才 ACK，处理异步。
router.post('/extapi/:workspaceId/:slotId', async (req, res) => {
  try {
    const Workspace = require('../models/Workspace');
    const ws = await Workspace.findById(req.params.workspaceId).catch(() => null);
    const slot = ws && (ws.externalApiSlots || []).find((s) => s.slotId === req.params.slotId);
    const given = String(req.query.secret || req.headers['x-webhook-secret'] || '');
    const expect = String((slot && slot.webhookSecret) || '');
    const crypto = require('crypto');
    const ok = !!slot && !!expect && given.length === expect.length
      && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expect));
    if (!ok || !slot.enabled) return res.sendStatus(401); // 不区分"不存在/密钥错"，防枚举
    res.sendStatus(200);

    const inbound = require('../services/externalApiInbound');
    const body = req.body || {};
    if (body.event === 'status') {
      await inbound.handleStatus({ workspace: ws, messageId: body.messageId, status: body.status });
      return;
    }
    if (!body.from) return;
    await inbound.handleInbound({
      workspace: ws, slotId: slot.slotId,
      from: body.from, type: body.type, text: body.text, messageId: body.messageId, media: body.media,
    });
  } catch (e) {
    console.error('[ExtAPI] inbound webhook error:', e.message);
    if (!res.headersSent) res.sendStatus(200);
  }
});

module.exports = router;
