'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { Search, Undo2, CheckCircle2, XCircle, Info } from 'lucide-react';
import Card, { StatCard } from '@/components/ui/Card';
import Table, { type Column } from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { adminPartnersApi } from '@/lib/api';
import { inr, commissionStatusLabel, commissionStatusVariant, commissionTypeLabel } from '@/lib/affiliateLabels';
import toast from 'react-hot-toast';

interface CommissionRow {
  _id: string; type: string; saleAmount: number; rate: number; amount: number; status: string;
  clearsAt: string | null; creditedAt: string | null; createdAt: string; note: string; plan: string;
  partner: { _id: string; code: string; name: string } | null;
  customer: { _id: string; name: string; email: string } | null;
}

export default function AdminCommissionsPage() {
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [reverse, setReverse] = useState<CommissionRow | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    adminPartnersApi.commissions({ status: status || undefined, page, limit: 25 })
      .then((r) => {
        setRows(r.data.data || []);
        setPages(r.data.pagination?.pages || 1);
        setTotal(r.data.pagination?.total || 0);
      })
      .catch(() => toast.error(translateApiMessage("无法加载佣金")))
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  const doReverse = async () => {
    if (!reverse) return;
    setSaving(true);
    try {
      await adminPartnersApi.reverseCommission(reverse._id, note);
      toast.success(translateApiMessage("佣金被撤销"));
      setReverse(null);
      setNote('');
      load();
    } catch (e) {
      toast.error(translateApiMessage(isAxiosError(e) ? e.response?.data?.message || "无法撤销佣金" : "无法撤销佣金"));
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.partner?.name, c.partner?.code, c.customer?.name, c.customer?.email].some((v) => (v || '').toLowerCase().includes(q));
  });

  const credited = filtered.filter((c) => c.status === 'credited').reduce((s, c) => s + c.amount, 0);
  const reversedTotal = filtered.filter((c) => c.status === 'reversed').reduce((s, c) => s + c.amount, 0);

  const columns: Column<CommissionRow>[] = [
    {
      key: 'partner', title: "合作伙伴",
      render: (c) => (
        <div>
          <p className="font-medium text-gray-900">{c.partner?.name || '—'}</p>
          <p className="text-xs font-mono text-gray-400">{c.partner?.code}</p>
        </div>
      ),
    },
    {
      key: 'customer', title: "来源",
      render: (c) => (
        <div>
          <p className="text-sm text-gray-900">{c.customer?.name || '—'}</p>
          <p className="text-xs text-gray-500">{c.plan}</p>
        </div>
      ),
    },
    { key: 'type', title: "类型", render: (c) => <Badge variant={c.type === 'renewal' ? 'info' : 'default'}>{commissionTypeLabel[c.type] || c.type}</Badge> },
    { key: 'sale', title: "销售金额", render: (c) => <span className="text-sm">{inr(c.saleAmount)}</span> },
    { key: 'rate', title: "率", render: (c) => <span className="text-sm">{c.rate}%</span> },
    { key: 'amount', title: "佣金", render: (c) => <span className="text-sm font-semibold">{inr(c.amount)}</span> },
    {
      key: 'date', title: "日期",
      render: (c) => (
        <div className="text-xs text-gray-500">
          <p>{new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          {c.status === 'pending' && c.clearsAt && <p>清除 {new Date(c.clearsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>}
          {c.status === 'credited' && c.creditedAt && <p>已记入 {new Date(c.creditedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>}
        </div>
      ),
    },
    { key: 'status', title: "状态", render: (c) => <Badge variant={commissionStatusVariant[c.status]}>{commissionStatusLabel[c.status]}</Badge> },
    {
      key: 'actions', title: '',
      render: (c) => c.status !== 'reversed' ? (
        <button className="p-1.5 text-gray-400 hover:text-red-600" title={"反向佣金"} onClick={() => setReverse(c)}>
          <Undo2 className="w-4 h-4" />
        </button>
      ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold">佣金</h1>
        <p className="text-emerald-50 text-sm mt-1">所有联属合作伙伴赚取的每笔佣金</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard title={"已记入（本页）"} value={inr(credited)} icon={<CheckCircle2 className="w-6 h-6" />} color="emerald" />
        <StatCard title={"反转（本页）"} value={inr(reversedTotal)} icon={<XCircle className="w-6 h-6" />} color="red" />
      </div>

      <Card className="border border-blue-100 bg-blue-50/60">
        <p className="text-sm text-blue-800 flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          一旦推荐客户的付款完成并且清算期结束，佣金就会自动记入贷方——无需手动批准步骤。请参阅仪表板了解整个计划的总计。
        </p>
      </Card>

      <Card padding={false} className="p-4">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <Input placeholder={"按合作伙伴或客户搜索..."} value={search} onChange={(e) => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} />
          </div>
          <div className="w-44">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[
              { value: '', label: "所有状态" },
              { value: 'pending', label: "待定" },
              { value: 'credited', label: "已记入" },
              { value: 'reversed', label: "反转" },
            ]} />
          </div>
        </div>
      </Card>

      <Table columns={columns} data={filtered} loading={loading} emptyText={"尚无佣金"}
        pagination={{ page, totalPages: pages, total, onPageChange: setPage }} />

      <Modal isOpen={!!reverse} onClose={() => setReverse(null)} title={"反向佣金"}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            倒车 {inr(reverse?.amount)} for <strong>{reverse?.partner?.name}</strong>。如果已经存入，则该金额将从合作伙伴钱包中扣除，并更正推荐总额。
          </p>
          <Input label={"原因（显示在钱包分类帐中）"} value={note} onChange={(e) => setNote(e.target.value)} placeholder={"退款/退款"} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReverse(null)}>取消</Button>
            <Button variant="danger" onClick={doReverse} loading={saving}>反向</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
