# 客户端模块清理任务记录

项目 /www/wwwroot/bapanel，会话 client-prune-20260917，类型 refactor。

任务 1 /root/admin_pages：前端所有 src（除 lib/api.ts、lib/currency.ts），删除 21 个页面及所有嵌入 UI、类型、订阅限额。
任务 2 /root/admin_backend：后台订阅计费、用户与登录、管理员/客户统计，支付/平台路由、账单模型、WhatsApp 扣费和安装/seed。
任务 3 /root/independent_review：后台预约/管道/商城/工单/CTWA/CRM/聊天控件、联系人迁移清理、相关机器人和 AI 工具集成。
任务 integration /root：API 导出、货币工具、server 路由与调度、featureGate、模型索引、认证中间件、开发者 API 清理。

全部 accepted；专属文件所有权通过实际 agent 消息划定，不修改数据库、不升级依赖。当前 3 个实现 agent 并行，候选冻结后由非作者交叉审核及负责人构建/浏览器检查。code-team 状态 MCP 不可用，负责人本地任务记录。

备份 /www/backup/bapanel/client-prune-20260917/before-prune.tar.gz。潜在客户管理 = Lead CRM 分组（lead-dashboard、call-center、crm、call-logs），获客表单/Facebook leads 不在该分组。联系人正常导入与聊天内部备注/提醒保留。

## 候选与独立验收

任务 1 前端、任务 2 计费、任务 3 CRM/商城已接受。任务 4/6 /root/admin_backend 非作者审核 CRM/商城、负责人整合及前端；任务 5 /root/independent_review 非作者审核计费/登录/集成。审核发现的已删除 AI 工具声明、旧评分筛选、自动工单与热门线索开关、发票设置、商品预设/Instagram 阶段引用均由原作者或负责人修复，受影响候选重新冻结复核，最终 PASS，无未解决项。

lead-owned 整合还清理未引用 gatewayLinks、开发者 key/webhook 接口、公开套餐/预约、旧页面跳转、闲置 HomeLanding/currency、旧提醒/到期计费任务；保留 Meta WhatsApp 运输信息及外部来源捕获、Facebook 表单、普通联系人导入/备注/回拨提醒、AI 通话、营销。公告展示保留。伙伴联盟独立账号资金功能不属于 client 订阅分组。

删除 Stripe/Razorpay/PDFKit 及专属传递依赖，离线 npm uninstall --legacy-peer-deps 保持现有 peer 依赖布局，其余锁文件包版本变化为 0。package 与锁文件及现有直接安装版本一致。更新前清单额外备份在 client-prune-20260917/backend-package-before.json 与 backend-package-lock-before.json。

## 验证证据

- /tmp/bapanel-manual-update/client-prune-final-build.log：最终生产 webpack 构建与 TypeScript 通过。
- /tmp/bapanel-manual-update/client-prune-final-types.log：标准 tsc --noEmit 退出 0，旧生成页面类型已刷新。
- 后台相对 require 全部可解析；15 个保留的消息/登录/管理/自动化模块清理依赖后离线加载通过。
- 浏览器 /tmp/bapanel-zh/browser/client-prune.cjs：21 个 client 旧页面、公开 book/pay/catalog/widget 及 admin API-docs HTTP 404；本地聊天发送夹具及仪表盘、联系人、广播、机器人、AI 设置、自动化、集成页面无运行时错误、无废弃 API 请求，未发送真实消息。
- 运行后台 health HTTP 200，20 个废弃模块/公开入口 HTTP 404；认证只读管理员 auth/me、dashboard、vendors、settings、workspaces HTTP 200，用户响应不含套餐/钱包字段，旧客服/优惠券验证接口 HTTP 404。未写生产数据库记录。

前端与后端已重启。真实 AI/外部消息服务未作为回归测试调用。项目历史数据与管理员账号保留。所有本轮任务完成。
