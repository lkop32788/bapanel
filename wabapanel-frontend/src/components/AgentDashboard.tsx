'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Send, Clock, BellRing, Timer, TrendingUp, Users } from 'lucide-react';
import Card from '@/components/ui/Card';
import { StatCard } from '@/components/ui/Card';
import type * as RechartsModule from 'recharts';

export interface AgentPayload {
  role: 'agent';
  today?: { assigned?: number; awaitingReply?: number; sentToday?: number; avgResponseMins?: number };
  needsAction?: {
    unanswered?: Array<{ conversationId: string; contactName?: string; channel?: string; minutesWaiting: number }>;
    reminders?: Array<{ contactId: string; contactName?: string; remindAt: string; note?: string }>;
  };
  trends?: { daily?: Array<{ date: string; conversations: number; messages: number }> };
}

export interface AgentPerformanceRow {
  _id: string;
  name: string;
  assignedChats: number;
  resolvedChats: number;
  messagesSent: number;
  avgResponseMins: number | null;
}

const fmtDay = (d: string) => new Date(d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

export const isAgentPayload = (d: unknown): d is AgentPayload =>
  !!d && (d as { role?: string }).role === 'agent';

export function AgentStatCards({ data }: { data: AgentPayload }) {
  const t = data.today || {};
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard title="分配给我的会话" value={t.assigned || 0} icon={<MessageSquare className="w-6 h-6" />} color="blue" />
      <StatCard title="待我回复" value={t.awaitingReply || 0} icon={<BellRing className="w-6 h-6" />} color="orange" />
      <StatCard title="我今日已发送" value={t.sentToday || 0} icon={<Send className="w-6 h-6" />} color="emerald" />
      <StatCard title="我的平均响应" value={`${t.avgResponseMins || 0} 分钟`} icon={<Timer className="w-6 h-6" />} color="purple" />
    </div>
  );
}

export function AgentTrendCard({ data }: { data: AgentPayload }) {
  const [rc, setRc] = useState<typeof RechartsModule | null>(null);
  useEffect(() => { import('recharts').then((mod) => setRc(mod)).catch(() => {}); }, []);
  const { ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = rc || ({} as typeof RechartsModule);
  const daily = (data.trends?.daily || []).map(d => ({ date: fmtDay(d.date), conversations: d.conversations, messages: d.messages }));
  return (
    <Card>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">我的趋势</h3>
      <div className="h-64">
        {daily.length ? (rc && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="conversations" stroke="#8B5CF6" fill="#EDE9FE" name="会话" />
              <Bar dataKey="messages" fill="#10B981" name="消息" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        )) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">尚无数据</div>}
      </div>
    </Card>
  );
}

export function AgentNeedsAction({ data }: { data: AgentPayload }) {
  const unanswered = data.needsAction?.unanswered || [];
  const reminders = data.needsAction?.reminders || [];
  const empty = unanswered.length === 0 && reminders.length === 0;
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900">需要处理</h3>
        <Link href="/client/chat" className="text-sm text-emerald-600 hover:underline">打开收件箱</Link>
      </div>
      {empty ? (
        <p className="text-sm text-gray-400">太棒了，没有待处理的会话 🎉</p>
      ) : (
        <div className="space-y-4">
          {unanswered.length > 0 && (
            <div className="space-y-2.5">
              {unanswered.map(u => (
                <Link key={u.conversationId} href={`/client/chat?conv=${encodeURIComponent(u.conversationId)}`}
                  className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{u.contactName || '未知联系人'}</p>
                    <p className="text-xs text-gray-400 truncate">{u.channel || ''}</p>
                  </div>
                  <span className="text-xs text-red-500 shrink-0 flex items-center gap-1"><Clock className="w-3 h-3" />等待 {u.minutesWaiting} 分钟</span>
                </Link>
              ))}
            </div>
          )}
          {reminders.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-gray-500">今日提醒</p>
              {reminders.map(r => (
                <Link key={`${r.contactId}-${r.remindAt}`} href={`/client/chat?contact=${encodeURIComponent(r.contactId)}`}
                  className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.contactName || '未知联系人'}</p>
                    <p className="text-xs text-gray-400 truncate">{r.note || ''}</p>
                  </div>
                  <span className="text-xs text-orange-500 shrink-0">{new Date(r.remindAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function AgentPerformanceTable({ rows }: { rows?: AgentPerformanceRow[] }) {
  const sorted = [...(rows || [])].sort((a, b) => b.assignedChats - a.assignedChats);
  return (
    <Card>
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-emerald-600" />客服绩效</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="pb-2 font-medium">客服</th>
              <th className="pb-2 font-medium text-right">接待会话</th>
              <th className="pb-2 font-medium text-right">已解决</th>
              <th className="pb-2 font-medium text-right">发送消息</th>
              <th className="pb-2 font-medium text-right">平均响应(分钟)</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length ? sorted.map(a => (
              <tr key={a._id} className="border-b border-gray-50 last:border-0">
                <td className="py-2 font-medium text-gray-900">{a.name}</td>
                <td className="py-2 text-right">{a.assignedChats}</td>
                <td className="py-2 text-right text-emerald-600">{a.resolvedChats}</td>
                <td className="py-2 text-right">{a.messagesSent}</td>
                <td className="py-2 text-right">{a.avgResponseMins ?? '—'}</td>
              </tr>
            )) : <tr><td colSpan={5} className="py-8 text-center text-gray-400">暂无客服绩效数据</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function AgentDashboard({ data, userName }: { data: AgentPayload; userName?: string }) {
  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">我的工作台</h1>
          <p className="text-emerald-50 text-sm mt-1">欢迎回来， {userName} 👋</p>
        </div>
        <TrendingUp className="w-8 h-8 text-white/70" />
      </div>
      <AgentStatCards data={data} />
      <AgentNeedsAction data={data} />
      <AgentTrendCard data={data} />
    </div>
  );
}
