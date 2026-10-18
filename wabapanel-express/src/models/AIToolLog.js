const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  app: { type: String, required: true },      // 'google-sheets' | custom server name
  tool: { type: String, required: true },
  level: { type: String, enum: ['read', 'write', 'danger'], default: 'read' },
  phone: { type: String, default: '' },        // customer phone that triggered it
  args: { type: String, default: '' },         // JSON string of args
  status: { type: String, enum: ['ok', 'error', 'denied', 'confirm'], default: 'ok' },
  detail: { type: String, default: '' },
  ms: { type: Number, default: 0 },
}, { timestamps: true });

schema.index({ workspace: 1, createdAt: -1 });

module.exports = mongoose.model('AIToolLog', schema);
