const mongoose = require('mongoose');

// 省钱专家：积分流水。amount 正=入账（充值/退款），负=扣费
const saverLedgerSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  type: { type: String, enum: ['topup', 'charge', 'refund', 'adjust'], required: true },
  amount: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'SaverCheckTask' },
  note: { type: String, default: '' },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // 充值/调整的操作管理员
}, { timestamps: true });

saverLedgerSchema.index({ workspace: 1, createdAt: -1 });

module.exports = mongoose.model('SaverLedger', saverLedgerSchema);
