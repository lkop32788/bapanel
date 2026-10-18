const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  title: { type: String, required: true },
  body: { type: String, default: '' },
  type: { type: String, enum: ['info', 'warning', 'success'], default: 'info' },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Partner' }],
}, { timestamps: true });

module.exports = mongoose.model('PartnerAnnouncement', schema);
