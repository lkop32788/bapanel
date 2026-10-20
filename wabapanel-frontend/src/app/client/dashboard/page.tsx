'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import React, { useEffect, useState } from 'react';

import Link from 'next/link';
import { MessageSquare, Send, CheckCheck, Eye, AlertCircle, Users, WifiOff, Megaphone, LayoutTemplate, Phone, Zap, TrendingUp, BellRing } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { dashboardApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import useKkhsTheme from '@/lib/useKkhsTheme';
import KkhsDashboard, { KkhsWidgets } from '@/components/kkhs/KkhsDashboard';
import AgentDashboard, { isAgentPayload } from '@/components/AgentDashboard';
import type * as RechartsModule from 'recharts'; // PERF-16: recharts is loaded on demand below

interface DashboardData {
  contacts: number;
  conversations: { total: number; active: number };
  messages: { sent: number; delivered: number; read: number; failed: number; total: number };
  messageChart: Array<{ _id: string; sent: number; received: number; total: number }>;
  recentConversations: Array<{ _id: string; contact: { name: string; phone: string }; lastMessage: { text: string }; updatedAt: string }>;

  whatsappConnected: boolean;
  campaigns?: { total: number; running: number; scheduled: number; completed: number; draft: number; paused: number; failed: number; sentTotal: number };
  recentCampaigns?: Array<{ _id: string; name: string; type: string; status: string; stats?: { sent?: number; failed?: number }; createdAt: string }>;
  templates?: { total: number; approved: number; pending: number; rejected: number };
  presets?: number;
  aiCalls?: { total: number; completed: number; failed: number; minutes: number };

  keywords?: number;
  unreadCount?: number;
  newContacts?: number;
  contactChart?: Array<{ _id: string; count: number }>;
  
  today?: { sent: number; received: number };
  
  dueReminders?: Array<{ _id: string; text: string; remindAt: string; contact?: { name?: string; phone?: string } }>;
  resolvedCount?: number;
  botFlowsActive?: number;
  responseTime?: { avgMinutes: number; medianMinutes: number; samples: number };
  hourlyActivity?: Array<{ hour: number; count: number }>;
  typeBreakdown?: Array<{ source: string; count: number }>;
  widgets?: KkhsWidgets | null;
}

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="block cursor-pointer transition hover:-translate-y-0.5 hover:opacity-95">{children}</Link>
);

