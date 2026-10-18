const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  customerEmail: { type: String, default: '' },
  customerName: { type: String, default: '' },
  status: { type: String, enum: ['clicked', 'signed_up', 'converted', 'churned'], default: 'clicked' },
  plan: { type: String, default: '' },
  amount: { type: Number, default: 0 },
  convertedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('PartnerReferral', schema);
