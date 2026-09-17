'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Users, Wallet, TrendingUp, CalendarDays, IndianRupee, CheckCircle2, Clock,
  Handshake, Share2, ShieldCheck, Megaphone,
} from 'lucide-react';
import Card, { StatCard } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { usePartnerAnnouncementStore } from '@/stores/partnerAnnouncementStore';
import {
  announcementLabel, announcementVariant, commissionStatusLabel, commissionStatusVariant,
  inr, referralStatusLabel, referralStatusVariant,
} from '@/lib/affiliateLabels';
import DateRangeFilter, { DateRange, emptyRange, rangeParams } from '@/components/partner/DateRangeFilter';
import { partnerApi } from '@/lib/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import toast from 'react-hot-toast';

const SectionTitle = ({ icon, title, accent }: { icon: React.ReactNode; title: string; accent: string }) => (
  <div className="flex items-center gap-2.5 mt-2">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>{icon}</div>
    <h2 className="text-base font-semibold text-gray-800">{title}</h2>
    <div className="flex-1 h-px bg-linear-to-r from-gray-200 to-transparent" />
  </div>
);

interface Customer { _id?: string; name: string; email: string; phone: string }
interface DashboardData {
  code: string;
  walletBalance: number;
  commissionRate: number;
  totalCustomers: number;
  activeCustomers: number;
  totalCommission: number;
  pendingCommission: number;
  newSaleCommission: number;
  recurringCommission: number;
  creditedCommission: number;
  totalCommissionCount: number;
  monthCommission: number;
  monthCommissionCount: number;
  revenueGenerated: number;
  totalPaidOut: number;
  payoutCount: number;
  kycStatus: string;
  trend: { month: string; referrals: number; conversions: number; commission: number }[];
  recentCommissions: { _id: string; amount: number; type: string; status: string; createdAt: string; customer: Customer }[];
  recentCustomers: { _id: string; status: string; createdAt: string; totalCommission: number; customer: Customer }[];
}

