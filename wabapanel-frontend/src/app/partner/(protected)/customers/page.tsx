'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import Input from '@/components/ui/Input';
import ReferralTable, { PartnerReferral } from '@/components/partner/ReferralTable';
import DateRangeFilter, { DateRange, emptyRange, rangeParams } from '@/components/partner/DateRangeFilter';
import { partnerApi } from '@/lib/api';
import { inr } from '@/lib/affiliateLabels';
import toast from 'react-hot-toast';

type TabKey = 'signups' | 'waba' | 'conversions';

interface Conversion {
  _id: string;
  projectName: string;
  plan: string;
  invoiceId: string;
  currency: string;
  amount: number;
  commission: number;
  rate: number;
  purchasedAt: string;
}

export default function PartnerCustomersPage() {
  const [rows, setRows] = useState<(PartnerReferral & { wabaLive?: boolean })[]>([]);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [counts, setCounts] = useState({ signups: 0, wabaLive: 0, conversions: 0 });
  const [tab, setTab] = useState<TabKey>('signups');
  const [range, setRange] = useState<DateRange>(emptyRange);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const params = useMemo(() => rangeParams(range), [range]);
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([partnerApi.customers(params), partnerApi.conversions(params)])
      .then(([c, cv]) => {
        setRows(c.data.data || []);
        setCounts(c.data.counts || { signups: 0, wabaLive: 0, conversions: 0 });
        setConversions(cv.data.data || []);
      })
      .catch(() => toast.error(translateApiMessage("无法加载您的客户")))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const referralRows = useMemo(() => {
    const base = tab === 'waba'
      ? rows.filter((r) => r.wabaLive)
      : tab === 'conversions' ? rows.filter((r) => r.status === 'converted') : rows;
    if (!q) return base;
    return base.filter((r) => [r.customer.name, r.customer.email, r.projectName].some((v) => (v || '').toLowerCase().includes(q)));
  }, [rows, tab, q]);

  const conversionRows = useMemo(() => {
    if (!q) return conversions;
    return conversions.filter((c) => [c.projectName, c.plan, c.invoiceId].some((v) => (v || '').toLowerCase().includes(q)));
  }, [conversions, q]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'signups', label: "注册", count: counts.signups },
    { key: 'waba', label: "WABA 直播", count: counts.wabaLive },
    { key: 'conversions', label: "转换", count: counts.conversions },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold">客户</h1>
        <p className="text-emerald-50 text-sm mt-1">使用您的推荐链接注册的客户</p>
      </div>

      <DateRangeFilter value={range} onChange={setRange} />

      <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 pt-3 sm:pr-4">
          <div className="flex overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-5 py-3 text-left border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <span className={`block text-xl font-bold ${tab === t.key ? 'text-emerald-700' : 'text-gray-900'}`}>{t.count}</span>
                <span className="block text-xs text-gray-500 whitespace-nowrap">{t.label}</span>
              </button>
            ))}
          </div>
          <div className="flex-1 sm:max-w-xs sm:ml-auto pb-3 sm:pb-0">
            <Input
              placeholder={tab === 'conversions' ? "搜索项目、计划或发票..." : "搜索客户或项目..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
        </div>
      </div>

      {tab === 'conversions' ? (
        <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 bg-gray-50/70 border-b border-gray-100">
                  <th className="py-3 px-5">项目名称</th>
                  <th className="py-3 px-5">购买计划</th>
                  <th className="py-3 px-5">发票 ID</th>
                  <th className="py-3 px-5">货币</th>
                  <th className="py-3 px-5">金额</th>
                  <th className="py-3 px-5">赚取的佣金</th>
                  <th className="py-3 px-5">佣金百分比</th>
                  <th className="py-3 px-5">购买日期</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="py-10 text-center text-gray-400">加载中…</td></tr>}
                {!loading && conversionRows.length === 0 && (
                  <tr><td colSpan={8} className="py-10 text-center text-gray-500">在此期间没有转化</td></tr>
                )}
                {!loading && conversionRows.map((c) => (
                  <tr key={c._id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 px-5 font-medium text-gray-900">{c.projectName}</td>
                    <td className="py-3 px-5 text-gray-500">{c.plan || '—'}</td>
                    <td className="py-3 px-5 font-mono text-xs text-gray-600">{c.invoiceId || '—'}</td>
                    <td className="py-3 px-5 text-gray-500">{c.currency}</td>
                    <td className="py-3 px-5 text-gray-700">{inr(c.amount)}</td>
                    <td className="py-3 px-5 font-semibold text-emerald-700">{inr(c.commission)}</td>
                    <td className="py-3 px-5 text-gray-500">{c.rate}%</td>
                    <td className="py-3 px-5 text-gray-500">
                      {new Date(c.purchasedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <ReferralTable rows={referralRows} loading={loading} showWaba />
      )}
    </div>
  );
}
