const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  // General
  appName: { type: String, default: '红浪漫' },
  appEmail: { type: String, default: '' },
  appDescription: { type: String, default: '' },
  appUrl: { type: String, default: '' },
  theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'light' },
  primaryColor: { type: String, default: '#059669' },
  primaryFont: { type: String, default: 'Inter' },
  siteTheme: { type: String, default: 'royal-violet' },
  contactCaptcha: { type: Boolean, default: false },
  sessionTimeout: { type: Number, default: 60 }, // minutes

  // Branding
  logo: { type: String, default: '' },
  logoDark: { type: String, default: '' },
  favicon: { type: String, default: '' },
  loginBg: { type: String, default: '' },
  tagline: { type: String, default: '' },

  // WhatsApp
  whatsapp: {
    apiUrl: { type: String, default: 'https://graph.facebook.com/v21.0' },
    apiVersion: { type: String, default: 'v21.0' },
    appId: { type: String, default: '' },
    appSecret: { type: String, default: '' },
    verifyToken: { type: String, default: '' },
    configId: { type: String, default: '' },
    businessId: { type: String, default: '' },
    webhookUrl: { type: String, default: '' },
    webhookVerifyToken: { type: String, default: '' },
    enableEmbeddedSignup: { type: Boolean, default: false },
    enableManualSignup: { type: Boolean, default: true },
    enableCoexistence: { type: Boolean, default: false },
  },

  // Baileys 转换 API（六段凭证 → Baileys session 工厂，见 services/waFactoryService.js，
  // 实际服务在 yuncang-proxy 的 /api/wa/*）。平台级配置，商户不可见、不可改。
  waFactory: {
    enabled: { type: Boolean, default: false },          // 是否开放六段凭证登录
    baseUrl: { type: String, default: '' },              // 工厂服务地址，空=用 YUNCANG_URL（默认 127.0.0.1:5090）
    defaultPlatform: { type: String, default: '0' },     // 0 Android / 1 iOS / 10 SMB安卓 / 12 SMB iOS
    allowProxy: { type: Boolean, default: true },        // 是否允许随号附带代理
    timeoutMs: { type: Number, default: 35000 },         // 单次登录超时(ms)
  },

  // 省钱专家：号码状态检测外部 API（见 services/saverCheckService.js）
  saverApi: {
    baseUrl: { type: String, default: '' },
    apiKey: { type: String, default: '' },
    // 商家计量收费：按提交号码数扣积分；关闭时免费
    billingEnabled: { type: Boolean, default: false },
    priceDefault: { type: Number, default: 0.01 }, // 积分/条
    priceOverrides: { type: Map, of: Number, default: {} }, // taskType → 单价
    // 充值中心：USDT(TRC20) 直收
    usdt: {
      enabled: { type: Boolean, default: false },
      address: { type: String, default: '' },   // TRC20 收款地址
      rate: { type: Number, default: 7 },       // 1 USDT = 多少元(RMB)
      tronApiKey: { type: String, default: '' },// TronGrid API Key（可选，提高限额）
    },
  },

  // Floating WhatsApp chat widget (public landing page)
  whatsappWidget: {
    enabled: { type: Boolean, default: false },
    phone: { type: String, default: '' },
    message: { type: String, default: 'Hi! I have a question.' },
    greeting: { type: String, default: 'Need help? Chat with us' },
  },

  // Facebook
  facebook: {
    appId: { type: String, default: '' },
    appSecret: { type: String, default: '' },
    leadWebhookUrl: { type: String, default: '' },
    configId: { type: String, default: '' },
    enableOneClick: { type: Boolean, default: false },
  },

  // Instagram Auto DM add-on (one-click connect uses the Facebook app above).
  instagram: {
    configId: { type: String, default: '' },
    enableOneClick: { type: Boolean, default: false },
    enableManual: { type: Boolean, default: true },
  },
  // Per-panel add-on licenses (controlled by the store). Missing/false = not licensed.
  addons: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Email SMTP
  smtp: {
    host: { type: String, default: '' },
    port: { type: Number, default: 587 },
    user: { type: String, default: '' },
    pass: { type: String, default: '' },
    from: { type: String, default: '' },
    fromName: { type: String, default: '' },
    encryption: { type: String, enum: ['tls', 'ssl', 'none'], default: 'tls' },
  },

  // Email Templates
  emailTemplates: {
    welcome: { enabled: { type: Boolean, default: true }, subject: { type: String, default: 'Welcome to {{appName}}!' }, body: { type: String, default: '<h2>Welcome, {{userName}}!</h2><p>Your account has been created successfully on <strong>{{appName}}</strong>.</p><p>You can now login and start using our WhatsApp Business API platform.</p><p>Login: <a href="{{appUrl}}">{{appUrl}}</a></p>' } },
    emailVerification: { enabled: { type: Boolean, default: true }, subject: { type: String, default: 'Verify Your Email - {{appName}}' }, body: { type: String, default: '<h2>Email Verification</h2><p>Hi {{userName}},</p><p>Please verify your email address by clicking the link below:</p><p><a href="{{verifyLink}}" style="background:#10B981;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Verify Email</a></p>' } },
    accountDeactivation: { enabled: { type: Boolean, default: true }, subject: { type: String, default: 'Account Deactivated - {{appName}}' }, body: { type: String, default: '<h2>Account Deactivated</h2><p>Hi {{userName}},</p><p>Your account on <strong>{{appName}}</strong> has been deactivated.</p><p>If you think this was a mistake, please contact our support team.</p>' } },
    loginAlert: { enabled: { type: Boolean, default: false }, subject: { type: String, default: 'New Login Detected - {{appName}}' }, body: { type: String, default: '<h2>New Login Detected</h2><p>Hi {{userName}},</p><p>A new login was detected on your account.</p><p>IP: {{ipAddress}}<br/>Time: {{loginTime}}<br/>Device: {{deviceInfo}}</p><p>If this was not you, please change your password immediately.</p>' } },
    contactForm: { enabled: { type: Boolean, default: true }, subject: { type: String, default: 'New Contact Form Submission - {{appName}}' }, body: { type: String, default: '<h2>New Contact Form Submission</h2><p>Name: {{contactName}}<br/>Email: {{contactEmail}}<br/>Phone: {{contactPhone}}<br/>Message: {{contactMessage}}</p>' } },
  },

  // Google
  google: {
    clientId: { type: String, default: '' },
    clientSecret: { type: String, default: '' },
    apiKey: { type: String, default: '' },
  },

  // AWS S3
  aws: {
    accessKeyId: { type: String, default: '' },
    secretAccessKey: { type: String, default: '' },
    region: { type: String, default: 'ap-south-1' },
    bucket: { type: String, default: '' },
  },

  // Limits
  limits: {
    maxFileSize: { type: Number, default: 16 }, // MB
    maxGroupMembers: { type: Number, default: 256 },
  },

  // Maintenance
  maintenance: {
    isEnabled: { type: Boolean, default: false },
    message: { type: String, default: 'We are currently under maintenance. Please check back later.' },
  },

  // AI Configuration
  ai: {
    providers: [{
      name: { type: String }, // openai, deepseek, xai, gemini
      displayName: { type: String },
      model: { type: String },
      apiKey: { type: String, default: '' },
      baseUrl: { type: String, default: '' },
      isActive: { type: Boolean, default: false },
    }],
    defaultProvider: { type: String, default: 'openai' },
  },

  // Languages
  languages: [{
    code: { type: String },
    name: { type: String },
    nativeName: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  }],

  // Currency
  currencies: [{
    code: { type: String },
    name: { type: String },
    symbol: { type: String },
    rate: { type: Number, default: 0 }, // units of this currency per 1 base (INR); used for exchange-rate pricing
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  }],

  // KKHS License Control
  kkhsLicenseKey: { type: String, default: "" },
  kkhsDomain: { type: String, default: "" },
  kkhsIsActive: { type: Boolean, default: false },
  kkhsKillSwitch: { type: Boolean, default: false },
  kkhsLicenseData: { type: Object, default: {} },
  kkhsFeatureLocks: { type: Object, default: {} },
  kkhsAddonLocks: { type: Object, default: {} },
  migrations: { type: Object, default: {} },
  kkhsRemoteConfig: { type: Object, default: {} },
  kkhsNotifications: { type: Array, default: [] },
  kkhsAddons: { type: Array, default: [] },
  kkhsLastHeartbeat: { type: Date, default: null },
  kkhsActivatedAt: { type: Date, default: null },
  kkhsDeactivatedAt: { type: Date, default: null },
  kkhsLastPatchVersion: { type: String, default: "" },
  kkhsLastPatchAt: { type: Date, default: null },

  // Quick Replies
  quickReplies: [{
    title: { type: String },
    message: { type: String },
    shortcut: { type: String },
  }],

  // Automatic data cleanup (daily cron); each category deletes records older than `days`
  dataCleanup: {
    enabled: { type: Boolean, default: false },
    runHour: { type: Number, default: 3 },
    categories: {
      messages: { enabled: { type: Boolean, default: false }, days: { type: Number, default: 180 } },
      callSessions: { enabled: { type: Boolean, default: false }, days: { type: Number, default: 90 } },
      auditLogs: { enabled: { type: Boolean, default: false }, days: { type: Number, default: 90 } },
      scheduledCalls: { enabled: { type: Boolean, default: false }, days: { type: Number, default: 30 } },
      facebookLeads: { enabled: { type: Boolean, default: false }, days: { type: Number, default: 365 } },
      media: { enabled: { type: Boolean, default: false }, days: { type: Number, default: 180 } },
    },
    lastRun: { type: Date },
    lastRunSummary: { type: String, default: '' },
  },
}, { timestamps: true });

systemSettingsSchema.set('toJSON', { schemaFieldsOnly: true });
systemSettingsSchema.set('toObject', { schemaFieldsOnly: true });

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
