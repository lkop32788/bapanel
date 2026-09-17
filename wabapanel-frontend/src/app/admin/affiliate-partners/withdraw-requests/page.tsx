'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { Check, X, Clock, IndianRupee, TrendingUp, Search } from 'lucide-react';
import Card, { StatCard } from '@/components/ui/Card';
import Table, { type Column } from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { adminPartnersApi } from '@/lib/api';
import { inr, withdrawalStatusLabel, withdrawalStatusVariant, kycStatusLabel } from '@/lib/affiliateLabels';
import toast from 'react-hot-toast';

interface Snapshot {
  method: string; upiId?: string; bankAccountName?: string; bankAccountNumber?: string; bankIfsc?: string; bankName?: string;
}
interface WithdrawalRow {
  _id: string; amount: number; status: string; payoutSnapshot: Snapshot; reference: string; adminNote: string;
  createdAt: string; processedAt: string | null;
  partner: { _id: string; code: string; name: string; email: string; kycStatus: string } | null;
}

const payoutText = (s: Snapshot) =>
  s?.method === 'upi' ? `UPI · ${s.upiId}`
    : s?.method === 'bank' ? `${s.bankName || 'Bank'} · ${s.bankAccountNumber} · ${s.bankIfsc}`
      : '—';

export default function AdminWithdrawalsPage() {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<{ pendingWithdrawals: number; pendingWithdrawalAmount: number; totalPaidOut: number } | null>(null);
  const [action, setAction] = useState<{ row: WithdrawalRow; type: 'paid' | 'rejected' } | null>(null);
  const [form, setForm] = useState({ reference: '', adminNote: '' });
  const [saving, setSaving] = useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    adminPartnersApi.withdrawals(status || undefined)
      .then((r) => setRows(r.data.data || []))
      .catch(() => toast.error(translateApiMessage("无法加载提款请求")))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    adminPartnersApi.summary().then((r) => setSummary(r.data.data)).catch(() => {});
  }, []);

  const process = async () => {
    if (!action) return;
    setSaving(true);
    try {
      await adminPartnersApi.processWithdrawal(action.row._id, {
        status: action.type,
        reference: form.reference,
        adminNote: form.adminNote,
      });
      toast.success(translateApiMessage(action.type === 'paid' ? "标记为已付费" : "请求被拒绝，金额退还至钱包"));
      setAction(null);
      setForm({ reference: '', adminNote: '' });
      load();
    } catch (e) {
      toast.error(translateApiMessage(isAxiosError(e) ? e.response?.data?.message || "无法处理请求" : "无法处理请求"));
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter((w) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [w.partner?.name, w.partner?.email, w.partner?.code].some((v) => (v || '').toLowerCase().includes(q));
  });

  const columns: Column<WithdrawalRow>[] = [
    {
      key: 'partner', title: "合作伙伴",
      render: (w) => (
        <div>
          <p className="font-medium text-gray-900">{w.partner?.name || '—'}</p>
          <p className="text-xs text-gray-500">{w.partner?.email}</p>
          <p className="text-xs font-mono text-gray-400">{w.partner?.code} · KYC {kycStatusLabel[w.partner?.kycStatus || 'not_started']}</p>
        </div>
      ),
    },
    { key: 'amount', title: "金额", render: (w) => <span className="text-sm font-semibold">{inr(w.amount)}</span> },
    { key: 'payout', title: "支付至", render: (w) => <span className="text-xs text-gray-600">{payoutText(w.payoutSnapshot)}</span> },
    {
      key: 'createdAt', title: "已请求",
      render: (w) => <span className="text-xs text-gray-500">{new Date(w.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>,
    },
    {
      key: 'status', title: "状态",
      render: (w) => (
        <div>
          <Badge variant={withdrawalStatusVariant[w.status]}>{withdrawalStatusLabel[w.status]}</Badge>
          {w.reference && <p className="text-xs text-gray-400 mt-1">参考： {w.reference}</p>}
          {w.adminNote && <p className="text-xs text-gray-400 mt-0.5">{w.adminNote}</p>}
        </div>
      ),
    },
    {
      key: 'actions', title: '',
      render: (w) => w.status === 'pending' ? (
        <div className="flex items-center gap-1">
          <button className="p-1.5 text-gray-400 hover:text-emerald-600" title={"标记已付款"} onClick={() => setAction({ row: w, type: 'paid' })}>
            <Check className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-gray-400 hover:text-red-600" title={"拒绝"} onClick={() => setAction({ row: w, type: 'rejected' })}>
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold">提款请求</h1>
        <p className="text-emerald-50 text-sm mt-1">批准并处理合作伙伴付款请求</p>
      </div>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title={"待处理的请求"} value={summary.pendingWithdrawals} icon={<Clock className="w-6 h-6" />} color="yellow" />
          <StatCard title={"待处理金额"} value={inr(summary.pendingWithdrawalAmount)} icon={<IndianRupee className="w-6 h-6" />} color="blue" />
          <StatCard title={"支付总额"} value={inr(summary.totalPaidOut)} icon={<TrendingUp className="w-6 h-6" />} color="emerald" />
        </div>
      )}

      <Card padding={false} className="p-4">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <Input placeholder={"按合作伙伴名称或电子邮件搜索..."} value={search}
              onChange={(e) => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} />
          </div>
          <div className="w-48">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[
              { value: '', label: "所有状态" },
              { value: 'pending', label: "待定" },
              { value: 'paid', label: "已付费" },
              { value: 'rejected', label: "被拒绝" },
            ]} />
          </div>
        </div>
      </Card>

      <Table columns={columns} data={filtered} loading={loading} emptyText={"没有提款请求"} />

      <Modal isOpen={!!action} onClose={() => setAction(null)}
        title={action?.type === 'paid' ? "将提款标记为已付款" : "拒绝提款"}>
        <div className="space-y-4">
          <div className="text-sm text-gray-600 space-y-1">
            <p><strong>{action?.row.partner?.name}</strong> · {inr(action?.row.amount)}</p>
            <p>支付至： {action ? payoutText(action.row.payoutSnapshot) : ''}</p>
            {action?.type === 'rejected' && <p className="text-amber-700">持有的金额将被存入合作伙伴钱包。</p>}
          </div>
          {action?.type === 'paid' && (
            <Input label={"付款参考（UTR/交易 ID）"} value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          )}
          <Input label={action?.type === 'paid' ? "注意（可选）" : "原因"} value={form.adminNote}
            onChange={(e) => setForm({ ...form, adminNote: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAction(null)}>取消</Button>
            <Button variant={action?.type === 'paid' ? 'primary' : 'danger'} onClick={process} loading={saving}>
              {action?.type === 'paid' ? "马克支付" : "拒绝"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
