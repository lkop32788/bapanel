'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Language { _id: string; name: string; code: string; nativeName: string; isDefault: boolean; isActive: boolean; }

export default function LanguagesPage() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', nativeName: '', isDefault: false });

  const fetch = () => adminApi.getLanguages().then(r => setLanguages(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    try { await adminApi.createLanguage(form); toast.success(translateApiMessage("已添加")); setShowModal(false); fetch(); } catch { toast.error(translateApiMessage("操作失败")); }
  };

  const seedAll = async () => {
    if (!confirm("添加所有标准语言？现有的保持不变。")) return;
    setSeeding(true);
    try { const r = await adminApi.seedLanguages(); toast.success(translateApiMessage(`已添加 ${r.data.added ?? 0} 语言`)); fetch(); }
    catch { toast.error(translateApiMessage("添加语言失败")); }
    finally { setSeeding(false); }
  };

  const columns = [
    { key: 'name', title: "语言", render: (l: Language) => <span className="font-medium">{l.name}</span> },
    { key: 'code', title: "代码", render: (l: Language) => <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">{l.code}</code> },
    { key: 'native', title: "本机", render: (l: Language) => l.nativeName || <span className="text-gray-400">{l.name}</span> },
    { key: 'default', title: "默认", render: (l: Language) => l.isDefault ? <Badge variant="success">默认</Badge> : null },
    { key: 'actions', title: '', render: (l: Language) => (
      <button onClick={() => { if (confirm("确定删除？")) adminApi.deleteLanguage(l._id).then(fetch); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">语言库</h1>
        <p className="text-sm mt-1">跨平台可用的语言。菜单/导航已翻译为支持的语言；其他人则退回到英语直到翻译。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Download className="w-4 h-4" />} onClick={seedAll} loading={seeding}>添加所有语言</Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>添加语言</Button>
        </div>
      </div>
      <Table columns={columns} data={languages} loading={loading} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={"添加语言"}>
        <div className="space-y-4">
          <Input label={"名称"} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={"英语"} required />
          <Input label={"代码"} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="en" required />
          <Input label={"本机名称"} value={form.nativeName} onChange={e => setForm({ ...form, nativeName: e.target.value })} placeholder={"英语"} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={e => setForm({ ...form, isDefault: e.target.checked })} className="rounded text-emerald-600" />设置为默认值</label>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button><Button onClick={handleSave}>添加</Button></div>
        </div>
      </Modal>
    </div>
  );
}
