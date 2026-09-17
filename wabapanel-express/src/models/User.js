const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  twoFactorSecret: { type: String, default: "" },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorMethod: { type: String, enum: ['app', 'email'], default: 'app' },
  twoFactorEmailOTP: { type: String, default: '' },
  twoFactorEmailExpire: { type: Date },
  phone: { type: String, default: '' },
  avatar: { type: String, default: '' },
  role: { type: String, enum: ['super_admin', 'admin', 'user', 'agent', 'vendor'], default: 'user' },
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  isEmailVerified: { type: Boolean, default: false },
  currentWorkspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
  // Admin-controlled per-client feature switches (featureKey -> false disables the module)
  featureOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },
  permissions: [{ type: String }],
  allowedChannels: [{ type: String }],
  inboxScope: { type: String, enum: ['all', 'assigned'], default: 'all' },
  lastLogin: { type: Date },
  emailVerified: { type: Boolean, default: true },
  emailVerifyToken: { type: String },
  emailVerifyExpire: { type: Date },
  resetPasswordToken: { type: String },
  resetPasswordExpire: { type: Date },
  // Vendor-specific fields
  companyName: { type: String, default: '' },
  website: { type: String, default: '' },
  address: { type: String, default: '' },
  gstNumber: { type: String, default: '' },
  vendorNotes: { type: String, default: '' },
}, { timestamps: true });

// Serialize only current schema fields, including when historical documents contain retired data.
userSchema.set('toJSON', { schemaFieldsOnly: true });
userSchema.set('toObject', { schemaFieldsOnly: true });

userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
