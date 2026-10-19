const mongoose = require('mongoose');

// 省钱专家：USDT 在线充值订单（Cryptomus）
const saverUsdtOrderSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  credits: { type: Number, required: true },      // 到账积分
  usdtAmount: { type: Number, required: true },   // 应付 USDT
  provider: { type: String, default: 'cryptomus' },
  orderNo: { type: String, required: true, unique: true }, // 我方订单号（传给网关的 order_id）
  externalId: { type: String, default: '' },      // 网关侧 uuid
  payUrl: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'expired'], default: 'pending', index: true },
  paidAt: { type: Date },
  raw: { type: mongoose.Schema.Types.Mixed },     // 网关最后一次返回的状态详情
}, { timestamps: true });

// SEC-PAY1：同一笔链上交易（externalId=交易hash）全局只能入账一次，兜底并发双入账
saverUsdtOrderSchema.index(
  { externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $exists: true, $gt: '' } } },
);
// SEC-PAY3：待支付订单金额全局唯一，兜底 createOrder 并发撞金额（check-then-create 竞态）
saverUsdtOrderSchema.index(
  { usdtAmount: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);

module.exports = mongoose.model('SaverUsdtOrder', saverUsdtOrderSchema);
