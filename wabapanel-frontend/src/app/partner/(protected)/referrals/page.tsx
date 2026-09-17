'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import ReferralTable, { PartnerReferral } from '@/components/partner/ReferralTable';
import { partnerApi } from '@/lib/api';
import toast from 'react-hot-toast';

export default function PartnerReferralsPage() {
  const [rows, setRows] = useState<PartnerReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    partnerApi.customers(status ? { status } : undefined)
      .then((res) => setRows(res.data.data || []))
      .catch(() => toast.error(translateApiMessage("无法加载您的推荐")))
      .finally(() => setLoading(false));
  }, [status]);

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.customer.name, r.customer.email, r.customer.phone].some((v) => (v || '').toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold">我的推荐</h1>
        <p className="text-emerald-50 text-sm mt-1">您推荐的每个客户，以及他们产生的收入和佣金</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            placeholder={"按客户姓名或电子邮件搜索..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="sm:w-56">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: '', label: "所有状态" },
              { value: 'signed_up', label: "已注册" },
              { value: 'converted', label: "已转换" },
            ]}
          />
        </div>
      </div>

      <ReferralTable rows={filtered} loading={loading} />
    </div>
  );
}
