'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, ToggleLeft, ToggleRight, MessageSquare, Zap, FileText, Sticker as StickerIcon, Upload } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { keywordApi, uploadApi, templateApi, botFlowApi, automationApi } from '@/lib/api';

import toast from 'react-hot-toast';

interface Keyword {
  _id: string;
  keyword: string;
  matchType: string;
  responseType: string;
  responseText: string;
  responseTemplate?: { _id: string; name: string };
  botFlow?: { _id: string; name: string };
  automation?: { _id: string; name: string };
  responseMedia?: { type: string; url: string; caption: string };
  status: string;
  priority: number;
  stats: { triggered: number; lastTriggeredAt?: string };
  createdAt: string;
}

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Keyword | null>(null);
  const [form, setForm] = useState({
    keyword: '', matchType: 'contains', responseType: 'text',
    responseText: '', priority: 0,
    responseMedia: { type: 'sticker', url: '', caption: '' },
    responseTemplate: '', botFlow: '', automation: '',
  });
  const [templates, setTemplates] = useState<{ _id: string; name: string; language?: string; status?: string }[]>([]);
  const [flows, setFlows] = useState<{ _id: string; name: string }[]>([]);
  const [automations, setAutomations] = useState<{ _id: string; name: string }[]>([]);
  const [kwUploading, setKwUploading] = useState(false);
  const kwFileRef = React.useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchKeywords = () => {
    keywordApi.getKeywords()
      .then(r => setKeywords(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchKeywords(); }, []);

  useEffect(() => {
    templateApi.list({ limit: 200 }).then(r => setTemplates(r.data.data || [])).catch(() => {});
    botFlowApi.list().then(r => setFlows(r.data.data || [])).catch(() => {});
    automationApi.list().then(r => setAutomations(r.data.data || [])).catch(() => {});
  }, []);

  const handleKwUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setKwUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (form.responseMedia.type === 'sticker') fd.append('folder', 'stickers');
      const res = await uploadApi.uploadFile(fd);
      setForm(f => ({ ...f, responseMedia: { ...f.responseMedia, url: res.data.data.url } }));
      toast.success(translateApiMessage("已上传"));
    } catch { toast.error(translateApiMessage("上传失败")); }
    setKwUploading(false);
    if (kwFileRef.current) kwFileRef.current.value = '';
  };

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);

    if (!form.keyword.trim()) { toast.error(translateApiMessage("需要关键字")); return; }
    if (form.responseType === 'text' && !form.responseText.trim()) { toast.error(translateApiMessage("需要回复文本")); setSubmitting(false); return; }
    if (form.responseType === 'media' && !form.responseMedia.url) { toast.error(translateApiMessage("请上传贴纸/媒体文件")); setSubmitting(false); return; }
    if (form.responseType === 'template' && !form.responseTemplate) { toast.error(translateApiMessage("请选择模板")); setSubmitting(false); return; }
    if (form.responseType === 'flow' && !form.botFlow) { toast.error(translateApiMessage("请选择机器人流程")); setSubmitting(false); return; }
    if (form.responseType === 'automation' && !form.automation) { toast.error(translateApiMessage("请选择自动化")); setSubmitting(false); return; }
    try {
      if (editItem) {
        await keywordApi.updateKeyword(editItem._id, form);
        toast.success(translateApiMessage("关键字已更新"));
      } else {
        await keywordApi.createKeyword(form);
        toast.success(translateApiMessage("关键字已创建"));
      }
      setShowModal(false);
      setEditItem(null);
      fetchKeywords();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    } finally { setSubmitting(false); }
  };

  const toggleStatus = async (kw: Keyword) => {
    try {
      await keywordApi.updateKeyword(kw._id, {
        status: kw.status === 'active' ? 'inactive' : 'active',
      });
      toast.success(translateApiMessage(kw.status === 'active' ? "关键字已停用" : "关键字已激活"));
      fetchKeywords();
    } catch { toast.error(translateApiMessage("操作失败")); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    if (!confirm("删除此关键字触发器？")) return;
    try {
      await keywordApi.deleteKeyword(id);
      toast.success(translateApiMessage("关键字已删除"));
      fetchKeywords();
    } catch { toast.error(translateApiMessage("操作失败")); } finally { setSubmitting(false); }
  };

  const openEdit = (kw: Keyword) => {
    setEditItem(kw);
    setForm({
      keyword: kw.keyword,
      matchType: kw.matchType,
      responseType: kw.responseType,
      responseText: kw.responseText || '',
      priority: kw.priority || 0,
      responseMedia: {
        type: kw.responseMedia?.type || 'sticker',
        url: kw.responseMedia?.url || '',
        caption: kw.responseMedia?.caption || '',
      },
      responseTemplate: kw.responseTemplate?._id || '',
      botFlow: kw.botFlow?._id || '',
      automation: kw.automation?._id || '',
    });
    setShowModal(true);
  };

  const responseIcon = (type: string) => {
    if (type === 'text') return <MessageSquare className="w-3.5 h-3.5" />;
    if (type === 'template') return <FileText className="w-3.5 h-3.5" />;
    if (type === 'automation') return <Zap className="w-3.5 h-3.5" />;
    if (type === 'media') return <StickerIcon className="w-3.5 h-3.5" />;
    return null;
  };

  const columns = [
    { key: 'keyword', title: "关键字", render: (k: Keyword) => (
      <div>
        <span className="font-semibold text-gray-900">{k.keyword}</span>
        
        <p className="text-xs text-gray-400 mt-0.5">{k.matchType === 'exact' ? "完全匹配" : k.matchType === 'contains' ? "包含" : "开头为"}</p>
      </div>
    )},
    { key: 'response', title: "回应", render: (k: Keyword) => (
      <div className="flex items-center gap-2">
        <Badge variant={k.responseType === 'text' ? 'info' : k.responseType === 'template' ? 'warning' : 'default'}>
          <span className="flex items-center gap-1">{responseIcon(k.responseType)} {k.responseType}</span>
        </Badge>
        {k.responseType === 'text' && k.responseText && (
          <span className="text-sm text-gray-500 truncate block max-w-[200px]">{k.responseText}</span>
        )}
      </div>
    )},
    { key: 'stats', title: "已触发", render: (k: Keyword) => (
      <div className="text-center">
        <span className="text-lg font-semibold text-gray-900">{k.stats?.triggered || 0}</span>
        {k.stats?.lastTriggeredAt && (
          <p className="text-xs text-gray-400">{new Date(k.stats.lastTriggeredAt).toLocaleDateString()}</p>
        )}
      </div>
    )},
    { key: 'status', title: "状态", render: (k: Keyword) => (
      <button onClick={() => toggleStatus(k)} className="flex items-center gap-1.5 group">
        {k.status === 'active' ? (
          <ToggleRight className="w-6 h-6 text-emerald-600 group-hover:text-emerald-700" />
        ) : (
          <ToggleLeft className="w-6 h-6 text-gray-400 group-hover:text-gray-500" />
        )}
        <span className={`text-xs font-medium ${k.status === 'active' ? 'text-emerald-600' : 'text-gray-400'}`}>
          {k.status === 'active' ? "启用" : "停用"}
        </span>
      </button>
    )},
    { key: 'actions', title: '', render: (k: Keyword) => (
      <div className="flex gap-1">
        <button onClick={() => openEdit(k)} className="p-1.5 hover:bg-gray-100 rounded-lg">
          <Edit className="w-4 h-4 text-gray-400" />
        </button>
        <button onClick={() => handleDelete(k._id)} className="p-1.5 hover:bg-red-50 rounded-lg">
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      </div>
    )},
  ];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm("删除" + selectedIds.length + "选择的项目？")) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => keywordApi.deleteKeyword(id)));
      toast.success(translateApiMessage(selectedIds.length + "项目已删除"));
      setSelectedIds([]);
      fetchKeywords();
    } catch { toast.error(translateApiMessage("删除某些项目失败")); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">关键字触发器</h1>
          <p className="text-sm text-gray-500 mt-1">当客户发送特定关键字时自动回复</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => {
          setEditItem(null);
          setForm({ keyword: '', matchType: 'contains', responseType: 'text', responseText: '', priority: 0, responseMedia: { type: 'sticker', url: '', caption: '' }, responseTemplate: '', botFlow: '', automation: '' });
          setShowModal(true);
        }}>添加关键字</Button>
      </div>

      <Table columns={columns} data={keywords} loading={loading} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => keywordApi.deleteKeyword(id).catch(() => null))); fetchKeywords(); }} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? "编辑关键字" : "添加关键字"}>
        <div className="space-y-4">
          <Input label={"关键字"} value={form.keyword} onChange={e => setForm({ ...form, keyword: e.target.value })} placeholder={"例如你好，定价，帮助"} required />
          <div className="grid grid-cols-2 gap-4">
            <Select label={"匹配类型"} value={form.matchType} onChange={e => setForm({ ...form, matchType: e.target.value })}
              options={[{ value: 'exact', label: "完全匹配" }, { value: 'contains', label: "包含" }, { value: 'starts_with', label: "开头为" }]} />
            <Select label={"响应类型"} value={form.responseType} onChange={e => setForm({ ...form, responseType: e.target.value })}
              options={[{ value: 'text', label: "短信" }, { value: 'media', label: "贴纸/媒体" }, { value: 'template', label: "模板" }, { value: 'flow', label: "机器人流程" }, { value: 'automation', label: "触发自动化" }]} />
          </div>
          {form.responseType === 'template' && (
            <div>
              <Select label={"模板"} value={form.responseTemplate} onChange={e => setForm({ ...form, responseTemplate: e.target.value })}
                options={[{ value: '', label: templates.length ? 'Select a template...' : 'No templates found - sync from Templates page' }, ...templates.map(t => ({ value: t._id, label: `${t.name}${t.language ? ` (${t.language})` : ''}${t.status && t.status !== 'approved' ? ` - ${t.status}` : ''}` }))]} />
              <p className="text-xs text-gray-400 mt-1">只能传送 WhatsApp 批准的模板。</p>
            </div>
          )}
          {form.responseType === 'flow' && (
            <div>
              <Select label={"机器人流程"} value={form.botFlow} onChange={e => setForm({ ...form, botFlow: e.target.value })}
                options={[{ value: '', label: flows.length ? 'Select a flow...' : 'No bot flows found' }, ...flows.map(f => ({ value: f._id, label: f.name }))]} />
              <p className="text-xs text-gray-400 mt-1">当该关键字匹配时，所选流从其第一个节点开始。</p>
            </div>
          )}
          {form.responseType === 'automation' && (
            <Select label={"自动化"} value={form.automation} onChange={e => setForm({ ...form, automation: e.target.value })}
              options={[{ value: '', label: automations.length ? 'Select an automation...' : 'No automations found' }, ...automations.map(a => ({ value: a._id, label: a.name }))]} />
          )}
          {form.responseType === 'text' && (
            <Textarea label={"响应文本"} value={form.responseText} onChange={e => setForm({ ...form, responseText: e.target.value })} rows={4} placeholder={"输入自动回复消息..."} required />
          )}
          {form.responseType === 'media' && (
            <div className="space-y-3">
              <Select label={"媒体类型"} value={form.responseMedia.type} onChange={e => setForm({ ...form, responseMedia: { ...form.responseMedia, type: e.target.value, url: '' } })}
                options={[{ value: 'sticker', label: "贴纸 (WebP)" }, { value: 'image', label: "图片" }, { value: 'video', label: "视频" }, { value: 'document', label: "文件" }]} />
              <input ref={kwFileRef} type="file" className="hidden" accept={form.responseMedia.type === 'sticker' ? 'image/*,.webp,.gif' : form.responseMedia.type === 'image' ? 'image/*' : form.responseMedia.type === 'video' ? 'video/*' : '*/*'} onChange={handleKwUpload} />
              <div className="flex items-center gap-2">
                <Button variant="outline" icon={<Upload className="w-4 h-4" />} loading={kwUploading} onClick={() => kwFileRef.current?.click()}>上传 {translateDisplay(form.responseMedia.type)}</Button>
                {form.responseMedia.url && form.responseMedia.type === 'sticker' && (
                  <img src={form.responseMedia.url} alt="" className="w-14 h-14 object-contain border border-gray-200 rounded-lg" />
                )}
                {form.responseMedia.url && form.responseMedia.type === 'image' && (
                  <img src={form.responseMedia.url} alt="" className="w-14 h-14 object-cover border border-gray-200 rounded-lg" />
                )}
                {form.responseMedia.url && form.responseMedia.type !== 'sticker' && form.responseMedia.type !== 'image' && (
                  <span className="text-xs text-emerald-600">已上传 ✓</span>
                )}
              </div>
              {form.responseMedia.type !== 'sticker' && (
                <Input label={"标题（可选）"} value={form.responseMedia.caption} onChange={e => setForm({ ...form, responseMedia: { ...form.responseMedia, caption: e.target.value } })} />
              )}
              <p className="text-xs text-gray-400">贴纸文件会自动转换为 WhatsApp WebP 格式。</p>
            </div>
          )}
          <Input label={"优先"} type="number" value={String(form.priority)} onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} />
          <p className="text-xs text-gray-400">首先检查优先级较高的关键字。默认值为 0。</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
            <Button onClick={handleSave}>{editItem ? "更新" : "保存"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
