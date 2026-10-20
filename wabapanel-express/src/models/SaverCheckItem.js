const mongoose = require('mongoose');

// 省钱专家：检测任务明细。原内嵌在 SaverCheckTask.results，上限提到 500 万条后
// 会爆 Mongo 16MB 文档上限，拆成独立集合；旧任务仍读内嵌 results。
const saverCheckItemSchema = new mongoose.Schema({
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'SaverCheckTask', required: true, index: true },
  phone: { type: String, required: true },
  status: { type: String, enum: ['active', 'banned', 'inactive', 'not_found', 'unknown'], default: 'unknown' },
  detail: { type: String, default: '' },
}, { versionKey: false });

module.exports = mongoose.model('SaverCheckItem', saverCheckItemSchema);
