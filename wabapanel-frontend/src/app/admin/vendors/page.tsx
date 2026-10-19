'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useCallback, useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, Ban, CheckCircle, LogIn, Store, Eye, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Textarea from '@/components/ui/Textarea';
import Card from '@/components/ui/Card';
import Tabs from '@/components/ui/Tabs';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { SAVER_GROUPS } from '@/lib/saverTypes';

interface Vendor {
  _id: string; name: string; email: string; phone: string; status: string;
  companyName: string; website: string; address: string; gstNumber: string; vendorNotes: string;
  createdAt: string; lastLogin?: string;
  messages30d?: number;
}

interface WalletRow {
  workspaceId: string;
  name: string;
  owner?: { name?: string; email?: string } | null;
  balance: number;
  spent: number;
  chargedTasks: number;
}
interface LedgerRow {
  _id: string;
  type: 'topup' | 'charge' | 'refund' | 'adjust';
  amount: number;
  balanceAfter: number;
  note?: string;
  task?: { fileName?: string; taskType?: string; total?: number } | null;
  by?: { name?: string } | null;
  createdAt: string;
}
interface UsdtOrderRow {
  _id: string;
  orderNo: string;
  workspace?: { name?: string } | null;
  by?: { name?: string } | null;
  usdtAmount: number;
  credits: number;
  status: string;
  externalId?: string;
  createdAt: string;
  paidAt?: string;
}
interface TopupReqRow {
  _id: string;
  workspace?: { name?: string } | null;
  by?: { name?: string; email?: string } | null;
  handledBy?: { name?: string } | null;
  amount: number;
  note?: string;
  adminNote?: string;
  status: string;
  createdAt: string;
}

const LEDGER_TYPE: Record<string, { label: string; cls: string }> = {
  topup: { label: '充值', cls: 'bg-emerald-50 text-emerald-700' },
  charge: { label: '消费', cls: 'bg-gray-100 text-gray-600' },
  refund: { label: '退款', cls: 'bg-blue-50 text-blue-600' },
  adjust: { label: '扣减', cls: 'bg-red-50 text-red-600' },
};
const USDT_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '待支付', cls: 'bg-amber-50 text-amber-600' },
  paid: { label: '已到账', cls: 'bg-emerald-50 text-emerald-700' },
  failed: { label: '失败', cls: 'bg-red-50 text-red-600' },
  expired: { label: '已超时', cls: 'bg-gray-100 text-gray-500' },
};
const REQ_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '待审核', cls: 'bg-amber-50 text-amber-600' },
  approved: { label: '已通过', cls: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: '已拒绝', cls: 'bg-red-50 text-red-600' },
};
const typeName = (v?: string) => SAVER_GROUPS.flatMap(g => g.types).find(t => t.value === v)?.name || v || '';
const round2 = (n: number) => Math.round((n || 0) * 100) / 100;
const rmb = (n: number) => `￥${round2(n)}`;
const fmtTime = (d: string) => new Date(d).toLocaleString('zh-CN');

