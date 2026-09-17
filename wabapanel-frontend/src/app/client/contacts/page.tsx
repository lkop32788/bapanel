'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Upload, Download, Search, Phone, Mail, Trash2, Edit, FileDown, X, Clock, MessageSquare, Tag as TagIcon, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { contactApi, tagApi, dataFieldApi, badgeApi, segmentApi } from '@/lib/api';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { getSocket } from '@/lib/socket';
import type { Contact, Tag } from '@/types';
import toast from 'react-hot-toast';

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

interface DataField {
  _id: string;
  name: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  defaultValue: string;
  isActive: boolean;
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  whatsapp_qr: "WhatsApp 二维码",
  facebook: 'Facebook',
  instagram: 'Instagram',
  telegram: 'Telegram',
  telegram_personal: "电报个人",
  email: "Gmail/电子邮件",
};

const CHANNEL_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'whatsapp_qr', label: "WhatsApp 二维码" },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'telegram_personal', label: "电报个人" },
  { value: 'email', label: "Gmail/电子邮件" },
];

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [badges, setBadges] = useState<Tag[]>([]);
  const [dataFields, setDataFields] = useState<DataField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [optedOutCount, setOptedOutCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const isAgent = useAuthStore(s => s.user?.role === 'agent');
  const [detailContact, setDetailContact] = useState<Contact | null>(null);
  const [contactActivity, setContactActivity] = useState<Array<{_id: string; action: string; details: string; createdAt: string}>>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState({ name: '', phone: '', email: '', birthday: '', anniversary: '', tags: [] as string[], badges: [] as string[], customFields: {} as Record<string, string> });
  const importFileRef = React.useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [segments, setSegments] = useState<{ _id: string; name: string }[]>([]);
  const [importTags, setImportTags] = useState<string[]>([]);
  const [importSegments, setImportSegments] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkAssign, setShowBulkAssign] = useState<'tags' | 'segments' | null>(null);
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await contactApi.list({ page, search, limit: pageSize, channel: channelFilter || undefined, tag: tagFilter || undefined, status: statusFilter || undefined });
      setContacts(res.data.data || []);
      setTotalPages(res.data.pagination?.totalPages || res.data.pagination?.pages || 1);
      setTotal(res.data.pagination?.total || 0);
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tag');
    if (t) setTagFilter(t);
    setFiltersReady(true);
  }, []);

  useEffect(() => { if (!filtersReady) return; fetchContacts(); setSelectedIds([]); }, [filtersReady, page, pageSize, search, channelFilter, tagFilter, statusFilter]);
  useEffect(() => {
    contactApi.list({ status: 'opted_out', limit: 1 })
      .then(r => setOptedOutCount(r.data.pagination?.total || 0))
      .catch(() => {});
  }, [statusFilter, total]);
  useEffect(() => {
    tagApi.list().then(r => setTags(r.data.data || [])).catch(() => {});
    badgeApi.list().then(r => setBadges(r.data.data || [])).catch(() => {});
    dataFieldApi.list().then(r => setDataFields((r.data.data || []).filter((f: DataField) => f.isActive))).catch(() => {});
    segmentApi.list().then(r => setSegments(r.data.data || [])).catch(() => {});
  }, []);

  // FEAT-01: "Delete all matching" - owner / workspace admin / super_admin only (the backend enforces the same).
  const canDeleteAll = useAuthStore(s => {
    const u = s.user;
    if (!u || u.role === 'agent') return false;
    if (u.role === 'super_admin') return true;
    const ws = s.currentWorkspace;
    if (!ws) return false;
    const idOf = (x: unknown) => (x && typeof x === 'object' ? String((x as { _id?: string })._id || '') : String(x || ''));
    return idOf(ws.owner) === u._id || (ws.members || []).some(m => idOf(m.user) === u._id && m.role === 'admin');
  });
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleteAllText, setDeleteAllText] = useState('');
  const [startingDeleteAll, setStartingDeleteAll] = useState(false);
  const [deleteAllJob, setDeleteAllJob] = useState<{ running: boolean; total: number; deleted: number } | null>(null);

  useEffect(() => {
    api.get('/contacts/delete-all/status').then(r => {
      const j = r.data.data;
      if (j?.running) setDeleteAllJob({ running: true, total: j.total, deleted: j.deleted });
    }).catch(() => {});
    const s = getSocket();
    const onProgress = (p: { total: number; deleted: number; done: boolean; error?: string }) => {
      setDeleteAllJob({ running: !p.done, total: p.total, deleted: p.deleted });
      if (p.done) {
        if (p.error) toast.error(translateApiMessage(`删除停止于 ${p.deleted} 联系人： ${p.error}`));
        else toast.success(translateApiMessage(`${p.deleted} 联系人已删除`));
        fetchContacts();
      }
    };
    s?.on('contacts_delete_progress', onProgress);
    return () => { s?.off('contacts_delete_progress', onProgress); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback when the socket is not connected: poll the job status while it runs.
  useEffect(() => {
    if (!deleteAllJob?.running) return;
    const t = setInterval(() => {
      api.get('/contacts/delete-all/status').then(r => {
        const j = r.data.data;
        if (!j) return;
        setDeleteAllJob({ running: !!j.running, total: j.total, deleted: j.deleted });
        if (!j.running) fetchContacts();
      }).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteAllJob?.running]);

  const handleDeleteAll = async () => {
    if (deleteAllText !== 'DELETE' || startingDeleteAll) return;
    setStartingDeleteAll(true);
    try {
      const filter = { search: search || undefined, tag: tagFilter || undefined, status: statusFilter || undefined, channel: channelFilter || undefined };
      const res = await api.post('/contacts/delete-all', { confirm: 'DELETE', filter, expectedCount: total });
      toast.success(translateApiMessage(res.data.message || "正在删除联系人..."));
      setDeleteAllJob({ running: true, total: res.data.data?.total || total, deleted: 0 });
      setShowDeleteAll(false);
      setSelectedIds([]);
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "删除失败"));
      if (error.response?.status === 409) fetchContacts();
    } finally {
      setStartingDeleteAll(false);
    }
  };

  const getDefaultCustomFields = (): Record<string, string> => {
    const defaults: Record<string, string> = {};
    dataFields.forEach(f => { defaults[f.name] = f.defaultValue || ''; });
    return defaults;
  };

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = { ...form, birthday: form.birthday || null, anniversary: form.anniversary || null };
      if (editContact) {
        await contactApi.update(editContact._id, payload);
        toast.success(translateApiMessage("联系方式已更新"));
      } else {
        await contactApi.create(payload);
        toast.success(translateApiMessage("联系人已创建"));
      }
      setShowModal(false);
      setEditContact(null);
      setForm({ name: '', phone: '', email: '', birthday: '', anniversary: '', tags: [], badges: [], customFields: {} });
      fetchContacts();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    if (!confirm("删除此联系人？")) return;
    setSubmitting(true);
    try {
      await contactApi.delete(id);
      toast.success(translateApiMessage("联系人已删除"));
      fetchContacts();
    } catch { toast.error(translateApiMessage("删除失败")); } finally { setSubmitting(false); }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleBulkDelete = async () => {
    if (submitting) return;
    if (selectedIds.length === 0) return;
    if (!confirm(`删除 ${selectedIds.length} 选择联系人？`)) return;
    setSubmitting(true);
    setDeleting(true);
    try {
      await contactApi.bulkDelete(selectedIds);
      toast.success(translateApiMessage(`${selectedIds.length} 联系人已删除`));
      setSelectedIds([]);
      fetchContacts();
    } catch { toast.error(translateApiMessage("批量删除失败")); } finally { setSubmitting(false); }
    setDeleting(false);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const applyBulkAssign = async (mode: 'add' | 'remove') => {
    if (!showBulkAssign || bulkIds.length === 0 || selectedIds.length === 0) return;
    setBulkSaving(true);
    try {
      const res = await contactApi.bulkAssign({
        ids: selectedIds,
        [showBulkAssign]: bulkIds,
        mode,
      });
      toast.success(translateApiMessage(res.data.message || "联系人已更新"));
      setShowBulkAssign(null);
      setBulkIds([]);
      setSelectedIds([]);
      fetchContacts();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "无法更新联系人"));
    }
    setBulkSaving(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === contacts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contacts.map(c => c._id));
    }
  };

  const handleDownloadTemplate = () => {
    const customCols = dataFields.map(f => f.name);
    const header = ['name', 'phone', 'email', 'tags',  'segments', 'birthday', 'anniversary', ...customCols].join(',');
    const row1 = ['Sample Name One', '910000000001', 'sample1@example.com', 'VIP;Lead', 'Negotiation', 'Wholesale;Mumbai', '21-04-1995', '02-11-2018', ...customCols.map(() => '')].join(',');
    const row2 = ['Sample Name Two', '910000000002', 'sample2@example.com', 'Customer', 'New', 'Retail', '', '', ...customCols.map(() => '')].join(',');
    const csv = [header, row1, row2].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'contacts-import-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (submitting) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      importTags.forEach(t => formData.append('tags', t));
      importSegments.forEach(s => formData.append('segments', s));
      const res = await contactApi.import(formData);
      toast.success(translateApiMessage(res.data.message || "联系人已导入"));
      setShowImport(false);
      fetchContacts();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "导入失败"));
    } finally {
      setSubmitting(false);
    }
    setImporting(false);
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const handleExport = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const res = await contactApi.export();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = 'contacts.csv'; a.click();
    } catch { toast.error(translateApiMessage("导出失败")); } finally { setSubmitting(false); }
  };

  const openEdit = (contact: Contact) => {
    setEditContact(contact);
    const cf = ((contact as unknown as Record<string, unknown>).customFields || {}) as Record<string, string>;
    const customFields: Record<string, string> = {};
    dataFields.forEach(f => { customFields[f.name] = cf[f.name] || f.defaultValue || ''; });
    const cext = contact as unknown as { birthday?: string; anniversary?: string };
    setForm({
      name: contact.name, phone: contact.phone, email: contact.email,
      birthday: cext.birthday ? cext.birthday.slice(0, 10) : '',
      anniversary: cext.anniversary ? cext.anniversary.slice(0, 10) : '',
      tags: contact.tags?.map(t => t._id || t as unknown as string) || [],
      badges: contact.badges?.map(b => b._id || b as unknown as string) || [],
      customFields,
    });
    setShowModal(true);
  };

  const openAdd = () => {
    setEditContact(null);
    setForm({ name: '', phone: '', email: '', birthday: '', anniversary: '', tags: [], badges: [], customFields: getDefaultCustomFields() });
    setShowModal(true);
  };

  const updateCustomField = (fieldName: string, value: string) => {
    setForm(prev => ({ ...prev, customFields: { ...prev.customFields, [fieldName]: value } }));
  };

  // LV-07: one checkbox column only. The page's own column is kept (it feeds selectedIds for the
  // Tags / Group bulk-assign and "Delete N Selected"); the Table's own column is not enabled.
  const columns = [
    { key: 'select', title: (
      <input type="checkbox" checked={contacts.length > 0 && selectedIds.length === contacts.length} onChange={toggleSelectAll} className="rounded text-emerald-600" />
    ), render: (c: Contact) => (
      <input type="checkbox" checked={selectedIds.includes(c._id)} onChange={() => toggleSelect(c._id)} className="rounded text-emerald-600" onClick={(e) => e.stopPropagation()} />
    )},
    { key: 'name', title: "名称", render: (c: Contact) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-medium">{c.name?.charAt(0) || '?'}</div>
        <span className="font-medium text-gray-900">{c.name}</span>
      </div>
    )},
    { key: 'phone', title: "电话", render: (c: Contact) => <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" />{c.phone}</span> },
    { key: 'email', title: "邮箱", render: (c: Contact) => c.email ? <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-gray-400" />{c.email}</span> : '-' },
    { key: 'tags', title: "标签", render: (c: Contact) => (
      <div className="flex gap-1 flex-wrap">{c.tags?.slice(0, 3).map((t, i) => <Badge key={i} variant="info">{typeof t === 'object' ? t.name : t}</Badge>)}{c.badges?.slice(0, 3).map((b, i) => <span key={'bg'+i} className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: ((typeof b==='object'&&b.color)||'#10b981')+'20', color: (typeof b==='object'&&b.color)||'#10b981' }}>{typeof b === 'object' ? b.name : b}</span>)}</div>
    )},
    { key: 'platform', title: "平台", render: (c: Contact) => <Badge variant="info">{CHANNEL_LABELS[c.channel || ''] || CHANNEL_LABELS[c.source || ''] || 'WhatsApp'}</Badge> },
    { key: 'status', title: "状态", render: (c: Contact) => <Badge variant={c.status === 'active' ? 'success' : c.status === 'opted_out' ? 'warning' : 'danger'}>{c.status === 'opted_out' ? "取消订阅" : c.status}</Badge> },
    { key: 'actions', title: '', render: (c: Contact) => (
      <div className="flex gap-1">
        <button onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
        {!isAgent && <button onClick={(e) => { e.stopPropagation(); handleDelete(c._id); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>}
      </div>
    )},
  ];

  // Agents can view/edit contacts but not delete them, so drop the bulk-select column for them.
  const visibleColumns = isAgent ? columns.filter(col => col.key !== 'select') : columns;

  const renderCustomField = (field: DataField) => {
    const value = form.customFields[field.name] || '';
    const isRequired = field.required;
    const label = `${field.label}${isRequired ? ' *' : ''}`;

    switch (field.type) {
      case 'dropdown':
        return (
          <div key={field._id}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <select
              value={value}
              onChange={(e) => updateCustomField(field.name, e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              required={isRequired}
            >
              <option value="">请选择 {translateDisplay(field.label)}</option>
              {field.options.map((opt) => (
                <option key={opt} value={opt}>{translateDisplay(opt)}</option>
              ))}
            </select>
          </div>
        );
      case 'checkbox':
        return (
          <div key={field._id}>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={value === 'true'}
                onChange={(e) => updateCustomField(field.name, e.target.checked ? 'true' : 'false')}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              {field.label}
            </label>
          </div>
        );
      case 'boolean':
        return (
          <div key={field._id}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <select
              value={value}
              onChange={(e) => updateCustomField(field.name, e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              required={isRequired}
            >
              <option value="">请选择</option>
              <option value="true">是的</option>
              <option value="false">否</option>
            </select>
          </div>
        );
      case 'date':
        return <Input key={field._id} label={label} type="date" value={value} onChange={(e) => updateCustomField(field.name, e.target.value)} required={isRequired} />;
      case 'number':
        return <Input key={field._id} label={label} type="number" value={value} onChange={(e) => updateCustomField(field.name, e.target.value)} required={isRequired} />;
      case 'email':
        return <Input key={field._id} label={label} type="email" value={value} onChange={(e) => updateCustomField(field.name, e.target.value)} required={isRequired} />;
      case 'url':
        return <Input key={field._id} label={label} type="url" value={value} onChange={(e) => updateCustomField(field.name, e.target.value)} placeholder="https://" required={isRequired} />;
      case 'phone':
        return <Input key={field._id} label={label} type="tel" value={value} onChange={(e) => updateCustomField(field.name, e.target.value)} placeholder="+91XXXXXXXXXX" required={isRequired} />;
      default:
        return <Input key={field._id} label={label} value={value} onChange={(e) => updateCustomField(field.name, e.target.value)} required={isRequired} />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">联系人</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total} 联系人总数
            {optedOutCount > 0 && (
              <>
                {' · '}
                <button onClick={() => { setPage(1); setStatusFilter('opted_out'); }} className="text-yellow-700 hover:underline">
                  {optedOutCount} 取消订阅
                </button>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Download className="w-4 h-4" />} onClick={handleExport}>出口</Button>
          <Button variant="outline" icon={<FileDown className="w-4 h-4" />} onClick={handleDownloadTemplate}>模板</Button>
          <input ref={importFileRef} type="file" accept=".csv,.xlsx,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={handleImport} />
          <Button variant="outline" icon={<Upload className="w-4 h-4" />} onClick={() => setShowImport(true)} loading={importing}>导入</Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={openAdd}>添加联系人</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder={"搜索联系人..."} value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <select
          value={channelFilter}
          onChange={(e) => { setPage(1); setChannelFilter(e.target.value); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">所有平台</option>
          {CHANNEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{translateDisplay(o.label)}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">所有状态</option>
          <option value="active">已订阅</option>
          <option value="opted_out">取消订阅({translateDisplay(optedOutCount)})</option>
          <option value="blocked">被阻止</option>
        </select>
        {tagFilter && (
          <span className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
            标签： {tags.find(t => t._id === tagFilter)?.name || "过滤器"}
            <button onClick={() => { setPage(1); setTagFilter(''); window.history.replaceState(null, '', '/client/contacts'); }} className="hover:text-emerald-900"><X className="w-3 h-3" /></button>
          </span>
        )}
        {selectedIds.length > 0 && (
          <>
            <Button variant="outline" icon={<TagIcon className="w-4 h-4" />} onClick={() => { setBulkIds([]); setShowBulkAssign('tags'); }}>
              标签 ({selectedIds.length})
            </Button>
            <Button variant="outline" icon={<Users className="w-4 h-4" />} onClick={() => { setBulkIds([]); setShowBulkAssign('segments'); }}>
              组（{selectedIds.length})
            </Button>
          </>
        )}
        {!isAgent && selectedIds.length > 0 && (
          <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={handleBulkDelete} loading={deleting}>
            删除 {selectedIds.length} 已选择
          </Button>
        )}
        {canDeleteAll && total > 0 && !deleteAllJob?.running && (
          <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => { setDeleteAllText(''); setShowDeleteAll(true); }}>
            全部删除 {total} 匹配
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2 text-sm text-gray-500">
          <span>显示</span>
          <select
            value={pageSize}
            onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }}
            className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{translateDisplay(n)}</option>)}
          </select>
          <span>每页</span>
        </div>
      </div>

      {deleteAllJob?.running && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center justify-between text-sm font-medium text-red-800">
            <span>正在后台删除联系人...</span>
            <span>{deleteAllJob.deleted} / {deleteAllJob.total}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-red-100">
            <div className="h-full bg-red-600 transition-all" style={{ width: `${deleteAllJob.total ? Math.min(100, Math.round((deleteAllJob.deleted * 100) / deleteAllJob.total)) : 0}%` }} />
          </div>
        </div>
      )}

      <Table columns={visibleColumns} data={contacts} loading={loading} pagination={{ page, totalPages, total, onPageChange: setPage }} onRowClick={(c: Contact) => { setDetailContact(c); setActivityLoading(true); api.get('/conversations', { params: { contact: c._id, limit: 10 } }).then(r => setContactActivity((r.data.data || []).map((cv: { _id: string; status?: string; lastMessage?: { text?: string }; updatedAt?: string }) => ({ _id: cv._id, action: cv.status === 'closed' ? 'Chat resolved' : 'Chat active', details: cv.lastMessage?.text || '', createdAt: cv.updatedAt || '' })))).catch(() => setContactActivity([])).finally(() => setActivityLoading(false)); }} />

      {/* Contact Detail Drawer */}
      {detailContact && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDetailContact(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-96 bg-white dark:bg-gray-800 h-full shadow-xl overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{detailContact.name}</h3>
              <button onClick={() => setDetailContact(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xl font-semibold">{detailContact.name?.charAt(0) || '?'}</div>
                <div>
                  <p className="font-medium text-gray-900">{detailContact.name}</p>
                  <p className="text-sm text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{detailContact.phone}</p>
                  {detailContact.email && <p className="text-sm text-gray-500 flex items-center gap-1"><Mail className="w-3 h-3" />{detailContact.email}</p>}
                </div>
              </div>
              {detailContact.tags && detailContact.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">{detailContact.tags.map((t, i) => <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">{typeof t === 'object' ? (t as {name: string}).name : t}</span>)}</div>
              )}
              {detailContact.badges && detailContact.badges.length > 0 && (
                <div className="flex gap-1 flex-wrap">{detailContact.badges.map((b, i) => <span key={'b'+i} className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: ((typeof b==='object'&&(b as {color?:string}).color)||'#10b981')+'20', color: (typeof b==='object'&&(b as {color?:string}).color)||'#10b981' }}>{typeof b === 'object' ? (b as {name:string}).name : b}</span>)}</div>
              )}
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1"><Clock className="w-4 h-4" /> 活动时间表</h4>
                {activityLoading ? (
                  <p className="text-sm text-gray-400">加载中…</p>
                ) : contactActivity.length === 0 ? (
                  <p className="text-sm text-gray-400">暂无最近活动</p>
                ) : (
                  <div className="space-y-3">
                    {contactActivity.map(a => (
                      <div key={a._id} className="flex gap-3">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5"><MessageSquare className="w-3 h-3 text-gray-400" /></div>
                        <div className="min-w-0"><p className="text-sm text-gray-700">{a.action}</p>{a.details && <p className="text-xs text-gray-400 truncate">{a.details}</p>}<p className="text-xs text-gray-300">{a.createdAt ? new Date(a.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-gray-100 pt-4 flex gap-2">
                <button onClick={() => { window.location.href = '/client/chat?channel=whatsapp&conv=' + (detailContact as {conversations?: string[]}).conversations?.[0]; }} className="flex-1 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-1"><MessageSquare className="w-4 h-4" /> 打开聊天</button>
                <button onClick={() => { openEdit(detailContact); setDetailContact(null); }} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-1"><Edit className="w-4 h-4" /> 编辑</button>
              </div>
              <div className="pt-2">
                <button
                  onClick={async () => {
                    const optedOut = detailContact.status === 'opted_out';
                    const next = optedOut ? 'active' : 'opted_out';
                    try {
                      await contactApi.update(detailContact._id, { status: next, optInStatus: optedOut });
                      setDetailContact({ ...detailContact, status: next });
                      fetchContacts();
                      toast.success(translateApiMessage(optedOut ? "联系人重新订阅" : "联系取消订阅"));
                    } catch { toast.error(translateApiMessage("更新失败")); }
                  }}
                  className={`w-full px-3 py-2 text-sm rounded-lg flex items-center justify-center gap-1 border ${detailContact.status === 'opted_out' ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-yellow-200 text-yellow-700 hover:bg-yellow-50'}`}
                >
                  {detailContact.status === 'opted_out' ? "重新订阅（选择加入）" : "取消订阅（选择退出）"}
                </button>
                <p className="mt-1 text-[11px] text-gray-400 text-center">取消订阅的联系人被排除在所有广播和活动之外。</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={!!showBulkAssign}
        onClose={() => setShowBulkAssign(null)}
        title={showBulkAssign === 'segments' ? `组/段 ${selectedIds.length} 联系人` : `标签 ${selectedIds.length} 联系人`}
      >
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {(showBulkAssign === 'segments' ? segments : tags).length === 0 && (
              <span className="text-xs text-gray-400">{showBulkAssign === 'segments' ? "尚无分段" : "还没有标签"}</span>
            )}
            {(showBulkAssign === 'segments' ? segments : tags).map((item) => (
              <button
                key={item._id}
                type="button"
                onClick={() => setBulkIds(prev => prev.includes(item._id) ? prev.filter(x => x !== item._id) : [...prev, item._id])}
                className={`px-3 py-1 rounded-full text-xs border ${bulkIds.includes(item._id) ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowBulkAssign(null)}>取消</Button>
            <Button variant="outline" loading={bulkSaving} onClick={() => applyBulkAssign('remove')}>删除</Button>
            <Button loading={bulkSaving} onClick={() => applyBulkAssign('add')}>添加</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title={"导入联系人"}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">CSV/Excel (.xlsx) ki 标签/细分列 ke saath-saath，yahan chuni gayi 标签 aur 细分 sabhi 导入联系人 par lag jayengi。</p>
          <p className="text-xs text-gray-400">提示：Excel 文件（.xlsx）seedha 上传 karo — CSV 我的手机 9.19E+11 jaisa ban kar 数字 kho deta hai。</p>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">标签</p>
            <div className="flex gap-2 flex-wrap">
              {tags.length === 0 && <span className="text-xs text-gray-400">还没有标签</span>}
              {tags.map((tag) => (
                <button
                  key={tag._id}
                  type="button"
                  onClick={() => setImportTags(prev => prev.includes(tag._id) ? prev.filter(t => t !== tag._id) : [...prev, tag._id])}
                  className={`px-3 py-1 rounded-full text-xs border ${importTags.includes(tag._id) ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">段/组</p>
            <div className="flex gap-2 flex-wrap">
              {segments.length === 0 && <span className="text-xs text-gray-400">尚无分段</span>}
              {segments.map((sg) => (
                <button
                  key={sg._id}
                  type="button"
                  onClick={() => setImportSegments(prev => prev.includes(sg._id) ? prev.filter(s => s !== sg._id) : [...prev, sg._id])}
                  className={`px-3 py-1 rounded-full text-xs border ${importSegments.includes(sg._id) ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {sg.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowImport(false)}>取消</Button>
            <Button icon={<Upload className="w-4 h-4" />} loading={importing} onClick={() => importFileRef.current?.click()}>选择 CSV/Excel 并导入</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editContact ? "编辑联系人" : "添加联系人"}>
        <div className="space-y-4">
          <Input label={"名称"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={"电话"} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91XXXXXXXXXX" required />
          <Input label={"邮箱"} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">生日</label>
              <input type="date" value={form.birthday} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()} onChange={(e) => setForm({ ...form, birthday: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">周年纪念日</label>
              <input type="date" value={form.anniversary} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()} onChange={(e) => setForm({ ...form, anniversary: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
          </div>

          {/* Custom Data Fields */}
          {dataFields.length > 0 && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm font-semibold text-gray-600 mb-3">附加信息</p>
              <div className="space-y-3">
                {dataFields.map(renderCustomField)}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">标签</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag._id}
                  onClick={() => setForm({ ...form, tags: form.tags.includes(tag._id) ? form.tags.filter(t => t !== tag._id) : [...form.tags, tag._id] })}
                  className={`px-3 py-1 rounded-full text-xs border ${form.tags.includes(tag._id) ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>

          {badges.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">徽章</label>
            <div className="flex flex-wrap gap-2">
              {badges.map((bg) => (
                <button
                  key={bg._id}
                  onClick={() => setForm({ ...form, badges: form.badges.includes(bg._id) ? form.badges.filter(b => b !== bg._id) : [...form.badges, bg._id] })}
                  className="px-3 py-1 rounded-full text-xs border"
                  style={form.badges.includes(bg._id) ? { backgroundColor: (bg.color||'#10b981')+'20', borderColor: bg.color, color: bg.color } : { background:'#fff', borderColor:'#e5e7eb', color:'#4b5563' }}
                >
                  {bg.name}
                </button>
              ))}
            </div>
          </div>
          )}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
            <Button onClick={handleSave}>{editContact ? "更新" : "创建"}</Button>
          </div>
        </div>
      </Modal>

      {/* FEAT-01: typed-DELETE confirmation for "Delete all matching" */}
      <Modal isOpen={showDeleteAll} onClose={() => { if (!startingDeleteAll) setShowDeleteAll(false); }} title={"删除所有匹配的联系人"}>
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            这将永久删除 <b>{total}</b> 联系人
            {(search || tagFilter || statusFilter || channelFilter) ? "匹配当前过滤器" : "- 未设置过滤器，因此这是此工作区中的每个联系人"}，以及他们的聊天、消息和笔记。此操作无法撤消：如果您可能需要该列表，请先导出。
          </p>
          {(search || tagFilter || statusFilter || channelFilter) && (
            <ul className="list-disc pl-5 text-xs text-gray-500">
              {search && <li>搜索： {search}</li>}
              {tagFilter && <li>标签： {tags.find(t => t._id === tagFilter)?.name || tagFilter}</li>}
              {statusFilter && <li>状态： {statusFilter}</li>}
              {channelFilter && <li>平台： {CHANNEL_LABELS[channelFilter] || channelFilter}</li>}
            </ul>
          )}
          <Input label={"键入 DELETE 进行确认"} value={deleteAllText} onChange={(e) => setDeleteAllText(e.target.value)} placeholder="DELETE" />
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowDeleteAll(false)} disabled={startingDeleteAll} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">取消</button>
            <button onClick={handleDeleteAll} disabled={deleteAllText !== 'DELETE' || startingDeleteAll} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> {startingDeleteAll ? "开始..." : `删除 ${total} 联系人`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
