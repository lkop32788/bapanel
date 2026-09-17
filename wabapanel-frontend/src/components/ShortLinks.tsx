'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Copy, QrCode, BarChart3, ExternalLink } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { shortLinkApi } from '@/lib/api';
import type { ShortLink } from '@/types';
import toast from 'react-hot-toast';

interface LinkStats {
  clicks: number;
  unique: number;
  byDevice: Record<string, number>;
  byBrowser: Record<string, number>;
  byReferrer: Record<string, number>;
  byDay: Record<string, number>;
  recent: { clickedAt: string; device?: string; browser?: string; referrer?: string }[];
}

const emptyForm = { title: '', originalUrl: '', customSlug: '', description: '', imageUrl: '', showPreview: false };

export default function ShortLinks({ embedded = false }: { embedded?: boolean } = {}) {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editLink, setEditLink] = useState<ShortLink | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [qrLink, setQrLink] = useState<ShortLink | null>(null);
  const [statsLink, setStatsLink] = useState<ShortLink | null>(null);
  const [stats, setStats] = useState<LinkStats | null>(null);

  const shortUrl = (l: ShortLink) => (typeof window !== 'undefined' ? window.location.origin : '') + '/s/' + l.shortCode;

  const fetchLinks = async () => {
    try { const res = await shortLinkApi.list(); setLinks(res.data.data || []); } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchLinks(); }, []);

  useEffect(() => {
    if (!statsLink) { setStats(null); return; }
    shortLinkApi.stats(statsLink._id)
      .then(r => setStats(r.data.data))
      .catch(() => toast.error(translateApiMessage("无法加载统计数据")));
  }, [statsLink]);

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (editLink) { await shortLinkApi.update(editLink._id, form); }
      else { await shortLinkApi.create(form); }
      toast.success(translateApiMessage(editLink ? "已更新" : "已创建"));
      setShowModal(false); fetchLinks();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { key: 'title', title: "标题", render: (l: ShortLink) => (
      <div>
        <p className="font-medium text-gray-900">{l.title || "无标题"}</p>
        <p className="text-xs text-gray-400 truncate max-w-[200px]">{l.originalUrl}</p>
      </div>
    )},
    { key: 'short', title: "短网址", render: (l: ShortLink) => (
      <div className="flex items-center gap-2">
        <code className="text-sm text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{shortUrl(l)}</code>
        <button onClick={() => { navigator.clipboard.writeText(shortUrl(l)); toast.success(translateApiMessage("链接已复制！")); }} className="p-1 hover:bg-emerald-50 rounded" title={"复制链接"}>
          <Copy className="w-3 h-3 text-gray-400 hover:text-emerald-600" />
        </button>
        <a href={shortUrl(l)} target="_blank" rel="noreferrer" className="p-1 hover:bg-emerald-50 rounded" title={"打开链接"}>
          <ExternalLink className="w-3 h-3 text-gray-400 hover:text-emerald-600" />
        </a>
      </div>
    )},
    { key: 'clicks', title: "点击次数", render: (l: ShortLink) => (
      <button onClick={() => setStatsLink(l)} className="font-medium text-emerald-600 hover:underline">{l.clicks || 0}</button>
    ) },
    { key: 'status', title: "状态", render: (l: ShortLink) => <Badge variant={l.isActive !== false ? 'success' : 'default'}>{l.isActive !== false ? "启用" : "停用"}</Badge> },
    { key: 'actions', title: '', render: (l: ShortLink) => (
      <div className="flex gap-1">
        <button title={"点击分析"} onClick={() => setStatsLink(l)} className="p-1 hover:bg-gray-100 rounded"><BarChart3 className="w-4 h-4 text-gray-400" /></button>
        <button title={"二维码"} onClick={() => setQrLink(l)} className="p-1 hover:bg-gray-100 rounded"><QrCode className="w-4 h-4 text-gray-400" /></button>
        <button title={"编辑"} onClick={() => { setEditLink(l); setForm({ title: l.title, originalUrl: l.originalUrl, customSlug: l.shortCode || '', description: l.description || '', imageUrl: l.imageUrl || '', showPreview: !!l.showPreview }); setShowModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
        <button title={"删除"} onClick={() => { if (confirm("确定删除？")) shortLinkApi.delete(l._id).then(() => { fetchLinks(); toast.success(translateApiMessage("链接已删除")); }).catch(() => toast.error(translateApiMessage("删除失败"))); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  const breakdown = (label: string, data: Record<string, number> | undefined) => (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase mb-1">{label}</p>
      {Object.keys(data || {}).length === 0 ? <p className="text-sm text-gray-400">无数据</p> : (
        <ul className="space-y-1">
          {Object.entries(data || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => (
            <li key={k} className="flex justify-between text-sm"><span className="text-gray-600 truncate mr-2">{k}</span><span className="font-medium">{v}</span></li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex items-center justify-between">
          <p className="text-gray-500 text-sm">使用二维码和丰富的预览创建可跟踪的短链接</p>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditLink(null); setForm(emptyForm); setShowModal(true); }}>创建链接</Button>
        </div>
      ) : (
        <div className="page-hero flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">短链接</h1>
            <p className="text-gray-500 text-sm mt-1">使用二维码和丰富的预览创建可跟踪的短链接</p>
          </div>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditLink(null); setForm(emptyForm); setShowModal(true); }}>创建链接</Button>
        </div>
      )}

      <Table columns={columns} data={links} loading={loading} emptyText={"还没有短链接"} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => shortLinkApi.delete(id).catch(() => null))); fetchLinks(); }} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editLink ? "编辑链接" : "创建短链接"}>
        <div className="space-y-4">
          <Input label={"标题"} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={"我的链接"} />
          <Input label={"目标网址"} value={form.originalUrl} onChange={(e) => setForm({ ...form, originalUrl: e.target.value })} placeholder="https://example.com" required />
          <Input label={"自定义子弹（可选）"} value={form.customSlug} onChange={(e) => setForm({ ...form, customSlug: e.target.value })} placeholder={"我的链接"} />
          <Input label={"预览说明（可选）"} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={"在 WhatsApp/social 上共享链接时显示"} />
          <Input label={"预览图像 URL（可选）"} value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://.../thumbnail.jpg" />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.showPreview} onChange={(e) => setForm({ ...form, showPreview: e.target.checked })} className="rounded" />
            显示带有“继续”按钮的预览页面，而不是立即重定向
          </label>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
            <Button onClick={handleSave}>{editLink ? "更新" : "创建"}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!qrLink} onClose={() => setQrLink(null)} title={"二维码"}>
        {qrLink && (
          <div className="space-y-4 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shortLinkApi.qrUrl(qrLink._id)} alt={"二维码"} className="mx-auto w-56 h-56" />
            <code className="block text-sm text-gray-600 break-all">{shortUrl(qrLink)}</code>
            <a href={shortLinkApi.qrUrl(qrLink._id)} download className="inline-block text-sm text-emerald-600 hover:underline">下载PNG</a>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!statsLink} onClose={() => setStatsLink(null)} title={statsLink ? `分析 — ${statsLink.title || statsLink.shortCode}` : "数据分析"}>
        {!stats ? <p className="text-sm text-gray-500">加载中…</p> : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">总点击次数</p><p className="text-xl font-semibold">{stats.clicks}</p></div>
              <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">唯一访客</p><p className="text-xl font-semibold">{stats.unique}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {breakdown('Device', stats.byDevice)}
              {breakdown('Browser', stats.byBrowser)}
              {breakdown('Referrer', stats.byReferrer)}
              {breakdown('By day', stats.byDay)}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
