require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const setupSocket = require('./sockets/socketHandler');

// Keep the API alive when a background integration (email IMAP, Telegram, a
// webhook, etc.) throws asynchronously. Previously an unhandled rejection /
// exception crashed the whole process and pm2 restarted it, killing in-flight
// campaign sends. Log and continue instead.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', (reason && reason.stack) ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', (err && err.stack) ? err.stack : err);
});

const app = express();
// SEC-XSS：上传目录改白名单放行——只有明确安全的图片/音视频/PDF/纯文本允许内联
// 渲染，其余一律按附件下载 + CSP sandbox（旧黑名单漏 .xht/.svgz 等可执行脚本的
// 扩展名，公开表单上传曾可借此在面板同源种存储型 XSS 偷登录 token）。
// 注意 <img>/<audio>/<video> 标签不受 Content-Disposition 影响，svg logo 不受影响。
const INLINE_SAFE_RE = /\.(jpe?g|png|gif|webp|avif|bmp|ico|mp3|wav|ogg|oga|m4a|aac|amr|mp4|webm|m4v|mov|pdf|txt|csv)$/i;
const setUploadHeaders = (res, filePath) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!INLINE_SAFE_RE.test(filePath)) {
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('Content-Security-Policy', 'sandbox');
  }
};
app.set('trust proxy', 1);
// SEC-LOCK2：dotfiles 拒绝 + 不找 index，上传目录只按确切文件名出文件
const uploadStaticOpts = { setHeaders: setUploadHeaders, dotfiles: 'deny', index: false };
app.use('/uploads', require('express').static(require('path').join(__dirname, '..', 'uploads'), uploadStaticOpts));
// Also serve uploads under the /api prefix. Every install proxies /api to this
// backend, but some reverse-proxy setups route bare /uploads to the frontend
// (breaking white-label logos/favicons). Serving via /api/uploads guarantees
// uploaded assets load regardless of the proxy config.
app.use('/api/uploads', require('express').static(require('path').join(__dirname, '..', 'uploads'), uploadStaticOpts));
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  path: process.env.SOCKET_PATH || '/socket.io',
  cors: {
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      process.env.ADMIN_URL || 'http://localhost:3001',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  },
});

app.set('io', io);
global.io = io;
setupSocket(io);

// Connect DB
connectDB();

// SEC-PUB：installed.lock 自愈——系统已有 super_admin 却缺 lock 文件时自动补上，
// 防止 lock 被误删/迁移丢失后，公开的 /api/install/complete 被用来重置超管
setTimeout(async () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const lock = path.join(__dirname, '..', 'installed.lock');
    if (!fs.existsSync(lock)) {
      const hasAdmin = await require('./models/User').exists({ role: 'super_admin' });
      if (hasAdmin) {
        fs.writeFileSync(lock, 'installed (auto-restored ' + new Date().toISOString() + ')\n');
        console.log('[Fixup] installed.lock 缺失已自动恢复');
      }
    }
  } catch (e) { console.error('[Fixup] install lock self-heal:', e.message); }
}, 8000);

// SEC-PUB：给存量 Telegram webhook 补注册 secret_token（注册成功后入站强制验签）
setTimeout(async () => {
  try {
    const Workspace = require('./models/Workspace');
    const tg = require('./services/telegramService');
    const rows = await Workspace.find({ 'telegram.enabled': true, 'telegram.botToken': { $gt: '' }, 'telegram.secretSynced': { $ne: true } }).select('_id telegram.botToken');
    for (const w of rows) {
      try { await tg.setWebhook(w.telegram.botToken, w._id); console.log('[Fixup] telegram secret registered:', String(w._id)); }
      catch (e) { console.warn('[Fixup] telegram secret register failed:', String(w._id), e.message); }
    }
  } catch (e) { console.error('[Fixup] telegram secret fixup:', e.message); }
}, 12000);