const FilterPills = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) => (
  <div className="flex items-center gap-1.5 flex-wrap">
    {options.map(([v, label]) => (
      <button key={v} onClick={() => onChange(v)}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${value === v ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
        {label}
      </button>
    ))}
  </div>
);

const emptyForm = {
  name: '', email: '', password: '', phone: '', companyName: '', website: '',
  address: '', gstNumber: '', vendorNotes: '', status: 'active',
};

export default function VendorsPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyForm);

  // 计费：按所有者邮箱把商户和 workspace 钱包对上
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const walletOf = (v: Vendor) => wallets.find(w => w.owner?.email && w.owner.email === v.email);
  const loadWallets = useCallback(async () => {
    try {
      const res = await adminApi.saverWallets();
      setWallets(res.data.data || []);
    } catch { /* empty */ }
  }, []);
  useEffect(() => { loadWallets(); }, [loadWallets]);

  const fetchVendors = async () => {
    try {
      const res = await adminApi.getVendors({ search, page, limit: 20 });
      setVendors(res.data.data || []);
      const pg = res.data.pagination || {};
      setPages(pg.pages || 1);
      setTotal(pg.total || 0);
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchVendors(); }, [search, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    try {
      if (editVendor) {
        const rest = form;
        const updateData: Record<string, unknown> = { ...rest };
        if (!updateData.password) delete updateData.password;
        await adminApi.updateVendor(editVendor._id, updateData);
      } else {
        if (!form.password) { toast.error(translateApiMessage("需要密码")); return; }
        await adminApi.createVendor(form);
      }
      toast.success(translateApiMessage(editVendor ? "商户已更新" : "商户已创建"));
      setShowModal(false);
      fetchVendors();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    }
  };

  const handleToggleStatus = async (vendorId: string, current: string) => {
    const newStatus = current === 'active' ? 'suspended' : 'active';
    try {
      await adminApi.updateVendor(vendorId, { status: newStatus });
      toast.success(translateApiMessage("状态已更新"));
      fetchVendors();
    } catch { toast.error(translateApiMessage("操作失败")); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("删除该商户？此操作无法撤消。")) return;
    try {
      await adminApi.deleteVendor(id);
      toast.success(translateApiMessage("商户已删除"));
      fetchVendors();
    } catch { toast.error(translateApiMessage("操作失败")); }
  };

  const handleLoginAs = async (vendor: Vendor) => {
    try {
      const res = await adminApi.loginAsVendor(vendor._id);
      const { token } = res.data.data;
      // ADM-14: hand the token over in a one-time storage key (never in the URL); same tab,
      // the login page keeps the admin token as adminToken for switching back.
      localStorage.setItem('impersonateToken', token);
      toast.success(translateApiMessage(`登录身份 ${vendor.name}`));
      window.location.assign('/auth/login?impersonate=1');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "无法以商户身份登录"));
    }
  };

  const openEdit = (v: Vendor) => {
    setEditVendor(v);
    setForm({
      name: v.name, email: v.email, password: '', phone: v.phone || '',
      companyName: v.companyName || '', website: v.website || '',
      address: v.address || '', gstNumber: v.gstNumber || '',
      vendorNotes: v.vendorNotes || '', status: v.status,
    });
    setShowModal(true);
  };

  const openNew = () => {
    setEditVendor(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  // ---------- 充值/扣减 + 余额明细（按 workspace） ----------
  const [topupWs, setTopupWs] = useState<WalletRow | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [minus, setMinus] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const openTopup = (w: WalletRow, isMinus: boolean) => {
    setTopupWs(w); setMinus(isMinus); setAmount(''); setNote('');
  };
  const doTopup = async () => {
    const n = Math.abs(Number(amount));
    if (!topupWs || !Number.isFinite(n) || n <= 0) { toast.error('请输入有效金额'); return; }
    setSubmitting(true);
    try {
      await adminApi.saverTopup({ workspaceId: topupWs.workspaceId, amount: minus ? -n : n, note });
      toast.success(minus ? '已扣减' : '已充值');
      setTopupWs(null);
      loadWallets();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || '操作失败');
    }
    setSubmitting(false);
  };

  const [ledgerWs, setLedgerWs] = useState<WalletRow | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPages, setLedgerPages] = useState(1);
  const loadLedger = useCallback(async (wsId: string, p: number) => {
    try {
      const res = await adminApi.saverLedger({ workspace: wsId, page: p, limit: 20 });
      setLedger(res.data.data || []);
      setLedgerPages(res.data.pagination?.pages || 1);
    } catch { /* empty */ }
  }, []);
  const openLedger = (w: WalletRow) => { setLedgerWs(w); setLedgerPage(1); loadLedger(w.workspaceId, 1); };

  // ---------- 充值订单 ----------
  const [orders, setOrders] = useState<UsdtOrderRow[]>([]);
  const [orderFilter, setOrderFilter] = useState('');
  const loadOrders = useCallback(async (status?: string) => {
    try {
      const res = await adminApi.saverUsdtOrders(status || undefined);
      setOrders(res.data.data || []);
    } catch { /* empty */ }
  }, []);
  useEffect(() => { loadOrders(orderFilter); }, [loadOrders, orderFilter]);
  const creditOrder = async (o: UsdtOrderRow) => {
    if (!confirm(`手动确认订单 ${o.orderNo} 已到账？将按当前汇率给「${o.workspace?.name || ''}」入账 ${o.usdtAmount} USDT 对应金额`)) return;
    try {
      const res = await adminApi.saverCreditUsdtOrder(o._id, '管理员手动补单');
      toast.success(res.data.message || '已入账');
      loadOrders(orderFilter);
      loadWallets();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || '操作失败');
    }
  };

  // ---------- 充值申请 ----------
  const [reqs, setReqs] = useState<TopupReqRow[]>([]);
  const [reqFilter, setReqFilter] = useState('pending');
  const loadReqs = useCallback(async (status?: string) => {
    try {
      const res = await adminApi.saverTopupRequests(status || undefined);
      setReqs(res.data.data || []);
    } catch { /* empty */ }
  }, []);
  useEffect(() => { loadReqs(reqFilter); }, [loadReqs, reqFilter]);
  const handleReq = async (r: TopupReqRow, action: 'approve' | 'reject') => {
    let adminNote = '';
    if (action === 'reject') {
      adminNote = prompt('拒绝原因（选填）') || '';
    } else if (!confirm(`通过申请并给「${r.workspace?.name || ''}」入账 ${rmb(r.amount)}？`)) {
      return;
    }
    try {
      const res = await adminApi.saverHandleTopupRequest(r._id, { action, adminNote });
      toast.success(res.data.message || '已处理');
      loadReqs(reqFilter);
      loadWallets();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || '操作失败');
    }
  };
  const pendingReqCount = reqFilter === 'pending' ? reqs.length : reqs.filter(r => r.status === 'pending').length;

  const columns = [
    { key: 'vendor', title: "商户", render: (v: Vendor) => (
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-purple-100 rounded-full flex items-center justify-center text-xs font-semibold text-purple-600">
          <Store className="w-4 h-4" />
        </div>
        <div>
          <p className="font-medium text-sm">{v.name}</p>
          <p className="text-xs text-gray-400">{v.email}</p>
        </div>
      </div>
    )},
    { key: 'company', title: "公司", render: (v: Vendor) => (
      <div>
        <p className="text-sm">{v.companyName || '-'}</p>
        {v.phone && <p className="text-xs text-gray-400">{v.phone}</p>}
      </div>
    )},
    { key: 'status', title: "状态", render: (v: Vendor) => (
      <Badge variant={v.status === 'active' ? 'success' : v.status === 'suspended' ? 'danger' : 'default'}>{v.status}</Badge>
    )},
    { key: 'balance', title: "余额(元)", render: (v: Vendor) => {
      const w = walletOf(v);
      if (!w) return <span className="text-xs text-gray-300">—</span>;
      return (
        <div>
          <p className={`text-sm font-semibold ${w.balance > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{round2(w.balance)}</p>
          <div className="flex gap-2 text-xs mt-0.5">
            <button onClick={() => openTopup(w, false)} className="text-emerald-600 hover:underline">充值</button>
            <button onClick={() => openTopup(w, true)} className="text-red-400 hover:underline">扣减</button>
            <button onClick={() => openLedger(w)} className="text-gray-400 hover:underline">明细</button>
          </div>
        </div>
      );
    }},
    { key: 'usage', title: "消息（30 天）", render: (v: Vendor) => (v.messages30d ?? 0).toLocaleString() },
    { key: 'last', title: "上次登录", render: (v: Vendor) => v.lastLogin ? new Date(v.lastLogin).toLocaleDateString() : '—' },
    { key: 'date', title: "已加入", render: (v: Vendor) => {
      const days = Math.floor((Date.now() - new Date(v.createdAt).getTime()) / 86400000);
      return <div><p className="text-sm">{new Date(v.createdAt).toLocaleDateString()}</p><p className="text-xs text-gray-400">{days} day{days === 1 ? '' : 's'} ago</p></div>;
    } },
    { key: 'actions', title: '', render: (v: Vendor) => (
      <div className="flex gap-1">
        <button onClick={() => router.push(`/admin/vendors/${v._id}`)} className="p-1.5 hover:bg-blue-50 rounded" title={"查看详情"}>
          <Eye className="w-4 h-4 text-blue-500" />
        </button>
        <button onClick={() => handleLoginAs(v)} className="p-1.5 hover:bg-emerald-50 rounded" title={"以该商户身份登录"}>
          <LogIn className="w-4 h-4 text-emerald-500" />
        </button>
        <button onClick={() => openEdit(v)} className="p-1.5 hover:bg-gray-100 rounded" title={"编辑"}>
          <Edit className="w-4 h-4 text-gray-400" />
        </button>
        <button onClick={() => handleToggleStatus(v._id, v.status)} className="p-1.5 hover:bg-gray-100 rounded" title={v.status === 'active' ? "暂停" : "启用"}>
          {v.status === 'active' ? <Ban className="w-4 h-4 text-yellow-500" /> : <CheckCircle className="w-4 h-4 text-emerald-500" />}
        </button>
        <button onClick={() => handleDelete(v._id)} className="p-1.5 hover:bg-red-50 rounded" title={"删除"}>
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      </div>
    )},
  ];

  const tabs = [
    { key: 'list', label: '商户列表', content: (
      <div className="space-y-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" autoComplete="off" placeholder={"按名称、电子邮件或公司搜索商户..."} value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>

        <Table columns={columns} data={vendors} loading={loading} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => adminApi.deleteVendor(id).catch(() => null))); fetchVendors(); }} />

        {pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              显示页面 {page} of {pages} · {total} 商户总计
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</Button>
              <span className="text-sm font-medium text-gray-700">{page} / {pages}</span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>下一步</Button>
            </div>
          </div>
        )}
      </div>
    )},
    { key: 'orders', label: '充值订单', content: (
      <Card padding={false} className="overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <FilterPills value={orderFilter} onChange={setOrderFilter}
            options={[['', '全部'], ['pending', '待支付'], ['paid', '已到账'], ['expired', '已超时'], ['failed', '失败']]} />
          <span className="flex-1" />
          <Button size="sm" variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => loadOrders(orderFilter)}>刷新</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50/60">
                <th className="px-4 py-3 font-medium">订单号</th>
                <th className="px-3 py-3 font-medium">商家</th>
                <th className="px-3 py-3 font-medium text-right">USDT</th>
                <th className="px-3 py-3 font-medium text-right">到账(元)</th>
                <th className="px-3 py-3 font-medium">状态</th>
                <th className="px-3 py-3 font-medium">交易哈希</th>
                <th className="px-3 py-3 font-medium">时间</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-14 text-center text-gray-400">暂无充值订单</td></tr>
              ) : orders.map(o => (
                <tr key={o._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{o.orderNo}</td>
                  <td className="px-3 py-2.5 text-gray-900">{o.workspace?.name || '—'}<div className="text-xs text-gray-400">{o.by?.name || ''}</div></td>
                  <td className="px-3 py-2.5 text-right font-medium">{o.usdtAmount}</td>
                  <td className="px-3 py-2.5 text-right">{o.status === 'paid' ? <span className="text-emerald-600 font-medium">{round2(o.credits)}</span> : '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${USDT_STATUS[o.status]?.cls || ''}`}>{USDT_STATUS[o.status]?.label || o.status}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-400 max-w-32 truncate" title={o.externalId}>{o.externalId || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{fmtTime(o.createdAt)}{o.paidAt ? <><br />到账 {fmtTime(o.paidAt)}</> : null}</td>
                  <td className="px-4 py-2.5 text-right">
                    {o.status !== 'paid' && (
                      <Button size="sm" variant="outline" icon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={() => creditOrder(o)}>手动补单</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    )},
    { key: 'requests', label: `充值申请${pendingReqCount ? `（${pendingReqCount}）` : ''}`, content: (
      <Card padding={false} className="overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <FilterPills value={reqFilter} onChange={setReqFilter}
            options={[['pending', '待审核'], ['approved', '已通过'], ['rejected', '已拒绝'], ['', '全部']]} />
          <span className="flex-1" />
          <Button size="sm" variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => loadReqs(reqFilter)}>刷新</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50/60">
                <th className="px-4 py-3 font-medium">商家 / 申请人</th>
                <th className="px-3 py-3 font-medium text-right">金额(元)</th>
                <th className="px-3 py-3 font-medium">备注</th>
                <th className="px-3 py-3 font-medium">状态</th>
                <th className="px-3 py-3 font-medium">时间</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {reqs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-14 text-center text-gray-400">暂无申请</td></tr>
              ) : reqs.map(r => (
                <tr key={r._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-gray-900">{r.workspace?.name || '—'}<div className="text-xs text-gray-400">{r.by?.name || ''}</div></td>
                  <td className="px-3 py-2.5 text-right font-semibold">{round2(r.amount)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 max-w-56 truncate" title={r.note}>{r.note || ''}{r.adminNote ? ` · 管理员：${r.adminNote}` : ''}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REQ_STATUS[r.status]?.cls || ''}`}>{REQ_STATUS[r.status]?.label || r.status}</span>
                    {r.handledBy?.name && <div className="text-xs text-gray-400 mt-0.5">{r.handledBy.name}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{fmtTime(r.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    {r.status === 'pending' && (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" icon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={() => handleReq(r, 'approve')}>通过</Button>
                        <Button size="sm" variant="danger" icon={<XCircle className="w-3.5 h-3.5" />} onClick={() => handleReq(r, 'reject')}>拒绝</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">商户管理</h1>
          <p className="text-sm text-gray-500 mt-1">商户账户、余额（人民币）、充值订单与申请。单价和收款配置在 系统偏好设置 → 省钱专家</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openNew}>添加商户</Button>
      </div>

      <Tabs tabs={tabs} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editVendor ? "编辑商户" : "添加商户"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label={"名称"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label={"电话"} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+60..." />
          </div>
          <Input label={"邮箱"} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!editVendor} />
          <Input label={editVendor ? "新密码（留空保留）" : "密码"} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editVendor} />
          <hr className="border-gray-200" />
          <Input label={"公司名称"} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          <Input label={"网站"} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
          <Input label={"商品及服务税号"} value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} />
          <Input label={"地址"} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Textarea label={"注释"} value={form.vendorNotes} onChange={(e) => setForm({ ...form, vendorNotes: e.target.value })} />
          {editVendor && (
            <Select label={"状态"} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
              options={[{ value: 'active', label: "启用" }, { value: 'suspended', label: "暂停" }, { value: 'inactive', label: "停用" }]} />
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
            <Button onClick={handleSave}>{editVendor ? "更新" : "创建商户"}</Button>
          </div>
        </div>
      </Modal>

      {/* 充值/扣减 */}
      <Modal isOpen={!!topupWs} onClose={() => setTopupWs(null)} title={`${minus ? '扣减' : '充值'} — ${topupWs?.name || ''}`} size="sm" guard={false}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">当前余额 <span className="font-semibold text-gray-900">{rmb(topupWs?.balance || 0)}</span></p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{minus ? '扣减' : '充值'}金额（元）</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} autoFocus
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">备注（可选）</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder={minus ? '扣减原因' : '如：收款 100U'}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTopupWs(null)}>取消</Button>
            <Button variant={minus ? 'danger' : 'primary'} onClick={doTopup} loading={submitting}>确认{minus ? '扣减' : '充值'}</Button>
          </div>
        </div>
      </Modal>

      {/* 余额明细 */}
      <Modal isOpen={!!ledgerWs} onClose={() => setLedgerWs(null)} title={`余额明细 — ${ledgerWs?.name || ''}`} size="xl" guard={false}>
        <div className="space-y-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 font-medium">时间</th>
                <th className="pb-2 font-medium">类型</th>
                <th className="pb-2 font-medium text-right">变动(元)</th>
                <th className="pb-2 font-medium text-right">余额(元)</th>
                <th className="pb-2 font-medium">关联任务 / 备注</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400">暂无明细</td></tr>
              ) : ledger.map(l => (
                <tr key={l._id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-xs text-gray-500">{fmtTime(l.createdAt)}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEDGER_TYPE[l.type]?.cls || ''}`}>{LEDGER_TYPE[l.type]?.label || l.type}</span>
                  </td>
                  <td className={`py-2 text-right font-medium ${l.amount >= 0 ? 'text-emerald-600' : 'text-gray-700'}`}>{l.amount >= 0 ? '+' : ''}{round2(l.amount)}</td>
                  <td className="py-2 text-right text-gray-500">{round2(l.balanceAfter)}</td>
                  <td className="py-2 text-xs text-gray-500 max-w-70 truncate">
                    {l.task ? `${l.task.fileName || ''}（${typeName(l.task.taskType)} ${l.task.total || 0}条）` : ''}
                    {l.note ? ` ${l.note}` : ''}
                    {l.by?.name ? ` · 操作人 ${l.by.name}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-end gap-1.5 text-xs text-gray-500">
            <button disabled={ledgerPage <= 1}
              onClick={() => { const p = ledgerPage - 1; setLedgerPage(p); if (ledgerWs) loadLedger(ledgerWs.workspaceId, p); }}
              className="px-2.5 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">上一页</button>
            <span className="px-1">{ledgerPage} / {ledgerPages}</span>
            <button disabled={ledgerPage >= ledgerPages}
              onClick={() => { const p = ledgerPage + 1; setLedgerPage(p); if (ledgerWs) loadLedger(ledgerWs.workspaceId, p); }}
              className="px-2.5 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">下一页</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
