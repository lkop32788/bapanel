const router = require('express').Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const c = require('../controllers/facebookConnectController');

router.use(protect, workspaceAccess);

router.get('/config', c.config);
router.post('/one-click', c.oneClick);
router.post('/disconnect', c.disconnect);

// ---- Messenger/Instagram 诊断与修复（前端渠道页的 Meta 诊断区） ----
const axios = require('axios');
const graphErr = (e) => e.response?.data?.error?.message || e.message;
const chk = (key, label, ok, detail = '', fix = '') => ({ key, label, ok: !!ok, detail, ...(ok || !fix ? {} : { fix }) });

router.get('/diagnose', async (req, res) => {
  try {
    const mc = req.workspace.metaChat || {};
    const checks = [];
    const hasCfg = !!(mc.pageId && mc.pageAccessToken);
    checks.push(chk('config', '主页凭据', hasCfg,
      hasCfg ? `Page ${mc.pageName || mc.pageId} · FB ${mc.fbEnabled ? '开' : '关'} / IG ${mc.igEnabled ? '开' : '关'}` : '未连接 Facebook 主页',
      '用上方「一键连接」或手动填写 Page ID 和 Page Access Token'));
    if (hasCfg) {
      try {
        const r = await axios.get(`https://graph.facebook.com/v21.0/${mc.pageId}`, {
          params: { fields: 'name,id', access_token: mc.pageAccessToken }, timeout: 12000,
        });
        checks.push(chk('token', 'Page 令牌', true, r.data?.name || ''));
      } catch (e) {
        checks.push(chk('token', 'Page 令牌', false, graphErr(e), '令牌过期：重新一键连接获取长效 Page Token'));
      }
      try {
        const r = await axios.get(`https://graph.facebook.com/v21.0/${mc.pageId}/subscribed_apps`, {
          params: { access_token: mc.pageAccessToken }, timeout: 12000,
        });
        const apps = r.data?.data || [];
        const fields = apps.flatMap(a => a.subscribed_fields || []);
        const okSub = apps.length > 0 && fields.includes('messages');
        checks.push(chk('webhook', '主页 Webhook 订阅', okSub,
          apps.length ? `应用 ${apps.map(a => a.name || a.id).join(', ')} · 字段 ${fields.join(',') || '-'}` : '没有应用订阅该主页，收不到私信',
          '点击「修复订阅」重新订阅 messages 等字段'));
      } catch (e) {
        checks.push(chk('webhook', '主页 Webhook 订阅', false, graphErr(e), '点击「修复订阅」重试'));
      }
      if (mc.igEnabled) {
        try {
          const r = await axios.get(`https://graph.facebook.com/v21.0/${mc.pageId}`, {
            params: { fields: 'instagram_business_account,connected_instagram_account', access_token: mc.pageAccessToken }, timeout: 12000,
          });
          const igId = r.data?.instagram_business_account?.id || r.data?.connected_instagram_account?.id || '';
          const match = igId && String(igId) === String(mc.igAccountId || '');
          checks.push(chk('instagram', 'Instagram 绑定', !!igId && (match || !mc.igAccountId),
            igId ? `IG 账号 ${igId}${mc.igAccountId && !match ? `（面板保存的是 ${mc.igAccountId}，不一致）` : ''}` : '主页未绑定 IG 商业账号',
            igId ? '重新保存渠道设置可自动纠正 IG 账号 ID' : '在 Meta 后台把 IG 商业账号绑定到该主页'));
        } catch (e) {
          checks.push(chk('instagram', 'Instagram 绑定', false, graphErr(e)));
        }
      }
    }
    // 收件箱侧的消息量，辅助判断链路是否真的通
    let inbox;
    try {
      const Conversation = require('../models/Conversation');
      const agg = await Conversation.aggregate([
        { $match: { workspace: req.workspace._id, channel: { $in: ['facebook', 'instagram'] } } },
        { $group: { _id: '$channel', n: { $sum: 1 } } },
      ]);
      inbox = Object.fromEntries(agg.map(a => [a._id, a.n]));
    } catch { /* 可选信息 */ }
    const bad = checks.filter(c => !c.ok).length;
    res.json({ success: true, data: {
      ok: bad === 0,
      summary: bad === 0 ? `全部 ${checks.length} 项检查通过` : `${checks.length} 项检查中有 ${bad} 项未通过`,
      checks, inbox,
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/resubscribe', async (req, res) => {
  try {
    const mc = req.workspace.metaChat || {};
    if (!mc.pageId || !mc.pageAccessToken) {
      return res.status(400).json({ success: false, message: '未连接 Facebook 主页' });
    }
    await axios.post(`https://graph.facebook.com/v21.0/${mc.pageId}/subscribed_apps`,
      { subscribed_fields: 'messages,messaging_postbacks,message_reads,message_reactions' },
      { headers: { Authorization: `Bearer ${mc.pageAccessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 });
    res.json({ success: true, message: 'Webhook 订阅已刷新' });
  } catch (e) {
    res.status(400).json({ success: false, message: graphErr(e) });
  }
});

// 历史聊天同步暂不支持（入站消息自 webhook 接通后实时进入收件箱）
router.post('/sync-chats', (req, res) => {
  res.status(400).json({ success: false, message: '暂不支持同步历史聊天；webhook 接通后新消息会实时进入收件箱' });
});

module.exports = router;
