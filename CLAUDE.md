# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概况

WABA Panel 2026（kkhsmedia.com 的商业产品，本地已深度定制）：多渠道客服/营销面板，支持 WhatsApp Cloud API、WhatsApp QR（Baileys）、Telegram Bot、Telegram 个人号（MTProto）、Instagram、Facebook、Email 等渠道的统一收件箱、群发、机器人流程、AI 助手/AI 外呼。

- `wabapanel-express/` — 后端：Express 5 + Mongoose 9 + Socket.io 4（CommonJS，无构建步骤，无测试）
- `wabapanel-frontend/` — 前端：Next.js 16 App Router + React 19 + Tailwind 4 + zustand
- 生产环境：pm2 运行 `wabapanel-api`（127.0.0.1:5000）和 `wabapanel-app`（127.0.0.1:3002），BaoTa nginx 反代 `ws.37182.club`：`/api` 和 `/socket.io` → 5000，其余 → 3002。两个 pm2 进程目前都在 root 用户下。

## 常用命令

```bash
# 后端（wabapanel-express/）
npm run dev        # node --watch src/server.js
npm start          # 生产启动（实际由 pm2 管理）
npm run seed       # 建 super_admin、demo 账号、Permission 数据
node reset-admin-password.js [密码] [邮箱]   # 重置管理员密码并清除 2FA

# 前端（wabapanel-frontend/）
npm run dev        # next dev
npm run lint       # next lint（没有测试命令）

# 前端上线：永远用根目录 build.sh，不要直接 npm run build
./build.sh                 # 构建 → 替换 .next → pm2 重启 → 健康检查，失败自动回滚
./build.sh --no-restart    # 只构建到 .next-build，不动线上
./build.sh --install       # 改过依赖时先 npm install
./build.sh --rollback      # 退回 .next-old
./build.sh --status        # 看构建目录 / pm2 / 健康状态
```

build.sh 原理：`NEXT_DIST_DIR=.next-build npx next build` 构建到暂存目录，成功后整体换入 `.next`，避免构建期间线上 chunk 404。脚本会切到前端目录属主（当前是 `www`）执行，但 pm2 进程注册在 root 下，必要时用 `APP_USER=root ./build.sh`。需要 >2GB 空闲磁盘。

后端改动没有构建步骤，直接 `pm2 restart wabapanel-api`。

## 供应商补丁体系（重要）

代码来自供应商的编号 zip 补丁。`wabapanel-frontend/local-update.json` 记录已装补丁版本（前端 v226）、本地定制清单（中文化、登录跳转、移除 license 检查、已删除的 client 模块等）；`patch_backups/frontend-vNNN/_patch_meta.json` 记录每个补丁的文件清单和备份。**任何本地修改都可能被供应商补丁覆盖，重要定制应同步记录到 local-update.json。** 后端 `routes/kkhsLicense.js` 加载时会启动自动拉取远程补丁的定时器（受 `KKHS_AUTO_UPDATES_ENABLED` 控制）；license 校验已被 stub 为 "active"。代码注释里的 `MSG-16`、`ADM-23` 等标签是供应商 fix ID。

## 后端架构

- 分层：`src/routes/`（~50）→ `src/controllers/`（~35）→ `src/models/`（~60 schema）+ `src/services/`（~45，渠道、调度器、AI 都在这）。部分路由文件内联逻辑（platform.js、kkhsLicense.js、webhooks.js 的 telegram 入站）。
- `src/server.js`（574 行）集中装配一切：Socket.io 通过 `app.set('io')` / `global.io` 暴露（services 用 `global.io` 推送）；`express.json` 保留 `req.rawBody` 供 webhook 验签；`/api/public/*`、`/s/:code` 等公开端点直接写在 server.js；启动时执行一次性 "Fixup" 迁移（每次 boot 都会改角色、删索引）；最后启动所有调度器。
- 路由惯例：`router.use(protect, workspaceAccess)` + `requireFeature('xxx')`。响应统一 `{ success, message, data[, pagination] }`（utils/apiResponse.js）。
- **多租户**：所有模型按 `workspace` 隔离。渠道凭据都是 Workspace 的子文档（`whatsapp`、`waQr`、`tgPersonal`、`emailChannel` 等）。Conversation 按 (workspace, contact, channel) 唯一。
- **渠道没有统一抽象**：发消息在 `conversationController.sendMessage` 里按 `conversation.channel` if/else 分支；入站各走各的（Cloud API/FB/IG 走 `controllers/webhookController.js`，Baileys 在 `services/waQrService.js`，邮件是 `emailInboxPoller.js` 每 2 分钟 IMAP 轮询）。
- Baileys 会话存 `wa_sessions/<workspaceId>/`（多文件 auth state），启动 5 秒后 `restoreAll()`；Telegram 个人号 StringSession 存在 Mongo 的 `Workspace.tgPersonal.session`，启动 7 秒后恢复。Baileys 有日发送上限（预热机制）和发送队列。
- 认证：JWT `{id}`，`protect` 读 Bearer 头（有 token cookie 回退但没人设 cookie）。角色 `super_admin/admin/vendor/user/agent`，workspace 内另有 `members[].role`（owner/admin/agent）。2FA 走 challengeToken + speakeasy TOTP。`workspaceAccess` 读 `x-workspace-id` 头。注意：`.env` 写的是 `JWT_EXPIRES_IN` 但代码只读 `JWT_EXPIRE`（默认 365d）。
- Socket.io 房间：`user:<id>`、`workspace:<id>`、`conversation:<id>`；握手需要 `auth.token`。主要事件：`new_message`、`conversation_updated`、`message_status`、`waqr:status`、`agent_typing`、`reminder_due`。
- 调度器混用 node-cron（很多 job 固定 Asia/Kolkata 时区）和 setInterval，全部在 server.js 启动：drip/campaign/aiCall 调度、每日报表、数据清理、每日 DB 备份等。
- 坑：unhandledRejection/uncaughtException 只打日志不退出，故障可能静默；server.js 以 root 运行时会自己改 nginx 配置；上传文件同时挂在 `/uploads` 和 `/api/uploads`，优先用 `/api/uploads`（反代可能把裸 `/uploads` 发给前端）；`vendor/ffmpeg` 是自带的静态二进制。

