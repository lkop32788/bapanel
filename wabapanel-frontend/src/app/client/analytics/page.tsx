'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import React, { useState, useEffect, useCallback } from 'react';

import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import { StatCard } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Send, CheckCheck, Eye, AlertCircle, MessageSquare, Users, Phone, Megaphone, TrendingUp, Download, Clock, Timer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import api from '@/lib/api';
import useBranding from '@/lib/useBranding';
import Link from 'next/link';

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

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
const fmtHour = (h: number) => `${((h % 12) || 12)}${h < 12 ? 'am' : 'pm'}`;
const fmtMins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${m} min`);

export default function AnalyticsPage() {
  const router = useRouter();
  const brand = useBranding();
  const [data, setData] = useState<DashData | null>(null);
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
      setData(res.data.data);
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
    lines.push(`${brand.name} 分析导出，${rangeLabel}，生成 ${new Date().toLocaleString('en-IN')}`);
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
    (data.topCustomers || []).forEach(t => lines.push(`${esc(t.name)},${esc(t.phone)},${t.total},${t.inbound},${t.outbound},${new Date(t.lastAt).toLocaleString('en-IN')}`));
    lines.push('');
    lines.push('CAMPAIGNS');
    lines.push("名称、类型、状态、已发送、已送达、已读、失败、已跳过、已创建");
    (data.campaignTable || []).forEach(cp => lines.push(`${esc(cp.name)},${cp.type},${cp.status},${cp.stats?.sent || 0},${cp.stats?.delivered || 0},${cp.stats?.read || 0},${cp.stats?.failed || 0},${cp.stats?.skipped || 0},${new Date(cp.createdAt).toLocaleDateString('en-IN')}`));
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

      {/* Message metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <L href="/client/chat"><StatCard title={"消息总数"} value={totalMessages.toLocaleString()} icon={<Send className="w-6 h-6" />} change={rangeLabel} color="emerald" /></L>
        <L href="/client/chat"><StatCard title={"交货率"} value={`${deliveryRate}%`} icon={<CheckCheck className="w-6 h-6" />} change={`${(totalDelivered + totalRead).toLocaleString()} delivered`} color="blue" /></L>
        <L href="/client/chat"><StatCard title={"读取率"} value={`${readRate}%`} icon={<Eye className="w-6 h-6" />} change={`${totalRead.toLocaleString()} read`} color="purple" /></L>
        <L href="/client/chat"><StatCard title={"失败率"} value={`${failRate}%`} icon={<AlertCircle className="w-6 h-6" />} change={`${totalFailed.toLocaleString()} failed`} color="red" /></L>
      </div>

      {/* Business metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <L href="/client/contacts"><StatCard title={"联系人"} value={(data?.contacts || 0).toLocaleString()} icon={<Users className="w-6 h-6" />} change={`+${data?.newContacts || 0} new`} color="blue" /></L>
        <L href="/client/chat"><StatCard title={"对话"} value={(data?.conversations?.total || 0).toLocaleString()} icon={<MessageSquare className="w-6 h-6" />} change={`${data?.conversations?.active || 0} active`} color="emerald" /></L>
        <L href="/client/ai-calling"><StatCard title={"人工智能呼叫"} value={(data?.aiCalls?.total || 0).toLocaleString()} icon={<Phone className="w-6 h-6" />} change={`${data?.aiCalls?.minutes || 0} minutes`} color="purple" /></L>
        
      </div>

      {/* Response time */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <L href="/client/chat"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><Timer className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">平均响应时间</p><p className="text-xl font-bold text-gray-900">{fmtMins(data?.responseTime?.avgMinutes || 0)}</p></div>
          </div>
        </Card></L>
        <L href="/client/chat"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Clock className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">中值响应时间</p><p className="text-xl font-bold text-gray-900">{fmtMins(data?.responseTime?.medianMinutes || 0)}</p></div>
          </div>
        </Card></L>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><TrendingUp className="w-5 h-5 text-purple-600" /></div>
            <div>
              <p className="text-xs text-gray-500">最佳发送时间</p>
              <p className="text-xl font-bold text-gray-900">{bestHour ? `${fmtHour(bestHour.hour)}${bestDay ? ` · ${WEEKDAYS[bestDay.day]}` : ''}` : '—'}</p>
            </div>
          </div>
        </Card>
      </div>

      {chartData.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">留言量</h3>
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4">每日细目</h3>
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

      {/* Best time to send */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">按小时划分的客户回复 (IST)</h3>
          <p className="text-xs text-gray-400 mb-4">收到最多回复的时间 — 发送的最佳时间</p>
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
          <h3 className="text-lg font-semibold text-gray-900 mb-1">客户每日回复</h3>
          <p className="text-xs text-gray-400 mb-4">您的客户在一周中哪几天最活跃</p>
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

      {/* Message type breakdown + top customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">出站消息类型</h3>
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">顶级客户</h3>
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

      {/* Campaign comparison table */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">活动表现</h3>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">联系增长</h3>
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">人工智能呼叫</h3>
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">活动（按状态）</h3>
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

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <L href="/client/broadcasts"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><Megaphone className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-xs text-gray-500">已发送活动消息</p><p className="text-xl font-bold text-gray-900">{c?.sentTotal || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/broadcasts"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><TrendingUp className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">活动总数</p><p className="text-xl font-bold text-gray-900">{c?.total || 0}</p></div>
          </div>
        </Card></L>
        <L href="/client/ai-calling"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Phone className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">人工智能通话已完成</p><p className="text-xl font-bold text-gray-900">{data?.aiCalls?.completed || 0}</p></div>
          </div>
        </Card></L>
        
      </div>
    </div>
  );
}
