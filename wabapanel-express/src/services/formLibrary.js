// 表单模板库：内置中文表单模板目录（本地定制，前端 FormLibrary.tsx 使用）
// 字段 type 必须是 Form 模型枚举值之一：
// text / number / email / phone / select / multi_select / date / textarea / file / checkbox / radio

const TEMPLATES = [
  {
    id: 'inquiry-register',
    name: '询价登记',
    category: '销售获客',
    description: '收集潜在客户的联系方式与感兴趣的产品，方便销售及时跟进报价。',
    tags: ['询价', '报价', '获客'],
    keyword: '询价 报价 产品 咨询 线索',
    fields: [
      { id: 'name', type: 'text', label: '姓名', placeholder: '请输入您的姓名', required: true, options: [], order: 0 },
      { id: 'phone', type: 'phone', label: '联系电话', placeholder: '请输入手机号码', required: true, options: [], order: 1 },
      { id: 'product', type: 'text', label: '感兴趣的产品', placeholder: '请填写您想了解的产品或服务', required: true, options: [], order: 2 },
      { id: 'message', type: 'textarea', label: '留言', placeholder: '补充说明您的需求（可选）', required: false, options: [], order: 3 },
    ],
  },
  {
    id: 'event-signup',
    name: '活动报名',
    category: '活动营销',
    description: '活动、讲座、促销报名登记，统计参与人数与备注需求。',
    tags: ['活动', '报名', '预约'],
    keyword: '活动 报名 预约 人数 讲座',
    fields: [
      { id: 'name', type: 'text', label: '姓名', placeholder: '请输入您的姓名', required: true, options: [], order: 0 },
      { id: 'phone', type: 'phone', label: '联系电话', placeholder: '请输入手机号码', required: true, options: [], order: 1 },
      { id: 'headcount', type: 'number', label: '参加人数', placeholder: '请填写参加人数', required: true, options: [], order: 2 },
      { id: 'remark', type: 'textarea', label: '备注', placeholder: '特殊需求或备注（可选）', required: false, options: [], order: 3 },
    ],
  },
  {
    id: 'aftersale-register',
    name: '售后登记',
    category: '客户服务',
    description: '售后问题登记：记录订单号、问题描述并支持上传凭证图片。',
    tags: ['售后', '工单', '投诉'],
    keyword: '售后 退换 维修 订单 问题 工单',
    fields: [
      { id: 'name', type: 'text', label: '姓名', placeholder: '请输入您的姓名', required: true, options: [], order: 0 },
      { id: 'phone', type: 'phone', label: '联系电话', placeholder: '请输入手机号码', required: true, options: [], order: 1 },
      { id: 'order_no', type: 'text', label: '订单号', placeholder: '请输入订单编号', required: true, options: [], order: 2 },
      { id: 'issue', type: 'textarea', label: '问题描述', placeholder: '请详细描述遇到的问题', required: true, options: [], order: 3 },
      { id: 'photo', type: 'file', label: '问题图片', placeholder: '上传问题照片或凭证（可选）', required: false, options: [], order: 4 },
    ],
  },
  {
    id: 'customer-profile',
    name: '客户资料补全',
    category: '客户管理',
    description: '补全客户档案信息（邮箱、城市、生日），便于精准营销与生日关怀。',
    tags: ['客户资料', '档案', 'CRM'],
    keyword: '资料 档案 邮箱 城市 生日 会员',
    fields: [
      { id: 'name', type: 'text', label: '姓名', placeholder: '请输入您的姓名', required: true, options: [], order: 0 },
      { id: 'email', type: 'email', label: '邮箱', placeholder: '请输入电子邮箱', required: true, options: [], order: 1 },
      { id: 'city', type: 'text', label: '所在城市', placeholder: '请输入您所在的城市', required: false, options: [], order: 2 },
      { id: 'birthday', type: 'date', label: '生日', placeholder: '请选择您的生日', required: false, options: [], order: 3 },
    ],
  },
];

// 返回模板目录（前端列表渲染用，不含内部字段）
function listTemplates() {
  return TEMPLATES.map(t => ({
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description,
    tags: t.tags,
    keyword: t.keyword,
    fields: t.fields,
  }));
}

// 分类列表（按模板出现顺序去重）
function listCategories() {
  return [...new Set(TEMPLATES.map(t => t.category))];
}

// 按 id 查找单个模板
function getTemplate(templateId) {
  return TEMPLATES.find(t => t.id === templateId) || null;
}

module.exports = { listTemplates, listCategories, getTemplate };