## 前端架构

- App Router（`src/app/`，~120 个 page.tsx，几乎全是 `'use client'`），路径别名 `@/*` → `./src/*`。区域：`client/*`（商家面板，~45 模块）、`admin/*`（管理后台）、`partner/(protected)`（分销）、`auth/*`、公开 CMS 页（blog、pages/[slug] 等）。
- **没有 middleware**，鉴权守卫在各区域 `layout.tsx` 客户端执行（`loadUser()` + 按角色跳转）。根 layout 是 `force-dynamic` 服务端组件，白标元数据来自 `src/lib/serverSite.ts`（60s 内存缓存 + `.site-cache/` 磁盘回退，服务端用 `INTERNAL_API_URL`）。
- 状态：zustand（`src/stores/authStore.ts` 管 user/token/workspace 并负责连 socket）。**react-query 装了但从未使用**，页面都是 useEffect + axios；**@xyflow/react 装了但没用**，bot 流程编辑器是手写 canvas（`client/bot-flows/[id]/page.tsx`，1.7k 行）。
- API 层集中在 `src/lib/api.ts`（~690 行，所有端点按 `xxxApi` 对象分组）：单 axios 实例，请求拦截器带 `localStorage.token`（Bearer）+ `x-workspace-id` 头；401 清 token 硬跳 `/auth/login`；自带 GET 去重 adapter 和可选 `cachedGet` 短缓存。类型在 `src/types/index.ts`。
- Socket 封装在 `src/lib/socket.ts`，重连会自动重进 workspace/conversation 房间。`client/chat/page.tsx`（3.2k 行）是聊天主界面。
- UI 已中文化：`src/lib/zhDisplay.ts` / `zhMessages.ts` / `zhNavigation.ts` 的 `translateDisplay`/`translateApiMessage` 被 ~109 个文件使用，改 UI 文案要走这套。主题在 `src/styles/omniclick.css` 和 `src/styles/kkhs-2026/*`（根目录 `styles/kkhs-2026/` 是设计参考）。
- `globals.css` 的 `@import 'tailwindcss' source(none); @source '../../src'` 是故意的（扫描备份目录曾吃掉 10GB 内存），别改回默认扫描。
- 陷阱：`src/src/stores/authStore.ts` 是过期的重复文件，没人引用，别误改；`localStorage.adminToken` 是"以商家身份登录"后切回管理员用的 token。

## 环境与配置

- 后端 `.env` 关键变量：`PORT=5000`、`HOST=127.0.0.1`、`MONGODB_URI`、`JWT_SECRET`、`FRONTEND_URL`/`ADMIN_URL`（即 CORS 白名单）、`WHATSAPP_VERIFY_TOKEN`。渠道相关（META_*、TG_API_ID/HASH、SMTP_*、AWS_*）代码会读但多存在 DB（`SystemSettings`/Workspace 子文档）里。
- 前端 `.env`：`NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_SOCKET_URL`、`INTERNAL_API_URL`。`next.config.mjs` 只设了 `distDir`（可被 `NEXT_DIST_DIR` 覆盖），没有 rewrites——浏览器直接打绝对 URL，靠 nginx 反代。
- 生效的 pm2 配置是根目录 `ecosystem.generated.config.js`（install.sh 生成）；`wabapanel-express/ecosystem.config.js` 指向 `/var/www/...`，已过期。
- `install.sh` 是全新机器一键安装脚本（Node 22、MongoDB 7、pm2、写 .env、seed、nginx 提示）。
- git 仓库文件属主是 www/root 混合，git 可能报 "dubious ownership"。
