'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { Check, X, FileText, Clock, ShieldCheck, Search } from 'lucide-react';
import Card, { StatCard } from '@/components/ui/Card';
import Table, { type Column } from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { adminPartnersApi } from '@/lib/api';
import { kycStatusLabel, kycStatusVariant } from '@/lib/affiliateLabels';
import toast from 'react-hot-toast';

interface Kyc {
  status: string; fullName?: string; businessName?: string; pan?: string; gstin?: string;
  addressLine?: string; city?: string; state?: string; pincode?: string;
  documents?: Record<string, { url?: string; key?: string }>;
  submittedAt?: string; reviewedAt?: string; rejectionReason?: string;
}
interface KycRow {
  _id: string; code: string; kyc: Kyc;
  user: { _id: string; name: string; email: string; phone?: string } | null;
}

const docLabels: Record<string, string> = {
  idProof: "身份证明", panCard: "PAN 卡", addressProof: "地址证明", cancelledCheque: "已取消的支票",
};

const docShort: Record<string, string> = {
  idProof: 'ID', panCard: 'PAN', addressProof: 'Address', cancelledCheque: 'Cheque',
};

export default function AdminKycPage() {
  const [rows, setRows] = useState<KycRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<{ pending: number; approved: number } | null>(null);
  const [view, setView] = useState<KycRow | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    adminPartnersApi.kycQueue(status || undefined)
      .then((r) => setRows(r.data.data || []))
      .catch(() => toast.error(translateApiMessage("无法加载 KYC 队列")))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([adminPartnersApi.kycQueue('pending'), adminPartnersApi.kycQueue('approved')])
      .then(([p, a]) => setCounts({ pending: (p.data.data || []).length, approved: (a.data.data || []).length }))
      .catch(() => {});
  }, [rows]);

  const filtered = rows.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [p.user?.name, p.user?.email, p.code, p.kyc?.businessName, p.kyc?.pan]
      .some((v) => (v || '').toLowerCase().includes(q));
  });

  const approve = async (row: KycRow) => {
    setSaving(true);
    try {
      await adminPartnersApi.reviewKyc(row._id, { status: 'approved' });
      toast.success(translateApiMessage("KYC 已批准"));
      load();
    } catch (e) {
      toast.error(translateApiMessage(isAxiosError(e) ? e.response?.data?.message || "无法更新 KYC" : "无法更新 KYC"));
    } finally {
      setSaving(false);
    }
  };

  const review = async (decision: 'approved' | 'rejected') => {
    if (!view) return;
    if (decision === 'rejected' && !reason.trim()) {
      toast.error(translateApiMessage("添加拒绝原因，以便合作伙伴可以修复它"));
      return;
    }
    setSaving(true);
    try {
      await adminPartnersApi.reviewKyc(view._id, { status: decision, rejectionReason: reason });
      toast.success(translateApiMessage(decision === 'approved' ? "KYC 已批准" : "KYC 被拒绝"));
      setView(null);
      setReason('');
      load();
    } catch (e) {
      toast.error(translateApiMessage(isAxiosError(e) ? e.response?.data?.message || "无法更新 KYC" : "无法更新 KYC"));
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<KycRow>[] = [
    {
      key: 'partner', title: "合作伙伴",
      render: (p) => (
        <div>
          <p className="font-medium text-gray-900">{p.user?.name || '—'}</p>
          <p className="text-xs text-gray-500">{p.user?.email}</p>
          <p className="text-xs font-mono text-gray-400">{p.code}</p>
        </div>
      ),
    },
    {
      key: 'business', title: "商业/PAN",
      render: (p) => (
        <div>
          <p className="text-sm text-gray-900">{p.kyc?.businessName || p.kyc?.fullName || '—'}</p>
          <p className="text-xs font-mono text-gray-500">{p.kyc?.pan || '—'}</p>
        </div>
      ),
    },
    {
      key: 'address', title: "地址",
      render: (p) => (
        <span className="text-sm text-gray-700">
          {[p.kyc?.addressLine, p.kyc?.city, p.kyc?.state, p.kyc?.pincode].filter(Boolean).join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'documents', title: "文件",
      render: (p) => {
        const docs = Object.entries(p.kyc?.documents || {}).filter(([, v]) => v?.url);
        if (!docs.length) return <span className="text-xs text-gray-400">—</span>;
        return (
          <div className="flex flex-wrap gap-2">
            {docs.map(([k, v]) => (
              <a key={k} href={v.url} target="_blank" rel="noreferrer" title={docLabels[k] || k}
                className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline">
                <FileText className="w-3.5 h-3.5" /> {docShort[k] || docLabels[k] || k}
              </a>
            ))}
          </div>
        );
      },
    },
    { key: 'status', title: "状态", render: (p) => <Badge variant={kycStatusVariant[p.kyc?.status || 'not_started']}>{kycStatusLabel[p.kyc?.status || 'not_started']}</Badge> },
    {
      key: 'submitted', title: "已提交",
      render: (p) => <span className="text-xs text-gray-500">{p.kyc?.submittedAt ? new Date(p.kyc.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>,
    },
    {
      key: 'actions', title: '',
      render: (p) => (
        <div className="flex items-center gap-1">
          <button className="p-1.5 text-gray-400 hover:text-gray-700" title={"查看详情"}
            onClick={() => { setView(p); setReason(p.kyc?.rejectionReason || ''); }}>
            <FileText className="w-4 h-4" />
          </button>
          {p.kyc?.status === 'pending' && (
            <>
              <button className="p-1.5 text-emerald-600 hover:text-emerald-700 disabled:opacity-50" title={"批准"}
                disabled={saving} onClick={() => approve(p)}>
                <Check className="w-4 h-4" />
              </button>
              <button className="p-1.5 text-red-500 hover:text-red-600" title={"拒绝"}
                onClick={() => { setView(p); setReason(p.kyc?.rejectionReason || ''); }}>
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold">合作伙伴 KYC</h1>
        <p className="text-emerald-50 text-sm mt-1">审查身份和业务验证提交</p>
      </div>

      {counts && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard title={"待审查"} value={counts.pending} icon={<Clock className="w-6 h-6" />} color="yellow" />
          <StatCard title={"已批准"} value={counts.approved} icon={<ShieldCheck className="w-6 h-6" />} color="emerald" />
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
              { value: 'approved', label: "已批准" },
              { value: 'rejected', label: "被拒绝" },
            ]} />
          </div>
        </div>
      </Card>

      <Table columns={columns} data={filtered} loading={loading} emptyText={"没有 KYC 提交"} />

      <Modal isOpen={!!view} onClose={() => setView(null)} title={`KYC — ${view?.user?.name || ''}`} size="lg">
        {view && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><dt className="text-gray-500">全名</dt><dd className="text-gray-900">{view.kyc.fullName || '—'}</dd></div>
              <div><dt className="text-gray-500">企业名称</dt><dd className="text-gray-900">{view.kyc.businessName || '—'}</dd></div>
              <div><dt className="text-gray-500">PAN</dt><dd className="text-gray-900 font-mono">{view.kyc.pan || '—'}</dd></div>
              <div><dt className="text-gray-500">GSTIN</dt><dd className="text-gray-900 font-mono">{view.kyc.gstin || '—'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-gray-500">地址</dt>
                <dd className="text-gray-900">{[view.kyc.addressLine, view.kyc.city, view.kyc.state, view.kyc.pincode].filter(Boolean).join(', ') || '—'}</dd>
              </div>
              <div><dt className="text-gray-500">电话</dt><dd className="text-gray-900">{view.user?.phone || '—'}</dd></div>
              <div><dt className="text-gray-500">邮箱</dt><dd className="text-gray-900">{view.user?.email}</dd></div>
            </dl>

            <div className="flex flex-wrap gap-2">
              {Object.entries(view.kyc.documents || {}).filter(([, v]) => v?.url).map(([k, v]) => (
                <a key={k} href={v.url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100">
                  <FileText className="w-3.5 h-3.5" /> {docLabels[k] || k}
                </a>
              ))}
              {Object.values(view.kyc.documents || {}).every((v) => !v?.url) && (
                <p className="text-xs text-gray-400">没有上传任何文件</p>
              )}
            </div>

            <Input label={"拒绝原因（需拒绝）"} value={reason} onChange={(e) => setReason(e.target.value)} />

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setView(null)}>关闭</Button>
              <Button variant="danger" onClick={() => review('rejected')} loading={saving}><X className="w-4 h-4 mr-1" /> 拒绝</Button>
              <Button onClick={() => review('approved')} loading={saving}><Check className="w-4 h-4 mr-1" /> 批准</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
