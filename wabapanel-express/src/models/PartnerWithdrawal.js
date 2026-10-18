const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'paid'], default: 'pending' },
  note: { type: String, default: '' },
  payoutDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
  processedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('PartnerWithdrawal', schema);
