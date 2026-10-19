'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, MessageSquare, Building2, Send, UserPlus, Shield, Wallet, Megaphone, Settings, ClipboardList } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import useKkhsTheme from '@/lib/useKkhsTheme';
import KkhsAdminOps, { KkhsAdminOpsData } from '@/components/kkhs/KkhsAdminOps';
import type * as RechartsModule from 'recharts'; // PERF-16: recharts is loaded on demand below

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="block cursor-pointer transition hover:-translate-y-0.5 hover:opacity-95">{children}</Link>
);

const fmtDate = (d: string) => new Date(d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
const round2 = (n: number) => Math.round(n * 100) / 100;

interface RecentUser {
  _id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  lastLogin?: string;
}

interface MoneyOverview {
  totalBalance: number;   // 全部商户钱包余额合计（元）
  walletCount: number;
  paid30Count: number;    // 近 30 天已入账 USDT 订单
  paid30Rmb: number;      // 近 30 天入账金额（元）
  pendingTopups: number;  // 待审批线下充值申请
}

export default function AdminDashboard() {
  const [data, setData] = useState<{
    users: { total: number; active: number };
    recentSignups: RecentUser[];
    platform: { workspaces: number; msgSent30: number; msgRecv30: number; campaigns: number; aiCalls30: number; msgToday: number } | null;
    todaySignups: number;
    userGrowthChart: Array<{ _id: string; count: number }>;
    ops?: KkhsAdminOpsData | null;
  } | null>(null);
  const [money, setMoney] = useState<MoneyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const kkhs = useKkhsTheme();
  // PERF-16: load the chart library in its own chunk, after the page shell (same pattern as client dashboard)
  const [rc, setRc] = useState<typeof RechartsModule | null>(null);
  useEffect(() => { import('recharts').then((mod) => setRc(mod)).catch(() => {}); }, []);
  const { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } = rc || ({} as typeof RechartsModule);

  useEffect(() => {
    adminApi.getDashboard().then(r => {
      setData(r.data.data);
    }).catch(() => {}).finally(() => setLoading(false));
    // 资金概览：钱包合计 / 近30天入账 / 待审批申请（superAdmin 接口，普通 admin 拿不到就不展示）
    Promise.allSettled([
      adminApi.saverWallets(),
      adminApi.saverUsdtOrders('paid'),
      adminApi.saverTopupRequests('pending'),
    ]).then(([w, o, t]) => {
      const wallets = w.status === 'fulfilled' ? (w.value.data.data || []) : null;
      if (!wallets) return; // 无权限（非超管）时整块隐藏
      const orders = o.status === 'fulfilled' ? (o.value.data.data || []) : [];
      const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
      const paid30 = orders.filter((x: { paidAt?: string }) => x.paidAt && new Date(x.paidAt).getTime() >= cutoff);
      setMoney({
        totalBalance: round2(wallets.reduce((s: number, x: { balance?: number }) => s + (x.balance || 0), 0)),
        walletCount: wallets.length,
        paid30Count: paid30.length,
        paid30Rmb: round2(paid30.reduce((s: number, x: { credits?: number }) => s + (x.credits || 0), 0)),
        pendingTopups: t.status === 'fulfilled' ? (t.value.data.data || []).length : 0,
      });
    }).catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const d = data;
  const p = d?.platform;

  const growthData = (d?.userGrowthChart || []).map(g => ({ date: fmtDate(g._id), users: g.count }));

  return (
    <div className="space-y-6">
      {kkhs ? (
        <KkhsAdminOps
          ops={d?.ops}
          totalVendors={d?.users?.total || 0}
          activeVendors={d?.users?.active || 0}
          msgToday={p?.msgToday || 0}
          workspaces={p?.workspaces || 0}
        />
      ) : (<>
      {/* Hero */}
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">管理仪表板</h1>
          <p className="text-emerald-50 text-sm mt-1">平台概况、商户与资金一览</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 text-white rounded-lg text-sm font-medium backdrop-blur">
            <Shield className="w-4 h-4" /> 超级管理员
          </span>
        </div>
      </div>
      </>)}

      {/* ① 核心指标：一行 6 个 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { href: '/admin/vendors', label: '今日新注册', value: d?.todaySignups || 0, icon: <UserPlus className="w-4 h-4 text-emerald-600" />, bg: 'bg-emerald-50' },
          { href: '/admin/vendors', label: '今日消息量', value: (p?.msgToday || 0).toLocaleString(), icon: <MessageSquare className="w-4 h-4 text-blue-600" />, bg: 'bg-blue-50' },
          { href: '/admin/vendors', label: '商户（活跃/总数）', value: `${d?.users?.active || 0} / ${d?.users?.total || 0}`, icon: <Users className="w-4 h-4 text-indigo-600" />, bg: 'bg-indigo-50' },
          { href: '/admin/vendors', label: '工作空间', value: p?.workspaces || 0, icon: <Building2 className="w-4 h-4 text-teal-600" />, bg: 'bg-teal-50' },
          { href: '/admin/vendors', label: '发送 30天', value: (p?.msgSent30 || 0).toLocaleString(), icon: <Send className="w-4 h-4 text-purple-600" />, bg: 'bg-purple-50' },
          { href: '/admin/vendors', label: '收到 30天', value: (p?.msgRecv30 || 0).toLocaleString(), icon: <MessageSquare className="w-4 h-4 text-orange-500" />, bg: 'bg-orange-50' },
        ].map((k) => (
          <L key={k.label} href={k.href}>
            <Card className="!p-3.5 h-full">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${k.bg}`}>{k.icon}</div>
                <div className="min-w-0">
                  <p className="text-xl font-bold leading-tight text-gray-900 truncate">{k.value}</p>
                  <p className="text-[11px] text-gray-500 truncate">{k.label}</p>
                </div>
              </div>
            </Card>
          </L>
        ))}
      </div>

      {/* ② 主体：商户增长（左 2/3，底部内嵌平台量）+ 资金概览（右 1/3） */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <Card className="lg:col-span-2 flex flex-col">
          <h3 className="text-base font-semibold text-gray-900 mb-3">商户增长（30 天）</h3>
          <div className="h-56 flex-1">
            {growthData.length > 0 ? (rc &&
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="users" stroke="#10B981" fill="#D1FAE5" name="新商户" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">30 天内暂无新注册</div>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 text-center">
            {[
              { label: '营销活动总数', value: p?.campaigns || 0 },
              { label: 'AI 外呼（30 天）', value: p?.aiCalls30 || 0 },
              { label: '消息总量（30 天）', value: ((p?.msgSent30 || 0) + (p?.msgRecv30 || 0)).toLocaleString() },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-lg font-semibold text-gray-900">{s.value}</p>
                <p className="text-[11px] text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">资金概览</h3>
            <Link href="/admin/vendors" className="text-sm text-emerald-600 hover:underline">商户管理</Link>
          </div>
          {money ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-emerald-50 px-4 py-3">
                <p className="text-[11px] text-emerald-700">商户钱包余额合计（{money.walletCount} 个钱包）</p>
                <p className="text-2xl font-bold text-emerald-700">￥{money.totalBalance.toLocaleString()}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] text-gray-500">充值入账（30 天）</p>
                  <p className="text-lg font-semibold text-gray-900">￥{money.paid30Rmb.toLocaleString()}</p>
                  <p className="text-[11px] text-gray-400">{money.paid30Count} 笔</p>
                </div>
                <div className={`rounded-xl px-3 py-2.5 ${money.pendingTopups > 0 ? 'bg-orange-50' : 'bg-gray-50'}`}>
                  <p className="text-[11px] text-gray-500">待审批充值申请</p>
                  <p className={`text-lg font-semibold ${money.pendingTopups > 0 ? 'text-orange-600' : 'text-gray-900'}`}>{money.pendingTopups}</p>
                  <p className="text-[11px] text-gray-400">{money.pendingTopups > 0 ? '去商户管理处理' : '无待办'}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-2">资金数据加载中或无权限</p>
          )}
          <div className="mt-auto pt-3 border-t border-gray-100 space-y-1">
            {[
              { href: '/admin/vendors', icon: <Wallet className="w-4 h-4 text-emerald-500" />, label: '充值订单 / 审批' },
              { href: '/admin/features', icon: <ClipboardList className="w-4 h-4 text-blue-500" />, label: '功能开关' },
              { href: '/admin/settings', icon: <Settings className="w-4 h-4 text-gray-500" />, label: '系统设置（SMTP / 品牌 / 省钱专家）' },
            ].map((a) => (
              <Link key={a.href} href={a.href} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-gray-700 hover:bg-gray-50 transition">
                {a.icon}{a.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* ③ 最近注册 */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">最近注册</h3>
          <Link href="/admin/vendors" className="text-sm text-emerald-600 hover:underline">全部商户</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-xs font-medium text-gray-500">商户</th>
                <th className="text-left py-2 text-xs font-medium text-gray-500">状态</th>
                <th className="text-left py-2 text-xs font-medium text-gray-500">注册时间</th>
                <th className="text-left py-2 text-xs font-medium text-gray-500">最近登录</th>
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
                    <Badge variant={u.status === 'active' ? 'success' : 'default'}>{u.status === 'active' ? '启用' : u.status}</Badge>
                  </td>
                  <td className="py-2.5 text-gray-500">{fmtDate(u.createdAt)}</td>
                  <td className="py-2.5 text-gray-500">{u.lastLogin ? fmtDate(u.lastLogin) : '—'}</td>
                </tr>
              ))}
              {!(d?.recentSignups || []).length && (
                <tr><td colSpan={4} className="py-4 text-center text-gray-400">还没有商户</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ④ 快捷入口 chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { href: '/admin/vendors', label: '商户管理', icon: <Users className="w-3.5 h-3.5" /> },
          { href: '/admin/system', label: '系统状态', icon: <Megaphone className="w-3.5 h-3.5" /> },
          { href: '/admin/one-click-signup', label: '一键注册', icon: <UserPlus className="w-3.5 h-3.5" /> },
          { href: '/admin/settings', label: '系统设置', icon: <Settings className="w-3.5 h-3.5" /> },
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
