// 机器人流程模板市场（本地内置，不依赖供应商云端）。
// 每个条目 = 市场卡片元数据 + 完整流程定义（def），安装即按 def 建流程。
const { PRESETS } = require('./presetFlows');

const at = (col, row) => ({ x: 40 + col * 260, y: 60 + row * 170 });

// 欢迎 + 按钮菜单
const welcomeMenu = {
  name: '欢迎菜单机器人',
  triggerKeywords: ['hi', 'hello', '你好', 'menu'],
  matchType: 'contains',
  startNode: 'w1',
  nodes: [
    { id: 'w1', name: '欢迎', type: 'interactive', mode: 'buttons', text: '您好 {first_name}！👋 我是自动助手，请选择您需要的服务：', buttons: [
      { title: '咨询产品', next: 'w2' },
      { title: '查询订单', next: 'w3' },
      { title: '人工客服', next: 'w4' },
    ], ...at(0, 0) },
    { id: 'w2', name: '产品咨询', type: 'text', text: '请直接发送您感兴趣的产品名称，稍后客服会给您详细介绍 😊', next: 'w5', ...at(1, 0) },
    { id: 'w3', name: '订单查询', type: 'question', text: '请发送您的订单号，我帮您查询～', answerVar: 'order_no', next: 'w5', ...at(1, 1) },
    { id: 'w4', name: '转人工', type: 'text', text: '好的，已为您转接人工客服，请稍候 🙋', next: 'w5', ...at(1, 2) },
    { id: 'w5', name: '打标签', type: 'action', actionType: 'add_tag', actionTag: '菜单进线', next: '', ...at(2, 1) },
  ],
};

// 非工作时间自动回复
const afterHours = {
  name: '非工作时间自动回复',
  triggerKeywords: [],
  matchType: 'contains',
  eventTrigger: '',
  startNode: 'a1',
  nodes: [
    { id: 'a1', name: '留言提示', type: 'text', text: '您好！现在是非工作时间（工作时间 9:00-18:00）。您的消息我们已收到，上班后会第一时间回复您 🌙', next: 'a2', ...at(0, 0) },
    { id: 'a2', name: '收集需求', type: 'question', text: '为了更快帮到您，可以先简单描述一下您的需求～', answerVar: 'note', waitTimeoutHours: 12, next: 'a3', nextTimeout: '', ...at(1, 0) },
    { id: 'a3', name: '打标签', type: 'action', actionType: 'add_tag', actionTag: '夜间留言', next: '', ...at(2, 0) },
  ],
};

// 满意度回访
const feedback = {
  name: '满意度回访',
  triggerKeywords: ['评价', 'feedback'],
  matchType: 'contains',
  startNode: 'f1',
  nodes: [
    { id: 'f1', name: '邀请评价', type: 'interactive', mode: 'buttons', text: '感谢您的咨询！本次服务您还满意吗？', buttons: [
      { title: '😍 非常满意', next: 'f2' },
      { title: '🙂 一般', next: 'f3' },
      { title: '😞 不满意', next: 'f4' },
    ], ...at(0, 0) },
    { id: 'f2', name: '好评', type: 'action', actionType: 'add_tag', actionTag: '好评', next: 'f5', ...at(1, 0) },
    { id: 'f3', name: '中评', type: 'action', actionType: 'add_tag', actionTag: '中评', next: 'f5', ...at(1, 1) },
    { id: 'f4', name: '差评收集', type: 'question', text: '抱歉没让您满意 🙏 能告诉我们哪里做得不好吗？我们一定改进。', answerVar: 'complaint', next: 'f6', ...at(1, 2) },
    { id: 'f5', name: '感谢', type: 'text', text: '收到，感谢您的反馈！祝您生活愉快 🌟', next: '', ...at(2, 0) },
    { id: 'f6', name: '差评标签', type: 'action', actionType: 'add_tag', actionTag: '差评跟进', next: 'f5', ...at(2, 2) },
  ],
};

