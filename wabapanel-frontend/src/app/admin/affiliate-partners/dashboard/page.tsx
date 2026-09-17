'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users, UserCheck, IndianRupee, Wallet, Clock, TrendingUp, Handshake, ArrowRight, BarChart3,
} from 'lucide-react';
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Card, { StatCard } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { adminPartnersApi } from '@/lib/api';
import { inr, referralStatusLabel, referralStatusVariant, withdrawalStatusLabel, withdrawalStatusVariant } from '@/lib/affiliateLabels';
import toast from 'react-hot-toast';

const SectionTitle = ({ icon, title, accent }: { icon: React.ReactNode; title: string; accent: string }) => (
  <div className="flex items-center gap-2.5 mt-2">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>{icon}</div>
    <h2 className="text-base font-semibold text-gray-800">{title}</h2>
    <div className="flex-1 h-px bg-linear-to-r from-gray-200 to-transparent" />
  </div>
);

const JourneyStep = ({ value, label, accent }: { value: number; label: string; accent: string }) => (
  <div className="flex-1 min-w-[140px] text-center">
    <p className={`text-3xl font-bold ${accent}`}>{value}</p>
    <p className="text-sm text-gray-500 mt-1">{label}</p>
  </div>
);

interface Summary {
  totalPartners: number; activePartners: number; totalReferrals: number; convertedReferrals: number;
  pendingWithdrawals: number; pendingWithdrawalAmount: number; totalPaidOut: number;
  creditedCommission: number; totalWalletBalance: number;
}
interface PartnerRow {
  _id: string; code: string; referrals: number; commission: number;
  user: { name: string; email: string } | null;
}
interface ReferralRow {
  _id: string; status: string; createdAt: string;
  partner: { code: string; name: string } | null;
  customer: { name: string; email: string } | null;
}
interface WithdrawalRow {
  _id: string; amount: number; status: string; createdAt: string;
  partner: { code: string; name: string } | null;
}

