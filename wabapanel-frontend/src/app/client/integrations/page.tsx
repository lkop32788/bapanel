'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { RefreshCw, Link2, Unlink, ArrowUpDown, Zap, Copy, Send, CheckCircle2, Clock, XCircle, Search, Pencil, Trash2, Plus, Download, BookOpen } from 'lucide-react';
import { integrationApi } from '@/lib/api';
import { INTEGRATION_GUIDES } from '@/lib/integrationGuides';
import toast from 'react-hot-toast';

interface IntegrationDef {
  id: string; name: string; description: string; icon: string; category: string; color: string;
  fields: { key: string; label: string; type: string; placeholder: string; options?: { value: string; label: string }[] }[];
}

const integrationDefs: IntegrationDef[] = [
  { id: 'google-workspace', name: 'Google Workspace', description: "Bot Flow Builder 内的 Google Meet、文档和表单卡", icon: 'GW', category: 'productivity', color: '#1A73E8',
    fields: [{ key: 'apiKey', label: "服务账户 JSON 密钥", type: 'textarea', placeholder: "粘贴服务账户 JSON..." },
      { key: 'subjectEmail', label: "充当的工作区用户（域范围委派）", type: 'text', placeholder: "you@yourdomain.com — Google Meet 链接需要" },
      { key: 'calendarId', label: "会议的日历 ID（可选）", type: 'text', placeholder: "初级" },
      { key: 'driveFolderId', label: "生成的文档的驱动器文件夹 ID（可选）", type: 'text', placeholder: "云端硬盘 URL 中的文件夹 ID" },
      { key: 'timezone', label: "默认会议时区（可选）", type: 'text', placeholder: "亚洲/加尔各答" }] },
  { id: 'google-sheets', name: 'Google Sheets', description: "将联系人和数据与 Google 表格同步", icon: 'GS', category: 'productivity', color: '#0F9D58',
    fields: [{ key: 'apiKey', label: "服务账户 JSON 密钥", type: 'textarea', placeholder: "粘贴服务账户 JSON..." }, { key: 'sheetId', label: "工作表ID", type: 'text', placeholder: "来自 URL 的 Google 表格 ID" },
      { key: 'sheetTab', label: "选项卡/工作表名称", type: 'text', placeholder: "表 1" },] },
  { id: 'shopify', name: 'Shopify', description: "从 Shopify 导入联系人", icon: 'S', category: 'ecommerce', color: '#7AB55C',
    fields: [{ key: 'storeUrl', label: "商店网址", type: 'text', placeholder: 'mystore.myshopify.com' },
      { key: 'apiKey', label: "管理 API 访问令牌", type: 'password', placeholder: "shpat_... — 仅用于客户同步" },
      { key: 'apiSecret', label: "自定义应用程序API密钥", type: 'password', placeholder: "shpss_... — 用于验证应用凭证" }] },
  { id: 'woocommerce', name: 'WooCommerce', description: "从 WooCommerce 导入联系人", icon: 'WC', category: 'ecommerce', color: '#96588A',
    fields: [{ key: 'storeUrl', label: "商店网址", type: 'text', placeholder: 'https://yourstore.com' }, { key: 'apiKey', label: "消费者钥匙", type: 'password', placeholder: 'ck_...' }, { key: 'apiSecret', label: "消费者的秘密", type: 'password', placeholder: 'cs_...' }] },
  { id: 'hubspot', name: 'HubSpot', description: "与 HubSpot CRM 同步联系人", icon: 'HS', category: 'crm', color: '#FF7A59',
    fields: [{ key: 'apiKey', label: "私人应用程序令牌", type: 'password', placeholder: 'pat-...' }] },
  { id: 'mailchimp', name: 'Mailchimp', description: "同步电子邮件营销联系人", icon: 'MC', category: 'marketing', color: '#FFE01B',
    fields: [{ key: 'apiKey', label: "API 密钥", type: 'password', placeholder: 'xxxxxxxx-us21' }] },
  { id: 'google-analytics', name: 'Google Analytics', description: "跟踪活动效果", icon: 'GA', category: 'analytics', color: '#E37400',
    fields: [{ key: 'measurementId', label: "测量ID", type: 'text', placeholder: 'G-XXXXXXXXXX' }] },
  { id: 'webhook', name: 'Custom Webhook', description: "通过 webhooks 将数据发送到任何 URL", icon: 'WH', category: 'developer', color: '#6366F1',
    fields: [{ key: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: 'https://your-server.com/webhook' }] },
  { id: 'zapier', name: 'Zapier', description: "通过 Zapier 与 5000 多个应用程序连接", icon: 'Z', category: 'automation', color: '#FF4A00',
    fields: [{ key: 'webhookUrl', label: 'Zapier Webhook URL', type: 'text', placeholder: 'https://hooks.zapier.com/...' }] },
  { id: 'make', name: 'Make (Integromat)', description: "使用 Make 自动化工作流程", icon: 'MK', category: 'automation', color: '#6D00CC',
    fields: [{ key: 'webhookUrl', label: "创建 Webhook URL", type: 'text', placeholder: 'https://hook.make.com/...' }] },
  { id: 'pabbly', name: 'Pabbly Connect', description: "使用 Pabbly Connect 自动化工作流程", icon: 'PC', category: 'automation', color: '#16A34A',
    fields: [{ key: 'webhookUrl', label: 'Pabbly Webhook URL', type: 'text', placeholder: 'https://connect.pabbly.com/workflow/sendwebhookdata/...' }] },
  { id: 'n8n', name: 'n8n', description: "使用自托管 n8n 实现工作流程自动化", icon: 'N8', category: 'automation', color: '#EA4B71',
    fields: [{ key: 'webhookUrl', label: 'n8n Webhook URL', type: 'text', placeholder: 'https://your-n8n.com/webhook/...' }] },
  { id: 'ifttt', name: 'IFTTT', description: "从面板事件触发 IFTTT 小程序", icon: 'IF', category: 'automation', color: '#000000',
    fields: [{ key: 'webhookUrl', label: 'IFTTT Webhook URL', type: 'text', placeholder: 'https://maker.ifttt.com/trigger/{event}/with/key/{key}' }] },
  { id: 'salesforce', name: 'Salesforce', description: "与 Salesforce CRM 同步潜在客户和联系人", icon: 'SF', category: 'crm', color: '#00A1E0',
    fields: [{ key: 'instanceUrl', label: "实例 URL", type: 'text', placeholder: 'https://yourorg.my.salesforce.com' }, { key: 'apiKey', label: "访问令牌", type: 'password', placeholder: "访问令牌..." }] },
  { id: 'zoho-crm', name: 'Zoho CRM', description: "与 Zoho CRM 同步联系人和交易", icon: 'ZC', category: 'crm', color: '#E42527',
    fields: [{ key: 'apiKey', label: "OAuth 访问令牌", type: 'password', placeholder: '1000.xxxx...' }, { key: 'apiDomain', label: "API 域", type: 'text', placeholder: 'https://www.zohoapis.com (or .in / .eu)' }] },
  { id: 'pipedrive', name: 'Pipedrive', description: "与 Pipedrive 同步联系人和交易", icon: 'PD', category: 'crm', color: '#017737',
    fields: [{ key: 'apiKey', label: "API 令牌", type: 'password', placeholder: "Pipedrive 设置中的 API 令牌" }, { key: 'companyDomain', label: "公司域名", type: 'text', placeholder: "yourcompany（来自 yourcompany.pipedrive.com）" }] },
  { id: 'bitrix24', name: 'Bitrix24', description: "与 Bitrix24 CRM 同步潜在客户", icon: 'B24', category: 'crm', color: '#2FC7F7',
    fields: [{ key: 'webhookUrl', label: "入站 Webhook URL", type: 'text', placeholder: 'https://yourcompany.bitrix24.com/rest/1/xxxx/' }] },
  { id: 'openai', name: 'OpenAI / Custom GPT', description: "使用您自己的 OpenAI 密钥或自定义 GPT 端点进行 AI 回复", icon: 'AI', category: 'ai', color: '#10A37F',
    fields: [{ key: 'apiKey', label: "API 密钥", type: 'password', placeholder: 'sk-...' }, { key: 'endpointUrl', label: "自定义端点 URL（可选）", type: 'text', placeholder: 'https://your-gpt-server.com/v1/chat/completions' }, { key: 'model', label: "型号（可选）", type: 'text', placeholder: "gpt-4o-迷你" }] },
  // Lead sources — connect, copy your webhook URL into the platform, leads auto-reply on WhatsApp
  { id: 'indiamart', name: 'IndiaMART', description: "立即自动向每个 IndiaMART 询问发送 WhatsApp", icon: 'IM', category: 'leads', color: '#128807', fields: [] },
  { id: 'justdial', name: 'Justdial', description: "立即自动向每个 Justdial 潜在客户发送 WhatsApp", icon: 'JD', category: 'leads', color: '#F26722', fields: [] },
  { id: 'tradeindia', name: 'TradeIndia', description: "自动发送 WhatsApp 至 TradeIndia 询问", icon: 'TI', category: 'leads', color: '#C8102E', fields: [] },
  { id: 'exportersindia', name: 'ExportersIndia', description: "自动向印度出口商发送 WhatsApp 询问", icon: 'EI', category: 'leads', color: '#1B5E9E', fields: [] },
  { id: 'facebook-leads', name: 'Facebook Lead Ads', description: "Instant WhatsApp 欢迎使用 Facebook/Instagram 提交潜在客户表格", icon: 'FB', category: 'leads', color: '#1877F2', fields: [] },
  { id: 'google-lead-forms', name: 'Google Lead Form Ads', description: "适用于 Google 和 YouTube 广告的自动 WhatsApp 潜在客户表单", icon: 'GL', category: 'leads', color: '#EA4335', fields: [] },
  { id: 'linkedin-ads', name: 'LinkedIn Lead Gen', description: "自动 WhatsApp for LinkedIn Lead Gen 表格潜在客户", icon: 'LI', category: 'leads', color: '#0A66C2', fields: [] },
  { id: 'twitter-ads', name: 'X (Twitter) Ads', description: "X 潜在客户生成卡的自动 WhatsApp", icon: 'X', category: 'leads', color: '#000000', fields: [] },
  { id: '99acres', name: '99acres', description: "自动 WhatsApp 进行 99 英亩房产查询", icon: '99', category: 'leads', color: '#0078DB', fields: [] },
  { id: 'magicbricks', name: 'MagicBricks', description: "自动 WhatsApp 至 MagicBricks 的房产线索", icon: 'MB', category: 'leads', color: '#D8232A', fields: [] },
  { id: 'housing', name: 'Housing.com', description: "自动 WhatsApp 发送来自 Housing.com 的潜在客户", icon: 'HO', category: 'leads', color: '#6B21A8', fields: [] },
  { id: 'olx', name: 'OLX', description: "自动 WhatsApp 至 OLX 广告查询", icon: 'OX', category: 'leads', color: '#002F34', fields: [] },
  { id: 'tagmango', name: 'TagMango', description: "自动通过 WhatsApp 发送给 TagMango 潜在客户和客户", icon: 'TM', category: 'leads', color: '#FF6B00', fields: [] },
  { id: 'leadsquared', name: 'LeadSquared', description: "自动 WhatsApp 发送至 LeadSquared 推送的潜在客户", icon: 'LS', category: 'leads', color: '#2E7CF6', fields: [] },
  { id: 'gohighlevel', name: 'GoHighLevel', description: "自动 WhatsApp 至 GoHighLevel 联系人/潜在客户", icon: 'GH', category: 'leads', color: '#188BF6', fields: [] },
  { id: 'wordpress-forms', name: 'WordPress Forms', description: "Elementor、CF7、WPForms、Gravity — 表单提交时自动 WhatsApp", icon: 'WP', category: 'forms', color: '#21759B', fields: [] },
  { id: 'google-forms', name: 'Google Forms', description: "Google 表单上的自动 WhatsApp 回复", icon: 'GF', category: 'forms', color: '#7248B9', fields: [] },
  { id: 'typeform', name: 'Typeform', description: "Typeform 提交上的自动 WhatsApp", icon: 'TF', category: 'forms', color: '#262627', fields: [] },
  { id: 'jotform', name: 'Jotform', description: "Jotform 提交上的自动 WhatsApp", icon: 'JF', category: 'forms', color: '#0A1551', fields: [] },
  { id: 'landing-pages', name: 'Landing Pages', description: "从任何登陆页面表单自动发送 WhatsApp", icon: 'LP', category: 'forms', color: '#059669', fields: [] },
  { id: 'flexifunnels', name: 'FlexiFunnels', description: "自动 WhatsApp 至 FlexiFunnels 潜在客户和买家", icon: 'FF', category: 'forms', color: '#7C3AED', fields: [] },
  { id: 'website', name: 'Own Website Webhook', description: "立即将潜在客户从您自己的网站发送到 WhatsApp", icon: 'WS', category: 'forms', color: '#334155', fields: [] },
];

