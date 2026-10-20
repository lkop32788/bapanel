'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import React, { useState, useEffect, useCallback } from 'react';

import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Send, CheckCheck, Eye, AlertCircle, MessageSquare, Users, Phone, Megaphone, TrendingUp, Download, Clock, Timer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import api from '@/lib/api';
import useBranding from '@/lib/useBranding';
import Link from 'next/link';
import { isAgentPayload, AgentStatCards, AgentTrendCard, AgentPerformanceTable, type AgentPayload, type AgentPerformanceRow } from '@/components/AgentDashboard';

interface DashData {
  contacts: number;
  conversations: { total: number; active: number };
  messages: { sent: number; delivered: number; read: number; failed: number; total: number };
  messageChart: { _id: string; sent: number; received: number; total: number }[];
  campaigns?: { total: number; running: number; scheduled: number; completed: number; draft: number; paused: number; failed: number; sentTotal: number };
  templates?: { total: number; approved: number; pending: number; rejected: number };
  aiCalls?: { total: number; completed: number; failed: number; minutes: number };
  callChart?: { _id: string; count: number; seconds: number }[];
  contactChart?: { _id: string; count: number }[];
  newContacts?: number;
  
  unreadCount?: number;
  
  hourlyActivity?: { hour: number; count: number }[];
  weekdayActivity?: { day: number; count: number }[];
  topCustomers?: { _id: string; name?: string; phone?: string; total: number; inbound: number; outbound: number; lastAt: string }[];
  campaignTable?: { _id: string; name: string; type: string; status: string; createdAt: string; stats?: { sent?: number; delivered?: number; read?: number; failed?: number; skipped?: number } }[];
  typeBreakdown?: { source: string; count: number }[];
  responseTime?: { avgMinutes: number; medianMinutes: number; samples: number };
  role?: 'owner' | 'agent';
  agentPerformance?: AgentPerformanceRow[];
}

const RANGES = [
  { value: 7, label: "7 天" },
  { value: 30, label: "30 天" },
  { value: 90, label: "90 天" },
];

const PIE_COLORS = ['#10B981', '#F59E0B', '#3B82F6', '#8B5CF6', '#EF4444', '#6B7280', '#EC4899', '#14B8A6'];
const WEEKDAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SOURCE_LABELS: Record<string, string> = {
  manual: "手册/聊天",
  template: "元模板",
  preset: "预设（收件箱）",
  preset_campaign: "预设活动",
  campaign: "广播活动",
  drip: "滴水活动",
  keyword_auto_reply: "关键字自动回复",
  ai_auto_reply: "人工智能自动回复",
  ai_call: "人工智能呼叫",
  ai_call_summary: "人工智能通话摘要",
  ai_handoff: "人工智能切换",
  preset_button_value: "按钮自动回复",
  welcome: "欢迎辞",
  out_of_office: "不在办公室",
  automation: 'Automation',
};

const sourceLabel = (s: string) => SOURCE_LABELS[s] || (s.startsWith('appointment') ? 'Appointment' : s.replace(/_/g, ' '));

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="block cursor-pointer transition hover:-translate-y-0.5 hover:opacity-95">{children}</Link>
);