// 售前咨询按钮引导
const presaleGuide = {
  name: '售前咨询引导',
  triggerKeywords: ['咨询', '价格', 'price'],
  matchType: 'contains',
  startNode: 'p1',
  nodes: [
    { id: 'p1', name: '咨询分流', type: 'interactive', mode: 'buttons', text: '您好 {first_name}！想了解哪方面呢？👇', buttons: [
      { title: '产品与价格', next: 'p2' },
      { title: '优惠活动', next: 'p3' },
      { title: '人工客服', next: 'p4' },
    ], ...at(0, 0) },
    { id: 'p2', name: '问产品', type: 'question', text: '请告诉我您想了解的产品名称或型号，我马上为您介绍～', answerVar: 'product', next: 'p5', ...at(1, 0) },
    { id: 'p3', name: '优惠说明', type: 'text', text: '🎁 本期优惠已为您登记，客服稍后会把最新活动清单发给您！', next: 'p6', ...at(1, 1) },
    { id: 'p4', name: '转人工提示', type: 'text', text: '好的，已为您转接人工客服，请稍候 🙋', next: 'p7', ...at(1, 2) },
    { id: 'p5', name: '标签-产品', type: 'action', actionType: 'add_tag', actionTag: '售前-产品', next: 'p8', ...at(2, 0) },
    { id: 'p6', name: '标签-优惠', type: 'action', actionType: 'add_tag', actionTag: '售前-优惠', next: '', ...at(2, 1) },
    { id: 'p7', name: '标签-人工', type: 'action', actionType: 'add_tag', actionTag: '转人工', next: '', ...at(2, 2) },
    { id: 'p8', name: '收尾', type: 'text', text: '收到！客服会结合您的需求给出报价和建议，请稍等片刻 😊', next: '', ...at(3, 0) },
  ],
};

// 售后服务按钮引导
const aftersaleGuide = {
  name: '售后服务引导',
  triggerKeywords: ['售后', '退换', '物流'],
  matchType: 'contains',
  startNode: 'a1',
  nodes: [
    { id: 'a1', name: '售后分流', type: 'interactive', mode: 'buttons', text: '您好，请选择售后类型，我来帮您快速处理 🛠', buttons: [
      { title: '物流查询', next: 'a2' },
      { title: '退换货', next: 'a3' },
      { title: '产品问题', next: 'a4' },
    ], ...at(0, 0) },
    { id: 'a2', name: '要订单号', type: 'question', text: '请发送您的订单号，我帮您查物流～', answerVar: 'order_no', next: 'a5', ...at(1, 0) },
    { id: 'a3', name: '退换原因', type: 'question', text: '请说明退换原因，并附上订单号 📦', answerVar: 'return_reason', next: 'a6', ...at(1, 1) },
    { id: 'a4', name: '问题描述', type: 'question', text: '请描述遇到的问题（可直接发图片/视频）📷', answerVar: 'issue', next: 'a7', ...at(1, 2) },
    { id: 'a5', name: '标签-物流', type: 'action', actionType: 'add_tag', actionTag: '售后-物流', next: 'a8', ...at(2, 0) },
    { id: 'a6', name: '标签-退换', type: 'action', actionType: 'add_tag', actionTag: '售后-退换', next: 'a8', ...at(2, 1) },
    { id: 'a7', name: '标签-故障', type: 'action', actionType: 'add_tag', actionTag: '售后-故障', next: 'a8', ...at(2, 2) },
    { id: 'a8', name: '收尾', type: 'text', text: '已为您登记，客服会尽快跟进处理，请留意消息 🙏', next: '', ...at(3, 1) },
  ],
};

// 服务预约引导（列表式交互）
const bookingGuide = {
  name: '服务预约引导',
  triggerKeywords: ['预约', 'book'],
  matchType: 'contains',
  startNode: 'k1',
  nodes: [
    { id: 'k1', name: '选择服务', type: 'interactive', mode: 'list', text: '欢迎预约！请从下方列表选择服务类型 📅', listButtonText: '选择服务', rows: [
      { title: '到店体验', description: '到门店现场体验/洽谈', next: 'k2' },
      { title: '上门服务', description: '工作人员上门服务', next: 'k3' },
      { title: '电话回访', description: '预约专属顾问电话沟通', next: 'k4' },
    ], ...at(0, 0) },
    { id: 'k2', name: '标签-到店', type: 'action', actionType: 'add_tag', actionTag: '预约-到店', next: 'k5', ...at(1, 0) },
    { id: 'k3', name: '标签-上门', type: 'action', actionType: 'add_tag', actionTag: '预约-上门', next: 'k5', ...at(1, 1) },
    { id: 'k4', name: '标签-回访', type: 'action', actionType: 'add_tag', actionTag: '预约-回访', next: 'k5', ...at(1, 2) },
    { id: 'k5', name: '问时间', type: 'question', text: '请告诉我您方便的日期和时间段（如：周六下午）🕐', answerVar: 'booking_time', next: 'k6', ...at(2, 1) },
    { id: 'k6', name: '确认', type: 'text', text: '收到！已为您登记预约意向，客服确认档期后会回复您确认 ✅', next: '', ...at(3, 1) },
  ],
};