// Integrations that support event automation (webhook in → WhatsApp template out)
const automationTypes = new Set(['indiamart', 'justdial', 'tradeindia', 'exportersindia', '99acres', 'magicbricks', 'housing', 'olx', 'tagmango', 'google-lead-forms', 'wordpress-forms', 'google-forms', 'typeform', 'jotform', 'landing-pages', 'flexifunnels', 'website', 'linkedin-ads', 'twitter-ads', 'leadsquared', 'gohighlevel', 'facebook-leads']);

// Per-source, honest setup guidance shown in the Automation modal.
// `steps` = how to make it work; `note` = provider dependency/limitation.
const SETUP_HINTS: Record<string, { steps: string[]; note?: string }> = {
  indiamart: {
    steps: [
      "IndiaMART 卖家面板→潜在客户经理→“导入/导出潜在客户”→ API /推送 API 部分。",
      "启用推送 API 并将上面的 Webhook URL 粘贴为目标 CRM URL。",
      "提交并批准下面的“领导谢谢”模板并打开自动发送。",
    ],
    note: "IndiaMART 仅公开符合资格的卖家计划的潜在客户推/拉。如果您的计划没有 API 选项，请要求您的 IndiaMART 关系经理启用“将 API 推送到 CRM”——否则潜在客户无法自动流动。",
  },
  justdial: {
    steps: [
      "联系您的 Justdial 账户/关系经理并请求“引导 Webhook / API 推送”。",
      "向他们提供上面的 Webhook URL 作为您的 CRM 端点。",
      "提交+批准下面的模板并打开自动发送。",
    ],
    note: "Justdial 不提供自助服务 API。 Webhook 推送仅根据请求由 Justdial 为付费/经过验证的广告商手动启用。未经他们的批准，自动捕获潜在客户是不可能的。",
  },
  'facebook-leads': {
    steps: [
      "元应用程序仪表板 → 您的应用程序 → Webhooks → 订阅页面上的“leadgen”字段。",
      "在 Meta webhook 配置中使用上面的 Webhook URL 和验证令牌。",
      "提交+批准下面的模板并打开自动发送。",
    ],
    note: "需要具有pages_manage_metadata +leads_retrieval权限的元应用程序和连接的页面。新应用程序在潜在客户投入生产之前需要进行元应用程序审核。",
  },
  'google-lead-forms': { steps: ["Google Ads → 您的潜在客户表单资产 → “Webhook 集成”。", "粘贴上面的 Webhook URL（键 = 留空或如图所示）。", "提交+批准模板并打开自动发送。"] },
  'linkedin-ads': { steps: ["LinkedIn Campaign Manager → Lead Gen Forms → 通过指向上述 URL 的 Webhook 工具 (Zapier/Make) 连接。"], note: "LinkedIn 没有原生 webhook；需要连接器 (Zapier/Make) 将潜在客户转发到此 URL。" },
  'twitter-ads': { steps: ["通过连接器 (Zapier/Make) 将 X (Twitter) 线索卡转发到上面的 Webhook URL。"], note: "X 不提供直接的 webhook；使用连接器转发引线。" },
  tradeindia: { steps: ["TradeIndia 卖家面板 → 潜在客户/查询 API 设置 → 设置上面的 Webhook URL。", "提交+批准模板并打开自动发送。"], note: "您的计划需要 TradeIndia 主要 API 访问权限。" },
  exportersindia: { steps: ["ExportersIndia 线索/询盘转发 → 设置上面的 Webhook URL。"], note: "需要您的计划中的 ExportersIndia 潜在客户转发/API 访问权限。" },
  '99acres': { steps: ["99acres CRM/潜在客户推送设置 → 设置上面的 Webhook URL。"], note: "潜在客户推送的可用性取决于您的 99acres 订阅。" },
  magicbricks: { steps: ["MagicBricks 主导 API/CRM 推送 → 设置上面的 Webhook URL。"], note: "潜在客户推送的可用性取决于您的 MagicBricks 计划。" },
  housing: { steps: ["Housing.com 线索推送/CRM 设置 → 设置上面的 Webhook URL。"], note: "潜在客户推送的可用性取决于您的 Housing.com 计划。" },
  olx: { steps: ["OLX 潜在客户转发 → 设置上面的 Webhook URL（或通过连接器）。"], note: "OLX 没有公共 webhook；可能需要连接器。" },
  leadsquared: { steps: ["LeadSquared → 自动化/Webhook → 将新线索发布到上面的 Webhook URL。"] },
  gohighlevel: { steps: ["GoHighLevel → 工作流程 → Webhook 操作 → POST 到上面的 Webhook URL。"] },
  tagmango: { steps: ["TagMango→integrations/webhook→POST 指向上面的 Webhook URL。"] },
  'wordpress-forms': { steps: ["Elementor / CF7 / WPForms / Gravity → 添加 Webhook 操作 → POST 提交到上面的 URL（映射电话和姓名字段）。"] },
  'google-forms': { steps: ["Google 表单 → Apps 脚本 → onFormSubmit → POST 响应到上面的 Webhook URL。"] },
  typeform: { steps: ["Typeform → 连接 → Webhooks → 添加上面的 Webhook URL。"] },
  jotform: { steps: ["Jotform → 设置 → 集成 → Webhooks → 添加上面的 Webhook URL。"] },
  'landing-pages': { steps: ["任何登陆页面表单 → 将提交内容（包含电话和姓名）发布到上面的 Webhook URL。"] },
  flexifunnels: { steps: ["FlexiFunnels → 表单/webhook 设置 → POST 指向上面的 Webhook URL。"] },
  website: { steps: ["您的网站表单后端 → POST { 姓名、电话、电子邮件 } 到上面的 Webhook URL。"] },
  'google-workspace': {
    steps: [
      "Google Cloud Console → API 和服务 → 启用 Google Calendar API、Google Drive API、Google Docs API 和 Google Forms API。",
      "创建服务账户 → 密钥 → 添加密钥 (JSON) → 粘贴上面的整个 JSON。",
      "Google Meet 链接：管理控制台 → 安全性 → API 控制 → 域范围委派 → 添加服务账户客户端 ID，范围包括日历、驱动器、文档、forms.body.readonly，然后填写“要充当的工作区用户”。",
      "文档模板和表单：与服务账户电子邮件（或模拟用户）共享模板文档/表单，以便它可以复制和阅读它们。",
      "然后在 Bot Flow Builder 中添加 Google Meet / Google Docs / Google Forms 卡。",
    ],
    note: "如果没有域范围的委派，普通服务账户无法创建 Google Meet 链接（文档和表单卡仍然有效）。",
  },
};

