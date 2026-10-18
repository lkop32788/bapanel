/* eslint-disable @typescript-eslint/no-explicit-any */
/* Default website content — mirrors backend src/config/siteContentDefaults.js */
export const DEFAULT_CONTENT: any = {
  "nav": {
    "links": [
      {
        "label": "首页",
        "href": "/"
      },
      {
        "label": "特点",
        "href": "/features"
      },
      
      {
        "label": "关于",
        "href": "/about"
      },
      {
        "label": "联系方式",
        "href": "/contact"
      },
      {
        "label": "隐私政策",
        "href": "/privacy"
      },
      {
        "label": "服务条款",
        "href": "/terms"
      },
      {
        "label": "博客",
        "href": "/blog"
      }
    ],
    "loginText": "Login",
    "registerText": "免费开始"
  },
  "home": {
    "badge": "官方 WhatsApp Business API 平台",
    "heroTitle": "WhatsApp 自动化驱动",
    "heroTitleHighlight": "实际业务增长",
    "heroSubtitle": "让您的客户参与处于自动驾驶状态。发送广播、部署人工智能聊天机器人、自动化工作流程以及管理对话——所有这些都来自一个强大的平台。",
    "ctaPrimary": "开始免费试用",
    "ctaSecondary": "看看它是如何工作的",
    "trustBadges": [
      "No credit card required",
      "14-day free trial",
      "Cancel anytime",
      "WhatsApp Compliant"
    ],
    "heroImage": "/assets/dashboard-hero.png",
    "trustedByTitle": "受到全球 500 多家企业的信赖",
    "trustedByLogos": [
      "/assets/logos/shopnova.svg",
      "/assets/logos/edulearn.svg",
      "/assets/logos/healthplus.svg",
      "/assets/logos/finserve.svg",
      "/assets/logos/estatepro.svg",
      "/assets/logos/retailmax.svg",
      "/assets/logos/logiflow.svg",
      "/assets/logos/cloudsy.svg"
    ],
    "stats": {
      "badge": "经过规模验证",
      "title": "会说话的数字",
      "titleHighlight": "为自己",
      "items": [
        { "value": "12000000+", "label": "消息已送达", "sub": "跨 WhatsApp、FB 和 IG" },
        { "value": "500+", "label": "船上企业", "sub": "来自 15 个以上行业" },
        { "value": "98.6%", "label": "交货率", "sub": "官方云 API" },
        { "value": "24/7", "label": "人工智能接听", "sub": "聊天机器人从不睡觉" }
      ]
    },
    "automation": {
      "badge": "自动化",
      "title": "适应的工作流程",
      "titleHighlight": "您的企业如何运营",
      "image": "/assets/workflow-automation.png",
      "points": [
        "无代码可视化流程构建器 - 在几分钟内拖放和发布",
        "人工智能驱动的决策节点自动确定潜在客户资格",
        "触发关键字、事件、时间延迟或自定义 Webhook",
        "跨 WhatsApp、电子邮件和 SMS 的多渠道序列"
      ]
    },
    "aiChat": {
      "badge": "人工智能聊天机器人",
      "title": "智能对话",
      "titleHighlight": "转换并保留",
      "image": "/assets/chat-interface.png",
      "points": [
        "立即部署 GPT-4o、DeepSeek、Gemini 和 50 多个 AI 模型",
        "包含丰富卡片、图像和购买按钮的产品目录",
        "需要时智能移交至人工代理",
        "根据您的数据进行训练 — 常见问题解答、文档、网站和产品信息"
      ]
    },
    "features": {
      "badge": "平台特点",
      "title": "你需要的一切",
      "titleHighlight": "在 WhatsApp 上进行缩放",
      "subtitle": "强大的工具，专为希望通过 WhatsApp 实现客户互动自动化并推动增长的企业而设计。",
      "viewAllText": "查看所有功能",
      "items": [
        {
          "title": "WhatsApp 云 API",
          "desc": "官方 Meta 合作伙伴关系。通过模板管理、媒体支持和实时传送网络钩子发送和接收无限消息。"
        },
        {
          "title": "智能广播",
          "desc": "通过个性化模板、动态变量、智能调度和 A/B 测试立即覆盖 10 万多个联系人，以实现最大程度的参与。"
        },
        {
          "title": "人工智能驱动的聊天机器人",
          "desc": "使用 GPT-4o、DeepSeek、Gemini 等部署智能代理。通过类似人类的对话，24/7 处理客户查询。"
        },
        {
          "title": "流程自动化",
          "desc": "可视化无代码工作流程构建器。触发关键字、事件、时间延迟和客户行为模式的自动序列。"
        },
        {
          "title": "联系 CRM",
          "desc": "具有标签、自定义字段、潜在客户评分和完整对话历史记录的智能分段。深入了解您的客户。"
        },
        {
          "title": "分析仪表板",
          "desc": "消息传递、阅读率、活动投资回报率、代理绩效和客户参与趋势的实时指标。"
        },
        {
          "title": "人工智能语音通话",
          "desc": "AI voice agents that handle inbound/outbound calls with natural speech, appointment booking, and intelligent call routing."
        },
        {
          "title": "点击 WhatsApp 广告",
          "desc": "在 Facebook 和 Instagram 上开展 CTWA 活动。通过即时自动跟进序列，将潜在客户自动捕获到您的 CRM 中。"
        }
      ]
    },
    "steps": {
      "badge": "快速设置",
      "title": "去住",
      "titleHighlight": "3 分钟",
      "items": [
        {
          "step": "01",
          "title": "创建账户",
          "desc": "通过电子邮件免费注册。一分钟内即可设置您的工作空间和团队。"
        },
        {
          "step": "02",
          "title": "连接 WhatsApp",
          "desc": "使用嵌入式注册立即连接您的 WhatsApp Business API。无需开发人员。"
        },
        {
          "step": "03",
          "title": "开始成长",
          "desc": "发送您的第一个广播，部署人工智能聊天机器人，并观察参与度的飙升。"
        }
      ]
    },
    "solutions": {
      "badge": "解决方案",
      "title": "专为",
      "titleHighlight": "各行业",
      "items": [
        {
          "title": "电子商务",
          "items": [
            "Order confirmations & tracking",
            "Abandoned cart recovery",
            "Product recommendations",
            "COD confirmation calls"
          ]
        },
        {
          "title": "客户支持",
          "items": [
            "24/7 AI auto-reply",
            "Multi-agent shared inbox",
            "Smart ticket routing",
            "CSAT & NPS surveys"
          ]
        },
        {
          "title": "教育",
          "items": [
            "Course notifications",
            "Fee payment reminders",
            "Admission updates",
            "Parent-teacher communication"
          ]
        },
        {
          "title": "医疗保健",
          "items": [
            "Appointment reminders",
            "Lab report delivery",
            "Health tips & follow-ups",
            "Emergency notifications"
          ]
        },
        {
          "title": "房地产",
          "items": [
            "Property alerts",
            "Site visit scheduling",
            "Document sharing",
            "EMI payment reminders"
          ]
        },
        {
          "title": "金融与银行",
          "items": [
            "Transaction alerts",
            "KYC document collection",
            "Loan status updates",
            "Investment notifications"
          ]
        }
      ]
    },
    
    "faqTitle": "常见问题解答",
    "faqs": [
      {
        "q": "这个平台是什么？",
        "a": "一个完整的 WhatsApp Business API 解决方案，可让您发送广播、与 AI 聊天机器人自动对话、管理联系人并发展您的业务 — 所有这些都通过一个仪表板完成。"
      },
      {
        "q": "我需要 Facebook 商务管理吗？",
        "a": "是的，您需要经过验证的 Facebook Business Manager 账户才能使用 WhatsApp Business API。我们指导您完成整个验证过程。"
      },
      {
        "q": "支持哪些人工智能模型？",
        "a": "支持 GPT-4o、GPT-4、Claude、DeepSeek、Gemini Pro、Grok 等 50 多种模型。可以为不同机器人选择模型，也可以同时使用多个模型。"
      },
      {
        "q": "我可以批量发送消息而不被禁止吗？",
        "a": "是的！我们使用官方 WhatsApp Business API 和经过批准的模板。您的消息会通过 Meta 的基础设施，并进行适当的速率限制和合规性检查。"
      },
      
      
    ],
    "cta": {
      "title": "准备好与 WhatsApp 一起成长了吗？",
      "subtitle": "使用我们的平台加入 500 多家企业，实现对话自动化并增加收入。",
      "primaryText": "开始免费试用",
      "secondaryText": "与销售人员交谈"
    }
  },
  "footer": {
    "tagline": "适用于成长型企业的最强大的 WhatsApp Business API 平台。",
    "productTitle": "Product",
    "companyTitle": "Company",
    "connectTitle": "Connect",
    "copyrightText": "保留所有权利。"
  },
  "about": {
    "badge": "关于我们",
    "title": "关于",
    "intro": "强大的 WhatsApp Business API 平台，旨在帮助各种规模的企业实现通信自动化、大规模吸引客户并通过全球最受欢迎的消息应用程序推动增长。",
    "stats": [
      {
        "value": "500+",
        "label": "企业信任我们"
      },
      {
        "value": "10M+",
        "label": "消息已送达"
      },
      {
        "value": "99.9%",
        "label": "正常运行时间 SLA"
      },
      {
        "value": "24/7",
        "label": "可用支持"
      }
    ],
    "valuesTitle": "Our",
    "valuesTitleHighlight": "Values",
    "valuesSubtitle": "是什么驱使我们每天为您的业务构建最佳平台。",
    "values": [
      {
        "title": "我们的使命",
        "desc": "使每个企业都可以访问并负担得起 WhatsApp Business API，使他们能够与大规模客户进行有效沟通。"
      },
      {
        "title": "安全第一",
        "desc": "我们严格遵守 WhatsApp 商务政策。您的数据通过企业级基础设施、SOC2 合规性和定期审核进行加密和保护。"
      },
      {
        "title": "创新",
        "desc": "我们不断集成最新的人工智能模型和自动化技术，让您的业务凭借尖端功能保持领先地位。"
      },
      {
        "title": "客户成功",
        "desc": "我们的专业支持团队通过 24/7 全天候协助、入职帮助和战略指导，确保您充分利用该平台。"
      },
      {
        "title": "社区驱动",
        "desc": "我们根据客户反馈构建功能。我们由 500 多家企业组成的充满活力的社区有助于塑造我们平台的未来。"
      },
      {
        "title": "全球影响力",
        "desc": "通过多语言支持、区域合规性和本地支付选项为 20 多个国家/地区的企业提供服务。"
      }
    ],
    "cta": {
      "title": "想了解更多吗？",
      "subtitle": "与我们的团队联系或立即开始免费试用。",
      "primaryText": "联系我们",
      "secondaryText": "开始免费试用"
    }
  },
  "team": {
    "badge": "我们的团队",
    "title": "认识",
    "titleHighlight": "团队",
    "intro": "充满热情的人们致力于通过智能通信帮助您的业务发展。",
    "members": [
      {
        "name": "Founder & CEO",
        "role": "首席执行官",
        "desc": "富有远见的领导者在 SaaS 和通信技术领域拥有 10 多年的经验，推动公司向前发展。",
        "initials": "CEO",
        "photo": ""
      },
      {
        "name": "CTO",
        "role": "首席技术官",
        "desc": "领导我们工程团队的架构专家。热衷于可扩展系统和人工智能创新。",
        "initials": "CTO",
        "photo": ""
      },
      {
        "name": "Head of Product",
        "role": "产品副总裁",
        "desc": "以客户为中心的产品领导者确保每项功能都能提供真正的商业价值。",
        "initials": "VP",
        "photo": ""
      },
      {
        "name": "Head of Engineering",
        "role": "工程主管",
        "desc": "全栈专家管理我们的开发流程，重点关注可靠性和性能。",
        "initials": "ENG",
        "photo": ""
      },
      {
        "name": "Head of Sales",
        "role": "销售副总裁",
        "desc": "关系建立者帮助企业发现适合其沟通需求的正确解决方案。",
        "initials": "SAL",
        "photo": ""
      },
      {
        "name": "Head of Support",
        "role": "客户成功领导",
        "desc": "通过专门的入职培训和 24/7 支持，确保每位客户获得最大价值。",
        "initials": "SUP",
        "photo": ""
      }
    ],
    "cta": {
      "title": "加入我们的团队",
      "subtitle": "我们一直在寻找有才华的人来加入我们的使命。查看空缺职位或将您的简历发送给我们。",
      "primaryText": "联系我们",
      "secondaryText": "关于我们"
    }
  },
  "contact": {
    "badge": "联系方式",
    "title": "进来",
    "titleHighlight": "触摸",
    "subtitle": "有疑问吗？我们很乐意听取您的意见。请给我们留言，我们会尽快回复。",
    "emailLabel": "Email",
    "phoneLabel": "Phone",
    "addressLabel": "Address",
    "buttonText": "发送消息",
    "successMessage": "谢谢！我们会尽快回复您。",
    "errorMessage": "出了点问题。请再试一次。"
  },
  "featuresPage": {
    "badge": "所有功能",
    "title": "强大的工具",
    "titleHighlight": "扩大您的业务",
    "subtitle": "在 WhatsApp 上自动化客户互动、增加收入和发展业务所需的一切 — 一切都来自一个强大的平台。",
    "ctaText": "开始免费试用",
    "itemLinkText": "开始吧",
    "items": [
      {
        "title": "WhatsApp 云 API",
        "desc": "官方 Meta 合作伙伴关系，具有完整的 API 访问权限。通过批准的模板管理、富媒体支持（图像、视频、文档、位置）、实时传送和阅读网络钩子以及交互式按钮/列表发送和接收无限消息。",
        "points": [
          "官方元业务合作伙伴",
          "模板消息管理",
          "富媒体支持（图像、视频、文档）",
          "实时交付和已读收据",
          "交互式按钮和列表消息",
          "基于 Webhook 的事件通知"
        ]
      },
      {
        "title": "智能广播",
        "desc": "通过个性化模板营销活动立即覆盖超过 10 万个联系人。使用动态变量、智能调度来实现最佳交付时间，使用 A/B 测试来最大限度地提高参与度，并对每个活动进行详细分析。",
        "points": [
          "一次发送给超过 10 万个联系人",
          "动态变量个性化",
          "智能调度和时区",
          "A/B 测试以提高参与度",
          "按标签、属性、行为细分",
          "详细的每条消息分析"
        ]
      },
      {
        "title": "人工智能驱动的聊天机器人",
        "desc": "部署由 GPT-4o、DeepSeek、Gemini、Claude 和 50 多个模型提供支持的智能对话式 AI 代理。通过类人对话、产品推荐和无缝座席交接，全天候 (24/7) 处理客户查询。",
        "points": [
          "50 多个 AI 模型（GPT-4o、Gemini、Claude、DeepSeek）",
          "根据您自己的数据和文档进行培训",
          "卡片丰富的产品目录",
          "需要时智能代理切换",
          "多语言支持（100多种语言）",
          "对话上下文记忆"
        ]
      },
      {
        "title": "流程自动化",
        "desc": "具有拖放界面的可视化无代码工作流程构建器。创建由关键字、事件、时间延迟、API Webhook 或客户行为模式触发的复杂自动化序列。",
        "points": [
          "可视化拖放构建器",
          "关键字和基于事件的触发器",
          "条件分支逻辑",
          "延时序列",
          "API Webhook 集成",
          "循环和重试处理"
        ]
      },
      {
        "title": "联系 CRM",
        "desc": "为 WhatsApp 构建的完整客户关系管理。具有标签、自定义字段、潜在客户评分、完整对话历史记录和自动化生命周期管理的智能细分。",
        "points": [
          "无限的自定义字段和标签",
          "线索评分和资格",
          "完整的对话历史记录",
          "智能分割和过滤器",
          "批量导入/导出 (CSV)",
          "生命周期阶段管理"
        ]
      },
      {
        "title": "分析仪表板",
        "desc": "Real-time comprehensive metrics for message delivery, read rates, campaign ROI, agent performance, chatbot effectiveness, and customer engagement trends with exportable reports.",
        "points": [
          "实时消息传递统计",
          "活动投资回报率跟踪",
          "代理绩效指标",
          "聊天机器人对话分析",
          "客户参与趋势",
          "可导出的 PDF/CSV 报告"
        ]
      },
      {
        "title": "人工智能语音通话",
        "desc": "AI-powered voice agents that handle inbound and outbound calls with natural speech synthesis. Appointment booking, intelligent call routing, voicemail, and call recording with transcription.",
        "points": [
          "人工智能驱动的语音代理",
          "自然语音合成与识别",
          "预约自动化",
          "智能呼叫路由",
          "通话录音和转录",
          "IVR 菜单生成器"
        ]
      },
      {
        "title": "点击 WhatsApp 广告",
        "desc": "直接在 Facebook 和 Instagram 上开展 CTWA 活动。通过即时自动跟进序列、归因跟踪和转化优化，将潜在客户自动捕获到您的 CRM 中。",
        "points": [
          "Facebook 和 Instagram 广告集成",
          "自动将潜在客户捕获至 CRM",
          "即时自动跟进",
          "转化归因跟踪",
          "活动绩效分析",
          "受众同步和重定向"
        ]
      },
      {
        "title": "多代理收件箱",
        "desc": "共享团队收件箱，多个代理可以同时处理客户对话。分配规则、内部注释、预设响应、SLA 计时器和主管监控。",
        "points": [
          "共享团队收件箱",
          "自动分配和循环法",
          "内部注释和提及",
          "预设回复库",
          "SLA 计时器和警报",
          "主管监控仪表板"
        ]
      },
      {
        "title": "多渠道支持",
        "desc": "管理 WhatsApp、Instagram DM、Facebook Messenger、Telegram 和电子邮件之间的对话 — 所有这些都来自一个具有一致客户资料的统一收件箱。",
        "points": [
          "WhatsApp 商业 API",
          "Instagram 私信",
          "Facebook Messenger",
          "Telegram 机器人集成",
          "电子邮件渠道支持",
          "统一的客户资料"
        ]
      },
      {
        "title": "模板管理器",
        "desc": "使用内置合规性检查器创建、提交和管理 WhatsApp 消息模板。实时预览模板、跟踪审批状态并按类别进行组织。",
        "points": [
          "可视化模板生成器",
          "自动元合规性检查",
          "实时预览",
          "类别组织",
          "可变占位符系统",
          "审批状态跟踪"
        ]
      },
      {
        "title": "API 和 Webhook",
        "desc": "用于自定义集成的完整 REST API 和 Webhook 系统。通过 HTTP 和预构建的连接器连接您现有的 CRM、电子商务平台、帮助台或任何第三方工具。",
        "points": [
          "完整的 REST API 访问权限",
          "Webhook事件系统",
          "预构建集成（Shopify、WooCommerce）",
          "Zapier 和 Make.com 支持",
          "自定义 HTTP 连接器",
          "API 文档和 SDK"
        ]
      },
      {
        "title": "白标就绪",
        "desc": "使用您自己的品牌对平台进行完全白标 - 徽标、颜色、域名、电子邮件。以定制定价和您自己的品牌标识转售给您的客户。",
        "points": [
          "定制徽标和品牌",
          "您自己的域名",
          "品牌电子邮件",
          "为客户定制定价",
          "多租户架构",
          "经销商仪表板"
        ]
      },
      {
        "title": "企业安全",
        "desc": "企业级安全性，具有端到端加密、基于角色的访问控制、IP 白名单、2FA、审核日志和数据保护的 GDPR 合规性。",
        "points": [
          "端到端加密",
          "基于角色的访问控制（RBAC）",
          "双因素身份验证（2FA）",
          "IP白名单",
          "审核日志和活动跟踪",
          "符合 GDPR 的数据处理"
        ]
      },
      {
        "title": "24/7 支持",
        "desc": "专门的支持团队通过聊天、电子邮件和电话全天候提供服务。通过专门的客户经理和入职协助为企业计划提供优先支持。",
        "points": [
          "24/7 实时聊天支持",
          "电子邮件和电话支持",
          "专职客户经理（企业）",
          "入职协助",
          "知识库和教程",
          "社区论坛访问"
        ]
      },
      {
        "title": "快速设置",
        "desc": "通过嵌入式注册，可在 3 分钟内开始使用。无需开发人员 - 连接您的 WhatsApp Business 号码、导入联系人并立即开始发送营销活动。",
        "points": [
          "3 分钟设置过程",
          "嵌入式 WhatsApp 注册",
          "无需开发人员",
          "引导式入职向导",
          "联系人导入（CSV/API）",
          "预建的活动模板"
        ]
      }
    ],
    "cta": {
      "title": "准备好开始了吗？",
      "subtitle": "立即开始 14 天免费试用。无需信用卡。",
      "primaryText": "开始免费试用",
      "secondaryText": "与销售人员交谈"
    }
  },
  "privacy": {
    "badge": "法律",
    "title": "隐私政策",
    "titleHighlight": "政策",
    "sections": [
      {
        "title": "1. 我们收集的信息",
        "content": "我们收集您直接向我们提供的信息，例如您在创建账户、使用我们的服务或与我们沟通时提供的信息。这包括姓名、电子邮件地址、电话号码和商业信息。我们还收集使用数据、设备信息和 cookie 以改进我们的服务。"
      },
      {
        "title": "2. 我们如何使用您的信息",
        "content": "我们使用收集的信息来提供、维护和改进我们的服务、处理交易、发送通信、确保您的账户安全、提供客户支持以及发送营销通信（经您同意）。"
      },
      {
        "title": "3. WhatsApp Business API 数据",
        "content": "通过我们的平台发送和接收的消息均通过官方 WhatsApp Business API (Meta) 进行处理。我们遵守 WhatsApp 的商业政策和商业消息传递政策。消息内容被安全存储并仅用于服务交付。我们不会向第三方出售或分享消息内容。"
      },
      {
        "title": "4.数据安全",
        "content": "我们采用行业通用的安全措施保护数据，包括传输加密（TLS 1.3）、存储加密（AES-256）、定期安全审计、访问控制、入侵检测及符合 SOC2 要求的基础设施。"
      },
      {
        "title": "5.数据保留",
        "content": "只要您的账户处于活动状态或根据提供服务的需要，我们就会保留您的数据。您可以随时联系我们请求删除您的数据。根据删除请求，我们会在 30 天内删除您的数据，法律要求保留的情况除外。"
      },
      {
        "title": "6. 第三方服务",
        "content": "我们可能与受信任的第三方服务共享数据，用于支付处理（Razorpay、Stripe）、分析（Google Analytics）、通信交付（WhatsApp/Meta）和云托管。所有第三方均受保密协议和数据处理协议的约束。"
      },
      {
        "title": "7. Cookie 和跟踪",
        "content": "我们使用基本 cookie 进行身份验证和安全，并使用可选的分析 cookie（经同意）来了解使用模式。您可以在浏览器设置中管理 cookie 首选项。"
      },
      {
        "title": "8. 您的权利",
        "content": "您有权访问、更正或删除您的个人数据。您还可以请求数据可移植性、限制处理或反对处理。如有任何与隐私相关的请求，请联系我们。我们会在 30 天内回复所有请求。"
      },
      {
        "title": "9. 国际转账",
        "content": "您的数据可能会在位于您所在国家/地区之外的服务器中进行处理。我们确保按照适用的数据保护法为国际数据传输采取适当的保障措施。"
      },
      {
        "title": "10. 本政策的更新",
        "content": "我们可能会不时更新本隐私政策。我们将通过电子邮件或应用内通知通知您任何重大变更。变更后继续使用我们的服务即表示接受更新后的政策。"
      },
      {
        "title": "11. 联系方式",
        "content": "对于隐私查询、数据请求或投诉，请通过本网站上的联系电子邮件联系我们的数据保护官。"
      }
    ]
  },
  "terms": {
    "badge": "法律",
    "title": "条款",
    "titleHighlight": "服务",
    "sections": [
      {
        "title": "1. 接受条款",
        "content": "通过访问或使用服务，您同意受这些服务条款的约束。如果您不同意，请勿使用该服务。这些条款适用于所有用户，包括商户、管理员和最终用户。"
      },
      {
        "title": "2.服务说明",
        "content": "我们提供 WhatsApp Business API 平台，包括消息收发、群发、AI 聊天机器人、自动化、CRM、数据分析及相关服务，帮助企业通过官方 WhatsApp Business API 与客户沟通。"
      },
      {
        "title": "3. 账户注册",
        "content": "您在注册时必须提供准确、完整的信息。您有责任维护您账户凭据的安全。您必须年满 18 岁，并拥有使您的组织遵守这些条款的法定权力。"
      },
      {
        "title": "4. WhatsApp 合规性",
        "content": "您同意始终遵守 WhatsApp 的商业政策、商业政策和商业消息传递政策。这包括不发送垃圾邮件、在向客户发送消息之前获得适当的选择同意、使用批准的消息模板以及不发送禁止的内容（成人、赌博、武器等）。"
      },
      {
        "title": "5.可接受的使用",
        "content": "您同意不会：发送未经请求的消息（垃圾邮件）、骚扰或滥用联系人、发送非法或有害内容、侵犯知识产权、尝试对平台进行逆向工程、使用服务进行欺诈活动，或者在不升级的情况下超出计划的消息传递限制。"
      },
      {
        "title": "6. 付款和账单",
        "content": "付费计划按选择按月或按年计费。除法律要求外，所有付款均不可退还。我们保留提前 30 天通知更改价格的权利。付款失败可能会导致服务暂停。 WhatsApp 通话费用是单独的，并根据 Meta 的定价进行计费。"
      },
      {
        "title": "7. 数据和隐私",
        "content": "您对服务的使用也受我们的隐私政策的约束。您是通过我们平台处理的客户数据的数据控制者。您必须确保您获得适当同意才能通过 WhatsApp 收集和处理客户数据。"
      },
      {
        "title": "8.服务可用性",
        "content": "我们努力实现 99.9% 的正常运行时间，但不保证服务不间断。预定的维护将提前通知。对于由 Meta/WhatsApp 基础设施、第三方服务或不可抗力事件导致的停机，我们不承担任何责任。"
      },
      {
        "title": "9.知识产权",
        "content": "服务，包括所有代码、设计、文档和品牌，均归公司所有。您保留对您的数据和内容的所有权。白标许可证授予您的计划协议中指定的有限品牌权。"
      },
      {
        "title": "10. 终止",
        "content": "任何一方均可随时终止。终止后，您的访问权限将被撤销，数据将在删除前保留 30 天。我们可能会暂停或终止违反这些条款、WhatsApp 政策或适用法律的账户，恕不另行通知。"
      },
      {
        "title": "11. 责任限制",
        "content": "在法律允许的最大范围内，公司不对任何间接、偶然、特殊或后果性损害承担责任。我们的总责任不得超过您在索赔前 12 个月内支付的金额。"
      },
      {
        "title": "12. 适用法律",
        "content": "这些条款受印度法律管辖。任何争议均应根据 1996 年《仲裁与调解法》通过仲裁解决，仲裁地为印度。"
      },
      {
        "title": "13. 条款变更",
        "content": "我们可能会不时更新这些条款。重大变更将在生效前至少 30 天通过电子邮件或应用内通知通知。变更后继续使用即表示接受。"
      },
      {
        "title": "14. 联系方式",
        "content": "如果对这些条款有疑问，请通过本网站上的支持电子邮件与我们联系。"
      }
    ]
  },
  "seo": {
    "metaTitle": "WabaPanel - WhatsApp 业务平台",
    "metaDescription": "用于消息传递、自动化和分析的完整 WhatsApp Business API 平台",
    "keywords": "Whatsapp 商业 API、Whatsapp 自动化、Whatsapp 营销、人工智能聊天机器人",
    "ogImage": "",
    "googleAnalyticsId": "",
    "googleTagManagerId": "",
    "facebookPixelId": "",
    "googleSiteVerification": "",
    "bingSiteVerification": "",
    "customHeadCode": ""
  }
};



export const deepMergeContent = (base: any, override: any): any => {
  if (Array.isArray(override)) return override;
  if (override && typeof override === 'object' && base && typeof base === 'object' && !Array.isArray(base)) {
    const out: any = { ...base };
    for (const k of Object.keys(override)) out[k] = deepMergeContent(base[k], override[k]);
    return out;
  }
  return override === undefined ? base : override;
};

export const replacePlaceholders = (val: any, bizName: string): any => {
  if (typeof val === 'string') return val.split('{business}').join(bizName);
  if (Array.isArray(val)) return val.map(v => replacePlaceholders(v, bizName));
  if (val && typeof val === 'object') return Object.fromEntries(Object.keys(val).map(k => [k, replacePlaceholders(val[k], bizName)]));
  return val;
};

export const buildSiteContent = (data: any, bizName: string): any =>
  replacePlaceholders(data ? deepMergeContent(DEFAULT_CONTENT, data) : DEFAULT_CONTENT, bizName);

