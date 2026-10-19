const router = require('express').Router();
const { protect, adminOnly, superAdminOnly } = require('../middleware/auth');
const admin = require('../controllers/adminController');

router.use(protect, adminOnly);

// Dashboard
const { getAdminDashboard } = require('../controllers/dashboardController');
router.get('/dashboard', getAdminDashboard);

// Users（SEC-H1：写操作收口 super_admin——此前普通 admin 可经 mass assignment 自提权）
router.get('/users', admin.getUsers);
router.get('/users/:id', admin.getUser);
router.post('/users', superAdminOnly, admin.createUser);
router.put('/users/:id', superAdminOnly, admin.updateUser);
router.delete('/users/:id', superAdminOnly, admin.deleteUser);

// Vendors
router.get('/feature-controls', admin.getFeatureControls);
router.put('/feature-controls/:vendorId', admin.updateFeatureControls);
router.get('/data-cleanup', admin.getDataCleanup);
router.put('/data-cleanup', admin.updateDataCleanup);
router.post('/data-cleanup/run', admin.runDataCleanup);
router.get('/vendors', admin.getVendors);
router.get('/vendors/:id', admin.getVendor);
router.post('/vendors', admin.createVendor);
router.put('/vendors/:id', admin.updateVendor);
router.delete('/vendors/:id', admin.deleteVendor);
router.post('/vendors/:id/login-as', admin.loginAsVendor);

// Meta Pricing
router.get('/meta-pricing', admin.getMetaPricing);
router.post('/meta-pricing', admin.updateMetaPricing);

// Permissions
router.get('/permissions', admin.getPermissions);
router.put('/permissions', admin.updatePermissions);

