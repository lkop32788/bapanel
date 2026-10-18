const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  licensed: { type: Boolean, default: true },
  defaultCommissionRate: { type: Number, default: 20, min: 0, max: 100 },
  recurringCommission: { type: Boolean, default: true },
  clearingDays: { type: Number, default: 15, min: 0 },
  minWithdrawAmount: { type: Number, default: 1000, min: 0 },
  maskCustomerContact: { type: Boolean, default: false },
  signupOpen: { type: Boolean, default: true },
  terms: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('PartnerSettings', schema);
