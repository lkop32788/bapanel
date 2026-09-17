# 本地前端补丁安装记录

2026-09-17 手动安装官方清单中的 frontend-v192 至 frontend-v226，共 35 个 ZIP，按编号顺序合并（后续覆盖前面同路径文件）。

前端更新至 v226，运行依赖 Next.js 16.3.5、React 19、Tailwind CSS 4。后端仍为 combined-fix-v120-ig-connect-diagnostics-20260809；没有安装后端升级包。

保留：根路径跳转登录页、默认 zh-CN、中文 UI 与菜单、许可证检测移除、现有管理员和数据库。Voice v3 主题已根据用户反馈关闭，恢复常规界面；需要时可通过 NEXT_PUBLIC_NEW_UI_2026=true 重新启用。后台自动覆盖更新默认关闭，可通过 KKHS_AUTO_UPDATES_ENABLED=true 显式开启。

兼容修复：将可嵌入短链接组件从 Next 页面拆出；预约和通话统计使用独立操作键，中文显示不改变状态参数；缺失服务健康扩展字段时显示“暂无状态数据”，不误报数据库故障。

前端补丁不包含配套后端：AI Assistant 使用 /api/ai-tools，联盟伙伴使用 /api/partners 和 /api/admin/partners；当前后端没有这些路由，不能使用这些完整功能。文件已安装，需配套后端升级。新版服务健康扩展同样没有后端数据。

安装前代码及配置备份：/www/backup/bapanel/manual-update-20260917/before-install.tar.gz。

验证：生产构建、TypeScript、真实管理员登录、首页跳转、中文菜单搜索、预约 confirmed 请求、客服模块及渠道权限、桌面和手机布局。全部通过；浏览器无运行时或 hydration 错误，真实账号可登录，Voice v3 已启用，桌面和手机无横向溢出。

## OmniClick 风格调整

按 /root/omni-click-apps-bak/frontend 的样式调整为蓝白简洁界面：#2563eb 主色、浅灰背景、白色导航与面板、细边框、小圆角；登录页居中，聊天发送气泡为蓝色。样式入口 src/styles/omniclick.css，根 html 使用 data-ui="omniclick"。

备份：/www/backup/bapanel/style-20260917/frontend-before-style.tar.gz。

生产构建、真实管理员登录、菜单搜索、预约状态请求、客服权限、手机无横向溢出和浏览器运行检查通过。

## OmniClick 细节对齐

重新对照参考项目 App.tsx 的主布局与 SystemDashboardPage.tsx，并在本机渲染参考 dist 做视觉对照。侧栏为 #111827，桌面默认 56px、悬停/键盘焦点展开 200px；导航为 18px 图标、14px 标签、8px 圆角、#2563eb 选中态。手机继续使用可开关侧栏。

系统管理首页居中内容宽度 976px（参考 max-w-5xl 的 1024px 减左右 24px），20px 标题、五个浅色统计块和列表式入口。原统计、图表和快捷操作保留在“详细统计与分析”展开区。顶部工具在桌面首页浮动，不再占据整条页头。

聊天列表宽 320px、32px 联系人头像、12px 列表行上下间距、12px 下划线筛选标签、14px 消息正文、白色/蓝色气泡。默认页面页头不再使用大卡片背景，表格细分隔线，登录输入框调整为参考的 4px 圆角和 8px 内边距。

备份：/www/backup/bapanel/style-detail-20260917/frontend-before-detail.tar.gz。

验证通过：生产构建与 TypeScript；实际管理员登录；56/200px 侧栏宽度；五个统计块；原统计可展开；中文菜单搜索；手机菜单与无横向溢出；预约 confirmed 请求、客服权限；模拟聊天的 320px 列表与蓝白气泡，无真实消息发送。

## 移除安装按钮与菜单搜索

已移除管理员、商户和伙伴顶部的“安装应用”按钮，以及侧栏菜单搜索、顶部搜索入口与相关查询筛选逻辑。菜单展开、模块权限和渠道权限保留。

验证：生产构建与 TypeScript 通过；浏览器确认搜索与安装按钮已移除、客服菜单可展开且权限正确，无运行时或 hydration 错误。前端已重启。

## 恢复原仪表盘

按用户要求撤回“系统管理”概览及五块新增统计卡片，恢复原管理仪表板直接展示：今天一览、平台概述、待处理事项、分析与趋势及快捷操作。取消详情折叠和首页专用悬浮页头。此前侧栏样式及安装按钮、搜索功能移除继续保留。

生产构建与 TypeScript 通过；浏览器确认原仪表盘各区块直接可见，无新增概览、折叠容器或运行时错误。前端已重启。

## 后台模块精简（多 agent）

删除后台 inquiries、coupons、announcements、support、user-guide、gateways、blog、currencies 页面，以及财务管理整个分组：payments、wallet、subscriptions、billing、taxes、plan-reminders、plans。清理对应专用 API、控制器、菜单、仪表盘快捷操作、套餐提醒定时任务和未使用的旧控制器副本。原仪表盘统计图表保留，已删除功能的统计卡不再链接旧页面。商户与公开端使用的套餐、支付、币种、优惠券、公告、工单等共享代码及数据库保留。

备份 /www/backup/bapanel/admin-prune-20260917/before-prune.tar.gz。团队记录 ADMIN-PRUNE-TASKS.md；三个实现 agent 与一个非作者审核 agent，复核通过。生产构建、TypeScript、后台语法与离线路由注册检查通过；浏览器检查全部 15 个旧页面 HTTP 404、剩余仪表盘和设置可用，无运行时错误。前后端已重启。

## 客户端模块精简（多 agent）

删除 client/api-docs、support、user-guide、ctwa-ads、orders、catalogs、tickets、appointments、pipelines、stages、migration、chat-appearance；删除订阅与套餐的 subscriptions、billing、transactions、invoices、wallet；删除“潜在客户管理”下 lead-dashboard、call-center、crm、call-logs。共 21 个 client 页面目录。相应公开预约、付款、目录/网站聊天页面及重复的管理员客户端 API 文档同步移除。

清理相关前后端专用控制器、路由、模型、服务、计费/配额/到期任务及聊天、营销、机器人、AI 工具、业务设置中的嵌入操作。后台登录、用户管理与仪表盘不再使用套餐/钱包字段；历史用户/设置序列化隐藏废弃财务字段。支付专用 Stripe、Razorpay、PDFKit 依赖删除，其余依赖版本未变。普通消息、联系人、标签/分组、备注提醒、回拨、AI 调用、营销、表单/Facebook 来源捕获、一般公告及独立联盟模块保留。

备份 /www/backup/bapanel/client-prune-20260917/before-prune.tar.gz；团队台账 CLIENT-PRUNE-TASKS.md。三个实现 agent 并行，跨作者独立复核与修复闭环通过。最终生产构建、标准 TypeScript、后台语法/模块/路由检查通过；浏览器确认旧页面 404、聊天本地发送夹具和剩余关键界面正常，无运行时错误或旧接口调用。认证管理员只读接口正常，未写数据库或发送真实消息。前后端已重启。