export default function PartnerDashboardPage() {
  const profile = usePartnerAuthStore((s) => s.profile);
  const announcements = usePartnerAnnouncementStore((s) => s.items);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>(emptyRange);

  const params = useMemo(() => rangeParams(range), [range]);

  useEffect(() => {
    setLoading(true);
    partnerApi.dashboard(params)
      .then((res) => setData(res.data.data))
      .catch(() => toast.error(translateApiMessage("无法加载您的仪表板")))
      .finally(() => setLoading(false));
  }, [params]);

  const referralLink = data && typeof window !== 'undefined'
    ? `${window.location.origin}/auth/register?ref=${data.code}`
    : '';

  const shareLink = async () => {
    if (!referralLink) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "加入此 WhatsApp Business 平台", text: referralLink, url: referralLink });
        return;
      } catch { /* user cancelled — fall back to copy */ }
    }
    navigator.clipboard.writeText(referralLink)
      .then(() => toast.success(translateApiMessage("已复制推荐链接")))
      .catch(() => toast.error(translateApiMessage("无法复制链接")));
  };

  const rangePicker = <DateRangeFilter value={range} onChange={setRange} />;

  if (loading) {
    return (
      <div className="space-y-6">
        {rangePicker}
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-6">
        {rangePicker}
        <Card>无法加载您的仪表板。请刷新。</Card>
      </div>
    );
  }

  const topAnnouncements = announcements.slice(0, 2);

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Handshake className="w-6 h-6" /> 欢迎， {profile?.name || "合作伙伴"}
          </h1>
          <p className="text-emerald-50 text-sm mt-1">跟踪推荐、佣金和支出</p>
        </div>
        <button
          onClick={shareLink}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-emerald-700 rounded-xl text-sm font-semibold shadow-sm hover:bg-emerald-50 transition-colors"
        >
          <Share2 className="w-4 h-4" /> 分享推荐链接
        </button>
      </div>

      {rangePicker}

      {topAnnouncements.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {topAnnouncements.map((a) => (
            <Card key={a._id} className="p-4!">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={announcementVariant[a.type]} size="sm">{announcementLabel[a.type]}</Badge>
                    <span className="text-xs text-gray-400">
                      {new Date(a.postDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 truncate">{a.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.message}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle icon={<TrendingUp className="w-4 h-4 text-white" />} title={"性能概述"} accent="bg-linear-to-br from-emerald-500 to-teal-500" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={"钱包余额"} value={inr(data.walletBalance)} icon={<Wallet className="w-6 h-6" />} color="emerald" />
        <StatCard
          title={"推荐客户"}
          value={data.totalCustomers}
          change={`${data.activeCustomers} on a paid plan`}
          icon={<Users className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title={"赚取的佣金总额"}
          value={inr(data.totalCommission)}
          change={`${data.payoutCount} payouts`}
          icon={<TrendingUp className="w-6 h-6" />}
          color="purple"
        />
        <StatCard
          title={"本月"}
          value={inr(data.monthCommission)}
          change={`${data.monthCommissionCount} commissions`}
          icon={<CalendarDays className="w-6 h-6" />}
          color="orange"
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StatCard
          title={"产生的收入"}
          value={inr(data.revenueGenerated)}
          change="Total sales from your referrals"
          icon={<IndianRupee className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title={"佣金支付"}
          value={inr(data.totalPaidOut)}
          change="Total withdrawn to date"
          icon={<CheckCircle2 className="w-6 h-6" />}
          color="emerald"
        />
      </div>
      {data.pendingCommission > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <StatCard
            title={"待定佣金"}
            value={inr(data.pendingCommission)}
            change={`Clears ${data.commissionRate}% commission after the clearing period`}
            icon={<Clock className="w-6 h-6" />}
            color="yellow"
          />
        </div>
      )}

      <SectionTitle icon={<TrendingUp className="w-4 h-4 text-white" />} title={"趋势"} accent="bg-linear-to-br from-purple-500 to-fuchsia-500" />
      <Card>
        <h3 className="text-lg font-semibold text-gray-900">推荐分析（每月）</h3>
        <p className="text-sm text-gray-500 mt-0.5 mb-4">过去 6 个月您推荐的客户以及转换为付费计划的客户数量</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="conversions" name="Conversions" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="referrals" name="Referrals" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <SectionTitle icon={<CalendarDays className="w-4 h-4 text-white" />} title={"最近的活动"} accent="bg-linear-to-br from-orange-400 to-amber-500" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">最近的佣金</h3>
            <Link href="/partner/commissions" className="text-sm text-emerald-600 hover:underline">查看全部</Link>
          </div>
          <div className="space-y-2.5">
            {data.recentCommissions.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">尚无佣金</p>
            )}
            {data.recentCommissions.map((c) => (
              <div key={c._id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.customer.name || c.customer.email}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {c.type === 'renewal' ? "续订" : "新品促销"} · {new Date(c.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-semibold text-gray-700">{inr(c.amount)}</span>
                  <Badge variant={commissionStatusVariant[c.status] || 'default'}>
                    {commissionStatusLabel[c.status] || c.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">最近的客户</h3>
            <Link href="/partner/customers" className="text-sm text-emerald-600 hover:underline">查看全部</Link>
          </div>
          <div className="space-y-2.5">
            {data.recentCustomers.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">尚未推荐客户</p>
            )}
            {data.recentCustomers.map((r) => (
              <div key={r._id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.customer.name || r.customer.email}</p>
                  <p className="text-xs text-gray-400 truncate">{new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
                <Badge variant={referralStatusVariant[r.status] || 'default'} className="shrink-0">
                  {referralStatusLabel[r.status] || r.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/partner/announcements" className="block">
          <Card className="p-4! flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Megaphone className="w-5 h-5" /></div>
            <div>
              <p className="text-xs text-gray-500">公告</p>
              <p className="text-sm font-bold text-gray-900">查看全部</p>
            </div>
          </Card>
        </Link>
        <Link href="/partner/security" className="block">
          <Card className="p-4! flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><ShieldCheck className="w-5 h-5" /></div>
            <div>
              <p className="text-xs text-gray-500">账户安全</p>
              <p className="text-sm font-bold text-gray-900">管理 2FA</p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
