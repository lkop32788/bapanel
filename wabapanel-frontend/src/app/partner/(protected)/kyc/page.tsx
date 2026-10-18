'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { ShieldCheck, Upload, FileCheck2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { partnerApi, uploadApi } from '@/lib/api';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { kycStatusLabel, kycStatusVariant } from '@/lib/affiliateLabels';
import toast from 'react-hot-toast';

type DocKey = 'idProof' | 'addressProof' | 'panCard' | 'cancelledCheque';
type Doc = { url: string; key: string };

const docLabels: { key: DocKey; label: string; required: boolean }[] = [
  { key: 'idProof', label: "身份证明", required: true },
  { key: 'addressProof', label: "地址证明", required: false },
  { key: 'panCard', label: "PAN 卡", required: true },
  { key: 'cancelledCheque', label: "已取消的支票", required: false },
];

const statusHint: Record<string, string> = {
  not_started: "填写下面的表格并提交以供审核。",
  pending: "您的 KYC 正在接受审核 - 我们将在验证后通知您。",
  rejected: "您的 KYC 被拒绝。更新以下详细信息并再次提交。",
  approved: "您的 KYC 已获批准 — 付款已启用。",
};

const emptyForm = {
  fullName: '', businessName: '', pan: '', gstin: '',
  addressLine: '', city: '', state: '', pincode: '',
};

export default function PartnerKycPage() {
  const loadPartner = usePartnerAuthStore((s) => s.loadPartner);
  const [form, setForm] = useState(emptyForm);
  const [docs, setDocs] = useState<Record<DocKey, Doc>>({
    idProof: { url: '', key: '' }, addressProof: { url: '', key: '' },
    panCard: { url: '', key: '' }, cancelledCheque: { url: '', key: '' },
  });
  const [status, setStatus] = useState('not_started');
  const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<DocKey | null>(null);

  useEffect(() => {
    partnerApi.kyc()
      .then((res) => {
        const k = res.data.data || {};
        setStatus(k.status || 'not_started');
        setRejectionReason(k.rejectionReason || '');
        setForm({
          fullName: k.fullName || '', businessName: k.businessName || '', pan: k.pan || '', gstin: k.gstin || '',
          addressLine: k.addressLine || '', city: k.city || '', state: k.state || '', pincode: k.pincode || '',
        });
        if (k.documents) setDocs((d) => ({ ...d, ...k.documents }));
      })
      .catch(() => toast.error(translateApiMessage("无法加载您的 KYC")))
      .finally(() => setLoading(false));
  }, []);

  const uploadDoc = async (field: DocKey, file: File) => {
    setUploading(field);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadApi.uploadFile(fd);
      setDocs((d) => ({ ...d, [field]: { url: res.data.data.url, key: res.data.data.key } }));
      toast.success(translateApiMessage("文件已上传"));
    } catch (err) {
      toast.error(translateApiMessage(isAxiosError(err) ? err.response?.data?.message || "上传失败" : "上传失败"));
    } finally {
      setUploading(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await partnerApi.submitKyc({ ...form, documents: docs });
      setStatus(res.data.data.status);
      setRejectionReason('');
      await loadPartner();
      toast.success(translateApiMessage("KYC 已提交审核"));
    } catch (err) {
      toast.error(translateApiMessage(isAxiosError(err) ? err.response?.data?.message || "无法提交 KYC" : "无法提交 KYC"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">加载中…</p>;

  const locked = status === 'approved';

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">KYC 验证</h1>
          <p className="text-emerald-50 text-sm mt-1">验证您的身份和公司详细信息</p>
        </div>
        <Badge variant={kycStatusVariant[status] || 'default'} size="md">{kycStatusLabel[status] || status}</Badge>
      </div>

      <Card className="p-4!">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </span>
          <p className="text-sm text-gray-600 pt-2">
            {statusHint[status] || statusHint.not_started}
            {status === 'rejected' && rejectionReason && <span className="text-red-600"> 原因： {rejectionReason}</span>}
          </p>
        </div>
      </Card>

      <form onSubmit={submit} className="space-y-6">
        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-4">个人和企业详细信息</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={"全名"} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} disabled={locked} required />
            <Input label={"企业名称"} value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} disabled={locked} />
            <Input label="PAN" placeholder="ABCDE1234F" value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} disabled={locked} required />
            <Input label={"GSTIN（可选）"} placeholder="22AAAAA0000A1Z5" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} disabled={locked} />
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-4">地址</h3>
          <Input label={"地址行"} value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} disabled={locked} required />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <Input label={"城市"} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} disabled={locked} required />
            <Input label={"状态"} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} disabled={locked} required />
            <Input label={"密码"} value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} disabled={locked} required />
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-gray-900">文件</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">上传您的身份证明、地址证明、PAN 卡和已取消的支票以供银行验证。</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {docLabels.map((d) => (
              <div key={d.key}>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  {d.label}{d.required && <span className="text-red-500"> *</span>}
                </p>
                {docs[d.key].url ? (
                  <div className="flex items-center justify-between gap-2">
                    <a href={docs[d.key].url} target="_blank" rel="noreferrer" className="text-sm text-emerald-600 hover:underline inline-flex items-center gap-1.5">
                      <FileCheck2 className="w-4 h-4" /> 查看上传的文件
                    </a>
                    {!locked && (
                      <label className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer">
                        替换
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,application/pdf"
                          onChange={(e) => e.target.files?.[0] && uploadDoc(d.key, e.target.files[0])}
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <label className={`inline-flex items-center gap-2 text-sm rounded-xl border border-gray-200 px-3 py-2 ${locked ? 'text-gray-400' : 'text-gray-700 hover:bg-gray-50 cursor-pointer'}`}>
                    <Upload className="w-4 h-4" />
                    {uploading === d.key ? "正在上传..." : "选择文件"}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,application/pdf"
                      disabled={locked}
                      onChange={(e) => e.target.files?.[0] && uploadDoc(d.key, e.target.files[0])}
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
        </Card>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-gray-400">付款的银行账户详细信息在您的个人资料页面上管理。</p>
          {!locked && (
            <Button type="submit" loading={saving}>
              {status === 'pending' ? "更新并重新提交" : "提交审核"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