// QR 日限额=1000 是旧 schema 默认值（从未被人主动选择），它把预热曲线整个短路了
// ——新号首日即可发千条。回收成 0（=自动预热）；每次 boot 幂等重跑，商户端已无
// 设置入口，平台确需手动上限时在 DB 设任意 ≠1000 的值即可。
setTimeout(async () => {
  try {
    const Workspace = require('./models/Workspace');
    const b = await Workspace.updateMany(
      { 'waQrSlots.dailyLimit': 1000 },
      { $set: { 'waQrSlots.$[s].dailyLimit': 0 } },
      { arrayFilters: [{ 's.dailyLimit': 1000 }] }
    );
    if (b.modifiedCount) console.log(`[Fixup] QR dailyLimit 1000→0（预热曲线生效）: ${b.modifiedCount} 个工作区`);
  } catch (e) { console.error('[Fixup] QR dailyLimit fixup:', e.message); }
}, 15000);

// Self-signup customers must appear on the admin Vendors page. Older versions
// registered them with role 'user'; promote workspace owners to 'vendor'.
require('mongoose').connection.once('open', async () => {
  try {
    const User = require('./models/User');
    const Workspace = require('./models/Workspace');
    const owners = await Workspace.distinct('owner');
    const r = await User.updateMany({ role: 'user', _id: { $in: owners } }, { $set: { role: 'vendor' } });
    if (r.modifiedCount) console.log(`[Fixup] Promoted ${r.modifiedCount} self-signup user(s) to vendor`);
  } catch (e) { console.error('[Fixup] vendor role fixup failed:', e.message); }
  try {
    await require('./middleware/featureGate').grandfatherSmartBroadcast();
  } catch (e) { console.error('[Fixup] smart broadcast grandfather failed:', e.message); }
  // Instagram Auto DM logs are now deduped on dedupeKey; drop the older media-only unique index.
  try {
    const coll = require('mongoose').connection.collection('igautodmlogs');
    const idx = await coll.indexes();
    if (idx.some((i) => i.name === 'workspace_1_automation_1_igUserId_1_mediaId_1')) {
      await coll.dropIndex('workspace_1_automation_1_igUserId_1_mediaId_1');
      await coll.updateMany({ dedupeKey: { $exists: false } }, [{ $set: { dedupeKey: '$mediaId' } }]);
      console.log('[Fixup] IgAutoDmLog dedupe index migrated');
    }
  } catch (e) { console.error('[Fixup] IgAutoDmLog index migration failed:', e.message); }
  // 号池统一迁移（2026-10-20）：把"主号"子文档 waQr / tgPersonal 复制成 slotId='default'
  // 的普通数组成员，使首号与附加号在代码/界面上完全平等。幂等、保留旧子文档可回滚。
  // 必须在 restoreAll（5s/7s）之前完成，否则已连接主号不会恢复（restoreAll 只读数组）。
  try {
    const Workspace = require('./models/Workspace');
    let q = 0;
    const qrRows = await Workspace.find({ 'waQr.phone': { $gt: '' } }).select('waQr waQrSlots').lean();
    for (const ws of qrRows) {
      if ((ws.waQrSlots || []).some((s) => s.slotId === 'default')) continue;
      const d = ws.waQr || {};
      const r = await Workspace.updateOne(
        { _id: ws._id, 'waQrSlots.slotId': { $ne: 'default' } },
        { $push: { waQrSlots: { slotId: 'default', label: d.label || '', status: d.status || 'disconnected', phone: d.phone || '', enabled: d.enabled !== false, warmupStartedAt: d.warmupStartedAt, dailyLimit: d.dailyLimit === 1000 ? 0 : (d.dailyLimit || 0), sentToday: d.sentToday || 0, sentDate: d.sentDate || '' } } }
      );
      q += r.modifiedCount || 0;
    }
    let t = 0;
    const tgRows = await Workspace.find({ 'tgPersonal.session': { $gt: '' } }).select('tgPersonal tgPersonalSlots').lean();
    for (const ws of tgRows) {
      if ((ws.tgPersonalSlots || []).some((s) => s.slotId === 'default')) continue;
      const d = ws.tgPersonal || {};
      const r = await Workspace.updateOne(
        { _id: ws._id, 'tgPersonalSlots.slotId': { $ne: 'default' } },
        { $push: { tgPersonalSlots: { slotId: 'default', label: d.label || '', status: d.status || 'disconnected', phone: d.phone || '', username: d.username || '', session: d.session || '', enabled: d.enabled !== false } } }
      );
      t += r.modifiedCount || 0;
    }
    if (q || t) console.log(`[Fixup] 号池统一迁移：QR 主号 ${q} 个、TG 主号 ${t} 个 → 数组成员 slotId=default`);
  } catch (e) { console.error('[Fixup] pool unify migration failed:', e.message); }
});

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    process.env.ADMIN_URL || 'http://localhost:3001',
  ],
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Maintenance mode (blocks non-admin API while enabled)
const platform = require('./routes/platform');
app.get('/api/maintenance-status', platform.maintenanceStatus);
app.use('/api/install', require('./routes/install'));
app.use(platform.maintenanceGuard);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/platform', platform.router);
app.use('/api/workspaces', require('./routes/workspace'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/segments', require('./routes/segments'));
app.use('/api/tags', require('./routes/tags'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/smart-broadcast', require('./routes/smartBroadcast'));
app.use('/api/preset-messages', require('./routes/presetMessages'));
app.use('/api/automations', require('./routes/automations'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/push', require('./routes/push'));
app.use('/api/waqr', require('./routes/waqr'));
app.use('/api/wabridge', require('./routes/wabridge'));
app.use('/api/tgpersonal', require('./routes/tgpersonal'));
app.use('/api/admin/extchannel', require('./routes/externalapi'));
app.use('/api/dashboard', require('./routes/dashboard'));


app.use('/api/forms', require('./routes/forms'));
// Public short link redirect (clean URL)
const { redirectShortLink } = require('./controllers/shortLinkController');
app.get('/s/:code', redirectShortLink);
app.get('/api/public/short-link/:code', require('./controllers/shortLinkController').getPublicShortLink);

app.use('/api/short-links', require('./routes/shortLinks'));
app.use('/api/rotation-links', require('./routes/rotationLinks'));
app.use('/api/saver', require('./routes/saver'));
app.use('/api/channel-diagnose', require('./routes/channelDiagnose'));

app.use('/api/teams', require('./routes/teams'));

app.use('/api/upload', require('./routes/upload'));
app.use('/api/facebook-leads', require('./routes/facebookLeads'));


app.use('/api/keywords', require('./routes/keywords'));
app.use('/api/instagram-auto-dm', require('./routes/instagramAutoDm'));
app.use('/api/facebook-connect', require('./routes/facebookConnect'));
app.use('/api/bot-flows', require('./routes/botFlows'));
app.use('/api/events', require('./routes/events'));
app.use('/api/ai-calling', require('./routes/aiCalling'));
app.use('/api/drips', require('./routes/drips'));
app.use('/api/contact-notes', require('./routes/contactNotes'));
app.use('/api/followups', require('./routes/followups'));



app.use('/api/webhook', require('./routes/webhooks'));
app.use('/api/admin', require('./routes/admin'));
// 分销/联盟模块已整块下线（空壳功能：佣金链路从未实现）
app.use('/api/admin/kkhs-license', require('./routes/kkhsLicense'));
// /api/embedded-signup 独立挂载已移除：路由没有 :id 参数而控制器读 req.params.id，
// 恒 404 的死路由（真正在用的是 workspace.js 里带 workspaceParamOwner 的同名挂载）
app.use("/api/data-fields", require("./routes/dataFields"));
app.use("/api/badges", require("./routes/badges"));
app.use("/api/ai-settings", require("./routes/aiSettings"));
app.use("/api/ai-tools", require("./routes/aiTools"));

app.use("/api/integrations", require("./routes/integrations"));
app.use("/api/media", require("./routes/media"));

app.use("/api/predefined-actions", require("./routes/predefinedActions"));
app.use("/api/response-resources", require("./routes/responseResources"));
app.use("/api/quick-replies-client", require("./routes/quickRepliesClient"));
app.use("/api/ext", require("./routes/externalWebhooks"));
app.use("/api/workspace-kb", require("./routes/knowledgeBase"));app.use("/api/audit-logs", require("./routes/auditLog"));

// Landing page API (public)
app.get('/api/landing-page', async (req, res) => {
  try {
    const LandingPage = require('./models/LandingPage');
    const page = await LandingPage.findOne();
    res.json({ success: true, data: { page } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Compatibility endpoint for older clients; this installation does not require a license.
app.get('/api/public/license-status', (req, res) => {
  res.json({ success: true, active: true, required: false, reason: '', killSwitch: false });
});

// SEC: 供应商商店的 kkhs-auto-login 后门端点已删除（持 licenseKey 即可签发
// super_admin token），本安装不需要商店免密登录。

// Compatibility endpoint: remote store locks are no longer applied.
app.get('/api/public/kkhs-features', (req, res) => {
  res.json({ success: true, data: {}, config: {} });
});
// White-label brand resolver: use the panel's configured appName; if unset,
// fall back to the master brand only on the master install (KKHS_MASTER),
// otherwise derive a name from the install's own domain. Never leak the
// master brand/tagline to customer installs.
const _isMasterInstall = () => process.env.KKHS_MASTER === 'true';
function brandNameFor(s, req) {
  if (s && typeof s.appName === 'string' && s.appName.trim()) return s.appName.trim();
  if (_isMasterInstall()) return '红浪漫';
  const host = String((req && req.headers && req.headers.host) || '').replace(/:\d+$/, '').replace(/^www\./, '');
  if (!host || require('net').isIP(host.replace(/^\[|\]$/g, ''))) return 'Panel';
  return host.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function brandTaglineFor(s) {
  const t = (s && s.tagline !== undefined) ? s.tagline : '';
  if (!_isMasterInstall() && t === 'by KKHS Media') return '';
  return t;
}
app.get('/api/public/branding', async (req, res) => {
  try {
    const SystemSettings = require('./models/SystemSettings');
    const s = await SystemSettings.findOne().lean();
    const name = brandNameFor(s, req);
    // Serve branding assets through /api/uploads so they load even on proxies that
    // route bare /uploads to the frontend.
    const apiUploads = (u) => (u && u.includes('/uploads/') && !u.includes('/api/uploads/'))
      ? u.replace('/uploads/', '/api/uploads/') : (u || '');
    res.json({ success: true, data: {
      name,
      tagline: brandTaglineFor(s),
      logo: apiUploads(s && s.logo), favicon: apiUploads(s && s.favicon), loginBg: apiUploads(s && s.loginBg),
      primaryColor: (s && s.primaryColor) || '#059669',
      primaryFont: (s && s.primaryFont) || 'Inter',
    } });
  } catch (e) { res.status(500).json({ success: false }); }
});

// Dynamic PWA manifest — reflects each panel's white-label branding
function _brandLogoLocalPath(logo) {
  try {
    if (!logo) return null;
    const path = require('path');
    const m = String(logo).match(/\/uploads\/(.+)$/);
    if (!m) return null;
    return path.join(__dirname, '..', 'uploads', m[1].split('?')[0]);
  } catch (e) { return null; }
}
const _pwaIconCache = {};
// Square PWA icons generated from the brand logo (browsers reject non-square icons)
app.get('/api/public/pwa-icon-:variant.png', async (req, res) => {
  try {
    const fs = require('fs');
    const variant = String(req.params.variant || '192');
    const size = variant.indexOf('512') === 0 ? 512 : 192;
    const maskable = variant.indexOf('maskable') !== -1;
    const SystemSettings = require('./models/SystemSettings');
    const s = await SystemSettings.findOne().lean();
    const logo = (s && s.logo) || '';
    const local = _brandLogoLocalPath(logo);
    if (!local || !fs.existsSync(local)) {
      return res.redirect('/icons/icon-' + (maskable ? '512-maskable' : size) + '.png');
    }
    const key = variant + ':' + logo;
    if (_pwaIconCache[key]) { res.set('Content-Type', 'image/png'); res.set('Cache-Control', 'public, max-age=3600'); return res.send(_pwaIconCache[key]); }
    const Jimp = require('jimp');
    const img = await Jimp.read(local);
    const pad = Math.round(size * (maskable ? 0.18 : 0.08));
    const maxDim = size - pad * 2;
    img.scaleToFit(maxDim, maxDim);
    const canvas = new Jimp(size, size, 0xffffffff);
    const x = Math.round((size - img.bitmap.width) / 2);
    const y = Math.round((size - img.bitmap.height) / 2);
    canvas.composite(img, x, y);
    const buf = await canvas.getBufferAsync(Jimp.MIME_PNG);
    _pwaIconCache[key] = buf;
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch (e) {
    res.redirect('/icons/icon-192.png');
  }
});
app.get(['/api/public/manifest.webmanifest', '/api/public/manifest.json'], async (req, res) => {
  try {
    const SystemSettings = require('./models/SystemSettings');
    const s = await SystemSettings.findOne().lean();
    const name = brandNameFor(s, req);
    const tagline = brandTaglineFor(s);
    const logo = (s && s.logo) || '';
    const themeColor = (s && s.primaryColor) || '#059669';
    const icons = logo
      ? [
          { src: '/api/public/pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/api/public/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/api/public/pwa-icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]
      : [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ];
    res.set('Content-Type', 'application/manifest+json');
    res.json({
      name,
      short_name: name,
      description: tagline ? `${name} — ${tagline}` : `${name} — WhatsApp Business Platform`,
      start_url: '/client/dashboard',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#ffffff',
      theme_color: themeColor,
      icons,
    });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

app.get('/api/public/landing-page', async (req, res) => {
  try {
    const LandingPage = require('./models/LandingPage');
    const page = await LandingPage.findOne({ isPublished: true });
    res.json({ success: true, data: { page } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Inquiry submission (public)
// 公开数学验证码（无状态：答案+过期时间的 HMAC 签名，不占内存不占库）
app.get('/api/public/captcha', (req, res) => {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const exp = Date.now() + 10 * 60 * 1000;
  const sig = require('crypto').createHmac('sha256', process.env.JWT_SECRET || 'captcha-secret')
    .update(`${a + b}.${exp}`).digest('hex');
  res.json({ success: true, data: { question: `${a} + ${b} = ?`, token: `${exp}.${sig}` } });
});

app.post('/api/inquiries', async (req, res) => {
  try {
    // 管理后台开启"联系表格验证码"后强制校验
    const SystemSettings = require('./models/SystemSettings');
    const sys = await SystemSettings.findOne().select('contactCaptcha').lean();
    if (sys?.contactCaptcha) {
      const [exp, sig] = String(req.body?.captchaToken || '').split('.');
      const expect = exp && require('crypto').createHmac('sha256', process.env.JWT_SECRET || 'captcha-secret')
        .update(`${String(req.body?.captchaAnswer || '').trim()}.${exp}`).digest('hex');
      if (!exp || Number(exp) < Date.now() || sig !== expect) {
        return res.status(400).json({ success: false, message: '验证码错误，请重试' });
      }
    }
    const Inquiry = require('./models/Inquiry');
    const { name, email, phone, message } = req.body || {};
    const inquiry = await Inquiry.create({ name, email, phone, message });
    require('./services/adminNotify').notifyAdmin('New inquiry received', ['Name: ' + (req.body.name || ''), 'Email: ' + (req.body.email || ''), 'Message: ' + String(req.body.message || '').slice(0, 200)], '/admin/dashboard').catch(() => {});
    res.status(201).json({ success: true, data: inquiry });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Public Blog API
app.get("/api/public/blog", async (req, res) => {
  try {
    const BlogPost = require("./models/BlogPost");
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(20, parseInt(req.query.limit) || 9);
    const filter = { status: "published" };
    if (req.query.tag) filter.tags = req.query.tag;
    const [posts, total] = await Promise.all([
      BlogPost.find(filter).sort("-publishedAt").skip((page-1)*limit).limit(limit).lean(),
      BlogPost.countDocuments(filter)
    ]);
    res.json({ success: true, data: posts, pagination: { page, limit, total, pages: Math.ceil(total/limit) } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
app.get("/api/public/blog/:slug", async (req, res) => {
  try {
    const BlogPost = require("./models/BlogPost");
    const post = await BlogPost.findOne({ slug: req.params.slug, status: "published" }).lean();
    if (!post) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: post });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Public Knowledge Base API
app.get("/api/public/knowledge", async (req, res) => {
  try {
    const KB = require("./models/KnowledgeBase");
    const filter = { status: "published" };
    if (req.query.category) filter.category = req.query.category;
    // SEC-PUB：公开搜索必须转义正则（原先可注入灾难性回溯正则打满 CPU）
    if (req.query.search) filter.title = { $regex: require('./utils/escapeRegex')(String(req.query.search).slice(0, 100)), $options: "i" };
    const articles = await KB.find(filter).sort("order").lean();
    const categories = await KB.distinct("category", { status: "published" });
    res.json({ success: true, data: articles, categories });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
app.get("/api/public/knowledge/:slug", async (req, res) => {
  try {
    const KB = require("./models/KnowledgeBase");
    const article = await KB.findOne({ slug: req.params.slug, status: "published" }).lean();
    if (!article) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: article });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Public Pages API
app.get("/api/public/pages/:slug", async (req, res) => {
  try {
    const Page = require("./models/Page");
    const pg = await Page.findOne({ slug: req.params.slug, status: "published", isActive: true }).lean();
    if (!pg) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: pg });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Public Site Settings (full website config)
app.get("/api/public/site-settings", async (req, res) => {
  try {
    const SystemSettings = require("./models/SystemSettings");
    const LandingPage = require("./models/LandingPage");
    const s = await SystemSettings.findOne().lean();
    const lp = await LandingPage.findOne({ isPublished: true }).lean();
    res.json({ success: true, data: {
      business: { name: (s && s.appName) || "红浪漫", tagline: (s && s.tagline) || "", email: (s && s.appEmail) || "", url: (s && s.appUrl) || "", description: (s && s.appDescription) || "" },
      branding: (() => { const fix = (u) => (u && u.includes('/uploads/') && !u.includes('/api/uploads/')) ? u.replace('/uploads/', '/api/uploads/') : (u || ""); return { logo: fix(s && s.logo), logoDark: fix(s && s.logoDark), favicon: fix(s && s.favicon) }; })(),
      theme: { primaryColor: (s && s.primaryColor) || "#059669", primaryFont: (s && s.primaryFont) || "Inter" },
      landing: lp || null,
      social: (lp && lp.footer && lp.footer.socialLinks) || {},
      contact: (lp && lp.contact) || {},
      footer: (lp && lp.footer) || {},
      whatsappWidget: (s && s.whatsappWidget) ? { enabled: !!s.whatsappWidget.enabled, phone: s.whatsappWidget.phone || "", message: s.whatsappWidget.message || "", greeting: s.whatsappWidget.greeting || "" } : { enabled: false, phone: "", message: "", greeting: "" },
    }});
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Public Site Content (all page texts, editable from admin Site Settings)
app.get("/api/public/site-content", async (req, res) => {
  try {
    const SiteContent = require("./models/SiteContent");
    const defaults = require("./config/siteContentDefaults");
    const merge = (base, over) => {
      if (Array.isArray(over)) return over;
      if (over && typeof over === "object" && base && typeof base === "object" && !Array.isArray(base)) {
        const out = { ...base };
        for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
        return out;
      }
      return over === undefined ? base : over;
    };
    const doc = await SiteContent.findOne().lean();
    res.json({ success: true, data: merge(defaults, (doc && doc.content) || {}) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Public Site Theme (website templates)
app.get("/api/public/site-themes", (req, res) => {
  try { res.json({ success: true, data: require("./config/siteThemes").getThemeList() }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
app.get("/api/public/site-theme", async (req, res) => {
  try {
    const { getThemePayload } = require("./config/siteThemes");
    let id = req.query.id;
    if (!id) {
      const SystemSettings = require("./models/SystemSettings");
      const st = await SystemSettings.findOne().lean();
      id = (st && st.siteTheme) || "royal-violet";
    }
    res.json({ success: true, data: getThemePayload(id) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running', timestamp: new Date() });
});

// Error handler
app.use(errorHandler);

// Initialize drip campaign scheduler
const DripScheduler = require('./services/dripScheduler');
const dripScheduler = new DripScheduler(io);
dripScheduler.start();

// Scheduled broadcast/preset campaigns (exact date-time + recurring)
const CampaignScheduler = require('./services/campaignScheduler');
new CampaignScheduler(io).start();
// Continue campaigns left "running" by a previous restart/crash.
require('./controllers/campaignController').resumeRunningCampaigns(io);

// Note reminders: notify workspace when a reminder is due
const ContactNote = require('./models/ContactNote');
setInterval(async () => {
  try {
    const due = await ContactNote.find({ remindAt: { $lte: new Date() }, reminderSent: false }).populate('contact', 'name phone');
    for (const note of due) {
      const room = io.sockets.adapter.rooms.get(`workspace:${note.workspace}`);
      if (!room || room.size === 0) continue; // retry next minute when someone is online
      io.to(`workspace:${note.workspace}`).emit('reminder_due', {
        noteId: note._id,
        text: note.text,
        contact: note.contact ? { _id: note.contact._id, name: note.contact.name, phone: note.contact.phone } : null,
      });
      note.reminderSent = true;
      await note.save();
    }
  } catch (e) { console.error('[NoteReminder]', e.message); }
}, 60 * 1000);
global._io = io;
require('./services/aiCallScheduler').start();
require('./services/aiCallScheduler').startBulkCampaigns();
require('./services/dataCleanup').start();
require('./services/wisher').start();
require('./services/dailyDigest').start();
// Instagram Auto DM sender: paced sending, hourly caps and retries.
setInterval(() => {
  require('./services/igAutoDmService').processQueue()
    .catch((e) => console.error('[IgAutoDm] queue error:', e.message));
}, 20000);
require('./services/followUpService').start();
require('./services/emailInboxPoller').start(io);
// Bot Flow durable timers: resume delayed steps and fire question "no-reply" timeout branches
setInterval(() => {
  const bf = require('./services/botFlowEngine');
  bf.processTimedResumes({ io }).catch(() => {});
  bf.processReplyTimeouts({ io }).catch(() => {});
}, 60 * 1000);
setTimeout(() => require('./services/waQrService').restoreAll().catch(() => {}), 5000);
setTimeout(() => require('./services/tgUserService').restoreAll().catch(() => {}), 7000);

// Auto-delete old call recordings per workspace retention setting
setInterval(async () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const AISettings = require('./models/AISettings');
    const CallSession = require('./models/CallSession');
    const { REC_DIR } = require('./services/callRecorder');
    const list = await AISettings.find({ 'callRecording.autoDeleteDays': { $gt: 0 } }).select('workspace callRecording').lean();
    for (const ai of list) {
      const cutoff = new Date(Date.now() - ai.callRecording.autoDeleteDays * 24 * 60 * 60 * 1000);
      const old = await CallSession.find({ workspace: ai.workspace, recordingUrl: { $ne: '' }, createdAt: { $lt: cutoff } }).select('recordingUrl').lean();
      for (const s of old) {
        try { fs.unlinkSync(path.join(REC_DIR, path.basename(s.recordingUrl))); } catch {}
        await CallSession.updateOne({ _id: s._id }, { recordingUrl: '' });
      }
      if (old.length) console.log('[Call Rec] auto-deleted', old.length, 'recordings for workspace', String(ai.workspace));
    }
  } catch (e) { console.error('[Call Rec cleanup]', e.message); }
}, 6 * 60 * 60 * 1000);

// Daily database backup (every 24 hours, keeps last 10)
setInterval(async () => {
  try { await platform.runBackup(); console.log('[Backup] Daily database backup completed'); }
  catch (e) { console.error('[Backup] Failed:', e.message); }
}, 24 * 60 * 60 * 1000);

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`Server running on port ${PORT}`);

  // Self-heal: the installer's nginx config historically missed client_max_body_size,
  // so uploads over 1MB got 413. Add it to our own site file only, then reload nginx.
  setTimeout(() => {
    try {
      const { execSync } = require('child_process');
      const fsN = require('fs');
      const site = '/etc/nginx/sites-available/wabapanel';
      if (process.getuid && process.getuid() === 0 && fsN.existsSync(site)) {
        const conf = fsN.readFileSync(site, 'utf8');
        if (!conf.includes('client_max_body_size')) {
          fsN.writeFileSync(site, conf.replace(/server\s*\{/, 'server {\n  client_max_body_size 100M;'));
          try {
            execSync('nginx -t', { stdio: 'ignore' });
          } catch (tErr) {
            fsN.writeFileSync(site, conf);
            throw tErr;
          }
          execSync('systemctl reload nginx', { stdio: 'ignore' });
          console.log('[NginxHeal] client_max_body_size 100M added');
        }
      }
    } catch (e) { console.error('[NginxHeal]', e.message); }
  }, 15000);
});

module.exports = { app, server, io };
