const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  referral: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerReferral', default: null },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['signup', 'renewal', 'manual', 'reversed'], default: 'signup' },
  status: { type: String, enum: ['pending', 'cleared', 'paid', 'reversed'], default: 'pending' },
  clearAt: { type: Date, required: true },
  note: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('PartnerCommission', schema);