// Returns the combined setup steps for an app (credential guide + lead-source hint).
function guideForApp(id: string): { steps: string[]; keysUrl?: string; note?: string } | null {
  const g = INTEGRATION_GUIDES[id];
  const h = SETUP_HINTS[id];
  if (!g && !h) return null;
  return {
    steps: [...(g?.steps || []), ...(h?.steps || [])],
    keysUrl: g?.keysUrl,
    note: g?.note || h?.note,
  };
}

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Builds a printable HTML doc (used for "Download PDF") for the given app ids.
function buildGuideHtml(ids: string[]): string {
  const sections = ids.map((id) => {
    const def = integrationDefs.find((d) => d.id === id);
    if (!def) return '';
    const g = guideForApp(id);
    const steps = g?.steps?.length
      ? `<ol>${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`
      : '<p class="muted">Enter the required keys in the panel and click Connect.</p>';
    const keys = g?.keysUrl ? `<p class="muted">Get keys: <span>${esc(g.keysUrl)}</span></p>` : '';
    const fields = def.fields.length
      ? `<p class="muted">Fields to fill: ${def.fields.map((f) => esc(f.label)).join(', ')}</p>` : '';
    const note = g?.note ? `<p class="note"><b>Note:</b> ${esc(g.note)}</p>` : '';
    return `<section><h2>${esc(def.name)}</h2><p class="desc">${esc(def.description)}</p>${fields}${keys}<h3>Steps</h3>${steps}${note}</section>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Integration Setup Guide</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:28px;max-width:820px;margin:0 auto}
      h1{font-size:22px;margin-bottom:4px}
      .lead{color:#555;margin-top:0}
      section{page-break-inside:avoid;border-top:1px solid #eee;padding:16px 0}
      h2{font-size:17px;margin:0 0 4px}
      h3{font-size:13px;margin:12px 0 4px;color:#333}
      .desc{color:#555;margin:2px 0 8px;font-size:13px}
      .muted{color:#666;font-size:12px;margin:3px 0}
      ol{margin:4px 0 4px 18px;padding:0}
      li{font-size:13px;margin:3px 0}
      .note{background:#fff8e1;border:1px solid #ffe082;padding:8px 10px;border-radius:6px;font-size:12px;margin-top:8px}
      @media print{a{color:#111}}
    </style></head><body>
    <h1>Integration Setup Guide</h1>
    <p class="lead">Step-by-step configuration for each app. Use your browser's "Save as PDF" in the print dialog.</p>
    ${sections}
    <script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
    </body></html>`;
}

function downloadGuidePdf(ids: string[]) {
  const w = window.open('', '_blank');
  if (!w) { toast.error(translateApiMessage("允许弹出窗口下载指南")); return; }
  w.document.write(buildGuideHtml(ids));
  w.document.close();
}

interface SetupTemplate { key: string; event: string; eventLabel: string; name: string; label: string; body: string; variables: string[]; status: string; rejectionReason: string; custom?: boolean }
interface SetupData { webhookUrl: string; verifyToken?: string; templates: SetupTemplate[]; automations: Record<string, { enabled: boolean; templateName: string }>; connected: boolean }

export default function IntegrationsPage() {
  const [connectedMap, setConnectedMap] = useState<Record<string, { connected: boolean; config: Record<string, string>; stats?: { totalSynced: number; lastSyncAt: string; lastError?: string } }>>({});
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('all');
  const [search, setSearch] = useState('');
  const [showConfig, setShowConfig] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showAuto, setShowAuto] = useState<string | null>(null);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [submittingTpl, setSubmittingTpl] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ label: '', body: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const emptyAddForm = { event: '', label: '', body: '', headerType: 'none', headerText: '', headerImage: '', buttons: [] as { type: string; text: string; url: string }[] };
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [savingTpl, setSavingTpl] = useState(false);

  useEffect(() => {
    integrationApi.list().then(r => {
      const map: Record<string, typeof connectedMap[string]> = {};
      (r.data.data || []).forEach((i: { type: string; connected: boolean; config: Record<string, string>; stats?: { totalSynced: number; lastSyncAt: string; lastError?: string } }) => {
        map[i.type] = { connected: i.connected, config: i.config, stats: i.stats };
      });
      setConnectedMap(map);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const categories = ['all', ...Array.from(new Set(integrationDefs.map(i => i.category)))];
  const q = search.trim().toLowerCase();
  const filtered = integrationDefs.filter(i =>
    (filterCat === 'all' || i.category === filterCat) &&
    (!q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
  );

  const openConfig = (id: string) => {
    const def = integrationDefs.find(d => d.id === id);
    if (!def) return;
    const existing = connectedMap[id]?.config || {};
    const form: Record<string, string> = {};
    def.fields.forEach(f => { form[f.key] = existing[f.key] || ''; });
    setConfigForm(form);
    setShowConfig(id);
  };

  // Webhook-based lead sources have no credentials to enter — connect them
  // instantly and jump straight to the setup (webhook URL + templates) modal
  // instead of showing a confusing empty "Connect" form.
  const handleConnectClick = async (id: string) => {
    const def = integrationDefs.find(d => d.id === id);
    if (!def) return;
    if (def.fields.length === 0 && automationTypes.has(id)) {
      setConnecting(true);
      try {
        const r = await integrationApi.connect({ type: id, config: {} });
        setConnectedMap(prev => ({ ...prev, [id]: { connected: true, config: r.data.data?.config || {}, stats: r.data.data?.stats } }));
        openAutomation(id);
      } catch (err: unknown) {
        const error = err as { response?: { data?: { message?: string } } };
        toast.error(translateApiMessage(error.response?.data?.message || "连接失败"));
      } finally { setConnecting(false); }
      return;
    }
    openConfig(id);
  };

  const handleConnect = async () => {
    if (submitting) return;
    if (!showConfig) return;
    setSubmitting(true);
    setConnecting(true);
    try {
      const r = await integrationApi.connect({ type: showConfig, config: configForm });
      setConnectedMap({ ...connectedMap, [showConfig]: { connected: true, config: r.data.data?.config || configForm, stats: r.data.data?.stats } });
      toast.success(translateApiMessage(r.data.message || "已连接！"));
      setShowConfig(null);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      // Failed validation must clear any stale "connected" badge
      setConnectedMap(prev => ({ ...prev, [showConfig]: { connected: false, config: prev[showConfig]?.config || {}, stats: prev[showConfig]?.stats } }));
      toast.error(translateApiMessage(error.response?.data?.message || "连接失败"));
    }
    setSubmitting(false);
    setConnecting(false);
  };

  const handleDisconnect = async (type: string) => {
    if (submitting) return;
    if (!confirm("断开此集成？")) return;
    setSubmitting(true);
    try {
      await integrationApi.disconnect(type);
      setConnectedMap(prev => ({ ...prev, [type]: { ...prev[type], connected: false } }));
      toast.success(translateApiMessage("已断开连接"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "无法断开连接"));
    } finally { setSubmitting(false); }
  };

  const handleSync = async (type: string) => {
    if (submitting) return;
    setSyncing(type);
    setSubmitting(true);
    try {
      const r = await integrationApi.sync(type);
      toast.success(translateApiMessage(r.data.data?.message || "同步完成"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "同步失败"));
    } finally {
      setSubmitting(false);
    }
    setSyncing(null);
  };

  const refreshSetup = async (id: string) => {
    try {
      const r = await integrationApi.setup(id);
      setSetupData(r.data.data);
    } catch { /* keep old data */ }
  };

  const openAutomation = async (id: string) => {
    setShowAuto(id);
    setSetupData(null);
    setEditKey(null);
    setShowAddForm(false);
    setLoadingSetup(true);
    try {
      const r = await integrationApi.setup(id);
      setSetupData(r.data.data);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "无法加载设置"));
      setShowAuto(null);
    }
    setLoadingSetup(false);
  };

  const handleSubmitTemplate = async (type: string, tpl: SetupTemplate) => {
    setSubmittingTpl(tpl.key);
    try {
      const r = await integrationApi.submitTemplate(type, tpl.key);
      toast.success(translateApiMessage(r.data.message || "已提交"));
      const upd = r.data.data as { status: string; rejectionReason: string };
      setSetupData(prev => prev ? { ...prev, templates: prev.templates.map(t => t.key === tpl.key ? { ...t, status: upd.status, rejectionReason: upd.rejectionReason } : t) } : prev);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "提交失败"));
    }
    setSubmittingTpl(null);
  };

  const handleToggleAuto = async (type: string, tpl: SetupTemplate, enabled: boolean) => {
    try {
      const r = await integrationApi.automation(type, { event: tpl.event, enabled, templateName: tpl.name });
      setSetupData(prev => prev ? { ...prev, automations: r.data.data } : prev);
      toast.success(translateApiMessage(enabled ? "自动发送开启" : "自动发送关闭"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    }
  };

  const handleSaveEdit = async (type: string, key: string) => {
    if (!editForm.body.trim()) { toast.error(translateApiMessage("需要模板主体")); return; }
    setSavingTpl(true);
    try {
      await integrationApi.updateTemplate(type, key, editForm);
      toast.success(translateApiMessage("模板已更新"));
      setEditKey(null);
      await refreshSetup(type);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "更新失败"));
    }
    setSavingTpl(false);
  };

  const handleAddTemplate = async (type: string) => {
    if (!addForm.event || !addForm.body.trim()) { toast.error(translateApiMessage("需要事件和正文")); return; }
    setSavingTpl(true);
    try {
      await integrationApi.addTemplate(type, addForm);
      toast.success(translateApiMessage("已添加模板"));
      setShowAddForm(false);
      setAddForm(emptyAddForm);
      await refreshSetup(type);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "添加失败"));
    }
    setSavingTpl(false);
  };

  const handleDeleteTemplate = async (type: string, key: string) => {
    if (!confirm("删除此模板？")) return;
    try {
      await integrationApi.deleteTemplate(type, key);
      toast.success(translateApiMessage("模板已删除"));
      await refreshSetup(type);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "删除失败"));
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(translateApiMessage("已复制！"))).catch(() => toast.error(translateApiMessage("复制失败")));
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="page-hero">
        <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">集成配置</h1>
        <p className="text-sm text-gray-500 mt-1">连接第三方工具和服务 - 添加密钥后即可使用</p>
        </div>
        <button onClick={() => downloadGuidePdf(integrationDefs.map(d => d.id))}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border bg-white text-gray-700 hover:bg-gray-50">
          <Download className="w-4 h-4" /> 设置指南 (PDF)
        </button>
        </div>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={"搜索集成..."}
          className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)}
            className={`px-4 py-2 rounded-lg text-sm capitalize ${filterCat === cat ? 'bg-emerald-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>{cat}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(def => {
          const conn = connectedMap[def.id];
          const isConnected = conn?.connected;
          return (
            <div key={def.id} className="bg-white rounded-xl border p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: def.color }}>{def.icon}</div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{def.name}</h3>
                    <span className="text-xs text-gray-400 capitalize">{def.category}</span>
                  </div>
                </div>
                {isConnected && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">已连接</span>}
              </div>
              <p className="text-sm text-gray-600 mb-3">{def.description}</p>
              {isConnected && conn?.stats && (
                <div className="text-xs text-gray-400 mb-3">
                  {conn.stats.totalSynced > 0 && <span>已同步： {conn.stats.totalSynced} </span>}
                  {conn.stats.lastSyncAt && <span>最后： {new Date(conn.stats.lastSyncAt).toLocaleDateString('en-IN')}</span>}
                </div>
              )}
              {isConnected && conn?.stats?.lastError && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-3 break-words">{conn.stats.lastError}</div>
              )}
              <div className="flex gap-2">
                {isConnected ? (
                  <>
                    
                    {automationTypes.has(def.id) ? (
                      <button onClick={() => openAutomation(def.id)}
                        className="flex-1 py-2 rounded-lg text-sm font-medium bg-violet-50 text-violet-700 hover:bg-violet-100 flex items-center justify-center gap-1">
                        <Zap className="w-3 h-3" /> 自动化
                      </button>
                    ) : (
                      <button onClick={() => handleSync(def.id)} disabled={syncing === def.id}
                        className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center justify-center gap-1 disabled:opacity-50">
                        {syncing === def.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ArrowUpDown className="w-3 h-3" />} 同步
                      </button>
                    )}
                    {def.fields.length > 0 && (
                    <button onClick={() => openConfig(def.id)} className="px-3 py-2 rounded-lg text-sm bg-gray-50 text-gray-600 hover:bg-gray-100">
                      <Link2 className="w-4 h-4" />
                    </button>
                    )}
                    <button onClick={() => handleDisconnect(def.id)} className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-600 hover:bg-red-100">
                      <Unlink className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button onClick={() => handleConnectClick(def.id)} disabled={connecting} className="w-full py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                    {def.fields.length === 0 && automationTypes.has(def.id) ? "连接和设置" : "连接"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Config Modal */}
      {showConfig && (() => {
        const def = integrationDefs.find(d => d.id === showConfig);
        if (!def) return null;

        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowConfig(null)}>
            <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b flex items-center gap-3 shrink-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: def.color }}>{def.icon}</div>
                <h3 className="font-semibold text-gray-900">连接 {def.name}</h3>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto">
                {def.fields.map(field => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                    {field.type === 'textarea' ? (
                      <textarea value={configForm[field.key] || ''} onChange={e => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm h-24 resize-y" placeholder={field.placeholder} />
                    ) : field.type === 'select' ? (
                      <select value={configForm[field.key] || ''} onChange={e => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm">
                        {(field.options || []).map(o => <option key={o.value} value={o.value}>{translateDisplay(o.label)}</option>)}
                      </select>
                    ) : (
                      <input type={field.type} value={configForm[field.key] || ''} onChange={e => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={field.placeholder} />
                    )}
                  </div>
                ))}
                
                {(() => {
                  const g = guideForApp(def.id);
                  if (!g) return null;
                  return (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700"><BookOpen className="w-4 h-4" /> 设置指南</span>
                        <button onClick={() => downloadGuidePdf([def.id])} className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline">
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                      </div>
                      <ol className="list-decimal ml-4 space-y-1 text-xs text-gray-600">
                        {g.steps.map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                      {g.keysUrl && <p className="text-xs text-gray-500 mt-2">获取密钥： <span className="font-mono break-all">{g.keysUrl}</span></p>}
                      {g.note && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2">{g.note}</p>}
                    </div>
                  );
                })()}
              </div>
              <div className="p-4 border-t flex gap-2 shrink-0">
                <button onClick={() => setShowConfig(null)} className="flex-1 py-2 rounded-lg text-sm border text-gray-600 hover:bg-gray-50">取消</button>
                <button onClick={handleConnect} disabled={connecting} className="flex-1 py-2 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                  {connecting ? "正在连接..." : "连接并保存"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Automation Modal */}
      {showAuto && (() => {
        const def = integrationDefs.find(d => d.id === showAuto);
        if (!def) return null;
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAuto(null)}>
            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b flex items-center gap-3 sticky top-0 bg-white rounded-t-xl">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: def.color }}>{def.icon}</div>
                <div>
                  <h3 className="font-semibold text-gray-900">{def.name} — WhatsApp 自动化</h3>
                  <p className="text-xs text-gray-500">活动到来时自动发送批准的模板</p>
                </div>
              </div>
              {loadingSetup || !setupData ? (
                <div className="flex items-center justify-center h-40"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
              ) : (
                <div className="p-4 space-y-5">
                  {setupData.webhookUrl && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {showAuto === 'facebook-leads' ? "Meta Webhook URL（在您的 Meta App → Webhooks → Leadgen 中设置）" : `您的 Webhook URL（将其粘贴到 ${def.name})`}
                      </label>
                      <div className="flex gap-2">
                        <input readOnly value={setupData.webhookUrl} className="flex-1 px-3 py-2 border rounded-lg text-xs bg-gray-50 text-gray-700 font-mono" />
                        <button onClick={() => copyText(setupData.webhookUrl)} className="px-3 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"><Copy className="w-4 h-4" /></button>
                      </div>
                      {showAuto !== 'facebook-leads' && <p className="text-xs text-gray-400 mt-1">杰斯嗨 {def.name} 是线索/事件 bhejega 的 URL，联系保存 hoga aur 批准的模板自动发送 hogi。</p>}
                      {setupData.verifyToken && (
                        <div className="mt-3">
                          <label className="block text-sm font-medium text-gray-700 mb-1">验证令牌（粘贴到 Meta App → Webhooks → 验证令牌）</label>
                          <div className="flex gap-2">
                            <input readOnly value={setupData.verifyToken} className="flex-1 px-3 py-2 border rounded-lg text-xs bg-gray-50 text-gray-700 font-mono" />
                            <button onClick={() => copyText(setupData.verifyToken!)} className="px-3 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"><Copy className="w-4 h-4" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  

                  {SETUP_HINTS[showAuto] && (
                    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-900">如何连接 {def.name}</h4>
                        <button onClick={() => downloadGuidePdf([showAuto])} className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline">
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                      </div>
                      <ol className="list-decimal list-inside space-y-1 text-xs text-gray-700">
                        {SETUP_HINTS[showAuto].steps.map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                      {SETUP_HINTS[showAuto].note && (
                        <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                          ⚠ {SETUP_HINTS[showAuto].note}
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">推荐模板（一键元批准）</h4>
                    <div className="space-y-3">
                      {setupData.templates.map(tpl => {
                        const auto = setupData.automations[tpl.event];
                        const enabled = !!auto?.enabled && auto?.templateName === tpl.name;
                        const approved = tpl.status === 'approved';
                        return (
                          <div key={tpl.key} className="border rounded-xl p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900 text-sm">{tpl.label}</span>
                                  {tpl.status === 'approved' && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 已批准</span>}
                                  {tpl.status === 'pending' && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> 待批准</span>}
                                  {tpl.status === 'rejected' && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1"><XCircle className="w-3 h-3" /> 被拒绝</span>}
                                  {tpl.status === 'not_submitted' && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">未提交</span>}
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">事件： {tpl.eventLabel}</p>
                              </div>
                              <div className="shrink-0 flex items-center gap-1">
                                {!approved && editKey !== tpl.key && (
                                  <button onClick={() => { setEditKey(tpl.key); setEditForm({ label: tpl.label, body: tpl.body }); }}
                                    className="px-2 py-1.5 rounded-lg text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 flex items-center gap-1" title={"编辑模板"}>
                                    <Pencil className="w-3 h-3" /> 编辑
                                  </button>
                                )}
                                {tpl.custom && (
                                  <button onClick={() => handleDeleteTemplate(showAuto, tpl.key)}
                                    className="px-2 py-1.5 rounded-lg text-xs text-red-500 bg-red-50 hover:bg-red-100" title={"删除模板"}>
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                                {!approved && (
                                  <button onClick={() => handleSubmitTemplate(showAuto, tpl)} disabled={submittingTpl === tpl.key}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
                                    {submittingTpl === tpl.key ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                    {tpl.status === 'pending' ? "重新提交" : "提交审批"}
                                  </button>
                                )}
                              </div>
                            </div>
                            {editKey === tpl.key ? (
                              <div className="mt-2 space-y-2">
                                <input value={editForm.label} onChange={e => setEditForm({ ...editForm, label: e.target.value })}
                                  className="w-full px-3 py-2 border rounded-lg text-xs" placeholder={"模板标题"} />
                                <textarea value={editForm.body} onChange={e => setEditForm({ ...editForm, body: e.target.value })}
                                  className="w-full px-3 py-2 border rounded-lg text-xs h-24 resize-y" placeholder={"消息正文 — 使用 {{1}}、{{2}} 作为变量"} />
                                <div className="flex gap-2">
                                  <button onClick={() => handleSaveEdit(showAuto, tpl.key)} disabled={savingTpl}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{savingTpl ? "保存中…" : "保存"}</button>
                                  <button onClick={() => setEditKey(null)} className="px-3 py-1.5 rounded-lg text-xs border text-gray-600 hover:bg-gray-50">取消</button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 bg-gray-50 rounded-lg p-3 text-xs text-gray-600 whitespace-pre-wrap">{tpl.body}</div>
                            )}
                            {tpl.rejectionReason && <p className="text-xs text-red-500 mt-1">{tpl.rejectionReason}</p>}
                            <div className="mt-3 flex items-center justify-between">
                              <span className="text-xs text-gray-500">将此模板自动发送至“{tpl.eventLabel}“</span>
                              <button onClick={() => handleToggleAuto(showAuto, tpl, !enabled)}
                                className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                              </button>
                            </div>
                            {enabled && !approved && <p className="text-xs text-amber-600 mt-1">模板批准 hone ke baad hi 消息 jayega — pehle 提交 karke 批准 ka 等待 karein。</p>}
                          </div>
                        );
                      })}
                    </div>

                    {showAddForm ? (
                      <div className="mt-3 border border-dashed rounded-xl p-4 space-y-2">
                        <h5 className="text-sm font-medium text-gray-900">添加您自己的模板</h5>
                        <select value={addForm.event} onChange={e => setAddForm({ ...addForm, event: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-xs bg-white">
                          <option value="">选择事件...</option>
                          {Array.from(new Set(setupData.templates.map(t => t.event))).map(ev => (
                            <option key={ev} value={ev}>{translateDisplay(setupData.templates.find(t => t.event === ev)?.eventLabel || ev)}</option>
                          ))}
                        </select>
                        <input value={addForm.label} onChange={e => setAddForm({ ...addForm, label: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-xs" placeholder={"模板标题（例如我的欢迎消息）"} />
                        <textarea value={addForm.body} onChange={e => setAddForm({ ...addForm, body: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-xs h-24 resize-y" placeholder={"消息正文 — 使用 {{1}}、{{2}} 作为变量（例如，您好 {{1}}，感谢您与我们联系！）"} />
                        <div className="flex gap-2">
                          <select value={addForm.headerType} onChange={e => setAddForm({ ...addForm, headerType: e.target.value })}
                            className="px-3 py-2 border rounded-lg text-xs bg-white">
                            <option value="none">无标题</option>
                            <option value="text">文本标题</option>
                            <option value="image">图像标题</option>
                          </select>
                          {addForm.headerType === 'text' && (
                            <input value={addForm.headerText} onChange={e => setAddForm({ ...addForm, headerText: e.target.value })}
                              className="flex-1 px-3 py-2 border rounded-lg text-xs" placeholder={"标题文本（例如消息提醒）"} />
                          )}
                          {addForm.headerType === 'image' && (
                            <input value={addForm.headerImage} onChange={e => setAddForm({ ...addForm, headerImage: e.target.value })}
                              className="flex-1 px-3 py-2 border rounded-lg text-xs" placeholder={"公共图像 URL (jpg/png)"} />
                          )}
                        </div>
                        {addForm.buttons.map((b, i) => (
                          <div key={i} className="flex gap-2">
                            <select value={b.type} onChange={e => setAddForm({ ...addForm, buttons: addForm.buttons.map((x, j) => j === i ? { ...x, type: e.target.value } : x) })}
                              className="px-3 py-2 border rounded-lg text-xs bg-white">
                              <option value="quick_reply">快速回复</option>
                              <option value="url">URL按钮</option>
                            </select>
                            <input value={b.text} onChange={e => setAddForm({ ...addForm, buttons: addForm.buttons.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })}
                              className="flex-1 px-3 py-2 border rounded-lg text-xs" placeholder={"按钮文本（最多 25 个字符）"} maxLength={25} />
                            {b.type === 'url' && (
                              <input value={b.url} onChange={e => setAddForm({ ...addForm, buttons: addForm.buttons.map((x, j) => j === i ? { ...x, url: e.target.value } : x) })}
                                className="flex-1 px-3 py-2 border rounded-lg text-xs" placeholder="https://..." />
                            )}
                            <button onClick={() => setAddForm({ ...addForm, buttons: addForm.buttons.filter((_, j) => j !== i) })}
                              className="px-2 py-1.5 rounded-lg text-xs text-red-500 bg-red-50 hover:bg-red-100"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        ))}
                        {addForm.buttons.length < 3 && (
                          <button onClick={() => setAddForm({ ...addForm, buttons: [...addForm.buttons, { type: 'quick_reply', text: '', url: '' }] })}
                            className="text-xs text-emerald-600 hover:underline">+ 添加按钮</button>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => handleAddTemplate(showAuto)} disabled={savingTpl}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{savingTpl ? "添加..." : "添加模板"}</button>
                          <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 rounded-lg text-xs border text-gray-600 hover:bg-gray-50">取消</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowAddForm(true)}
                        className="mt-3 w-full py-2 rounded-xl text-sm border border-dashed text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-1">
                        <Plus className="w-4 h-4" /> 添加您自己的模板
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className="p-4 border-t">
                <button onClick={() => setShowAuto(null)} className="w-full py-2 rounded-lg text-sm border text-gray-600 hover:bg-gray-50">关闭</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
