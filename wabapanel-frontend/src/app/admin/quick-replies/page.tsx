'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface QuickReply { _id: string; title: string; message: string; shortcut: string; }

export default function QuickRepliesPage() {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<QuickReply | null>(null);
  const [form, setForm] = useState({ title: '', message: '', shortcut: '' });

  const fetch = () => adminApi.getQuickReplies().then(r => setReplies(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    try {
      if (editItem) await adminApi.updateQuickReply(editItem._id, form);
      else await adminApi.createQuickReply(form);
      toast.success(translateApiMessage(editItem ? "已更新" : "已创建")); setShowModal(false); fetch();
    } catch { toast.error(translateApiMessage("操作失败")); }
  };

  const columns = [
    { key: 'title', title: "标题", render: (r: QuickReply) => <span className="font-medium">{r.title}</span> },
    { key: 'shortcut', title: "快捷方式", render: (r: QuickReply) => <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">/{r.shortcut}</code> },
    { key: 'message', title: "留言", render: (r: QuickReply) => <span className="text-sm text-gray-500 truncate block max-w-xs">{r.message}</span> },
    { key: 'actions', title: '', render: (r: QuickReply) => (
      <div className="flex gap-1">
        <button onClick={() => { setEditItem(r); setForm({ title: r.title, message: r.message, shortcut: r.shortcut }); setShowModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
        <button onClick={() => { if (confirm("确定删除？")) adminApi.deleteQuickReply(r._id).then(fetch); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">快捷回复</h1>
        <p className="text-sm mt-1">所有工作区均可使用全局快速回复</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditItem(null); setForm({ title: '', message: '', shortcut: '' }); setShowModal(true); }}>添加回复</Button>
      </div>
      <Table columns={columns} data={replies} loading={loading} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? "编辑回复" : "添加快速回复"}>
        <div className="space-y-4">
          <Input label={"标题"} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
          <Input label={"快捷方式"} value={form.shortcut} onChange={e => setForm({ ...form, shortcut: e.target.value })} placeholder={"例如你好"} />
          <Textarea label={"留言"} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} required />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button><Button onClick={handleSave}>保存</Button></div>
        </div>
      </Modal>
    </div>
  );
}
