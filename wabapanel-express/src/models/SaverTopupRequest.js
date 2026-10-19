const mongoose = require('mongoose');

// 省钱专家：商家充值申请（无在线支付网关，线下收款后管理员审批入账）
const saverTopupRequestSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  amount: { type: Number, required: true },
  note: { type: String, default: '' }, // 商家备注：付款方式/凭证说明
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },        // 申请人
  handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // 审批管理员
  handledAt: { type: Date },
  adminNote: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('SaverTopupRequest', saverTopupRequestSchema);
