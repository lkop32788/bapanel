// Step-by-step setup guides for credential-based integrations.
// Shown in-app (Connect modal) and used to generate a downloadable PDF.
// Keep each `steps` entry short and action-oriented (A-Z), `keysUrl` = where to get the keys.

export interface IntegrationGuide {
  steps: string[];
  keysUrl?: string;
  note?: string;
}

export const INTEGRATION_GUIDES: Record<string, IntegrationGuide> = {
  'google-sheets': {
    keysUrl: 'https://console.cloud.google.com/',
    steps: [
      "Google Cloud Console → 创建/选择一个项目。",
      "API 和服务 → 库 → 启用“Google Sheets API”。",
      "凭证 → 创建凭证 → 服务账户 → 打开它 → 密钥 → 添加密钥 → JSON → 下载。",
      "打开下载的 JSON 并复制“client_email”值（以 ...iam.gserviceaccount.com 结尾 — 这不是您的 Gmail）。",
      "打开您的 Google 表格 → 共享 → 粘贴该服务账户 (client_email) → 授予编辑器访问权限 → 发送。 （无法与您自己的 Gmail 共享。）",
      "从以下网址复制工作表 ID：docs.google.com/spreadsheets/d/<SHEET_ID>/edit",
      "将 JSON 和工作表 ID 粘贴到此处，然后进行连接。如果您收到“呼叫者没有权限”，则该工作表不会与上面的 client_email 共享。",
    ],
  },
  hubspot: {
    keysUrl: 'https://app.hubspot.com/',
    steps: [
      "HubSpot → 设置（齿轮）→ 集成 → 私人应用程序。",
      "创建私有应用程序 → 范围 → 启用 crm.objects.contacts（读/写）。",
      "创建应用程序 → 复制访问令牌（以 pat- 开头）。",
      "将令牌粘贴到此处，然后连接。",
    ],
  },
  mailchimp: {
    keysUrl: 'https://admin.mailchimp.com/account/api/',
    steps: [
      "Mailchimp → 账户 → 附加 → API 密钥。",
      "创建一个密钥并复制它 - 它以数据中心后缀（如 -us21）结尾。",
      "将完整密钥（包括 -usXX 部分）粘贴到此处，然后连接。",
    ],
    note: "密钥必须包含其数据中心后缀（例如...-us21），否则它将无法连接。",
  },
  'google-analytics': {
    keysUrl: 'https://analytics.google.com/',
    steps: [
      "Google Analytics → 管理 → 数据流 → 打开您的网络流。",
      "复制测量 ID (G-XXXXXXXXXX)。",
      "将其粘贴到此处，然后连接。",
    ],
  },
  webhook: {
    steps: [
      "获取服务器上应接收事件的 URL。",
      "将其粘贴到此处作为 Webhook URL，然后连接。",
      "我们将在面板事件上将 JSON 有效负载 POST 到此 URL。",
    ],
  },
  zapier: {
    keysUrl: 'https://zapier.com/app/zaps',
    steps: [
      "Zapier → 创建 Zap → 触发器：“Zapier 的 Webhooks”→ Catch Hook。",
      "复制 Zapier 为您提供的自定义 Webhook URL。",
      "将其粘贴到此处，然后连接。",
    ],
  },
  make: {
    keysUrl: 'https://www.make.com/',
    steps: [
      "制作 → 新场景 → 添加“Webhooks → 自定义 webhook”模块。",
      "复制生成的 Webhook URL。",
      "将其粘贴到此处，然后连接。",
    ],
  },
  pabbly: {
    keysUrl: 'https://connect.pabbly.com/',
    steps: [
      "Pabbly Connect → 新工作流程 → 触发器：Webhook。",
      "复制 Webhook URL。",
      "将其粘贴到此处，然后连接。",
    ],
  },
  n8n: {
    steps: [
      "n8n → 新工作流程 → 添加“Webhook”节点 → 复制其生产 URL。",
      "将其粘贴到此处，然后连接。",
    ],
  },
  ifttt: {
    keysUrl: 'https://ifttt.com/maker_webhooks',
    steps: [
      "IFTTT → Webhooks 服务 → 文档 → 复制您的密钥。",
      "构建 URL：https://maker.ifttt.com/trigger/{event}/with/key/{your_key}",
      "将其粘贴到此处，然后连接。",
    ],
  },
  salesforce: {
    keysUrl: 'https://login.salesforce.com/',
    steps: [
      "Salesforce → 设置 → 应用程序管理器 → 新连接的应用程序（启用 OAuth）。",
      "为 API 用户生成/获取 OAuth 访问令牌。",
      "实例 URL = https://yourorg.my.salesforce.com",
      "将实例 URL 和访问令牌粘贴到此处，然后连接。",
    ],
  },
  'zoho-crm': {
    keysUrl: 'https://api-console.zoho.com/',
    steps: [
      "Zoho API 控制台 → 自客户端 → 生成具有 ZohoCRM 范围的 OAuth 访问令牌。",
      "API 域 = https://www.zohoapis.com（或您所在地区的 .in / .eu）。",
      "将访问令牌和 API 域粘贴到此处，然后连接。",
    ],
  },
  pipedrive: {
    keysUrl: 'https://app.pipedrive.com/settings/api',
    steps: [
      "Pipedrive → 设置 → 个人偏好 → API → 复制您的 API 令牌。",
      "公司域 = .pipedrive.com 之前的部分（例如“yourcompany”）。",
      "将 API 令牌和公司域粘贴到此处，然后进行连接。",
    ],
  },
  bitrix24: {
    steps: [
      "Bitrix24 → 开发人员资源 → 其他 → 入站 webhook。",
      "授予其 CRM 权限并复制生成的 URL。",
      "将其粘贴到此处，然后连接。",
    ],
  },
  openai: {
    keysUrl: 'https://platform.openai.com/api-keys',
    steps: [
      "OpenAI Platform → API 密钥 → 创建新的密钥 → 复制它 (sk-...)。",
      "将 API 密钥粘贴到此处。",
      "（可选）对于自定义 GPT 服务器，添加端点 URL 和模型，然后添加连接。",
    ],
  },
};