const fmtDate = (d: string) => new Date(d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
const fmtHour = (h: number) => `${((h % 12) || 12)}${h < 12 ? 'am' : 'pm'}`;
const fmtMins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${m} min`);

// 紧凑 KPI 磁贴（与 client/dashboard 同一视觉语言）：图标 + 数值 + 标签 +（可选）副文本
const Kpi = ({ href, label, value, sub, icon, bg, warn }: {
  href?: string; label: string; value: string | number; sub?: string; icon: React.ReactNode; bg: string; warn?: boolean;
}) => {
  const body = (
    <Card className="!p-3.5 h-full">
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>{icon}</div>
        <div className="min-w-0">
          <p className={`text-xl font-bold leading-tight ${warn ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
          <p className="text-[11px] text-gray-500 truncate">{label}</p>
          {sub && <p className="text-[11px] text-gray-400 truncate mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  );
  return href ? <L href={href}>{body}</L> : body;
};

// 分区标题：细强调条 + 标签，给长页面建立层次（非装饰性 eyebrow）
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2 pt-1">
    <span className="w-1 h-4 rounded-full bg-emerald-500" />
    <h2 className="text-sm font-semibold text-gray-700">{children}</h2>
  </div>
);

// 图表卡标题（统一尺寸/间距，替代散落的 text-lg h3）
const ChartTitle = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="mb-4">
    <h3 className="text-base font-semibold text-gray-900">{title}</h3>
    {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
  </div>
);

export default function AnalyticsPage() {
  const router = useRouter();
  const brand = useBranding();
  const [data, setData] = useState<DashData | null>(null);
  const [agentData, setAgentData] = useState<AgentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [campStatus, setCampStatus] = useState('all');
  const [campType, setCampType] = useState('all');
  const [showAllCamps, setShowAllCamps] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(range
        ? `/dashboard/client?from=${range.from}&to=${range.to}`
        : `/dashboard/client?days=${days}`);
      if (isAgentPayload(res.data.data)) { setAgentData(res.data.data); setData(null); }
      else { setAgentData(null); setData(res.data.data); }
    } catch { /* empty */ }
    setLoading(false);
  }, [days, range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const chartData = (data?.messageChart || []).map(d => ({ date: fmtDate(d._id), sent: d.sent, received: d.received, total: d.total }));
  const contactData = (data?.contactChart || []).map(d => ({ date: fmtDate(d._id), contacts: d.count }));
  const callData = (data?.callChart || []).map(d => ({ date: fmtDate(d._id), calls: d.count, minutes: Math.round((d.seconds || 0) / 60) }));

  const hourlyData = Array.from({ length: 24 }, (_, h) => ({
    hour: fmtHour(h),
    replies: (data?.hourlyActivity || []).find(x => x.hour === h)?.count || 0,
  }));
  const weekdayData = [1, 2, 3, 4, 5, 6, 7].map(d => ({
    day: WEEKDAYS[d],
    replies: (data?.weekdayActivity || []).find(x => x.day === d)?.count || 0,
  }));
  const bestHour = (data?.hourlyActivity || []).slice().sort((a, b) => b.count - a.count)[0];
  const bestDay = (data?.weekdayActivity || []).slice().sort((a, b) => b.count - a.count)[0];

  const typeData = (data?.typeBreakdown || []).map(t => ({ name: sourceLabel(t.source), value: t.count }));

  const totalMessages = data?.messages?.total || 0;
  const totalSent = data?.messages?.sent || 0;
  const totalDelivered = data?.messages?.delivered || 0;
  const totalRead = data?.messages?.read || 0;
  const totalFailed = data?.messages?.failed || 0;
  const outbound = totalSent + totalDelivered + totalRead + totalFailed;

  const deliveryRate = outbound > 0 ? (((totalDelivered + totalRead) / outbound) * 100).toFixed(1) : '0';
  const readRate = outbound > 0 ? ((totalRead / outbound) * 100).toFixed(1) : '0';
  const failRate = outbound > 0 ? ((totalFailed / outbound) * 100).toFixed(1) : '0';

  const c = data?.campaigns;
  const campaignPie = [
    { name: 'Completed', value: c?.completed || 0 },
    { name: 'Draft', value: c?.draft || 0 },
    { name: 'Running', value: c?.running || 0 },
    { name: 'Scheduled', value: c?.scheduled || 0 },
    { name: 'Failed', value: c?.failed || 0 },
    { name: 'Paused', value: c?.paused || 0 },
  ].filter(d => d.value > 0);

  const allCamps = data?.campaignTable || [];
  const campTypes = Array.from(new Set(allCamps.map(cp => cp.type).filter(Boolean)));
  const campStatuses = Array.from(new Set(allCamps.map(cp => cp.status).filter(Boolean)));
  const filteredCamps = allCamps.filter(cp =>
    (campStatus === 'all' || cp.status === campStatus) && (campType === 'all' || cp.type === campType));
  const visibleCamps = showAllCamps ? filteredCamps : filteredCamps.slice(0, 10);

  const rangeLabel = range
    ? (range.from === range.to ? range.from : `${range.from} to ${range.to}`)
    : `last ${days} days`;

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    const from = customFrom <= customTo ? customFrom : customTo;
    const to = customFrom <= customTo ? customTo : customFrom;
    setRange({ from, to });
  };

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    lines.push(`${brand.name} 分析导出，${rangeLabel}，生成 ${new Date().toLocaleString('zh-CN')}`);
    lines.push('');
    lines.push('SUMMARY');
    lines.push(`消息总数，${totalMessages}`);
    lines.push(`已交付，${totalDelivered}，交货率，${deliveryRate}%`);
    lines.push(`读，${totalRead}，读取速率，${readRate}%`);
    lines.push(`失败，${totalFailed}，失败率，${failRate}%`);
    lines.push(`联系人，${data.contacts}，新联系人，${data.newContacts || 0}`);
    lines.push(`对话，${data.conversations?.total || 0}，活跃，${data.conversations?.active || 0}`);
    lines.push(`人工智能呼叫，${data.aiCalls?.total || 0}，分钟，${data.aiCalls?.minutes || 0}`);
    
    lines.push(`平均响应时间（分钟），${data.responseTime?.avgMinutes || 0}，中位数（分钟），${data.responseTime?.medianMinutes || 0}`);
    lines.push('');
    lines.push('DAILY MESSAGES');
    lines.push("日期、发送、接收、总计");
    (data.messageChart || []).forEach(d => lines.push(`${d._id},${d.sent},${d.received},${d.total}`));
    lines.push('');
    lines.push("消息类型（出站）");
    lines.push("类型，计数");
    (data.typeBreakdown || []).forEach(t => lines.push(`${esc(sourceLabel(t.source))},${t.count}`));
    lines.push('');
    lines.push('TOP CUSTOMERS');
    lines.push("姓名、电话、消息总数、已接收、已发送、上次活动");
    (data.topCustomers || []).forEach(t => lines.push(`${esc(t.name)},${esc(t.phone)},${t.total},${t.inbound},${t.outbound},${new Date(t.lastAt).toLocaleString('zh-CN')}`));
    lines.push('');
    lines.push('CAMPAIGNS');
    lines.push("名称、类型、状态、已发送、已送达、已读、失败、已跳过、已创建");
    (data.campaignTable || []).forEach(cp => lines.push(`${esc(cp.name)},${cp.type},${cp.status},${cp.stats?.sent || 0},${cp.stats?.delivered || 0},${cp.stats?.read || 0},${cp.stats?.failed || 0},${cp.stats?.skipped || 0},${new Date(cp.createdAt).toLocaleDateString('zh-CN')}`));
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${range ? `${range.from}_${range.to}` : `${days}days`}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (agentData) {
    return (
      <div className="space-y-6">
        <div className="page-hero">
          <h1 className="text-2xl font-bold text-gray-900">数据分析</h1>
          <p className="text-gray-500 text-sm mt-1">我的个人表现</p>
        </div>
        <AgentStatCards data={agentData} />
        <AgentTrendCard data={agentData} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">数据分析</h1>
          <p className="text-gray-500 text-sm mt-1">完整的性能概述· {rangeLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {RANGES.map(r => (
              <button key={r.value} onClick={() => { setRange(null); setDays(r.value); }}
                className={`px-3 py-1.5 text-sm rounded-md font-medium ${!range && days === r.value ? 'bg-white shadow text-emerald-700' : 'text-gray-500 hover:text-gray-700'}`}>
                {r.label}
              </button>
            ))}
          </div>
          <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${range ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
            <input type="date" value={customFrom} max={customTo || undefined}
              onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
              onChange={e => setCustomFrom(e.target.value)}
              className="text-sm px-1.5 py-1 rounded border border-gray-200 text-gray-700" />
            <span className="text-gray-400 text-xs">to</span>
            <input type="date" value={customTo} min={customFrom || undefined}
              onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
              onChange={e => setCustomTo(e.target.value)}
              className="text-sm px-1.5 py-1 rounded border border-gray-200 text-gray-700" />
            <button onClick={applyCustom} disabled={!customFrom || !customTo}
              className="px-2.5 py-1 text-sm rounded-md bg-emerald-600 text-white font-medium disabled:opacity-40">申请</button>
            {range && (
              <button onClick={() => { setRange(null); setCustomFrom(''); setCustomTo(''); }}
                className="px-2 py-1 text-sm rounded-md text-gray-500 hover:text-gray-700">清除</button>
            )}
          </div>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
            <Download className="w-4 h-4" /> 导出 CSV
          </button>
        </div>
      </div>

      {/* ① 消息与受众：核心健康指标一行看全 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi href="/client/chat" label="消息总数" value={totalMessages.toLocaleString()} icon={<Send className="w-4 h-4 text-emerald-600" />} bg="bg-emerald-50" />
        <Kpi href="/client/chat" label="交货率" value={`${deliveryRate}%`} sub={`${(totalDelivered + totalRead).toLocaleString()} 已送达`} icon={<CheckCheck className="w-4 h-4 text-blue-600" />} bg="bg-blue-50" />
        <Kpi href="/client/chat" label="读取率" value={`${readRate}%`} sub={`${totalRead.toLocaleString()} 已读`} icon={<Eye className="w-4 h-4 text-violet-600" />} bg="bg-violet-50" />
        <Kpi href="/client/chat" label="失败率" value={`${failRate}%`} sub={`${totalFailed.toLocaleString()} 失败`} icon={<AlertCircle className="w-4 h-4 text-red-500" />} bg="bg-red-50" warn={totalFailed > 0} />
        <Kpi href="/client/contacts" label="联系人" value={(data?.contacts || 0).toLocaleString()} sub={`+${data?.newContacts || 0} 新增`} icon={<Users className="w-4 h-4 text-indigo-600" />} bg="bg-indigo-50" />
        <Kpi href="/client/chat" label="对话" value={(data?.conversations?.total || 0).toLocaleString()} sub={`${data?.conversations?.active || 0} 活跃`} icon={<MessageSquare className="w-4 h-4 text-teal-600" />} bg="bg-teal-50" />
      </div>

      {/* ② 响应与运营：服务质量 + 活动/AI 存量（取代原底部重复 summary 行） */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi href="/client/chat" label="平均响应" value={fmtMins(data?.responseTime?.avgMinutes || 0)} icon={<Timer className="w-4 h-4 text-emerald-600" />} bg="bg-emerald-50" />
        <Kpi href="/client/chat" label="中值响应" value={fmtMins(data?.responseTime?.medianMinutes || 0)} icon={<Clock className="w-4 h-4 text-blue-600" />} bg="bg-blue-50" />
        <Kpi label="最佳发送时间" value={bestHour ? `${fmtHour(bestHour.hour)}${bestDay ? ` · ${WEEKDAYS[bestDay.day]}` : ''}` : '—'} icon={<TrendingUp className="w-4 h-4 text-violet-600" />} bg="bg-violet-50" />
        <Kpi href="/client/ai-calling" label="AI 呼叫" value={(data?.aiCalls?.total || 0).toLocaleString()} sub={`${data?.aiCalls?.minutes || 0} 分钟 · ${data?.aiCalls?.completed || 0} 完成`} icon={<Phone className="w-4 h-4 text-indigo-600" />} bg="bg-indigo-50" />
        <Kpi href="/client/broadcasts" label="活动总数" value={(c?.total || 0).toLocaleString()} sub={`${c?.running || 0} 进行中`} icon={<Megaphone className="w-4 h-4 text-purple-600" />} bg="bg-purple-50" />
        <Kpi href="/client/broadcasts" label="活动已发消息" value={(c?.sentTotal || 0).toLocaleString()} icon={<Send className="w-4 h-4 text-teal-600" />} bg="bg-teal-50" />
      </div>

      <SectionLabel>消息趋势</SectionLabel>
      {chartData.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <ChartTitle title="消息量" hint="每日发送与接收趋势" />
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="sent" stroke="#10B981" fill="url(#colorSent)" name="Sent" />
                  <Area type="monotone" dataKey="received" stroke="#3B82F6" fill="transparent" name="Received" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <ChartTitle title="每日明细" hint="发送 / 接收逐日对比" />
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="sent" fill="#10B981" name="Sent" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="received" fill="#3B82F6" name="Received" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <div className="text-center py-12">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">此期间没有消息数据。</p>
          </div>
        </Card>
      )}

      <SectionLabel>客户活跃时段</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <ChartTitle title="按小时的客户回复" hint="收到回复最多的时段 — 群发的最佳时间" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" fontSize={10} interval={1} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="replies" fill="#8B5CF6" name="Replies" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <ChartTitle title="按星期的客户回复" hint="客户在一周中哪几天最活跃" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" fontSize={12} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="replies" fill="#10B981" name="Replies" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <SectionLabel>构成与客户</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <ChartTitle title="出站消息类型" hint="按来源拆分已发出的消息" />
          <div className="h-80">
            {typeData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={90} label>
                    {typeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">尚无出站消息</div>}
          </div>
        </Card>
        <Card>
          <ChartTitle title="高频客户" hint="互动消息最多的联系人" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">客户</th>
                  <th className="pb-2 font-medium text-right">总计</th>
                  <th className="pb-2 font-medium text-right">已收到</th>
                  <th className="pb-2 font-medium text-right">已发送</th>
                  <th className="pb-2 font-medium text-right">最后活跃</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topCustomers || []).length ? (data?.topCustomers || []).map(t => (
                  <tr key={t._id} onClick={() => router.push('/client/chat')} className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50">
                    <td className="py-2">
                      <p className="font-medium text-gray-900">{t.name || t.phone}</p>
                      <p className="text-xs text-gray-400">{t.phone}</p>
                    </td>
                    <td className="py-2 text-right font-semibold">{t.total}</td>
                    <td className="py-2 text-right text-blue-600">{t.inbound}</td>
                    <td className="py-2 text-right text-emerald-600">{t.outbound}</td>
                    <td className="py-2 text-right text-xs text-gray-400">{fmtDate(t.lastAt)}</td>
                  </tr>
                )) : <tr><td colSpan={5} className="py-8 text-center text-gray-400">尚无数据</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <SectionLabel>活动表现</SectionLabel>
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="text-base font-semibold text-gray-900">各营销活动投递对比</h3>
          <div className="flex items-center gap-2">
            <select value={campStatus} onChange={e => { setCampStatus(e.target.value); setShowAllCamps(false); }}
              className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 bg-white">
              <option value="all">所有状态</option>
              {campStatuses.map(st => <option key={st} value={st}>{translateDisplay(st)}</option>)}
            </select>
            <select value={campType} onChange={e => { setCampType(e.target.value); setShowAllCamps(false); }}
              className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 bg-white">
              <option value="all">所有类型</option>
              {campTypes.map(tp => <option key={tp} value={tp}>{translateDisplay(tp)}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 font-medium">营销活动</th>
                <th className="pb-2 font-medium">类型</th>
                <th className="pb-2 font-medium">状态</th>
                <th className="pb-2 font-medium text-right">已发送</th>
                <th className="pb-2 font-medium text-right">已交付</th>
                <th className="pb-2 font-medium text-right">读</th>
                <th className="pb-2 font-medium text-right">操作失败</th>
                <th className="pb-2 font-medium text-right">读取率</th>
                <th className="pb-2 font-medium text-right">已创建</th>
              </tr>
            </thead>
            <tbody>
              {visibleCamps.length ? visibleCamps.map(cp => {
                const sent = cp.stats?.sent || 0;
                const read = cp.stats?.read || 0;
                const rr = sent > 0 ? ((read / sent) * 100).toFixed(0) + '%' : '—';
                return (
                  <tr key={cp._id} onClick={() => router.push(cp.type === 'preset' ? '/client/save-money/campaigns' : '/client/broadcasts')} className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50">
                    <td className="py-2 font-medium text-gray-900">{cp.name}</td>
                    <td className="py-2 text-gray-500">{translateDisplay(cp.type)}</td>
                    <td className="py-2"><Badge variant={cp.status === 'completed' || cp.status === 'running' ? 'success' : cp.status === 'failed' ? 'danger' : 'default'}>{cp.status}</Badge></td>
                    <td className="py-2 text-right">{sent}</td>
                    <td className="py-2 text-right">{cp.stats?.delivered || 0}</td>
                    <td className="py-2 text-right">{read}</td>
                    <td className="py-2 text-right text-red-500">{cp.stats?.failed || 0}</td>
                    <td className="py-2 text-right">{rr}</td>
                    <td className="py-2 text-right text-xs text-gray-400">{fmtDate(cp.createdAt)}</td>
                  </tr>
                );
              }) : <tr><td colSpan={9} className="py-8 text-center text-gray-400">未找到广告系列</td></tr>}
            </tbody>
          </table>
        </div>
        {filteredCamps.length > 10 && (
          <div className="mt-3 text-center">
            <button onClick={() => setShowAllCamps(v => !v)} className="text-sm text-emerald-600 font-medium hover:underline">
              {showAllCamps ? "显示较少" : `显示全部 (${filteredCamps.length})`}
            </button>
          </div>
        )}
      </Card>

      <SectionLabel>增长与渠道</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <ChartTitle title="联系人增长" />
          <div className="h-64">
            {contactData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={contactData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="contacts" stroke="#8B5CF6" fill="#EDE9FE" name="New Contacts" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">此期间没有新联系人</div>}
          </div>
        </Card>

        <Card>
          <ChartTitle title="AI 呼叫" hint="每日通话量与通话分钟" />
          <div className="h-64">
            {callData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={callData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="calls" fill="#3B82F6" name="Calls" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="minutes" fill="#10B981" name="Minutes" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">此期间没有AI呼叫</div>}
          </div>
        </Card>

        <Card>
          <ChartTitle title="活动（按状态）" />
          <div className="h-64">
            {campaignPie.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={campaignPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label>
                    {campaignPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">尚无活动</div>}
          </div>
        </Card>
      </div>

      {data?.role === 'owner' && (
        <>
          <SectionLabel>客服绩效</SectionLabel>
          <AgentPerformanceTable rows={data.agentPerformance} />
        </>
      )}
    </div>
  );
}
