'use client';
import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { HelpCircle, X } from 'lucide-react';

// Route-based help guides. Shown via a floating "?" button on every client page.
const HELP: Record<string, { title: string; points: string[] }> = {
  '/client/dashboard': { title: "仪表盘", points: [
    "您的业务一目了然：聊天、联系人、消息和营销活动。",
    "使用快速链接跳转到任何模块。",
    "当客户向您发送消息时，号码会实时更新。",
  ]},
  '/client/analytics': { title: "数据分析", points: [
    "跟踪一段时间内的消息量、送达率和代理绩效。",
    "代理性能显示每个代理处理的聊天、响应时间和解决方案（过去 30 天）。",
    "使用这些报告来查找您最繁忙的时间和效果最好的营销活动。",
  ]},
  '/client/chat': { title: "收件箱", points: [
    "WhatsApp、Instagram、Facebook、Telegram 和电子邮件中的所有客户对话都集中在一处。",
    "分配：向特定代理提供聊天。使用复选框图标进行批量操作。",
    "使用日历图标安排消息、悬停时转发消息以及从附加菜单发送目录产品。",
    "打开/关闭过滤器：打开 = 活动聊天，关闭 = 已解决的聊天。",
  ]},
  '/client/contacts': { title: "联系人", points: [
    "您的客户目录。通过 CSV 导入或手动添加联系人。",
    "单击联系人可查看其完整活动时间线、备注和标签。",
    "使用标签和自定义数据字段来组织客户进行有针对性的活动。",
  ]},
  '/client/segments': { title: "片段", points: [
    "根据标签、字段和群发行为等规则动态划分联系人分组。",
    "细分自动更新：当联系人符合规则时，他们会自动加入。",
    "重定向：构建诸如“收到广播X但没有回复”的分段并重新广播给它们。",
  ]},
  '/client/templates': { title: "消息模板", points: [
    "WhatsApp 需要预先批准的模板才能在 24 小时窗口之外发送消息。",
    "在此处创建模板并将其提交给 Meta 进行批准（通常需要几分钟到几小时）。",
    "使用 {{1}} 等变量进行个性化，并添加按钮、图像或轮播。",
  ]},
  '/client/broadcasts': { title: "广播", points: [
    "一次性将批准的模板发送给许多联系人（活动）。",
    "按细分、标签选择收件人，或上传列表而不保存联系人。",
    "A/B 测试：选择第二个模板和分割百分比 — 发送后，单击活动上的 A/B 按钮来比较发送率、阅读率和回复率。",
  ]},
  '/client/automations': { title: "自动化", points: [
    "一劳永逸的工作流程：欢迎消息、关键字回复、循环聊天路由。",
    "业主警报：获取有关消息、热门线索、投诉等的 WhatsApp 通知 - 每个警报都有自己的切换开关。",
    "循环路由在您的客服人员之间均匀分配新的聊天。",
  ]},
  '/client/bot-flows': { title: "机器人流程设计器", points: [
    "构建视觉聊天机器人：拖动消息、问题、条件和操作的节点。",
    "流量分析显示有多少用户到达每个步骤以及他们在哪里停止。",
    "将流连接到关键字或为每个新对话运行它们。",
  ]},
  
  '/client/agents': { title: "客服管理", points: [
    "添加可以登录并处理聊天的团队成员。",
    "权限：单击盾牌图标可精确控制客服人员可以查看哪些模块（例如，仅收件箱，无计费）。",
    "未选择任何权限的代理将获得完全访问权限。",
  ]},
  '/client/teams': { title: "团队", points: [
    "将代理分组为团队（例如销售、支持）以进行有组织的聊天分配。",
    "在 Analytics 中跟踪团队绩效。",
  ]},
  '/client/integrations': { title: "集成配置", points: [
    "连接外部工具：Google Sheets（自动导出潜在客户）、Google Calendar（根据约会自动创建事件）、支付网关、Zapier 等。",
    "每张卡都有自己的设置指南 - 单击进行配置。",
  ]},
  
  
  
  
  
  '/client/forms': { title: "潜在客户发掘表格", points: [
    "创建 WhatsApp Flows — 在 WhatsApp 内打开的本机表单（无外部链接）。",
    "提交内容会自动捕获并保存为潜在客户。",
  ]},
  
  '/client/media-library': { title: "媒体库", points: [
    "消息和模板中使用的图像、视频和文档的中央存储。",
  ]},
  
  '/client/settings': { title: "设置", points: [
    "工作区配置文件、密码、API 密钥、webhooks 和安全性 (2FA)。",
    "在“安全”选项卡下启用双因素身份验证以获得额外保护。",
  ]},
  '/client/ai-settings': { title: "人工智能设置", points: [
    "配置AI助手：API密钥、模型、功能（自动回复、摘要、情感）。",
    "在知识库中添加业务信息，以便人工智能准确回答客户问题。",
  ]},
  '/client/ai-calling': { title: "人工智能通话", points: [
    "AI 支持拨打和接听语音电话，可安排预约、收集潜在客户信息和设置回拨。",
    "在此处配置代理语音、问候语和行为。",
  ]},
  '/client/knowledge-base': { title: "知识库", points: [
    "添加有关您业务的信息（产品、价格、政策、常见问题解答）。",
    "AI 在回复客户时使用此信息。",
  ]},
};

export default function PageHelp() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const base = pathname.split('?')[0];
  const help = HELP[base] || HELP[base.replace(/\/$/, '')];
  if (!help) return null;
  // The chat composer sits at the bottom on phones, so the bubble moves up there.
  const liftedOnMobile = base.startsWith('/client/chat');
  return (
    <>
      <button onClick={() => setOpen(!open)} title={"页面指南"}
        className={`fixed ${liftedOnMobile ? 'bottom-24 sm:bottom-5' : 'bottom-5'} right-5 z-40 w-10 h-10 rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 hidden sm:flex items-center justify-center`}>
        <HelpCircle className="w-5 h-5" />
      </button>
      {open && (
        <div className="fixed bottom-20 right-5 z-40 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl ring-1 ring-gray-200 dark:ring-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">如何 {help.title} 工作</h4>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <ul className="space-y-2">
            {help.points.map((p, i) => (
              <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex gap-2">
                <span className="text-emerald-600 mt-0.5">•</span>{p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
