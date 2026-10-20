// 渠道连接诊断：前端 ChannelDiagnose 组件调用。
// 响应：{ ok, summary, checks: [{ key, label, ok, detail, fix? }] }
const router = require('express').Router();
const axios = require('axios');
const { protect, workspaceAccess, denyAgent } = require('../middleware/auth');

router.use(protect, workspaceAccess, denyAgent); // SEC-AGENT：诊断会用工作区凭据外呼并暴露配置概况

const check = (key, label, ok, detail = '', fix = '') => ({ key, label, ok: !!ok, detail, ...(ok || !fix ? {} : { fix }) });
const graphErr = (e) => e.response?.data?.error?.message || e.message;

async function diagnoseWhatsapp(ws) {
  const wa = ws.whatsapp || {};
  const checks = [];
  const hasCfg = !!(wa.accessToken && wa.phoneNumberId);
  checks.push(check('config', '凭据配置', hasCfg,
    hasCfg ? `号码ID ${wa.phoneNumberId}${wa.wabaId ? '，WABA ' + wa.wabaId : ''}` : '缺少 accessToken 或 phoneNumberId',
    '在渠道设置里重新连接 WhatsApp 或手动填写凭据'));
  if (hasCfg) {
    try {
      const r = await axios.get(`https://graph.facebook.com/v21.0/${wa.phoneNumberId}`, {
        headers: { Authorization: `Bearer ${wa.accessToken}` }, timeout: 12000,
        params: { fields: 'display_phone_number,quality_rating,status' },
      });
      checks.push(check('token', '访问令牌', true,
        `${r.data.display_phone_number || ''} · 质量 ${r.data.quality_rating || '-'} · 状态 ${r.data.status || '-'}`));
    } catch (e) {
      checks.push(check('token', '访问令牌', false, graphErr(e), '令牌失效或权限不足：重新连接或更换永久令牌'));
    }
    if (wa.wabaId) {
      try {
        const r = await axios.get(`https://graph.facebook.com/v21.0/${wa.wabaId}/subscribed_apps`, {
          headers: { Authorization: `Bearer ${wa.accessToken}` }, timeout: 12000,
        });
        const apps = r.data?.data || [];
        checks.push(check('webhook', 'Webhook 订阅', apps.length > 0,
          apps.length ? `已订阅应用：${apps.map(a => a.whatsapp_business_api_data?.name || a.id).join(', ')}` : '没有应用订阅此 WABA，收不到入站消息',
          '点击上方「修复网络钩子」重新订阅'));
      } catch (e) {
        checks.push(check('webhook', 'Webhook 订阅', false, graphErr(e), '点击「修复网络钩子」重试；若提示权限不足需重新连接'));
      }
    } else {
      checks.push(check('webhook', 'Webhook 订阅', false, '未保存 WABA ID，无法检查订阅', '在渠道设置填写 WABA ID 后重试'));
    }
  }
  checks.push(check('verifyToken', 'Webhook 验证令牌', !!process.env.WHATSAPP_VERIFY_TOKEN,
    process.env.WHATSAPP_VERIFY_TOKEN ? '服务器已配置' : '服务器未配置 WHATSAPP_VERIFY_TOKEN',
    '在服务器 .env 配置 WHATSAPP_VERIFY_TOKEN 并与 Meta 后台一致'));
  return checks;
}

async function diagnoseTelegram(ws) {
  const tg = ws.telegram || {};
  const checks = [];
  checks.push(check('config', '机器人令牌', !!tg.botToken, tg.botToken ? (tg.botUsername ? '@' + tg.botUsername : '已配置') : '未配置 botToken', '在渠道设置粘贴 BotFather 的令牌并保存'));
  if (tg.botToken) {
    try {
      const r = await axios.get(`https://api.telegram.org/bot${tg.botToken}/getMe`, { timeout: 12000 });
      checks.push(check('token', '令牌有效性', !!r.data?.ok, r.data?.result ? `@${r.data.result.username}` : '', '令牌无效：在 BotFather 重新生成并保存'));
    } catch (e) {
      checks.push(check('token', '令牌有效性', false, e.response?.data?.description || e.message, '令牌无效：在 BotFather 重新生成并保存'));
    }
    try {
      const r = await axios.get(`https://api.telegram.org/bot${tg.botToken}/getWebhookInfo`, { timeout: 12000 });
      const info = r.data?.result || {};
      const okHook = !!info.url;
      checks.push(check('webhook', 'Webhook', okHook,
        okHook ? `${info.url}${info.pending_update_count ? ` · 待处理 ${info.pending_update_count}` : ''}${info.last_error_message ? ` · 最近错误：${info.last_error_message}` : ''}` : '未设置 webhook，收不到消息',
        '在渠道设置重新保存机器人令牌（保存时面板会自动设置 webhook）'));
    } catch (e) {
      checks.push(check('webhook', 'Webhook', false, e.message));
    }
  }
  return checks;
}

