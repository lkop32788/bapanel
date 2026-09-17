'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Table, { type Column } from '@/components/ui/Table';
import { adminPartnersApi } from '@/lib/api';
import { inr } from '@/lib/affiliateLabels';
import toast from 'react-hot-toast';

interface PartnerRow {
  _id: string; code: string; status: string; walletBalance: number; totalPaidOut: number;
  user: { name: string; email: string } | null;
  referrals: number; conversions: number; commission: number;
}
interface TrendRow { month: string; commission: number; payouts: number }

export default function AffiliateReportsPage() {
  const [months, setMonths] = useState('6');
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [growth, setGrowth] = useState<{ month: string; partners: number }[]>([]);
  const [summary, setSummary] = useState<{ totalReferrals: number; convertedReferrals: number } | null>(null);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([adminPartnersApi.trends(Number(months)), adminPartnersApi.list(), adminPartnersApi.summary()])
      .then(([t, p, s]) => {
        setTrend(t.data.data.commissionTrend || []);
        setGrowth(t.data.data.partnerGrowthTrend || []);
        setPartners(p.data.data || []);
        setSummary(s.data.data);
      })
      .catch(() => toast.error(translateApiMessage("无法加载报告")))
      .finally(() => setLoading(false));
  }, [months]);

  const top = [...partners].sort((a, b) => b.commission - a.commission);
  const referralPie = summary
    ? [
      { name: 'Converted', value: summary.convertedReferrals, fill: '#10b981' },
      { name: 'Signed up', value: Math.max(summary.totalReferrals - summary.convertedReferrals, 0), fill: '#a78bfa' },
    ].filter((d) => d.value > 0)
    : [];

  const exportCsv = () => {
    const header = ['Partner', 'Email', 'Code', 'Status', 'Referrals', 'Conversions', 'Commission', 'Wallet', 'Paid Out'];
    const lines = top.map((p) => [
      p.user?.name || '', p.user?.email || '', p.code, p.status,
      p.referrals, p.conversions, p.commission, p.walletBalance, p.totalPaidOut,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `affiliate-partners-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: Column<PartnerRow>[] = [
    {
      key: 'partner', title: "合作伙伴",
      render: (p) => (
        <div>
          <p className="font-medium text-gray-900">{p.user?.name || '—'}</p>
          <p className="text-xs font-mono text-gray-400">{p.code}</p>
        </div>
      ),
    },
    { key: 'referrals', title: "推荐", render: (p) => <span className="text-sm">{p.referrals}</span> },
    { key: 'conversions', title: "转换", render: (p) => <span className="text-sm">{p.conversions}</span> },
    {
      key: 'rate', title: "转换。率",
      render: (p) => <span className="text-sm">{p.referrals ? Math.round((p.conversions / p.referrals) * 100) : 0}%</span>,
    },
    { key: 'commission', title: "佣金", render: (p) => <span className="text-sm font-semibold">{inr(p.commission)}</span> },
    { key: 'wallet', title: "钱包", render: (p) => <span className="text-sm">{inr(p.walletBalance)}</span> },
    { key: 'paid', title: "已支付", render: (p) => <span className="text-sm">{inr(p.totalPaidOut)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">报告</h1>
          <p className="text-emerald-50 text-sm mt-1">联盟计划绩效一览</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-40">
            <Select value={months} onChange={(e) => setMonths(e.target.value)} options={[
              { value: '3', label: "过去 3 个月" },
              { value: '6', label: "过去 6 个月" },
              { value: '12', label: "过去 12 个月" },
            ]} />
          </div>
          <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-1" /> 出口顶级合作伙伴 (CSV)</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-base font-semibold text-gray-900 mb-4">佣金与支出（每月）</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => inr(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="commission" stroke="#059669" strokeWidth={2} name="Commission Accrued" />
              <Line type="monotone" dataKey="payouts" stroke="#3b82f6" strokeWidth={2} name="Payouts Made" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-4">推荐状态</h3>
          {referralPie.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-24">尚未推荐</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={referralPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                  {referralPie.map((d) => <Cell key={d.name} fill={d.fill} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="text-base font-semibold text-gray-900 mb-4">新合作伙伴（每月）</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={growth}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="partners" fill="#8b5cf6" radius={[6, 6, 0, 0]} name="Partners" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">表现最佳的合作伙伴</h3>
        <Table columns={columns} data={top} loading={loading} emptyText={"还没有合作伙伴"} />
      </div>
    </div>
  );
}
