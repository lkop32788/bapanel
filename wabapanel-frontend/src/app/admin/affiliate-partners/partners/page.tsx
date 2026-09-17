'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, Search, Wallet, Pencil, Info, LogIn } from 'lucide-react';
import Card from '@/components/ui/Card';
import Table, { type Column } from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { adminPartnersApi } from '@/lib/api';
import { inr, kycStatusLabel, kycStatusVariant } from '@/lib/affiliateLabels';
import toast from 'react-hot-toast';

interface PartnerDetail extends Omit<PartnerRow, 'referrals'> {
  referrals?: number | unknown[];
  withdrawals?: unknown[];
}

interface PartnerRow {
  _id: string; code: string; status: string; commissionRate: number | null;
  walletBalance: number; totalPaidOut: number; kycStatus: string; createdAt: string;
  user: { _id: string; name: string; email: string; phone?: string } | null;
  referrals: number; conversions: number; commission: number;
}

const err = (e: unknown, fallback: string) =>
  isAxiosError(e) ? e.response?.data?.message || fallback : fallback;

export default function AdminPartnersPage() {
  const pathname = usePathname();
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [saving, setSaving] = useState(false);

  const [edit, setEdit] = useState<PartnerRow | null>(null);
  const [editForm, setEditForm] = useState({ status: 'active', commissionRate: '' });

  const [adjust, setAdjust] = useState<PartnerRow | null>(null);
  const [adjustForm, setAdjustForm] = useState({ amount: '', description: '' });

  const [details, setDetails] = useState<PartnerDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    adminPartnersApi.list(status || undefined)
      .then((r) => setRows(r.data.data || []))
      .catch(() => toast.error(translateApiMessage("无法加载合作伙伴")))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [p.code, p.user?.name, p.user?.email, p.user?.phone].some((v) => (v || '').toLowerCase().includes(q));
  });

  const createPartner = async () => {
    setSaving(true);
    try {
      await adminPartnersApi.create(createForm);
      toast.success(translateApiMessage("合作伙伴已创建"));
      setCreateOpen(false);
      setCreateForm({ name: '', email: '', phone: '', password: '' });
      load();
    } catch (e) {
      toast.error(translateApiMessage(err(e, 'Could not create partner')));
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      await adminPartnersApi.update(edit._id, {
        status: editForm.status,
        commissionRate: editForm.commissionRate === '' ? null : Number(editForm.commissionRate),
      });
      toast.success(translateApiMessage("合作伙伴已更新"));
      setEdit(null);
      load();
    } catch (e) {
      toast.error(translateApiMessage(err(e, 'Could not update partner')));
    } finally {
      setSaving(false);
    }
  };

  const saveAdjust = async () => {
    if (!adjust) return;
    setSaving(true);
    try {
      await adminPartnersApi.walletAdjust(adjust._id, {
        amount: Number(adjustForm.amount),
        description: adjustForm.description,
      });
      toast.success(translateApiMessage("钱包调整"));
      setAdjust(null);
      setAdjustForm({ amount: '', description: '' });
      load();
    } catch (e) {
      toast.error(translateApiMessage(err(e, 'Could not adjust wallet')));
    } finally {
      setSaving(false);
    }
  };

  const openDetails = async (p: PartnerRow) => {
    setDetails(p);
    setDetailsLoading(true);
    try {
      const r = await adminPartnersApi.get(p._id);
      setDetails(r.data.data);
    } catch (e) {
      toast.error(translateApiMessage(err(e, 'Could not load partner details')));
    } finally {
      setDetailsLoading(false);
    }
  };

  const loginAsPartner = async (p: { _id: string; user: PartnerRow['user'] }) => {
    // opened up-front so the browser does not block it as a popup after the request
    const tab = window.open('', '_blank');
    try {
      const r = await adminPartnersApi.loginAsPartner(p._id);
      const { token } = r.data.data;
      const url = `/partner/login?token=${token}`;
      if (tab) tab.location.href = url;
      else window.location.href = url;
      toast.success(translateApiMessage(`打开门户为 ${p.user?.name || 'partner'}`));
    } catch (e) {
      tab?.close();
      toast.error(translateApiMessage(err(e, 'Could not login as partner')));
    }
  };

  const columns: Column<PartnerRow>[] = [
    {
      key: 'partner', title: "合作伙伴",
      render: (p) => (
        <div>
          <p className="font-medium text-gray-900">{p.user?.name || '—'}</p>
          <p className="text-xs text-gray-500">{p.user?.email}</p>
          {p.user?.phone && <p className="text-xs text-gray-400">{p.user.phone}</p>}
        </div>
      ),
    },
    { key: 'code', title: "代码", render: (p) => <span className="font-mono text-sm">{p.code}</span> },
    {
      key: 'referrals', title: "客户",
      render: (p) => <span className="text-sm">{p.referrals} <span className="text-gray-400">/ {p.conversions} 已转换</span></span>,
    },
    { key: 'paid', title: "支付总额", render: (p) => <span className="text-sm">{inr(p.totalPaidOut)}</span> },
    {
      key: 'rate', title: "佣金率",
      render: (p) => <span className="text-sm">{p.commissionRate === null || p.commissionRate === undefined ? "默认" : `${p.commissionRate}%`}</span>,
    },
    { key: 'kyc', title: 'KYC', render: (p) => <Badge variant={kycStatusVariant[p.kycStatus]}>{kycStatusLabel[p.kycStatus]}</Badge> },
    {
      key: 'status', title: "状态",
      render: (p) => <Badge variant={p.status === 'active' ? 'success' : 'danger'}>{p.status === 'active' ? "启用" : "暂停"}</Badge>,
    },
    {
      key: 'actions', title: '',
      render: (p) => (
        <div className="flex items-center gap-1">
          <button className="p-1.5 text-gray-400 hover:text-gray-700" title={"查看详情"} onClick={() => openDetails(p)}>
            <Info className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-gray-400 hover:text-emerald-600" title={"作为合作伙伴登录"} onClick={() => loginAsPartner(p)}>
            <LogIn className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-gray-400 hover:text-gray-700" title={"编辑"}
            onClick={() => { setEdit(p); setEditForm({ status: p.status, commissionRate: p.commissionRate === null || p.commissionRate === undefined ? '' : String(p.commissionRate) }); }}>
            <Pencil className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-gray-400 hover:text-gray-700" title={"调整钱包"} onClick={() => setAdjust(p)}>
            <Wallet className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">附属合作伙伴</h1>
          <p className="text-emerald-50 text-sm mt-1">管理合作伙伴、佣金率和账户状态</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" /> 添加合作伙伴</Button>
      </div>

      {pathname !== '/admin/partners' && (
        <p className="text-sm text-gray-500">
          正在寻找经典的单页视图（合作伙伴、提款和设置）？{' '}
          <Link href="/admin/partners" className="text-emerald-600 hover:underline">在这里打开</Link>
        </p>
      )}

      <Card padding={false} className="p-4">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <Input placeholder={"按姓名、电子邮件或合作伙伴代码搜索..."} value={search}
              onChange={(e) => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} />
          </div>
          <div className="w-44">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[
              { value: '', label: "所有状态" },
              { value: 'active', label: "启用" },
              { value: 'suspended', label: "暂停" },
            ]} />
          </div>
        </div>
      </Card>

      <Table columns={columns} data={filtered} loading={loading} emptyText={"还没有合作伙伴"} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={"添加合作伙伴"}>
        <div className="space-y-4">
          <Input label={"名称"} value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
          <Input label={"邮箱"} type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
          <Input label={"电话"} value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
          <Input label={"密码"} type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={createPartner} loading={saving}>创建</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={`编辑 ${edit?.user?.name || 'Partner'}`}>
        <div className="space-y-4">
          <Select label={"状态"} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} options={[
            { value: 'active', label: "启用" },
            { value: 'suspended', label: "暂停" },
          ]} />
          <Input label={"佣金率 (%) — 空白使用程序默认值"} type="number" min={0} max={100}
            value={editForm.commissionRate} onChange={(e) => setEditForm({ ...editForm, commissionRate: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEdit(null)}>取消</Button>
            <Button onClick={saveEdit} loading={saving}>保存</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!details} onClose={() => setDetails(null)} title={"合作伙伴详细信息"}>
        {details && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold">
                {(details.user?.name || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{details.user?.name || '—'}</p>
                <p className="text-sm text-gray-500">{details.user?.email}</p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-gray-500">电话</dt><dd className="text-gray-900">{details.user?.phone || '—'}</dd></div>
              <div><dt className="text-gray-500">合作伙伴代码</dt><dd><Badge variant="info">{details.code}</Badge></dd></div>
              <div><dt className="text-gray-500">状态</dt>
                <dd><Badge variant={details.status === 'active' ? 'success' : 'danger'}>{details.status === 'active' ? "启用" : "暂停"}</Badge></dd>
              </div>
              <div><dt className="text-gray-500">佣金率</dt>
                <dd className="text-gray-900">{details.commissionRate === null || details.commissionRate === undefined ? "默认" : `${details.commissionRate}%`}</dd>
              </div>
              <div><dt className="text-gray-500">钱包余额</dt><dd className="text-gray-900">{inr(details.walletBalance)}</dd></div>
              <div><dt className="text-gray-500">已加入</dt>
                <dd className="text-gray-900">{details.createdAt ? new Date(details.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</dd>
              </div>
            </dl>

            <div className="grid grid-cols-3 gap-3 border-t border-gray-100 pt-4 text-center">
              <div>
                <p className="text-lg font-semibold text-gray-900">{Array.isArray(details.referrals) ? details.referrals.length : (details.referrals ?? 0)}</p>
                <p className="text-xs text-gray-500">客户</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">{inr(details.commission)}</p>
                <p className="text-xs text-gray-500">佣金（最近）</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">{detailsLoading ? '—' : (details.withdrawals?.length || 0)}</p>
                <p className="text-xs text-gray-500">提款请求</p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDetails(null)}>关闭</Button>
              <Button onClick={() => loginAsPartner(details)}><LogIn className="w-4 h-4 mr-1" /> 作为合作伙伴登录</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!adjust} onClose={() => setAdjust(null)} title={`调整钱包— ${adjust?.user?.name || ''}`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">当前余额： <strong>{inr(adjust?.walletBalance)}</strong></p>
          <Input label={"金额（负数扣除）"} type="number" value={adjustForm.amount}
            onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })} />
          <Input label={"原因"} value={adjustForm.description}
            onChange={(e) => setAdjustForm({ ...adjustForm, description: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdjust(null)}>取消</Button>
            <Button onClick={saveAdjust} loading={saving}>申请</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
