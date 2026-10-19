const mongoose = require('mongoose');

// 省钱专家：号码状态批量检测任务（WS客户状态 / TG客户状态）
const resultSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  // active=可发送, banned=已封号, inactive=久未上线, not_found=未注册, unknown=未知
  status: { type: String, enum: ['active', 'banned', 'inactive', 'not_found', 'unknown'], default: 'unknown' },
  detail: { type: String, default: '' },
}, { _id: false });

const saverCheckTaskSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  channel: { type: String, enum: ['whatsapp', 'telegram', 'more'], required: true },
  fileName: { type: String, default: '' },
  // th333 的任务类型（wsValid 筛开通 / wsSimpleValid 简筛 / wsActive 筛活跃 / tgValid / tgActive）
  taskType: { type: String, default: '' },
  externalTaskId: { type: String, default: '' },
  country: {
    name: { type: String, default: '' },
    dial: { type: String, default: '' },
    code: { type: String, default: '' }, // 地区编码（US、MY…），外部 API 必填
  },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  error: { type: String, default: '' },
  // 计量收费：本任务扣费（积分）、单价、是否已退款
  cost: { type: Number, default: 0 },
  unitPrice: { type: Number, default: 0 },
  refunded: { type: Boolean, default: false },
  total: { type: Number, default: 0 },
  checked: { type: Number, default: 0 },
  startedAt: { type: Date },
  finishedAt: { type: Date },
  summary: {
    active: { type: Number, default: 0 },
    banned: { type: Number, default: 0 },
    inactive: { type: Number, default: 0 },
    notFound: { type: Number, default: 0 },
    unknown: { type: Number, default: 0 },
  },
  results: { type: [resultSchema], default: [] },
}, { timestamps: true });

saverCheckTaskSchema.index({ workspace: 1, channel: 1, createdAt: -1 });

module.exports = mongoose.model('SaverCheckTask', saverCheckTaskSchema);