const fmtDate = (d: string) => new Date(d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

export default function DashboardPage() {
  const { user, currentWorkspace } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  // PERF-16: load the chart library in its own chunk, after the page shell
  const [rc, setRc] = useState<typeof RechartsModule | null>(null);
  useEffect(() => { import('recharts').then((mod) => setRc(mod)).catch(() => {}); }, []);
  const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } = rc || ({} as typeof RechartsModule);
  const kkhs = useKkhsTheme();

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await dashboardApi.getClientDashboard();
        setData(res.data.data);
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const m = data?.messages;
  const chartData = (data?.messageChart || []).map(d => ({ date: fmtDate(d._id), sent: d.sent, received: d.received, total: d.total }));
  const contactData = (data?.contactChart || []).map(d => ({ date: fmtDate(d._id), contacts: d.count }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAgentPayload(data)) {
    return <AgentDashboard data={data} userName={user?.name} />;
  }

  return (
    <div className="space-y-6">
      {kkhs ? (
        <KkhsDashboard
          userName={user?.name}
          widgets={data?.widgets}
          open={data?.conversations?.active || 0}
          resolved={data?.resolvedCount || 0}
          today={data?.today || { sent: 0, received: 0 }}
          
          responseTime={data?.responseTime}
          hourly={data?.hourlyActivity}
          typeBreakdown={data?.typeBreakdown}
          templatesRejected={data?.templates?.rejected || 0}
          dueReminders={data?.dueReminders?.length || 0}
          recentCampaign={data?.recentCampaigns?.[0] || null}

        />
      ) : (
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">仪表盘</h1>
          <p className="text-emerald-50 text-sm mt-1">欢迎回来， {user?.name} 👋</p>
        </div>
        <div className="flex items-center gap-2">
          {currentWorkspace?.whatsapp?.isConnected || data?.whatsappConnected ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-full text-sm font-semibold shadow-lg shadow-green-500/30">
              <CheckCheck className="w-4 h-4" /> WhatsApp 已连接 ✓
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-full text-sm font-semibold shadow-lg shadow-red-500/30 animate-pulse">
              <WifiOff className="w-4 h-4" /> WhatsApp 已断开连接 ✗
            </span>
          )}
        </div>
      </div>
      )}

      {/* ① 核心指标：一行 6 个，今天的量 + 关键存量，一眼看全 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { href: '/client/chat', label: '今天发送', value: data?.today?.sent || 0, icon: <Send className="w-4 h-4 text-emerald-600" />, bg: 'bg-emerald-50' },
          { href: '/client/chat', label: '今天收到', value: data?.today?.received || 0, icon: <MessageSquare className="w-4 h-4 text-blue-600" />, bg: 'bg-blue-50' },
          { href: '/client/chat', label: '未读消息', value: data?.unreadCount || 0, icon: <BellRing className="w-4 h-4 text-orange-500" />, bg: 'bg-orange-50', warn: (data?.unreadCount || 0) > 0 },
          { href: '/client/chat', label: '活跃对话', value: data?.conversations?.active || 0, icon: <Eye className="w-4 h-4 text-teal-600" />, bg: 'bg-teal-50' },
          { href: '/client/contacts', label: '联系人总数', value: data?.contacts || 0, icon: <Users className="w-4 h-4 text-indigo-600" />, bg: 'bg-indigo-50' },
          { href: '/client/contacts', label: '新联系人 30天', value: data?.newContacts || 0, icon: <TrendingUp className="w-4 h-4 text-purple-600" />, bg: 'bg-purple-50' },
        ].map((k) => (
          <L key={k.label} href={k.href}>
            <Card className="!p-3.5 h-full">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${k.bg}`}>{k.icon}</div>
                <div className="min-w-0">
                  <p className={`text-xl font-bold leading-tight ${k.warn ? 'text-orange-600' : 'text-gray-900'}`}>{k.value}</p>
                  <p className="text-[11px] text-gray-500 truncate">{k.label}</p>
                </div>
              </div>
            </Card>
          </L>
        ))}
      </div>

      {/* ② 主体：消息趋势（左 2/3，底部内嵌 30 天状态汇总）+ 今日待办（右 1/3） */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <Card className="lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">近 30 天消息量</h3>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />发送</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />收到</span>
            </div>
          </div>
          <div className="h-60 flex-1">
            {rc && <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="sent" fill="#10B981" name="发送" radius={[3, 3, 0, 0]} />
                <Bar dataKey="received" fill="#3B82F6" name="收到" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-4 text-center">
            {[
              { label: '已发送', value: m?.sent || 0, dot: 'bg-emerald-500' },
              { label: '已送达', value: m?.delivered || 0, dot: 'bg-blue-500' },
              { label: '已读', value: m?.read || 0, dot: 'bg-purple-500' },
              { label: '失败', value: m?.failed || 0, dot: 'bg-red-500' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-lg font-semibold text-gray-900">{s.value}</p>
                <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">今日待办</h3>
            <Link href="/client/chat" className="text-sm text-emerald-600 hover:underline">打开收件箱</Link>
          </div>
          <div className="flex-1 space-y-2.5 overflow-auto">
            {(data?.dueReminders || []).length ? (data?.dueReminders || []).map(r => (
              <div key={r._id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-red-600 truncate">{r.contact?.name || r.contact?.phone || '联系人'}</p>
                  <p className="text-xs text-gray-400 truncate">{r.text}</p>
                </div>
                <span className="text-xs text-red-500 shrink-0 ml-2">{new Date(r.remindAt).toLocaleString('zh-CN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )) : <p className="text-sm text-gray-400 py-2">没有到期提醒 🎉</p>}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
            {[
              { href: '/client/bot-flows', icon: <LayoutTemplate className="w-4 h-4 text-blue-500" />, label: '活跃机器人流程', right: String(data?.botFlowsActive || 0) },
              { href: '/client/broadcasts', icon: <Megaphone className="w-4 h-4 text-purple-500" />, label: '营销活动', right: `进行中 ${data?.campaigns?.running || 0} / 共 ${data?.campaigns?.total || 0}` },
              ...((m?.failed || 0) > 0 ? [{ href: '/client/chat', icon: <AlertCircle className="w-4 h-4 text-red-500" />, label: '发送失败（30 天）', right: String(m?.failed || 0) }] : []),
            ].map((a) => (
              <Link key={a.label} href={a.href} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-gray-50 transition">
                <span className="flex items-center gap-2 text-sm text-gray-700">{a.icon}{a.label}</span>
                <span className="text-sm font-medium text-gray-900">{a.right}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* ③ 底部：联系人增长 / 最近对话 / 最近营销活动 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-3">联系人增长（30 天）</h3>
          <div className="h-48">
            {contactData.length ? (rc &&
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={contactData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="contacts" stroke="#8B5CF6" fill="#EDE9FE" name="新联系人" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">还没有新联系人</div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">最近对话</h3>
            <Link href="/client/chat" className="text-sm text-emerald-600 hover:underline">全部</Link>
          </div>
          <div className="space-y-2.5">
            {(data?.recentConversations || []).length ? (data?.recentConversations || []).map(c => (
              <div key={c._id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.contact?.name || c.contact?.phone}</p>
                  <p className="text-xs text-gray-400 truncate max-w-[180px]">{c.lastMessage?.text || ''}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-2">{new Date(c.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span>
              </div>
            )) : <p className="text-sm text-gray-400">还没有对话</p>}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">最近营销活动</h3>
            <Link href="/client/broadcasts" className="text-sm text-emerald-600 hover:underline">全部</Link>
          </div>
          <div className="space-y-2.5">
            {(data?.recentCampaigns || []).length ? (data?.recentCampaigns || []).map(c => (
              <div key={c._id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                  <p className="text-xs text-gray-400">{translateDisplay(c.type)} · 发送 {c.stats?.sent || 0}{c.stats?.failed ? ` · 失败 ${c.stats.failed}` : ''}</p>
                </div>
                <Badge variant={c.status === 'completed' || c.status === 'running' ? 'success' : c.status === 'failed' ? 'danger' : 'default'}>{translateDisplay(c.status)}</Badge>
              </div>
            )) : <p className="text-sm text-gray-400">尚无活动</p>}
          </div>
        </Card>
      </div>

      {/* ④ 功能入口：一行轻量 chips，不再占大卡位 */}
      <div className="flex flex-wrap gap-2">
        {[
          { href: '/client/templates', label: `模板 ${data?.templates?.approved || 0}/${data?.templates?.total || 0} 已批准`, icon: <LayoutTemplate className="w-3.5 h-3.5" /> },
          { href: '/client/save-money/templates', label: `预设模板 ${data?.presets || 0}`, icon: <Zap className="w-3.5 h-3.5" /> },
          { href: '/client/ai-calling', label: `AI 外呼 ${data?.aiCalls?.total || 0} 通 · ${data?.aiCalls?.minutes || 0} 分钟`, icon: <Phone className="w-3.5 h-3.5" /> },
        ].map((t) => (
          <Link key={t.href} href={t.href}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:border-emerald-300 hover:text-emerald-700 transition">
            {t.icon}{t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
