'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Copy, QrCode, Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { trackedLinkApi, tagApi } from '@/lib/api';
import ShortLinksPage from '@/components/ShortLinks';
import toast from 'react-hot-toast';

interface TrackedLink {
  _id: string;
  title: string;
  code: string;
  phone: string;
  prefillText: string;
  leadSource: string;
  tag?: { _id: string; name: string } | null;
  leads?: number;
  isActive?: boolean;
  url: string;
  messageText: string;
}

const SOURCES = [
  { value: 'qr', label: "二维码（海报、商店、名片）" },
  { value: 'website', label: "网站" },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'ctwa', label: "点击 WhatsApp 广告" },
  { value: 'manual', label: "其他/离线" },
];

export default function TrackedLinksPage() {
  const [tab, setTab] = useState<'qr' | 'short'>('qr');
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [tags, setTags] = useState<{ _id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editLink, setEditLink] = useState<TrackedLink | null>(null);
  const [form, setForm] = useState({ title: '', phone: '', prefillText: 'Hi', leadSource: 'qr', tag: '' });
  const [submitting, setSubmitting] = useState(false);
  const [qr, setQr] = useState<{ title: string; img: string; url: string } | null>(null);

  const fetchLinks = async () => {
    try { const res = await trackedLinkApi.list(); setLinks(res.data.data || []); } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchLinks();
    tagApi.list().then(r => setTags(r.data.data || [])).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (submitting) return;
    if (!form.title.trim()) { toast.error(translateApiMessage("输入此链接的名称")); return; }
    setSubmitting(true);
    try {
      if (editLink) await trackedLinkApi.update(editLink._id, form);
      else await trackedLinkApi.create(form);
      toast.success(translateApiMessage(editLink ? "已更新" : "链接已创建"));
      setShowModal(false);
      fetchLinks();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const showQr = async (l: TrackedLink) => {
    try {
      const r = await trackedLinkApi.qr(l._id);
      setQr({ title: l.title, img: r.data.data.qr, url: r.data.data.url });
    } catch { toast.error(translateApiMessage("无法生成二维码")); }
  };

  const columns = [
    { key: 'title', title: "链接", render: (l: TrackedLink) => (
      <div>
        <p className="font-medium text-gray-900">{l.title}</p>
        <p className="text-xs text-gray-400">消息： {l.messageText}</p>
      </div>
    )},
    { key: 'url', title: "WhatsApp 链接", render: (l: TrackedLink) => (
      <div className="flex items-center gap-2">
        <code className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded truncate max-w-[240px]">{l.url}</code>
        <button onClick={() => { navigator.clipboard.writeText(l.url); toast.success(translateApiMessage("链接已复制！")); }} className="p-1 hover:bg-emerald-50 rounded">
          <Copy className="w-3 h-3 text-gray-400 hover:text-emerald-600" />
        </button>
      </div>
    )},
    { key: 'source', title: "铅来源", render: (l: TrackedLink) => (
      <div>
        <Badge variant="info">{SOURCES.find(s => s.value === l.leadSource)?.value || l.leadSource}</Badge>
        {l.tag ? <p className="text-xs text-gray-400 mt-1">标签： {l.tag.name}</p> : null}
      </div>
    )},
    { key: 'leads', title: "潜在客户", render: (l: TrackedLink) => <span className="font-medium">{l.leads || 0}</span> },
    { key: 'status', title: "状态", render: (l: TrackedLink) => <Badge variant={l.isActive !== false ? 'success' : 'default'}>{l.isActive !== false ? "启用" : "停用"}</Badge> },
    { key: 'actions', title: '', render: (l: TrackedLink) => (
      <div className="flex gap-1">
        <button title={"二维码"} onClick={() => showQr(l)} className="p-1 hover:bg-gray-100 rounded"><QrCode className="w-4 h-4 text-gray-400" /></button>
        <button title={"编辑"} onClick={() => { setEditLink(l); setForm({ title: l.title, phone: l.phone, prefillText: l.prefillText, leadSource: l.leadSource, tag: l.tag?._id || '' }); setShowModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
        <button title={"删除"} onClick={() => { if (confirm("删除此链接？")) trackedLinkApi.delete(l._id).then(() => { fetchLinks(); toast.success(translateApiMessage("链接已删除")); }).catch(() => toast.error(translateApiMessage("删除失败"))); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">潜在客户来源链接和二维码</h1>
          <p className="text-gray-500 text-sm mt-1">
            将这些链接或二维码放在海报、您的网站、广告和简介上。无论是谁通过它们向您发送消息，都会在收件箱中标记为该来源。
          </p>
        </div>
        {tab === 'qr' && (
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditLink(null); setForm({ title: '', phone: '', prefillText: 'Hi', leadSource: 'qr', tag: '' }); setShowModal(true); }}>创建链接</Button>
        )}
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {([['qr', "潜在客户来源和二维码"], ['short', "短链接"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === k ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'short'
        ? <ShortLinksPage embedded />
        : <Table columns={columns} data={links} loading={loading} emptyText={"还没有跟踪链接"} />}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editLink ? "编辑链接" : "创建跟踪链接"}>
        <div className="space-y-4">
          <Input label={"姓名（只有您能看到）"} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={"商店柜台二维码"} />
          <Input label={"WhatsApp 号码（留空以使用您连接的号码）"} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="919876543210" />
          <Input label={"预填充消息"} value={form.prefillText} onChange={e => setForm({ ...form, prefillText: e.target.value })} placeholder={"嗨，我想要详细信息"} />
          <p className="text-xs text-gray-500">
            在此消息末尾添加一个短代码（例如 <code>[a7k2m9]</code>）。该代码告诉面板引线来自哪里，因此请不要将其移除。
          </p>
          <Select label={"铅来源"} value={form.leadSource} onChange={e => setForm({ ...form, leadSource: e.target.value })} options={SOURCES} />
          <Select
            label={"标记联系人（可选）"}
            value={form.tag}
            onChange={e => setForm({ ...form, tag: e.target.value })}
            options={[{ value: '', label: "没有标签" }, ...tags.map(t => ({ value: t._id, label: t.name }))]}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
            <Button onClick={handleSave} loading={submitting}>{editLink ? "保存" : "创建"}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!qr} onClose={() => setQr(null)} title={qr ? `二维码— ${qr.title}` : "二维码"}>
        {qr ? (
          <div className="space-y-4 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.img} alt={"二维码"} className="mx-auto w-64 h-64" />
            <p className="text-xs text-gray-500 break-all">{qr.url}</p>
            <a href={qr.img} download={`qr-${qr.title.replace(/[^a-zA-Z0-9]+/g, '-')}.png`}>
              <Button icon={<Download className="w-4 h-4" />}>下载PNG</Button>
            </a>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