export default function AffiliateAdminDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [commissionTrend, setCommissionTrend] = useState<{ month: string; commission: number; payouts: number }[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);

  useEffect(() => {
    Promise.all([
      adminPartnersApi.summary(),
      adminPartnersApi.trends(6),
      adminPartnersApi.list(),
      adminPartnersApi.referrals({ limit: 5 }),
      adminPartnersApi.withdrawals(),
    ])
      .then(([s, t, p, r, w]) => {
        setSummary(s.data.data);
        setCommissionTrend(t.data.data.commissionTrend || []);
        setPartners(p.data.data || []);
        setReferrals(r.data.data || []);
        setWithdrawals(w.data.data || []);
      })
      .catch(() => toast.error(translateApiMessage("无法加载联属会员仪表板")));
  }, []);

  if (!summary) return <p className="text-sm text-gray-400 py-8 text-center">加载中…</p>;

  const topPartners = [...partners].sort((a, b) => b.commission - a.commission).slice(0, 5);
  const notConverted = Math.max(summary.totalReferrals - summary.convertedReferrals, 0);
  const referralPie = [
    { name: 'Converted', value: summary.convertedReferrals, fill: '#10b981' },
    { name: 'Signed up', value: notConverted, fill: '#a78bfa' },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold">附属合作伙伴</h1>
        <p className="text-emerald-50 text-sm mt-1">合作伙伴网络、推荐和佣金概述</p>
      </div>

      <SectionTitle icon={<Handshake className="w-4 h-4 text-white" />} title={"联盟之旅"} accent="bg-linear-to-br from-blue-500 to-indigo-500" />
      <Card>
        <div className="flex items-center flex-wrap gap-4 py-2">
          <JourneyStep value={summary.totalPartners} label={"合作伙伴"} accent="text-blue-600" />
          <ArrowRight className="w-5 h-5 text-gray-300 hidden sm:block" />
          <JourneyStep value={summary.totalReferrals} label={"推荐"} accent="text-violet-600" />
          <ArrowRight className="w-5 h-5 text-gray-300 hidden sm:block" />
          <JourneyStep value={summary.convertedReferrals} label={"已转换"} accent="text-emerald-600" />
          <ArrowRight className="w-5 h-5 text-gray-300 hidden sm:block" />
          <JourneyStep value={summary.pendingWithdrawals} label={"提款请求待处理"} accent="text-amber-600" />
        </div>
      </Card>

      <SectionTitle icon={<TrendingUp className="w-4 h-4 text-white" />} title={"计划概述"} accent="bg-linear-to-br from-emerald-500 to-teal-500" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Link href="/admin/affiliate-partners/partners" className="block">
          <StatCard title={"总计合作伙伴"} value={summary.totalPartners} icon={<Users className="w-6 h-6" />} color="emerald" />
        </Link>
        <Link href="/admin/affiliate-partners/partners" className="block">
          <StatCard title={"活跃合作伙伴"} value={summary.activePartners} icon={<UserCheck className="w-6 h-6" />} color="blue" />
        </Link>
        <Link href="/admin/affiliate-partners/referrals" className="block">
          <StatCard title={"推荐总数"} value={summary.totalReferrals} change={`${summary.convertedReferrals} converted`} icon={<Handshake className="w-6 h-6" />} color="purple" />
        </Link>
        <Link href="/admin/affiliate-partners/withdraw-requests" className="block">
          <StatCard title={"提款请求待处理"} value={summary.pendingWithdrawals} change={inr(summary.pendingWithdrawalAmount)} icon={<Clock className="w-6 h-6" />} color="yellow" />
        </Link>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Link href="/admin/affiliate-partners/commissions" className="block">
          <StatCard title={"信用佣金"} value={inr(summary.creditedCommission)} icon={<IndianRupee className="w-6 h-6" />} color="emerald" />
        </Link>
        <Link href="/admin/affiliate-partners/withdraw-requests" className="block">
          <StatCard title={"支付总额"} value={inr(summary.totalPaidOut)} icon={<TrendingUp className="w-6 h-6" />} color="blue" />
        </Link>
        <StatCard title={"钱包余额（所有合作伙伴）"} value={inr(summary.totalWalletBalance)} icon={<Wallet className="w-6 h-6" />} color="purple" />
      </div>

      <SectionTitle icon={<BarChart3 className="w-4 h-4 text-white" />} title={"趋势"} accent="bg-linear-to-br from-purple-500 to-fuchsia-500" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-base font-semibold text-gray-900 mb-4">佣金与支出（每月）</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={commissionTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => inr(Number(v))} />
              <Legend />
              <Area type="monotone" dataKey="commission" stroke="#059669" fill="#a7f3d0" name="Commission Accrued" />
              <Area type="monotone" dataKey="payouts" stroke="#3b82f6" fill="#bfdbfe" name="Payouts Made" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-4">推荐状态</h3>
          {referralPie.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-20">尚未推荐</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={referralPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {referralPie.map((d) => <Cell key={d.name} fill={d.fill} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <SectionTitle icon={<Clock className="w-4 h-4 text-white" />} title={"最近的活动"} accent="bg-linear-to-br from-orange-400 to-amber-500" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">顶级合作伙伴</h3>
            <Link href="/admin/affiliate-partners/partners" className="text-sm text-emerald-600 hover:underline">查看全部</Link>
          </div>
          {topPartners.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">还没有合作伙伴</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {topPartners.map((p) => (
                <div key={p._id} className="py-2.5 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold flex items-center justify-center shrink-0">
                    {(p.user?.name || '?').charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.user?.name || '—'}</p>
                    <p className="text-xs text-gray-400">{p.referrals} 转介</p>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-md px-2 py-1 shrink-0">{inr(p.commission)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">最近推荐</h3>
            <Link href="/admin/affiliate-partners/referrals" className="text-sm text-emerald-600 hover:underline">查看全部</Link>
          </div>
          {referrals.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">尚未推荐</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {referrals.map((r) => (
                <div key={r._id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.customer?.name || r.customer?.email || '—'}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {r.partner?.name || '—'} · {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <Badge variant={referralStatusVariant[r.status] || 'default'} className="shrink-0">
                    {referralStatusLabel[r.status] || r.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">提款请求</h3>
            <Link href="/admin/affiliate-partners/withdraw-requests" className="text-sm text-emerald-600 hover:underline">查看全部</Link>
          </div>
          {withdrawals.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">尚无提款请求</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {withdrawals.slice(0, 5).map((w) => (
                <div key={w._id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{w.partner?.name || '—'}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(w.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{inr(w.amount)}</p>
                    <Badge variant={withdrawalStatusVariant[w.status] || 'default'}>
                      {withdrawalStatusLabel[w.status] || w.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { href: '/admin/affiliate-partners/partners', label: "合作伙伴", action: 'Manage' },
          { href: '/admin/affiliate-partners/commissions', label: "佣金", action: 'Review' },
          { href: '/admin/affiliate-partners/reports', label: "报告", action: 'Analyze' },
          { href: '/admin/affiliate-partners/settings', label: "设置", action: 'Configure' },
        ].map((q) => (
          <Link key={q.href} href={q.href} className="block">
            <Card className="p-4! flex items-center justify-between gap-3 hover:ring-emerald-200">
              <div>
                <p className="text-xs text-gray-500">{q.label}</p>
                <p className="text-sm font-bold text-gray-900">{q.action}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
