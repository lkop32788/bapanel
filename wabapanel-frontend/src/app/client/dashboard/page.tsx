'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import React, { useEffect, useState } from 'react';

import Link from 'next/link';
import { MessageSquare, Send, CheckCheck, Eye, AlertCircle, Users, WifiOff, Megaphone, LayoutTemplate, Phone, Zap, Clock, TrendingUp, BellRing } from 'lucide-react';
import { StatCard } from '@/components/ui/Card';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { dashboardApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import useKkhsTheme from '@/lib/useKkhsTheme';
import KkhsDashboard, { KkhsWidgets } from '@/components/kkhs/KkhsDashboard';
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

const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444'];

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="block cursor-pointer transition hover:-translate-y-0.5 hover:opacity-95">{children}</Link>
);

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

const SectionTitle = ({ icon, title, accent }: { icon: React.ReactNode; title: string; accent: string }) => (
  <div className="flex items-center gap-2.5 mt-2">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>{icon}</div>
    <h2 className="text-base font-semibold text-gray-800">{title}</h2>
    <div className="flex-1 h-px bg-linear-to-r from-gray-200 to-transparent" />
  </div>
);

export default function DashboardPage() {
  const { user, currentWorkspace } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  // PERF-16: load the chart library in its own chunk, after the page shell
  const [rc, setRc] = useState<typeof RechartsModule | null>(null);
  useEffect(() => { import('recharts').then((mod) => setRc(mod)).catch(() => {}); }, []);
  const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } = rc || ({} as typeof RechartsModule);
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

  const pieData = [
    { name: 'Sent', value: m?.sent || 0 },
    { name: 'Delivered', value: m?.delivered || 0 },
    { name: 'Read', value: m?.read || 0 },
    { name: 'Failed', value: m?.failed || 0 },
  ].filter(d => d.value > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
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

      {/* Today strip */}
      <SectionTitle icon={<Clock className="w-4 h-4 text-white" />} title={"今天一览"} accent="bg-linear-to-br from-orange-400 to-amber-500" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <L href="/client/chat"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><Send className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">今天发送</p><p className="text-xl font-bold text-gray-900">{data?.today?.sent || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/chat"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><MessageSquare className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">今天收到</p><p className="text-xl font-bold text-gray-900">{data?.today?.received || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/chat"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center"><BellRing className="w-5 h-5 text-orange-600" /></div>
            <div><p className="text-xs text-gray-500">未读消息</p><p className="text-xl font-bold text-gray-900">{data?.unreadCount || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/contacts"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><TrendingUp className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-xs text-gray-500">新联系人（30 天）</p><p className="text-xl font-bold text-gray-900">{data?.newContacts || 0}</p></div>
          </div>
        </Card></L>
      </div>

      {/* Action needed */}
      <SectionTitle icon={<BellRing className="w-4 h-4 text-white" />} title={"今天需要采取行动"} accent="bg-linear-to-br from-red-500 to-rose-500" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">到期提醒</h3>
            <Link href="/client/chat" className="text-sm text-emerald-600 hover:underline">打开收件箱</Link>
          </div>
          <div className="space-y-2.5">
            {(data?.dueReminders || []).length ? (data?.dueReminders || []).map(r => (
              <div key={r._id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-red-600 truncate">{r.contact?.name || r.contact?.phone || "联系方式"}</p>
                  <p className="text-xs text-gray-400 truncate">{r.contact?.phone ? `${r.contact.phone} — ` : ''}{r.text}</p>
                </div>
                <span className="text-xs text-red-500 shrink-0">{new Date(r.remindAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )) : <p className="text-sm text-gray-400">没有待处理的提醒 🎉</p>}
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <L href="/client/followups"><Card className="!p-4 h-full">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">AI 自动跟进</p>
              <p className="text-lg font-bold text-gray-900">检查线索→</p>
              <p className="text-[11px] text-gray-400">需要回复/安静</p>
            </div>
          </Card></L>
          <L href="/client/chat"><Card className="!p-4 h-full">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">活跃聊天</p>
              <p className="text-lg font-bold text-gray-900">{data?.conversations?.active || 0}</p>
              <p className="text-[11px] text-gray-400">{data?.resolvedCount || 0} 已解决</p>
            </div>
          </Card></L>
          <L href="/client/bot-flows"><Card className="!p-4 h-full">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">活跃机器人流程</p>
              <p className="text-lg font-bold text-gray-900">{data?.botFlowsActive || 0}</p>
              <p className="text-[11px] text-gray-400">24×7自动回复</p>
            </div>
          </Card></L>
          
        </div>
      </div>

      

      {/* Main stats */}
      <SectionTitle icon={<MessageSquare className="w-4 h-4 text-white" />} title={"消息和联系人"} accent="bg-linear-to-br from-emerald-500 to-teal-500" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <L href="/client/contacts"><StatCard title={"联系人总数"} value={data?.contacts || 0} icon={<Users className="w-6 h-6" />} color="blue" /></L>
        <L href="/client/chat"><StatCard title={"已发送消息（30 天）"} value={m?.sent || 0} icon={<Send className="w-6 h-6" />} color="emerald" /></L>
        <L href="/client/chat"><StatCard title={"已交付"} value={m?.delivered || 0} icon={<CheckCheck className="w-6 h-6" />} color="purple" /></L>
        <L href="/client/chat"><StatCard title={"读"} value={m?.read || 0} icon={<Eye className="w-6 h-6" />} color="orange" /></L>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <L href="/client/chat"><StatCard title={"对话"} value={data?.conversations?.total || 0} icon={<MessageSquare className="w-6 h-6" />} color="blue" /></L>
        <L href="/client/chat"><StatCard title={"操作失败"} value={m?.failed || 0} icon={<AlertCircle className="w-6 h-6" />} color="red" /></L>
        <L href="/client/broadcasts"><StatCard title={"营销活动"} value={`${data?.campaigns?.running || 0} running / ${data?.campaigns?.total || 0}`} icon={<Megaphone className="w-6 h-6" />} color="purple" /></L>
        
      </div>

      <SectionTitle icon={<Phone className="w-4 h-4 text-white" />} title={"业务与运营"} accent="bg-linear-to-br from-blue-500 to-indigo-500" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <L href="/client/ai-calling"><StatCard title={"人工智能呼叫"} value={`${data?.aiCalls?.total || 0} (${data?.aiCalls?.minutes || 0} min)`} icon={<Phone className="w-6 h-6" />} color="blue" /></L>
        
        <L href="/client/templates"><StatCard title={"模板"} value={`${data?.templates?.approved || 0} approved / ${data?.templates?.total || 0}`} icon={<LayoutTemplate className="w-6 h-6" />} color="purple" /></L>
        
      </div>

      {/* Charts */}
      <SectionTitle icon={<TrendingUp className="w-4 h-4 text-white" />} title={"分析与趋势"} accent="bg-linear-to-br from-purple-500 to-fuchsia-500" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">消息分析（30 天）</h3>
          <div className="h-64">
            {rc && <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="sent" fill="#10B981" name="Sent" radius={[4, 4, 0, 0]} />
                <Bar dataKey="received" fill="#3B82F6" name="Received" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">消息状态</h3>
          <div className="h-64">
            {pieData.length ? (rc &&
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">尚无数据</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">接触增长（30天）</h3>
          <div className="h-56">
            {contactData.length ? (rc &&
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={contactData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="contacts" stroke="#8B5CF6" fill="#EDE9FE" name="New Contacts" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">还没有新联系人</div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">最近的活动</h3>
            <Link href="/client/broadcasts" className="text-sm text-emerald-600 hover:underline">查看全部</Link>
          </div>
          <div className="space-y-3">
            {(data?.recentCampaigns || []).length ? (data?.recentCampaigns || []).map(c => (
              <div key={c._id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400">{translateDisplay(c.type)} ·发送 {c.stats?.sent || 0}{c.stats?.failed ? ` ·失败 ${c.stats.failed}` : ''}</p>
                </div>
                <Badge variant={c.status === 'completed' || c.status === 'running' ? 'success' : c.status === 'failed' ? 'danger' : 'default'}>{c.status}</Badge>
              </div>
            )) : <p className="text-sm text-gray-400">尚无活动</p>}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">最近的谈话</h3>
            <Link href="/client/chat" className="text-sm text-emerald-600 hover:underline">打开收件箱</Link>
          </div>
          <div className="space-y-3">
            {(data?.recentConversations || []).length ? (data?.recentConversations || []).map(c => (
              <div key={c._id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.contact?.name || c.contact?.phone}</p>
                  <p className="text-xs text-gray-400 truncate max-w-[180px]">{c.lastMessage?.text || ''}</p>
                </div>
                <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" />{new Date(c.updatedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
              </div>
            )) : <p className="text-sm text-gray-400">还没有对话</p>}
          </div>
        </Card>
      </div>

      {/* Quick counts */}
      <SectionTitle icon={<Zap className="w-4 h-4 text-white" />} title={"快速工具"} accent="bg-linear-to-br from-rose-500 to-red-500" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <L href="/client/save-money/templates"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><Zap className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">预设模板</p><p className="text-xl font-bold text-gray-900">{data?.presets || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/keywords"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Zap className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">自动回复关键字</p><p className="text-xl font-bold text-gray-900">{data?.keywords || 0}</p></div>
          </div>
        </Card></L>

      </div>
    </div>
  );
}
