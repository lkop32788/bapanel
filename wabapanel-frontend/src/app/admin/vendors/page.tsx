'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, Ban, CheckCircle, LogIn, Store, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Textarea from '@/components/ui/Textarea';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Vendor {
  _id: string; name: string; email: string; phone: string; status: string;
  companyName: string; website: string; address: string; gstNumber: string; vendorNotes: string;
   createdAt: string; lastLogin?: string;  
  messages30d?: number;  
  
}

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

  useEffect(() => { fetchVendors(); }, [search, page]);

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

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">商户管理</h1>
          <p className="text-sm text-gray-500 mt-1">与普通用户分开管理商户账户</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openNew}>添加商户</Button>
      </div>

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

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editVendor ? "编辑商户" : "添加商户"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label={"名称"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label={"电话"} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91..." />
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
    </div>
  );
}
