const router = require('express').Router();
const { protect, adminOnly } = require('../middleware/auth');
const PartnerSettings = require('../models/PartnerSettings');
const Partner = require('../models/Partner');
const PartnerReferral = require('../models/PartnerReferral');
const PartnerCommission = require('../models/PartnerCommission');
const PartnerWithdrawal = require('../models/PartnerWithdrawal');
const PartnerAnnouncement = require('../models/PartnerAnnouncement');
const User = require('../models/User');

router.use(protect, adminOnly);

async function getSettings() {
  let s = await PartnerSettings.findOne();
  if (!s) s = await PartnerSettings.create({});
  return s;
}

// GET /api/admin/partners/module
router.get('/module', async (req, res) => {
  try {
    const s = await getSettings();
    res.json({ success: true, data: { licensed: s.licensed, enabled: s.enabled, active: s.licensed && s.enabled } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/partners/settings
router.get('/settings', async (req, res) => {
  try {
    const s = await getSettings();
    res.json({ success: true, data: s.toObject() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/partners/settings
router.put('/settings', async (req, res) => {
  try {
    const s = await getSettings();
    const allowed = ['enabled', 'defaultCommissionRate', 'recurringCommission', 'clearingDays', 'minWithdrawAmount', 'maskCustomerContact', 'signupOpen', 'terms'];
    allowed.forEach(k => { if (req.body[k] !== undefined) s[k] = req.body[k]; });
    await s.save();
    res.json({ success: true, data: s.toObject() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/partners/summary
router.get('/summary', async (req, res) => {
  try {
    const [totalPartners, activePartners, totalReferrals, convertedReferrals, pendingWithdrawals] = await Promise.all([
      Partner.countDocuments(),
      Partner.countDocuments({ status: 'active' }),
      PartnerReferral.countDocuments(),
      PartnerReferral.countDocuments({ status: 'converted' }),
      PartnerWithdrawal.countDocuments({ status: 'pending' }),
    ]);
    const walletAgg = await Partner.aggregate([{ $group: { _id: null, total: { $sum: '$walletBalance' }, paidOut: { $sum: '$totalPaidOut' } } }]);
    const commissionAgg = await PartnerCommission.aggregate([
      { $match: { status: { $in: ['cleared', 'paid'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const pendingAmtAgg = await PartnerWithdrawal.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    res.json({
      success: true, data: {
        totalPartners, activePartners, totalReferrals, convertedReferrals,
        pendingWithdrawals,
        pendingWithdrawalAmount: pendingAmtAgg[0]?.total || 0,
        totalPaidOut: walletAgg[0]?.paidOut || 0,
        creditedCommission: commissionAgg[0]?.total || 0,
        totalWalletBalance: walletAgg[0]?.total || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/partners/trends?months=6
router.get('/trends', async (req, res) => {
  try {
    const months = Math.min(parseInt(req.query.months) || 6, 24);
    const since = new Date();
    since.setMonth(since.getMonth() - months + 1);
    since.setDate(1); since.setHours(0, 0, 0, 0);

    const [commAgg, payAgg] = await Promise.all([
      PartnerCommission.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, commission: { $sum: '$amount' } } },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
      ]),
      PartnerWithdrawal.aggregate([
        { $match: { status: 'paid', createdAt: { $gte: since } } },
        { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, payouts: { $sum: '$amount' } } },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
      ]),
    ]);

    const map = {};
    const toKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
    commAgg.forEach(r => { const k = toKey(r._id.y, r._id.m); if (!map[k]) map[k] = { month: k, commission: 0, payouts: 0 }; map[k].commission = r.commission; });
    payAgg.forEach(r => { const k = toKey(r._id.y, r._id.m); if (!map[k]) map[k] = { month: k, commission: 0, payouts: 0 }; map[k].payouts = r.payouts; });

    const commissionTrend = Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
    res.json({ success: true, data: { commissionTrend } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/partners
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const partners = await Partner.find(filter).populate('user', 'name email').sort({ createdAt: -1 });
    res.json({ success: true, data: partners });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/partners
router.post('/', async (req, res) => {
  try {
    const { userId, name, commissionRate } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    const existing = await Partner.findOne({ user: userId });
    if (existing) return res.status(400).json({ success: false, message: 'User already a partner' });
    const code = await Partner.generateCode();
    const partner = await Partner.create({ user: userId, name: name || '', code, commissionRate: commissionRate ?? null });
    res.status(201).json({ success: true, data: partner });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/partners/referrals
router.get('/referrals', async (req, res) => {
  try {
    const { partnerId, status, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (partnerId) filter.partner = partnerId;
    if (status) filter.status = status;
    const referrals = await PartnerReferral.find(filter)
      .populate({ path: 'partner', populate: { path: 'user', select: 'name email' }, select: 'code name' })
      .populate('customer', 'name email')
      .sort({ createdAt: -1 }).limit(parseInt(limit)).skip((parseInt(page) - 1) * parseInt(limit));
    res.json({ success: true, data: referrals });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/partners/commissions
router.get('/commissions', async (req, res) => {
  try {
    const { status, type, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    const commissions = await PartnerCommission.find(filter)
      .populate({ path: 'partner', populate: { path: 'user', select: 'name email' }, select: 'code name' })
      .sort({ createdAt: -1 }).limit(parseInt(limit)).skip((parseInt(page) - 1) * parseInt(limit));
    res.json({ success: true, data: commissions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/partners/commissions/:id/reverse
router.post('/commissions/:id/reverse', async (req, res) => {
  try {
    const commission = await PartnerCommission.findById(req.params.id);
    if (!commission) return res.status(404).json({ success: false, message: 'Commission not found' });
    if (commission.status === 'reversed') return res.status(400).json({ success: false, message: 'Already reversed' });
    const prev = commission.status;
    commission.status = 'reversed';
    commission.type = 'reversed';
    commission.note = req.body.note || '';
    await commission.save();
    if (prev === 'cleared' || prev === 'paid') {
      await Partner.findByIdAndUpdate(commission.partner, { $inc: { walletBalance: -commission.amount, totalEarned: -commission.amount } });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/partners/withdrawals
router.get('/withdrawals', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const withdrawals = await PartnerWithdrawal.find(filter)
      .populate({ path: 'partner', populate: { path: 'user', select: 'name email' }, select: 'code name' })
      .sort({ createdAt: -1 });
    res.json({ success: true, data: withdrawals });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/partners/withdrawals/:id
router.put('/withdrawals/:id', async (req, res) => {
  try {
    const w = await PartnerWithdrawal.findById(req.params.id);
    if (!w) return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    const { status, note } = req.body;
    const prev = w.status;
    if (status) w.status = status;
    if (note !== undefined) w.note = note;
    if (status && status !== prev) {
      w.processedAt = new Date();
      if (status === 'paid') {
        await Partner.findByIdAndUpdate(w.partner, {
          $inc: { walletBalance: -w.amount, totalPaidOut: w.amount },
        });
      } else if (status === 'rejected' && prev === 'approved') {
        // no balance change — balance was not deducted on approve
      }
    }
    await w.save();
    res.json({ success: true, data: w });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/partners/kyc
router.get('/kyc', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { 'kyc.status': status } : { 'kyc.status': { $ne: 'none' } };
    const partners = await Partner.find(filter).populate('user', 'name email').sort({ 'kyc.submittedAt': -1 });
    res.json({ success: true, data: partners });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/partners/:id/kyc
router.put('/:id/kyc', async (req, res) => {
  try {
    const { status, note } = req.body;
    const partner = await Partner.findByIdAndUpdate(req.params.id, {
      'kyc.status': status, 'kyc.note': note || '', 'kyc.reviewedAt': new Date(),
    }, { new: true });
    if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
    res.json({ success: true, data: partner });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/partners/announcements
router.get('/announcements', async (req, res) => {
  try {
    const { type, status } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    const announcements = await PartnerAnnouncement.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: announcements });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/partners/announcements
router.post('/announcements', async (req, res) => {
  try {
    const { title, body, type } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title required' });
    const ann = await PartnerAnnouncement.create({ title, body: body || '', type: type || 'info' });
    res.status(201).json({ success: true, data: ann });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
