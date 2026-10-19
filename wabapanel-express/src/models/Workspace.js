const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['owner', 'admin', 'agent'], default: 'agent' },
    joinedAt: { type: Date, default: Date.now }
  }],
  whatsapp: {
    isConnected: { type: Boolean, default: false },
    // 号池模式：多号在群发/新会话接待时轮询分配（见 services/waNumberPool.js）
    poolEnabled: { type: Boolean, default: false },
    poolCursor: { type: Number, default: 0 },
    connectionMethod: { type: String, enum: ['embedded', 'qr', 'manual', 'coexistence', ''], default: '' },
    wabaId: { type: String, default: '' },
    phoneNumberId: { type: String, default: '' },
    businessAccountId: { type: String, default: '' },
    accessToken: { type: String, default: '' },
    adsAccessToken: { type: String, default: '' },
    adsPageId: { type: String, default: '' },
    phoneNumber: { type: String, default: '' },
    displayName: { type: String, default: '' },
    qualityRating: { type: String, default: '' },
    webhookSecret: { type: String, default: '' },
    paymentConfiguration: { type: String, default: '' },
    extraNumbers: [{
      phoneNumberId: { type: String, default: '' },
      phoneNumber: { type: String, default: '' },
      displayName: { type: String, default: '' },
      // Optional: for numbers that belong to a DIFFERENT WABA (different access token).
      // When empty, the number is treated as part of the main WABA (main token is used).
      accessToken: { type: String, default: '' },
      wabaId: { type: String, default: '' },
    }],
  },
  telegram: {
    botToken: { type: String, default: '' },
    botUsername: { type: String, default: '' },
    enabled: { type: Boolean, default: false },
    // SEC-PUB：secret_token 已随 setWebhook 注册，入站路由强制校验该头
    secretSynced: { type: Boolean, default: false },
  },
  waQr: {
    enabled: { type: Boolean, default: false },
    status: { type: String, default: 'disconnected' },
    phone: { type: String, default: '' },
    warmupStartedAt: { type: Date },
    dailyLimit: { type: Number, default: 1000 },
    sentToday: { type: Number, default: 0 },
    sentDate: { type: String, default: '' },
  },
  tgPersonal: {
    enabled: { type: Boolean, default: false },
    status: { type: String, default: 'disconnected' },
    phone: { type: String, default: '' },
    username: { type: String, default: '' },
    session: { type: String, default: '' },
    apiId: { type: String, default: '' },
    apiHash: { type: String, default: '' },
  },
  // ===== 号池 v2（2026-10-20）：网页版 WhatsApp / TG 个人号 多槽位 =====
  // 主槽位 slotId='default' 沿用上面的 waQr / tgPersonal 子文档（向后兼容）；
  // 这里只存附加槽位。会话绑定写在 conversation.waNumberId（'qr:<slotId>' / 'tgp:<slotId>'）
  waQrSlots: [{
    slotId: { type: String, required: true },
    label: { type: String, default: '' },
    status: { type: String, default: 'disconnected' },
    phone: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    warmupStartedAt: { type: Date },
    dailyLimit: { type: Number, default: 1000 },
    sentToday: { type: Number, default: 0 },
    sentDate: { type: String, default: '' },
  }],
  waQrPoolEnabled: { type: Boolean, default: false },
  waQrPoolCursor: { type: Number, default: 0 },
  tgPersonalSlots: [{
    slotId: { type: String, required: true },
    label: { type: String, default: '' },
    status: { type: String, default: 'disconnected' },
    phone: { type: String, default: '' },
    username: { type: String, default: '' },
    session: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
  }],
  tgPersonalPoolEnabled: { type: Boolean, default: false },
  tgPersonalPoolCursor: { type: Number, default: 0 },
  // ===== 外部 API 占位渠道（2026-10-20）：对接任意第三方消息 API =====
  // 每个槽位配置 endpoint + apiKey；会话绑定写在 conversation.waNumberId（'ext:<slotId>'）
  externalApiSlots: [{
    slotId: { type: String, required: true },
    label: { type: String, default: '' },
    endpoint: { type: String, default: '' },    // 外发消息 POST URL
    apiKey: { type: String, default: '' },      // 认证密钥（存储明文，传输时遮蔽）
    authHeader: { type: String, default: 'Authorization' },
    enabled: { type: Boolean, default: true },
  }],
  externalApiPoolEnabled: { type: Boolean, default: false },
  externalApiPoolCursor: { type: Number, default: 0 },
  // Aliyun Chat App Message Service — Meta Premier BSP, official WhatsApp
  // channel reached through Alibaba Cloud instead of a direct Meta token.
  chatApp: {
    enabled: { type: Boolean, default: false },
    isConnected: { type: Boolean, default: false },
    accessKeyId: { type: String, default: '' },
    accessKeySecret: { type: String, default: '' },
    endpoint: { type: String, default: 'cams.ap-southeast-1.aliyuncs.com' },
    custSpaceId: { type: String, default: '' },
    phoneNumber: { type: String, default: '' },
    lastError: { type: String, default: '' },
  },
  emailChannel: {
    enabled: { type: Boolean, default: false },
    imapHost: { type: String, default: '' },
    imapPort: { type: Number, default: 993 },
    smtpHost: { type: String, default: '' },
    smtpPort: { type: Number, default: 587 },
    user: { type: String, default: '' },
    pass: { type: String, default: '' },
    fromName: { type: String, default: '' },
    lastPolledAt: { type: Date },
    // 最近一次同步失败的原因（成功时清空；前端渠道页展示用）
    lastError: { type: String, default: '' },
  },
  metaChat: {
    pageId: { type: String, default: '' },
    pageName: { type: String, default: '' },
    pageAccessToken: { type: String, default: '' },
    igAccountId: { type: String, default: '' },
    fbEnabled: { type: Boolean, default: false },
    igEnabled: { type: Boolean, default: false },
  },
  settings: {
    timezone: { type: String, default: 'Asia/Shanghai' },
    currency: { type: String, default: 'CNY' },
    language: { type: String, default: 'en' },
    autoReply: { type: Boolean, default: false },
    autoReplyMessage: { type: String, default: '' },
    businessHoursEnabled: { type: Boolean, default: false },
    businessHours: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

workspaceSchema.index({ 'whatsapp.phoneNumberId': 1 }, { sparse: true });
workspaceSchema.index({ 'whatsapp.extraNumbers.phoneNumberId': 1 }, { sparse: true });

module.exports = mongoose.model('Workspace', workspaceSchema);