// System Settings
router.get('/settings', admin.getSettings);
router.put('/settings', superAdminOnly, admin.updateSettings);
router.post('/settings/test-email', superAdminOnly, admin.sendTestEmail);
// 省钱专家：商家计费 —— 钱包列表 / 充值扣减 / 流水
router.get('/saver-billing/wallets', async (req, res) => {
  try {
    const Workspace = require('../models/Workspace');
    const SaverWallet = require('../models/SaverWallet');
    const SaverLedger = require('../models/SaverLedger');
    const q = {};
    if (req.query.kw) {
      const safe = String(req.query.kw).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      q.name = { $regex: safe, $options: 'i' };
    }
    const wss = await Workspace.find(q).select('name owner').populate('owner', 'name email').sort('-createdAt').limit(200).lean();
    const ids = wss.map(w => w._id);
    const [wallets, charges] = await Promise.all([
      SaverWallet.find({ workspace: { $in: ids } }).lean(),
      SaverLedger.aggregate([
        { $match: { workspace: { $in: ids }, type: 'charge' } },
        { $group: { _id: '$workspace', spent: { $sum: '$amount' }, tasks: { $sum: 1 } } },
      ]),
    ]);
    const wmap = Object.fromEntries(wallets.map(w => [String(w.workspace), w.balance]));
    const smap = Object.fromEntries(charges.map(c => [String(c._id), c]));
    res.json({ success: true, data: wss.map(w => ({
      workspaceId: w._id,
      name: w.name,
      owner: w.owner ? { name: w.owner.name, email: w.owner.email } : null,
      balance: Math.round((wmap[String(w._id)] || 0) * 1000) / 1000,
      spent: Math.round(-(smap[String(w._id)]?.spent || 0) * 1000) / 1000,
      chargedTasks: smap[String(w._id)]?.tasks || 0,
    })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.post('/saver-billing/topup', superAdminOnly, async (req, res) => {
  try {
    const { workspaceId, amount, note } = req.body || {};
    const n = Number(amount);
    if (!workspaceId || !Number.isFinite(n) || n === 0) {
      return res.status(400).json({ success: false, message: '金额无效' });
    }
    const balance = await require('../services/saverBillingService').adjust(workspaceId, n, req.user._id, note);
    res.json({ success: true, data: { balance } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.get('/saver-billing/ledger', async (req, res) => {
  try {
    const SaverLedger = require('../models/SaverLedger');
    const q = {};
    if (req.query.workspace) q.workspace = req.query.workspace;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const [rows, total] = await Promise.all([
      SaverLedger.find(q).populate('task', 'fileName taskType total').populate('by', 'name')
        .sort('-createdAt').skip((page - 1) * limit).limit(limit).lean(),
      SaverLedger.countDocuments(q),
    ]);
    res.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 充值中心：USDT 充值订单管理
router.get('/saver-billing/usdt-orders', async (req, res) => {
  try {
    const SaverUsdtOrder = require('../models/SaverUsdtOrder');
    const q = {};
    if (['pending', 'paid', 'failed', 'expired'].includes(req.query.status)) q.status = req.query.status;
    const rows = await SaverUsdtOrder.find(q)
      .populate('workspace', 'name').populate('by', 'name')
      .sort('-createdAt').limit(200).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// 手动补单：商户已转账但超时/未匹配时，管理员确认到账（按当前汇率入账）
router.post('/saver-billing/usdt-orders/:id/credit', superAdminOnly, async (req, res) => {
  try {
    const SaverUsdtOrder = require('../models/SaverUsdtOrder');
    const { getUsdtConfig } = require('../services/saverUsdtService');
    const billing = require('../services/saverBillingService');
    const cfg = await getUsdtConfig();
    const order = await SaverUsdtOrder.findOne({ _id: req.params.id });
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    const rmb = Math.round(order.usdtAmount * cfg.rate * 100) / 100;
    // 原子抢占：已 paid 的不能重复入账
    const claimed = await SaverUsdtOrder.findOneAndUpdate(
      { _id: order._id, status: { $ne: 'paid' } },
      { $set: { status: 'paid', paidAt: new Date(), credits: rmb, raw: { manual: true, by: String(req.user._id), note: String(req.body?.note || '').slice(0, 200) } } },
      { new: true });
    if (!claimed) return res.status(400).json({ success: false, message: '订单已是到账状态' });
    await billing.adjust(claimed.workspace, rmb, req.user._id,
      `USDT充值手动补单 ${claimed.usdtAmount}U × ${cfg.rate} = ￥${rmb}（订单 ${claimed.orderNo}）`);
    res.json({ success: true, message: `已入账 ￥${rmb}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 省钱专家：充值申请列表与审批
router.get('/saver-billing/topup-requests', async (req, res) => {
  try {
    const SaverTopupRequest = require('../models/SaverTopupRequest');
    const q = {};
    if (['pending', 'approved', 'rejected'].includes(req.query.status)) q.status = req.query.status;
    const rows = await SaverTopupRequest.find(q)
      .populate('workspace', 'name').populate('by', 'name email').populate('handledBy', 'name')
      .sort('-createdAt').limit(100).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.post('/saver-billing/topup-requests/:id', superAdminOnly, async (req, res) => {
  try {
    const SaverTopupRequest = require('../models/SaverTopupRequest');
    const { action, adminNote } = req.body || {};
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: '无效操作' });
    }
    // 原子抢占 pending，防止重复审批重复入账
    const doc = await SaverTopupRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { $set: { status: action === 'approve' ? 'approved' : 'rejected', handledBy: req.user._id, handledAt: new Date(), adminNote: String(adminNote || '').slice(0, 300) } },
      { new: true });
    if (!doc) return res.status(404).json({ success: false, message: '申请不存在或已处理' });
    if (action === 'approve') {
      await require('../services/saverBillingService').adjust(doc.workspace, doc.amount, req.user._id, `充值申请批准${doc.note ? '：' + doc.note : ''}`);
    }
    res.json({ success: true, message: action === 'approve' ? '已通过并入账' : '已拒绝' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 省钱专家：测试筛号 API 连接（查余额）
router.get('/settings/saver-balance', superAdminOnly, async (req, res) => {
  try {
    res.json({ success: true, data: await require('../services/saverCheckService').getBalance() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// AI Settings
router.get('/ai-settings', admin.getAISettings);
router.put('/ai-settings', admin.updateAISettings);

// Per-vendor AI provider/key assignment
router.get('/vendor-ai', admin.getVendorAiAssignments);
router.put('/vendor-ai/:vendorId', admin.updateVendorAiAssignment);

// Push knowledge-base articles to vendor workspaces
router.post('/push-knowledge', admin.pushKnowledgeToVendors);

// Landing Page
router.get('/landing-page', admin.getLandingPage);
router.put('/landing-page', admin.updateLandingPage);

// Site Content (full website customization)
router.get('/site-content', admin.getSiteContent);
router.put('/site-content', superAdminOnly, admin.updateSiteContent);

// Global Templates
router.get('/templates', admin.getGlobalTemplates);
router.post('/templates', admin.createGlobalTemplate);
router.put('/templates/:id', admin.updateGlobalTemplate);
router.delete('/templates/:id', admin.deleteGlobalTemplate);

// Short Links
router.get('/short-links', admin.getAdminShortLinks);
router.delete('/short-links/:id', admin.deleteAdminShortLink);

// Quick Replies
router.get('/quick-replies', admin.getQuickReplies);
router.post('/quick-replies', admin.createQuickReply);
router.put('/quick-replies/:id', admin.updateQuickReply);
router.delete('/quick-replies/:id', admin.deleteQuickReply);

// Languages
router.get('/languages', admin.getLanguages);
router.post('/languages', admin.createLanguage);
router.post('/languages/seed', admin.seedLanguages);
router.put('/languages/:id', admin.updateLanguage);
router.delete('/languages/:id', admin.deleteLanguage);

// FAQs
router.get('/faqs', admin.getFAQs);
router.post('/faqs', admin.createFAQ);
router.put('/faqs/:id', admin.updateFAQ);
router.delete('/faqs/:id', admin.deleteFAQ);

// Testimonials
router.get('/testimonials', admin.getTestimonials);
router.post('/testimonials', admin.createTestimonial);
router.put('/testimonials/:id', admin.updateTestimonial);
router.delete('/testimonials/:id', admin.deleteTestimonial);

// Pages
router.get('/pages', admin.getPages);
router.post('/pages', admin.createPage);
router.put('/pages/:id', admin.updatePage);
router.delete('/pages/:id', admin.deletePage);

// Vendor Detail
router.get('/vendors/:id/detail', admin.getVendorDetail);

// Knowledge Base CRUD
router.get("/knowledge", admin.getKnowledgeArticles);
router.post("/knowledge", admin.createKnowledgeArticle);
router.put("/knowledge/:id", admin.updateKnowledgeArticle);
router.delete("/knowledge/:id", admin.deleteKnowledgeArticle);

module.exports = router;
