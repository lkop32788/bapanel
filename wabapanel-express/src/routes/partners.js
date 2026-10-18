const router = require('express').Router();
const { protect } = require('../middleware/auth');
const Partner = require('../models/Partner');
const PartnerSettings = require('../models/PartnerSettings');
const PartnerReferral = require('../models/PartnerReferral');
const PartnerCommission = require('../models/PartnerCommission');
const PartnerWithdrawal = require('../models/PartnerWithdrawal');
const PartnerAnnouncement = require('../models/PartnerAnnouncement');

router.use(protect);

async function requirePartner(req, res) {
  const p = await Partner.findOne({ user: req.user._id });
  if (!p) { res.status(403).json({ success: false, message: 'Not a partner' }); return null; }
  return p;
}

// GET /api/partners/me
router.get('/me', async (req, res) => {
  try {
    const partner = await Partner.findOne({ user: req.user._id }).populate('user', 'name email phone avatar');
    if (!partner) return res.status(404).json({ success: false, message: 'Not a partner' });
    res.json({ success: true, data: partner });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/partners/profile
router.put('/profile', async (req, res) => {
  try {
    const partner = await requirePartner(req, res);
    if (!partner) return;
    const { name, phone, avatar } = req.body;
    const User = require('../models/User');
    if (name || phone || avatar) await User.findByIdAndUpdate(req.user._id, { name, phone, avatar });
    if (name) partner.name = name;
    await partner.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/partners/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const partner = await requirePartner(req, res);
    if (!partner) return;
    const [referrals, conversions, pendingComm, clearedComm] = await Promise.all([
      PartnerReferral.countDocuments({ partner: partner._id }),
      PartnerReferral.countDocuments({ partner: partner._id, status: 'converted' }),
      PartnerCommission.countDocuments({ partner: partner._id, status: 'pending' }),
      PartnerCommission.countDocuments({ partner: partner._id, status: 'cleared' }),
    ]);
    const pendingAmount = (await PartnerCommission.aggregate([
      { $match: { partner: partner._id, status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]))[0]?.total || 0;
    res.json({ success: true, data: { referrals, conversions, pendingComm, clearedComm, pendingAmount, wallet: partner.walletBalance, totalEarned: partner.totalEarned, code: partner.code } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/partners/customers
router.get('/customers', async (req, res) => {
  try {
    const partner = await requirePartner(req, res);
    if (!partner) return;
    const settings = await PartnerSettings.findOne() || {};
    const referrals = await PartnerReferral.find({ partner: partner._id }).populate('customer', 'name email phone').sort({ createdAt: -1 });
    const mask = settings.maskCustomerContact;
    const data = referrals.map(r => {
      const obj = r.toObject();
      if (mask && obj.customer) {
        if (obj.customer.email) obj.customer.email = obj.customer.email.replace(/(.{2}).+(@.+)/, '$1***$2');
        if (obj.customer.phone) obj.customer.phone = '***' + String(obj.customer.phone).slice(-3);
      }
      return obj;
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/partners/conversions
router.get('/conversions', async (req, res) => {
  try {
    const partner = await requirePartner(req, res);
    if (!partner) return;
    const conversions = await PartnerReferral.find({ partner: partner._id, status: 'converted' }).sort({ convertedAt: -1 });
    res.json({ success: true, data: conversions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/partners/commissions
router.get('/commissions', async (req, res) => {
  try {
    const partner = await requirePartner(req, res);
    if (!partner) return;
    const { status, type, page = 1, limit = 50 } = req.query;
    const filter = { partner: partner._id };
    if (status) filter.status = status;
    if (type) filter.type = type;
    const commissions = await PartnerCommission.find(filter).sort({ createdAt: -1 }).limit(parseInt(limit)).skip((parseInt(page) - 1) * parseInt(limit));
    res.json({ success: true, data: commissions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/partners/wallet
router.get('/wallet', async (req, res) => {
  try {
    const partner = await requirePartner(req, res);
    if (!partner) return;
    res.json({ success: true, data: { balance: partner.walletBalance, totalEarned: partner.totalEarned, totalPaidOut: partner.totalPaidOut } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/partners/withdraw
router.get('/withdraw', async (req, res) => {
  try {
    const partner = await requirePartner(req, res);
    if (!partner) return;
    const withdrawals = await PartnerWithdrawal.find({ partner: partner._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: withdrawals });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/partners/withdraw
router.post('/withdraw', async (req, res) => {
  try {
    const partner = await requirePartner(req, res);
    if (!partner) return;
    const settings = await PartnerSettings.findOne() || {};
    const amount = Number(req.body.amount);
    const min = settings.minWithdrawAmount || 0;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });
    if (amount < min) return res.status(400).json({ success: false, message: `Minimum withdrawal is ${min}` });
    if (amount > partner.walletBalance) return res.status(400).json({ success: false, message: 'Insufficient balance' });
    const w = await PartnerWithdrawal.create({ partner: partner._id, amount, payoutDetails: partner.payoutDetails });
    res.status(201).json({ success: true, data: w });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/partners/payout-details
router.put('/payout-details', async (req, res) => {
  try {
    const partner = await requirePartner(req, res);
    if (!partner) return;
    partner.payoutDetails = req.body || {};
    await partner.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/partners/kyc
router.get('/kyc', async (req, res) => {
  try {
    const partner = await requirePartner(req, res);
    if (!partner) return;
    res.json({ success: true, data: partner.kyc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/partners/kyc
router.post('/kyc', async (req, res) => {
  try {
    const partner = await requirePartner(req, res);
    if (!partner) return;
    const { documents } = req.body;
    partner.kyc.documents = documents || [];
    partner.kyc.status = 'pending';
    partner.kyc.submittedAt = new Date();
    await partner.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/partners/announcements
router.get('/announcements', async (req, res) => {
  try {
    const partner = await requirePartner(req, res);
    if (!partner) return;
    const announcements = await PartnerAnnouncement.find({ status: 'active' }).sort({ createdAt: -1 });
    const data = announcements.map(a => ({ ...a.toObject(), read: a.readBy.includes(partner._id) }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/partners/announcements/read
router.post('/announcements/read', async (req, res) => {
  try {
    const partner = await requirePartner(req, res);
    if (!partner) return;
    const { ids } = req.body;
    if (Array.isArray(ids) && ids.length) {
      await PartnerAnnouncement.updateMany({ _id: { $in: ids } }, { $addToSet: { readBy: partner._id } });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
