// 省钱专家：th333 平台任务类型目录（https://api.th333.cc/apidoc.html）
// channel: 面板里挂在哪个页面；input: 上传内容类型；country: 是否必须传地区编码（仅邮箱类豁免）；
// active: 筛活跃类（无效=久未上线，其余类型无效=未开通/无效）
const T = (channel, input = 'phone', country = true, active = false) => ({ channel, input, country, active });

const TASK_TYPES = {
  // WhatsApp
  wsValid: T('whatsapp'),
  wsActive: T('whatsapp', 'phone', true, true),
  wsGender: T('whatsapp'),
  // Telegram
  tgValid: T('telegram'),
  tgActive: T('telegram', 'phone', true, true),
  tgGender: T('telegram'),
  tgNameValid: T('telegram', 'username'),
  // 社交媒体
  fbValid: T('more'), fbGender: T('more'), fbUid: T('more'),
  insValid: T('more'), linkedinValid: T('more'), linkedinGender: T('more'),
  tiktokUser: T('more', 'username'), twitterValid: T('more'), snapchatValid: T('more'),
  // 通讯工具
  lineValid: T('more'), lineGender: T('more'), signalValid: T('more'),
  viberValid: T('more'), viberGender: T('more'), viberActive: T('more', 'phone', true, true),
  botimValid: T('more'), botimGender: T('more'),
  zaloValid: T('more'), zaloGender: T('more'), zaloGenderQuick: T('more'), zaloActive: T('more', 'phone', true, true),
  wxValid: T('more'), wxAll: T('more'), rcsSystem: T('more'),
  // 号码检测
  phoneCheck: T('more'), operatorStandard: T('more'), numberStatus: T('more'),
  phoneActive: T('more', 'phone', true, true), phoneUsCarrier: T('more'),
  phoneRoaming: T('more'), phoneDnd: T('more'),
  iosBlueValid: T('more'), iosValid: T('more'), iosAll: T('more'),
  // 邮箱检测（无需国家）
  fbEmail: T('more', 'email', false), insEmail: T('more', 'email', false),
  amazonEmail: T('more', 'email', false), twitterEmail: T('more', 'email', false),
  // 其他服务
  amazonValid: T('more'), teamsValid: T('more'), sidelineValid: T('more'), dhlValid: T('more'),
  // 交易所
  binanceValid: T('more'), okxValid: T('more'), htxValid: T('more'),
  kucoinValid: T('more'), coinwValid: T('more'), mexcValid: T('more'),
};

// 按内容类型规范化一条输入，无效返回 null
const normalizeValue = {
  phone: (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 6 && d.length <= 17 ? d : null; },
  email: (v) => { const s = String(v || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null; },
  username: (v) => { const s = String(v || '').trim().replace(/^@/, ''); return s && s.length <= 64 && !/[\s,;]/.test(s) ? s : null; },
};

module.exports = { TASK_TYPES, normalizeValue };
