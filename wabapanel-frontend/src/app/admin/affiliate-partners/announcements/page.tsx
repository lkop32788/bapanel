'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Table, { type Column } from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import { adminPartnersApi } from '@/lib/api';
import { announcementLabel, announcementTypes, announcementVariant, type AnnouncementType } from '@/lib/affiliateLabels';
import toast from 'react-hot-toast';

interface AnnouncementRow {
  _id: string; title: string; message: string; type: AnnouncementType;
  published: boolean; postDate: string; expiresAt: string | null;
}

const dateInput = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : '');

const emptyForm = { title: '', message: '', type: 'general' as AnnouncementType, published: true, postDate: '', expiresAt: '' };

export default function AdminAffiliateAnnouncementsPage() {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    adminPartnersApi.announcements(filter ? { status: filter } : undefined)
      .then((r) => setRows(r.data.data || []))
      .catch(() => toast.error(translateApiMessage("无法加载公告")))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (a: AnnouncementRow) => {
    setEditing(a);
    setForm({
      title: a.title, message: a.message, type: a.type, published: a.published,
      postDate: dateInput(a.postDate), expiresAt: dateInput(a.expiresAt),
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    const body = {
      title: form.title,
      message: form.message,
      type: form.type,
      published: form.published,
      ...(form.postDate ? { postDate: form.postDate } : {}),
      expiresAt: form.expiresAt || null,
    };
    try {
      if (editing) await adminPartnersApi.updateAnnouncement(editing._id, body);
      else await adminPartnersApi.createAnnouncement(body);
      toast.success(translateApiMessage(editing ? "公告已更新" : "公告已发布"));
      setOpen(false);
      load();
    } catch (e) {
      toast.error(translateApiMessage(isAxiosError(e) ? e.response?.data?.message || "无法保存公告" : "无法保存公告"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: AnnouncementRow) => {
    if (!confirm(`删除“${a.title}”?`)) return;
    try {
      await adminPartnersApi.deleteAnnouncement(a._id);
      toast.success(translateApiMessage("公告已删除"));
      load();
    } catch {
      toast.error(translateApiMessage("无法删除公告"));
    }
  };

  const columns: Column<AnnouncementRow>[] = [
    {
      key: 'title', title: "公告",
      render: (a) => (
        <div className="max-w-md">
          <p className="font-medium text-gray-900">{a.title}</p>
          <p className="text-xs text-gray-500 line-clamp-2">{a.message}</p>
        </div>
      ),
    },
    { key: 'type', title: "类型", render: (a) => <Badge variant={announcementVariant[a.type]}>{announcementLabel[a.type]}</Badge> },
    {
      key: 'postDate', title: "发布日期",
      render: (a) => <span className="text-xs text-gray-500">{new Date(a.postDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>,
    },
    {
      key: 'expiresAt', title: "过期",
      render: (a) => <span className="text-xs text-gray-500">{a.expiresAt ? new Date(a.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : "从来没有"}</span>,
    },
    { key: 'published', title: "状态", render: (a) => <Badge variant={a.published ? 'success' : 'default'}>{a.published ? "已发布" : "草稿"}</Badge> },
    {
      key: 'actions', title: '',
      render: (a) => (
        <div className="flex items-center gap-1">
          <button className="p-1.5 text-gray-400 hover:text-gray-700" onClick={() => openEdit(a)} title={"编辑"}><Pencil className="w-4 h-4" /></button>
          <button className="p-1.5 text-gray-400 hover:text-red-600" onClick={() => remove(a)} title={"删除"}><Trash2 className="w-4 h-4" /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">联盟公告</h1>
          <p className="text-emerald-50 text-sm mt-1">在其门户中向合作伙伴显示的广播通知</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> 新公告</Button>
      </div>

      <Card padding={false} className="p-4">
        <div className="w-48">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} options={[
            { value: '', label: "全部" },
            { value: 'published', label: "已发布" },
            { value: 'draft', label: "草稿" },
          ]} />
        </div>
      </Card>

      <Table columns={columns} data={rows} loading={loading} emptyText={"还没有公告"} />

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? "编辑公告" : "新公告"} size="lg">
        <div className="space-y-4">
          <Input label={"标题"} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea label={"留言"} rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label={"类型"} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AnnouncementType })}
              options={announcementTypes.map((t) => ({ value: t, label: announcementLabel[t] }))} />
            <Input label={"发布日期"} type="date" value={form.postDate} onChange={(e) => setForm({ ...form, postDate: e.target.value })} />
            <Input label={"到期日（可选）"} type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })} />
            发布给合作伙伴
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} loading={saving}>{editing ? "保存" : "创建"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
