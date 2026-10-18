'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import Card from '@/components/ui/Card';
import Table, { type Column } from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { adminPartnersApi } from '@/lib/api';
import { inr, referralStatusLabel, referralStatusVariant } from '@/lib/affiliateLabels';
import toast from 'react-hot-toast';

interface ReferralRow {
  _id: string; status: string; createdAt: string; convertedAt: string | null;
  totalSaleAmount: number; totalCommission: number;
  plan: { name: string; price: number } | null;
  partner: { _id: string; code: string; name: string; email: string } | null;
  customer: { _id: string; name: string; email: string; phone?: string } | null;
}

export default function AdminReferralsPage() {
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [partner, setPartner] = useState('');
  const [partners, setPartners] = useState<{ _id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    adminPartnersApi.referrals({ status: status || undefined, partner: partner || undefined, page, limit: 25 })
      .then((r) => {
        setRows(r.data.data || []);
        setPages(r.data.pagination?.pages || 1);
        setTotal(r.data.pagination?.total || 0);
      })
      .catch(() => toast.error(translateApiMessage("无法加载推荐")))
      .finally(() => setLoading(false));
  }, [status, partner, page]);

  useEffect(() => {
    adminPartnersApi.list()
      .then((r) => setPartners((r.data.data || []).map((p: { _id: string; user: { name: string } | null }) => ({ _id: p._id, name: p.user?.name || p._id }))))
      .catch(() => undefined);
  }, []);

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.partner?.name, r.partner?.code, r.customer?.name, r.customer?.email].some((v) => (v || '').toLowerCase().includes(q));
  });

  const columns: Column<ReferralRow>[] = [
    {
      key: 'customer', title: "推荐业务",
      render: (r) => (
        <div>
          <p className="font-medium text-gray-900">{r.customer?.name || '—'}</p>
          <p className="text-xs text-gray-500">{r.customer?.email}</p>
        </div>
      ),
    },
    {
      key: 'partner', title: "合作伙伴",
      render: (r) => (
        <div>
          <p className="text-sm text-gray-900">{r.partner?.name || '—'}</p>
          <p className="text-xs font-mono text-gray-400">{r.partner?.code}</p>
        </div>
      ),
    },
    { key: 'plan', title: "购买计划", render: (r) => <span className="text-sm">{r.plan?.name || '—'}</span> },
    { key: 'sale', title: "销售金额", render: (r) => <span className="text-sm">{inr(r.totalSaleAmount)}</span> },
    { key: 'commission', title: "佣金", render: (r) => <span className="text-sm">{inr(r.totalCommission)}</span> },
    {
      key: 'createdAt', title: "日期",
      render: (r) => <span className="text-sm text-gray-500">{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>,
    },
    { key: 'status', title: "状态", render: (r) => <Badge variant={referralStatusVariant[r.status]}>{referralStatusLabel[r.status] || r.status}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold">推荐</h1>
        <p className="text-emerald-50 text-sm mt-1">
          跟踪您的联属合作伙伴推荐的业务，从注册到转化
        </p>
      </div>

      <Card padding={false} className="p-4">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <Input placeholder={"按企业或合作伙伴名称搜索..."} value={search} onChange={(e) => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} />
          </div>
          <div className="w-52">
            <Select value={partner} onChange={(e) => { setPartner(e.target.value); setPage(1); }} options={[
              { value: '', label: "所有合作伙伴" },
              ...partners.map((p) => ({ value: p._id, label: p.name })),
            ]} />
          </div>
          <div className="w-56">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[
              { value: '', label: "所有状态" },
              { value: 'signed_up', label: "已注册 — 未转换" },
              { value: 'converted', label: "已转换" },
            ]} />
          </div>
        </div>
      </Card>

      <Table columns={columns} data={filtered} loading={loading} emptyText={"尚未推荐"}
        pagination={{ page, totalPages: pages, total, onPageChange: setPage }} />
    </div>
  );
}
