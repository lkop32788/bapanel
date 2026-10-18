const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  read: { type: Boolean, default: true },
  write: { type: Boolean, default: false },
  danger: { type: Boolean, default: false },
  confirmWrite: { type: Boolean, default: true },
  dailyLimit: { type: Number, default: 200 },
  tools: { type: mongoose.Schema.Types.Mixed, default: {} }, // toolName -> bool override
}, { _id: false });

const customToolParamSchema = new mongoose.Schema({
  name: String,
  type: { type: String, enum: ['string', 'number', 'boolean'], default: 'string' },
  description: String,
  required: { type: Boolean, default: false },
  in: { type: String, enum: ['query', 'body', 'path'], default: 'query' },
}, { _id: false });

const customToolSchema = new mongoose.Schema({
  name: String,
  description: String,
  level: { type: String, enum: ['read', 'write', 'danger'], default: 'read' },
  enabled: { type: Boolean, default: true },
  method: { type: String, default: 'GET' },
  path: { type: String, default: '' },
  params: [customToolParamSchema],
}, { _id: false });

const customSchema = new mongoose.Schema({
  name: { type: String, required: true },
  kind: { type: String, enum: ['rest', 'mcp'], default: 'rest' },
  url: { type: String, required: true },
  authType: { type: String, enum: ['none', 'bearer', 'header', 'basic'], default: 'none' },
  headerName: { type: String, default: '' },
  authValue: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
  read: { type: Boolean, default: true },
  write: { type: Boolean, default: false },
  danger: { type: Boolean, default: false },
  confirmWrite: { type: Boolean, default: false },
  dailyLimit: { type: Number, default: 200 },
  tools: [customToolSchema],
  lastDiscoveredAt: { type: Date, default: null },
});

const appSchema = new mongoose.Schema({
  type: { type: String, required: true },
  connected: { type: Boolean, default: false },
  account: { type: String, default: '' },
  credentials: { type: mongoose.Schema.Types.Mixed, default: {} },
  policy: { type: policySchema, default: () => ({}) },
}, { _id: false });

const schema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
  ownerPhones: [{ type: String }],
  apps: [appSchema],
  custom: [customSchema],
}, { timestamps: true });

module.exports = mongoose.model('AIToolsSettings', schema);