async function diagnoseEmail(ws) {
  const em = ws.emailChannel || {};
  const checks = [];
  checks.push(check('enabled', '渠道开关', !!em.enabled, em.enabled ? '已启用' : '未启用', '在渠道设置开启邮件渠道'));
  const cfgOk = !!(em.imapHost && em.user && em.pass);
  checks.push(check('imap', 'IMAP 配置', cfgOk, cfgOk ? `${em.user} @ ${em.imapHost}:${em.imapPort || 993}` : '缺少 IMAP 主机/账号/密码', '补全 IMAP 收件配置'));
  checks.push(check('smtp', 'SMTP 配置', !!em.smtpHost, em.smtpHost ? `${em.smtpHost}:${em.smtpPort || 587}` : '缺少 SMTP 主机（无法发信）', '补全 SMTP 发件配置'));
  if (em.enabled && cfgOk) {
    const last = em.lastPolledAt ? new Date(em.lastPolledAt) : null;
    const fresh = last && (Date.now() - last.getTime()) < 10 * 60 * 1000;
    checks.push(check('poll', '收件轮询', !!fresh,
      last ? `上次成功 ${last.toLocaleString('zh-CN')}` : '从未成功轮询',
      'IMAP 登录可能失败：核对账号密码（Gmail/QQ 等需应用专用密码），保存后等 2 分钟再查'));
  }
  return checks;
}

async function diagnoseWaqr(ws) {
  const checks = [];
  try {
    const st = await require('../services/waQrService').getStatus(String(ws._id));
    const connected = st?.status === 'connected';
    checks.push(check('session', '登录状态', connected,
      connected ? `已连接 ${st.phone || ''}` : `当前状态：${st?.status || 'disconnected'}`,
      '在渠道设置重新扫码登录'));
    if (connected) {
      checks.push(check('quota', '今日发送额度', true, `${st.sentToday || 0} / ${st.todayCap || 0}`));
    }
  } catch (e) {
    checks.push(check('session', '登录状态', false, e.message, '在渠道设置重新扫码登录'));
  }
  return checks;
}

async function diagnoseTgPersonal(ws) {
  const tp = ws.tgPersonal || {};
  const checks = [];
  checks.push(check('api', 'API 凭据', !!(tp.apiId && tp.apiHash), (tp.apiId && tp.apiHash) ? '已配置' : '缺少 api_id / api_hash', '到 my.telegram.org 申请并填入'));
  checks.push(check('session', '登录会话', !!tp.session, tp.session ? `${tp.phone || ''} ${tp.username ? '@' + tp.username : ''}` : '未登录', '在渠道设置重新登录 Telegram 个人号'));
  checks.push(check('status', '连接状态', tp.status === 'connected', `当前状态：${tp.status || 'disconnected'}`, '重新登录；若频繁掉线检查服务器到 Telegram 的网络'));
  return checks;
}

const DIAGNOSERS = {
  whatsapp: diagnoseWhatsapp,
  telegram: diagnoseTelegram,
  email: diagnoseEmail,
  waqr: diagnoseWaqr,
  tgpersonal: diagnoseTgPersonal,
};

router.get('/:channel', async (req, res) => {
  try {
    const fn = DIAGNOSERS[req.params.channel];
    if (!fn) return res.status(400).json({ success: false, message: '不支持的渠道' });
    const checks = await fn(req.workspace);
    const bad = checks.filter(c => !c.ok).length;
    res.json({ success: true, data: {
      ok: bad === 0,
      summary: bad === 0 ? `全部 ${checks.length} 项检查通过` : `${checks.length} 项检查中有 ${bad} 项未通过`,
      checks,
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 修复 WhatsApp Webhook：重新把应用订阅到 WABA
router.post('/whatsapp/fix-webhook', async (req, res) => {
  try {
    const wa = req.workspace.whatsapp || {};
    if (!wa.accessToken || !wa.wabaId) {
      return res.status(400).json({ success: false, message: '缺少 accessToken 或 WABA ID，无法订阅' });
    }
    await axios.post(`https://graph.facebook.com/v21.0/${wa.wabaId}/subscribed_apps`, {}, {
      headers: { Authorization: `Bearer ${wa.accessToken}` }, timeout: 15000,
    });
    res.json({ success: true, message: 'Webhook 订阅已刷新' });
  } catch (e) {
    res.status(400).json({ success: false, message: graphErr(e) });
  }
});

module.exports = router;