// 图文引导漏斗：三层图文按钮卡片层层推进，走到底=高意向（安装后把占位图换成自己的产品图）
const imageFunnel = {
  name: '图文引导漏斗',
  triggerKeywords: ['了解', 'info'],
  matchType: 'contains',
  startNode: 'g1',
  nodes: [
    { id: 'g1', name: '第1层·种草', type: 'interactive', mode: 'buttons',
      headerType: 'image', headerMediaUrl: 'https://picsum.photos/seed/step1/800/418',
      text: '👋 {first_name}，一张图看懂我们能帮你什么——想继续了解吗？',
      buttons: [{ title: '继续了解 👉', next: 'g2' }, { title: '直接咨询', next: 'gh' }], ...at(0, 0) },
    { id: 'g2', name: '第2层·卖点', type: 'interactive', mode: 'buttons',
      headerType: 'image', headerMediaUrl: 'https://picsum.photos/seed/step2/800/418',
      text: '✨ 这是客户最喜欢我们的三个理由（见图）。想看价格和本期优惠吗？',
      buttons: [{ title: '看价格优惠 👉', next: 'g3' }, { title: '直接咨询', next: 'gh' }], ...at(1, 0) },
    { id: 'g3', name: '第3层·成交', type: 'interactive', mode: 'buttons',
      headerType: 'image', headerMediaUrl: 'https://picsum.photos/seed/step3/800/418',
      text: '🎁 本期专属优惠见图，名额有限。现在锁定？',
      buttons: [{ title: '立即预订 ✅', next: 'g4' }, { title: '咨询客服', next: 'gh' }], ...at(2, 0) },
    { id: 'g4', name: '高意向标签', type: 'action', actionType: 'add_tag', actionTag: '漏斗-高意向', next: 'g5', ...at(3, 0) },
    { id: 'g5', name: '收集信息', type: 'question', text: '太好了！请留下您的称呼和方便联系的时间，客服马上为您锁定名额 📝', answerVar: 'booking_info', next: 'g6', ...at(4, 0) },
    { id: 'g6', name: '确认', type: 'text', text: '已登记！客服会第一时间与您确认，感谢信任 🌟', next: '', ...at(5, 0) },
    { id: 'gh', name: '转人工', type: 'action', actionType: 'add_tag', actionTag: '转人工', next: 'gi', ...at(3, 1) },
    { id: 'gi', name: '人工提示', type: 'text', text: '好的，已为您转接人工客服，请稍候 🙋', next: '', ...at(4, 1) },
  ],
};

// 活动引流：网址按钮（CTA）直接把客户带到商城/落地页
const ctaPromo = {
  name: '活动引流（网址按钮）',
  triggerKeywords: ['活动', '优惠', 'promo'],
  matchType: 'contains',
  startNode: 'c1',
  nodes: [
    { id: 'c1', name: '活动推送', type: 'interactive', mode: 'cta',
      text: '🔥 {first_name}，本周特惠进行中！点击下方按钮直达（活动链接安装后替换成自己的）：',
      ctas: [
        { text: '进入商城', url: 'https://example.com/shop' },
        { text: '领取优惠券', url: 'https://example.com/coupon' },
      ], next: 'c2', ...at(0, 0) },
    { id: 'c2', name: '打标签', type: 'action', actionType: 'add_tag', actionTag: '活动引流', next: 'c3', ...at(1, 0) },
    { id: 'c3', name: '收尾', type: 'text', text: '有任何问题直接回复我，客服马上为您服务 😊', next: '', ...at(2, 0) },
  ],
};

