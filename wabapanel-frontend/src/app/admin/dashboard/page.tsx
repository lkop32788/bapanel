'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, MessageSquare, Building2, Send, Phone, TrendingUp, Clock, UserPlus, AlertTriangle, Activity, Shield, BarChart3 } from 'lucide-react';
import { StatCard } from '@/components/ui/Card';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import useKkhsTheme from '@/lib/useKkhsTheme';
import KkhsAdminOps, { KkhsAdminOpsData } from '@/components/kkhs/KkhsAdminOps';
import type * as RechartsModule from 'recharts'; // PERF-16: recharts is loaded on demand below

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const SectionTitle = ({ icon, title, accent }: { icon: React.ReactNode; title: string; accent: string }) => (
  <div data-ui-section-title className="flex items-center gap-2.5 mt-2">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>{icon}</div>
    <h2 className="text-base font-semibold text-gray-800">{title}</h2>
    <div className="flex-1 h-px bg-linear-to-r from-gray-200 to-transparent" />
  </div>
);

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="block cursor-pointer transition hover:-translate-y-0.5 hover:opacity-95">{children}</Link>
);

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

interface RecentUser {
  _id: string;
  name: string;
  email: string;
  
  status: string;
  createdAt: string;
  lastLogin?: string;
  
}

export default function AdminDashboard() {
  const [data, setData] = useState<{
    users: { total: number; active: number };

    recentSignups: RecentUser[];

    platform: { workspaces: number; msgSent30: number; msgRecv30: number; campaigns: number; aiCalls30: number;  msgToday: number } | null;
    todaySignups: number;

    userGrowthChart: Array<{ _id: string; count: number }>;
    ops?: KkhsAdminOpsData | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const kkhs = useKkhsTheme();
  // PERF-16: load the chart library in its own chunk, after the page shell (same pattern as client dashboard)
  const [rc, setRc] = useState<typeof RechartsModule | null>(null);
  useEffect(() => { import('recharts').then((mod) => setRc(mod)).catch(() => {}); }, []);
  const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } = rc || ({} as typeof RechartsModule);

  useEffect(() => {
    adminApi.getDashboard().then(r => {
      setData(r.data.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const d = data;

  const growthData = (d?.userGrowthChart || []).map(g => ({
    date: fmtDate(g._id),
    users: g.count,
  }));

  return (
    <div className="space-y-6">
      {kkhs ? (
        <KkhsAdminOps
          ops={d?.ops}
          totalVendors={d?.users?.total || 0}
          activeVendors={d?.users?.active || 0}

          msgToday={d?.platform?.msgToday || 0}
          workspaces={d?.platform?.workspaces || 0}

        />
      ) : (<>
      {/* Hero */}
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">管理仪表板</h1>
          <p className="text-emerald-50 text-sm mt-1">平台概述、商户和收入一览</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 text-white rounded-lg text-sm font-medium backdrop-blur">
            <Shield className="w-4 h-4" /> 超级管理员
          </span>
        </div>
      </div>

      </>)}

      {/* Today at a Glance */}
      <SectionTitle icon={<Clock className="w-4 h-4 text-white" />} title={"今天一览"} accent="bg-linear-to-br from-orange-400 to-amber-500" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <L href="/admin/vendors"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><UserPlus className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">今日新注册</p><p className="text-xl font-bold text-gray-900">{d?.todaySignups || 0}</p></div>
          </div>
        </Card></L>
        
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><MessageSquare className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-xs text-gray-500">今天的消息</p><p className="text-xl font-bold text-gray-900">{(d?.platform?.msgToday || 0).toLocaleString()}</p></div>
          </div>
        </Card>
        
      </div>

      {/* Platform Overview */}
      <SectionTitle icon={<Activity className="w-4 h-4 text-white" />} title={"平台概述"} accent="bg-linear-to-br from-emerald-500 to-teal-500" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <L href="/admin/vendors"><StatCard title={"商户总数"} value={d?.users?.total || 0} icon={<Users className="w-6 h-6" />} color="emerald" /></L>
        <L href="/admin/vendors"><StatCard title={"活跃商户"} value={d?.users?.active || 0} icon={<Users className="w-6 h-6" />} color="blue" /></L>

      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={"工作空间"} value={d?.platform?.workspaces || 0} icon={<Building2 className="w-6 h-6" />} color="emerald" />
        <StatCard title={"已发送消息（30 天）"} value={(d?.platform?.msgSent30 || 0).toLocaleString()} icon={<Send className="w-6 h-6" />} color="blue" />
        <StatCard title={"收到的消息（30 天）"} value={(d?.platform?.msgRecv30 || 0).toLocaleString()} icon={<MessageSquare className="w-6 h-6" />} color="purple" />
        <StatCard title={"人工智能通话（30天）"} value={d?.platform?.aiCalls30 || 0} icon={<Phone className="w-6 h-6" />} color="orange" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={"活动总数"} value={d?.platform?.campaigns || 0} icon={<Send className="w-6 h-6" />} color="emerald" />

      </div>

      {/* Action Needed */}
      <SectionTitle icon={<AlertTriangle className="w-4 h-4 text-white" />} title={"需要采取行动"} accent="bg-linear-to-br from-red-500 to-rose-500" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="grid grid-cols-2 gap-4">
          <L href="/admin/vendors"><Card className="!p-4 h-full">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">商户管理</p>
              <p className="text-lg font-bold text-gray-900">{d?.users?.total || 0}</p>
              <p className="text-[11px] text-gray-400">{d?.users?.active || 0} 活跃</p>
            </div>
          </Card></L>
          <L href="/admin/settings"><Card className="!p-4 h-full">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">设置</p>
              <p className="text-lg font-bold text-gray-900">配置</p>
              <p className="text-[11px] text-gray-400">SMTP、品牌</p>
            </div>
          </Card></L>
        </div>
      </div>

      {/* Charts */}
      <SectionTitle icon={<BarChart3 className="w-4 h-4 text-white" />} title={"分析与趋势"} accent="bg-linear-to-br from-purple-500 to-fuchsia-500" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">用户增长（30 天）</h3>
          <div className="h-56">
            {growthData.length > 0 ? (rc &&
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="users" stroke="#8B5CF6" fill="#EDE9FE" name="New Users" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">尚无增长数据</div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">最近注册</h3>
            <Link href="/admin/vendors" className="text-sm text-emerald-600 hover:underline">查看全部</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-xs font-medium text-gray-500">用户</th>
                  
                  <th className="text-left py-2 text-xs font-medium text-gray-500">状态</th>
                  <th className="text-left py-2 text-xs font-medium text-gray-500">已加入</th>
                </tr>
              </thead>
              <tbody>
                {(d?.recentSignups || []).map(u => (
                  <tr key={u._id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-xs font-semibold text-emerald-600">
                          {u.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    
                    <td className="py-2.5">
                      <Badge variant={u.status === 'active' ? 'success' : 'default'}>{u.status}</Badge>
                    </td>
                    <td className="py-2.5 text-gray-500">{fmtDate(u.createdAt)}</td>
                  </tr>
                ))}
                {!(d?.recentSignups || []).length && (
                  <tr><td colSpan={4} className="py-4 text-center text-gray-400">还没有用户</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Quick Tools */}
      <SectionTitle icon={<TrendingUp className="w-4 h-4 text-white" />} title={"快速行动"} accent="bg-linear-to-br from-rose-500 to-red-500" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <L href="/admin/vendors"><Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><Users className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">管理商户</p><p className="text-sm font-bold text-gray-900">查看全部</p></div>
          </div>
        </Card></L>
      </div>
    </div>
  );
}
