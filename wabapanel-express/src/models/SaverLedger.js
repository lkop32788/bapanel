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
  // SEC-PAY3：幂等键（如 usdt:<orderNo> / topup:<id>）。同一笔外部入账全局只记一次；
  // settled=false 表示流水已记但钱包还没加（进程崩溃窗口），由对账任务补齐
  ref: { type: String },
  settled: { type: Boolean, default: true },
}, { timestamps: true });

saverLedgerSchema.index({ workspace: 1, createdAt: -1 });
saverLedgerSchema.index({ ref: 1 }, { unique: true, partialFilterExpression: { ref: { $exists: true, $gt: '' } } });

module.exports = mongoose.model('SaverLedger', saverLedgerSchema);
