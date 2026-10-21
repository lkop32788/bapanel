const mongoose = require('mongoose');

// 号码生成批次：只存生成参数 + 随机种子，号码在下载时按参数确定性重新生成（不落库明细）
const numberGenBatchSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, default: '' },
  country: {
    name: { type: String, default: '' },
    dial: { type: String, default: '' },
    code: { type: String, default: '' },
  },
  prefixes: { type: [String], default: [] },
  localLen: { type: Number, required: true },
  mode: { type: String, enum: ['sequential', 'random'], required: true },
  count: { type: Number, required: true },
  seed: { type: Number, required: true },
}, { timestamps: true });

numberGenBatchSchema.index({ workspace: 1, createdAt: -1 });

module.exports = mongoose.model('NumberGenBatch', numberGenBatchSchema);
