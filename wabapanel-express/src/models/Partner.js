const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  code: { type: String, unique: true, required: true },
  name: { type: String, default: '' },
  commissionRate: { type: Number, default: null }, // null = use global default
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  walletBalance: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  totalPaidOut: { type: Number, default: 0 },
  referrals: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  kyc: {
    status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    documents: [{ type: String }],
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    note: { type: String, default: '' },
  },
  payoutDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

// Generate short unique referral code
schema.statics.generateCode = async function () {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (await this.findOne({ code }));
  return code;
};

module.exports = mongoose.model('Partner', schema);
