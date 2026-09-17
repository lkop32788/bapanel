# 后台模块清理任务记录

项目 /www/wwwroot/bapanel；会话 admin-prune-20260917；类型 refactor。

范围：后台 inquiries、coupons、announcements、support、user-guide、gateways、blog、currencies，以及 Accounting 下 payments、wallet、subscriptions、billing、taxes、plan-reminders、plans。删除后台页面与专用接口；保留商户共享功能、数据库与账号，不升级依赖。

|任务|Agent|独占写入范围|状态|
|---|---|---|---|
|codex:admin-prune-20260917:1|/root/admin_pages|15 个后台页面目录、AdminSidebar、dashboard/page、KkhsAdminOps|accepted|
|codex:admin-prune-20260917:2|/root/admin_backend|admin.js、adminController.js、platform.js|accepted|
|codex:admin-prune-20260917:3|/root/admin_api_refs|lib/api.ts、KkhsTopbar、独占后台 helper|accepted|
|integration|/root|server.js、记录文档、其余待确认引用|accepted|

状态 MCP 未提供，使用本地负责人台账。构建及离线检查完成后冻结候选并安排非作者复核。备份 /www/backup/bapanel/admin-prune-20260917/before-prune.tar.gz。

## 验收

四个 agent（页面清理、后台清理、API 清理、非作者复核）已回报；独立复核 PASS，无遗留问题。生产 webpack 构建与 TypeScript 通过。五个后台变更文件 node --check 通过；离线路由注册验证删除的接口不存在、保留的接口可加载。浏览器断言 15 个旧页面均为 HTTP 404，侧栏/仪表盘无失效链接，原仪表盘各区块、设置菜单正常，无运行时错误。前后端已重启，后台公共状态接口 HTTP 200。

整合变更另含移除 server.js 套餐提醒调度；通知地址改为仪表盘；删除未引用的 src/adminController.js 旧副本。未升级依赖，未删除数据库记录。
