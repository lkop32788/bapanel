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
app.set('trust proxy', 1);
app.use('/uploads', require('express').static(require('path').join(__dirname, '..', 'uploads')));
// Also serve uploads under the /api prefix. Every install proxies /api to this
// backend, but some reverse-proxy setups route bare /uploads to the frontend
// (breaking white-label logos/favicons). Serving via /api/uploads guarantees
// uploaded assets load regardless of the proxy config.
app.use('/api/uploads', require('express').static(require('path').join(__dirname, '..', 'uploads')));
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
app.use('/api/tgpersonal', require('./routes/tgpersonal'));
app.use('/api/dashboard', require('./routes/dashboard'));


app.use('/api/forms', require('./routes/forms'));
// Public short link redirect (clean URL)
const { redirectShortLink } = require('./controllers/shortLinkController');
app.get('/s/:code', redirectShortLink);

app.use('/api/short-links', require('./routes/shortLinks'));

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
app.use('/api/admin/kkhs-license', require('./routes/kkhsLicense'));
app.use("/api/embedded-signup", require("./routes/embeddedSignup"));
app.use("/api/data-fields", require("./routes/dataFields"));
app.use("/api/badges", require("./routes/badges"));
app.use("/api/ai-settings", require("./routes/aiSettings"));

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

// KKHS store auto-login — signed link from kkhsmedia.com storepanel
app.get('/api/auth/kkhs-auto-login', async (req, res) => {
  try {
    const { ts, sig } = req.query;
    if (!ts || !sig) return res.status(400).send('Invalid auto-login link');
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.status(400).send('Auto-login link expired');
    const SystemSettings = require('./models/SystemSettings');
    const settings = await SystemSettings.findOne().select('kkhsLicenseKey').lean();
    const licenseKey = settings?.kkhsLicenseKey || '';
    if (!licenseKey) return res.status(400).send('License not activated');
    const crypto = require('crypto');
    const domain = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().split(':')[0];
    const expected = crypto.createHash('sha256').update(domain + ts + licenseKey).digest('hex');
    if (String(sig) !== expected) return res.status(403).send('Invalid signature');
    const User = require('./models/User');
    const admin = await User.findOne({ role: 'super_admin' }).sort({ createdAt: 1 });
    if (!admin) return res.status(404).send('Admin user not found');
    const generateToken = require('./utils/generateToken');
    res.redirect('/auth/login?token=' + generateToken(admin._id));
  } catch (e) { res.status(500).send('Auto-login failed'); }
});

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
  if (_isMasterInstall()) return 'WabaPanel';
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
app.post('/api/inquiries', async (req, res) => {
  try {
    const Inquiry = require('./models/Inquiry');
    const inquiry = await Inquiry.create(req.body);
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
    if (req.query.search) filter.title = { $regex: req.query.search, $options: "i" };
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
      business: { name: (s && s.appName) || "KKHS Media", tagline: (s && s.tagline) || "", email: (s && s.appEmail) || "", url: (s && s.appUrl) || "", description: (s && s.appDescription) || "" },
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
server.listen(PORT, () => {
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
