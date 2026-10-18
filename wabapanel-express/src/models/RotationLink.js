const mongoose = require('mongoose');

const rotationLinkSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  prefillText: { type: String, default: 'Hi' },
  isActive: { type: Boolean, default: true },
  numbers: [{
    _id: false,
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
    phone: { type: String },
    dailyCap: { type: Number, default: 20 },
  }],
  lastPick: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('RotationLink', rotationLinkSchema);
