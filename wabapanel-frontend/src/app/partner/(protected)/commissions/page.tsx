'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Search, XCircle } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import DateRangeFilter, { DateRange, emptyRange, rangeParams } from '@/components/partner/DateRangeFilter';
import { partnerApi } from '@/lib/api';
import {
  commissionStatusLabel, commissionStatusVariant, commissionTypeLabel, inr,
} from '@/lib/affiliateLabels';
import toast from 'react-hot-toast';

interface Commission {
  _id: string;
  type: string;
  saleAmount: number;
  rate: number;
  amount: number;
  status: string;
  clearsAt: string | null;
  creditedAt: string | null;
  createdAt: string;
  plan: string;
  customer: { name: string; email: string; phone: string };
}

export default function PartnerCommissionsPage() {
  const [rows, setRows] = useState<Commission[]>([]);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [range, setRange] = useState<DateRange>(emptyRange);
  const [loading, setLoading] = useState(true);

  const params = useMemo(() => rangeParams(range), [range]);

  useEffect(() => {
    setLoading(true);
    partnerApi.commissions({ status: status || undefined, type: type || undefined, page, limit: 25, ...params })
      .then((res) => {
        setRows(res.data.data || []);
        setPages(res.data.pagination?.pages || 1);
      })
      .catch(() => toast.error(translateApiMessage("无法加载您的佣金")))
      .finally(() => setLoading(false));
  }, [status, type, page, params]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => [c.customer.name, c.customer.email].some((v) => (v || '').toLowerCase().includes(q)));
  }, [rows, search]);

  const credited = filtered.filter((c) => c.status === 'credited').reduce((s, c) => s + c.amount, 0);
  const reversed = filtered.filter((c) => c.status === 'reversed').reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold">佣金</h1>
        <p className="text-emerald-50 text-sm mt-1">从您推荐的客户付款中赚取的每笔佣金</p>
      </div>

      <DateRangeFilter
        value={range}
        onChange={(r) => { setRange(r); setPage(1); }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm p-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">已记入（本页）</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inr(credited)}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
        <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm p-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">反转（本页）</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inr(reversed)}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
            <XCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            placeholder={"按客户姓名或电子邮件搜索此页面..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="sm:w-48">
          <Select
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
            options={[
              { value: '', label: "所有类型" },
              { value: 'first_sale', label: "首次销售" },
              { value: 'renewal', label: "续订" },
            ]}
          />
        </div>
        <div className="sm:w-52">
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            options={[
              { value: '', label: "所有状态" },
              { value: 'pending', label: "待处理（清算）" },
              { value: 'credited', label: "已记入" },
              { value: 'reversed', label: "反转" },
            ]}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 bg-gray-50/70 border-b border-gray-100">
                <th className="py-3 px-5">客户</th>
                <th className="py-3 px-5">类型</th>
                <th className="py-3 px-5">付款金额</th>
                <th className="py-3 px-5">率</th>
                <th className="py-3 px-5">佣金</th>
                <th className="py-3 px-5">状态</th>
                <th className="py-3 px-5">日期</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="py-10 text-center text-gray-400">加载中…</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-gray-500">尚无佣金</td></tr>
              )}
              {!loading && filtered.map((c) => (
                <tr key={c._id} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 px-5">
                    <div className="font-medium text-gray-900">{c.customer.name || '—'}</div>
                    <div className="text-xs text-gray-400">{c.customer.email}</div>
                  </td>
                  <td className="py-3 px-5 text-gray-500">{commissionTypeLabel[c.type] || c.type}</td>
                  <td className="py-3 px-5 text-gray-700">{inr(c.saleAmount)}</td>
                  <td className="py-3 px-5 text-gray-500">{c.rate}%</td>
                  <td className="py-3 px-5 font-semibold text-emerald-700">{inr(c.amount)}</td>
                  <td className="py-3 px-5">
                    <Badge variant={commissionStatusVariant[c.status] || 'default'}>
                      {commissionStatusLabel[c.status] || c.status}
                    </Badge>
                    {c.status === 'pending' && c.clearsAt && (
                      <div className="text-[11px] text-gray-400 mt-0.5">清除 {new Date(c.clearsAt).toLocaleDateString()}</div>
                    )}
                  </td>
                  <td className="py-3 px-5 text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
            <span className="text-sm text-gray-500">页 {page} of {pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>下一步</Button>
          </div>
        )}
      </div>
    </div>
  );
}