// 市场目录：id → { 卡片元数据..., def }
const CATALOG = [
  { id: 'image_funnel', category: 'sales', categoryLabel: '销售跟进', description: '图文引导漏斗：三层图片+按钮卡片层层推进（种草→卖点→优惠成交），走到底自动打高意向标签并收集联系信息。安装后替换占位图为产品图。', difficulty: '简单', setupMinutes: 5, featured: true, isNew: true, def: imageFunnel },
  { id: 'lead_nurturing', category: 'sales', categoryLabel: '销售跟进', description: '新线索自动欢迎并在 1/2/3 天无回复时自动跟进，回复即打"Engaged"标签转人工。', difficulty: '中等', setupMinutes: 5, featured: true, isNew: false, def: PRESETS.lead_nurturing },
  { id: 'dnp_recovery', category: 'sales', categoryLabel: '销售跟进', description: '客户未接通/未回应后的自动挽回序列。', difficulty: '中等', setupMinutes: 5, featured: false, isNew: false, def: PRESETS.dnp_recovery },
  { id: 'welcome_menu', category: 'service', categoryLabel: '客服接待', description: '进线先出按钮菜单（咨询/查单/人工），自动分流并打标签。', difficulty: '简单', setupMinutes: 3, featured: true, isNew: true, def: welcomeMenu },
  { id: 'after_hours', category: 'service', categoryLabel: '客服接待', description: '非工作时间自动留言应答并收集需求，次日人工跟进。', difficulty: '简单', setupMinutes: 2, featured: false, isNew: true, def: afterHours },
  { id: 'presale_guide', category: 'service', categoryLabel: '客服接待', description: '售前按钮引导：产品/优惠/人工三路分流，自动收集需求并打标签。', difficulty: '简单', setupMinutes: 3, featured: true, isNew: true, def: presaleGuide },
  { id: 'aftersale_guide', category: 'service', categoryLabel: '客服接待', description: '售后按钮引导：物流/退换/故障分流，自动收集订单号和问题描述。', difficulty: '简单', setupMinutes: 3, featured: false, isNew: true, def: aftersaleGuide },
  { id: 'booking_guide', category: 'service', categoryLabel: '客服接待', description: '列表式预约引导：选服务类型→收集时间→打预约标签，客服只管确认档期。', difficulty: '简单', setupMinutes: 3, featured: false, isNew: true, def: bookingGuide },
  { id: 'cta_promo', category: 'sales', categoryLabel: '销售跟进', description: '网址按钮引流：一条消息带两个可点击链接按钮（商城/优惠券），点击即跳转，自动打引流标签。安装后替换成自己的链接。', difficulty: '简单', setupMinutes: 2, featured: false, isNew: true, def: ctaPromo },
  { id: 'feedback', category: 'retention', categoryLabel: '复购留存', description: '服务结束后一键满意度回访，好中差自动打标签，差评自动收集原因。', difficulty: '简单', setupMinutes: 2, featured: false, isNew: true, def: feedback },
];

const toCard = (t) => ({
  id: t.id,
  name: t.def.name,
  category: t.category,
  categoryLabel: t.categoryLabel,
  description: t.description,
  difficulty: t.difficulty,
  setupMinutes: t.setupMinutes,
  featured: t.featured,
  isNew: t.isNew,
  free: true,
  version: '1.0',
  author: '内置模板',
  trigger: (t.def.eventTrigger ? '事件触发' : (t.def.triggerKeywords || []).join(' / ')) || '手动启用',
  steps: (t.def.nodes || []).length,
});

const getCatalog = () => ({
  templates: CATALOG.map(toCard),
  categories: [
    { key: 'all', label: '全部', count: CATALOG.length },
    ...Object.entries(CATALOG.reduce((m, t) => { m[t.category] = m[t.category] || { label: t.categoryLabel, n: 0 }; m[t.category].n++; return m; }, {}))
      .map(([key, v]) => ({ key, label: v.label, count: v.n })),
  ],
});

const getTemplate = (id) => {
  const t = CATALOG.find(x => x.id === id);
  if (!t) return null;
  return {
    ...toCard(t),
    triggerKeywords: t.def.triggerKeywords || [],
    preview: (t.def.nodes || []).map(n => ({
      name: n.name || n.id,
      type: n.type,
      text: n.text || n.caption || '',
      actionTag: n.actionTag || '',
      actionType: n.actionType || '',
      mode: n.mode || '',
      headerType: n.headerType || '',
      headerMediaUrl: n.headerMediaUrl || '',
      mediaType: n.mediaType || '',
      mediaUrl: n.mediaUrl || '',
      listButtonText: n.listButtonText || '',
      buttons: (n.buttons || []).map(b => ({ title: b.title })),
      rows: (n.rows || []).map(r => ({ title: r.title, description: r.description || '' })),
      ctas: (n.ctas || []).map(c => ({ text: c.text, url: c.url })),
      delaySeconds: n.delaySeconds || 0,
      delayUnit: n.delayUnit || '',
    })),
    def: t.def,
  };
};

module.exports = { getCatalog, getTemplate };
