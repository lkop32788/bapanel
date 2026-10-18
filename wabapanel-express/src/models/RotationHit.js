const mongoose = require('mongoose');

const rotationHitSchema = new mongoose.Schema({
  link: { type: mongoose.Schema.Types.ObjectId, ref: 'RotationLink', required: true },
  workspace: { type: mongoose.Schema.Types.ObjectId },
  phone: { type: String },
  kind: { type: String, enum: ['click', 'session'] },
  contact: { type: mongoose.Schema.Types.ObjectId },
  contactPhone: { type: String },
  at: { type: Date, default: Date.now },
});

rotationHitSchema.index({ link: 1, kind: 1, at: -1 });
rotationHitSchema.index({ link: 1, contact: 1, kind: 1, at: -1 });
rotationHitSchema.index({ link: 1, contactPhone: 1, kind: 1, at: -1 });
rotationHitSchema.index({ at: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

module.exports = mongoose.model('RotationHit', rotationHitSchema);
