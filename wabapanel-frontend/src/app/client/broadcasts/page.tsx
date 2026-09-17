'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Play, Pause, Trash2, Send, Clock, CheckCircle, AlertCircle, Edit, CalendarClock, BarChart3 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import CampaignReportModal from '@/components/campaigns/CampaignReportModal';
import WhatsAppPhonePreview from '@/components/WhatsAppPhonePreview';
import api, { campaignApi, templateApi, segmentApi, tagApi, mediaApi, dataFieldApi } from '@/lib/api';
import type { Campaign, Template, Segment, Tag } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export default function BroadcastsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', template: '', audienceType: 'all', channel: '', segments: [] as string[], tags: [] as string[],
      
    scheduledAt: '', timezone: 'Asia/Kolkata',
    senderNumberId: '',
  });
  const { currentWorkspace } = useAuthStore();
  const waNumbers = React.useMemo(() => {
    const wa = currentWorkspace?.whatsapp;
    if (!wa) return [];
    const list = [{ id: wa.phoneNumberId || '', label: `${wa.displayName || 'Default'} (${wa.phoneNumber || wa.phoneNumberId || ''})` }];
    for (const n of (wa.extraNumbers || [])) {
      list.push({ id: n.phoneNumberId, label: `${n.displayName || 'Number'} (${n.phoneNumber || n.phoneNumberId})` });
    }
    return list.filter(n => n.id);
  }, [currentWorkspace]);
  // Templates belong to a WABA; a sender from another WABA can only use that WABA's templates.
  const senderWabaId = (pid: string) => {
    const wa = currentWorkspace?.whatsapp;
    if (!wa || !pid || pid === wa.phoneNumberId) return '';
    const n = (wa.extraNumbers || []).find(x => x.phoneNumberId === pid);
    const mainId = wa.wabaId || wa.businessAccountId || '';
    return n?.wabaId && n.wabaId !== mainId ? n.wabaId : '';
  };
  const senderTemplates = templates.filter(t => (t.wabaId || '') === senderWabaId(form.senderNumberId));
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [dataFields, setDataFields] = useState<{ name: string; label: string }[]>([]);
  const [abTest, setAbTest] = useState({ enabled: false, templateB: '', splitPercent: 50 });
  const [abResults, setAbResults] = useState<{ id: string; data: { results: Record<string, { sent: number; delivered: number; read: number; failed: number; replied: number }> } } | null>(null);
  const [numbersText, setNumbersText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [headerMediaMode, setHeaderMediaMode] = useState<'approved' | 'custom'>('approved');
  const [customHeaderUrl, setCustomHeaderUrl] = useState('');
  const [uploadingHeader, setUploadingHeader] = useState(false);
  // A new broadcast always starts from an empty form (never the previous campaign's data).
  const resetForm = () => {
    setEditId(null);
    setForm({ name: '', template: '', audienceType: 'all', channel: '', segments: [], tags: [],    scheduledAt: '', timezone: 'Asia/Kolkata', senderNumberId: '' });
    setNumbersText('');
    setVariables({});
    setAbTest({ enabled: false, templateB: '', splitPercent: 50 });
  };
  // Per-card carousel media override (card index -> new media URL) for this campaign only
  const [carouselMedia, setCarouselMedia] = useState<Record<number, string>>({});
  const [uploadingCard, setUploadingCard] = useState<number | null>(null);

  const handleCardUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCard(index);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'campaigns');
      const res = await mediaApi.upload(formData);
      const url = res.data?.data?.url || res.data?.url || '';
      if (!url) throw new Error('no url');
      setCarouselMedia(prev => ({ ...prev, [index]: url }));
      toast.success(translateApiMessage(`卡 ${index + 1} 媒体更新`));
    } catch { toast.error(translateApiMessage("上传失败")); }
    setUploadingCard(null);
    e.target.value = '';
  };

  const handleHeaderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHeader(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'campaigns');
      const res = await mediaApi.upload(formData);
      const url = res.data?.data?.url || res.data?.url || '';
      setCustomHeaderUrl(url);
      toast.success(translateApiMessage("文件已上传"));
    } catch { toast.error(translateApiMessage("上传失败")); }
    setUploadingHeader(false);
    e.target.value = '';
  };

  const [reportCampaign, setReportCampaign] = useState<{ id: string; name: string } | null>(null);

  const parseNumbers = (text: string) =>
    Array.from(new Set(text.split(/[\n\r,;|\t]+/).flatMap(line => {
      if (!line.trim()) return [];
      const digits = line.replace(/\D/g, '').replace(/^0+/, '');
      // A whole entry is one number (spaces/brackets inside it are fine);
      // an over-long entry means several numbers share the line, so split it.
      if (digits.length >= 10 && digits.length <= 15) return [digits];
      return line.split(/\s+/)
        .map(p => p.replace(/\D/g, '').replace(/^0+/, ''))
        .filter(p => p.length >= 10 && p.length <= 15);
    })));

  // Entries that were dropped (wrong length, non-numeric or duplicate), so a
  // pasted list never loses numbers silently.
  const ignoredCount = (text: string) =>
    Math.max(0, text.split(/[\n\r,;|\t]+/).filter(t => t.trim()).length - parseNumbers(text).length);

  const handleCsvUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const nums = parseNumbers(String(reader.result || ''));
      if (!nums.length) { toast.error(translateApiMessage("在 CSV 中找不到有效数字")); return; }
      setNumbersText(prev => Array.from(new Set(parseNumbers(prev).concat(nums))).join('\n'));
      toast.success(translateApiMessage(`${nums.length} 从 CSV 导入的数字`));
    };
    reader.readAsText(file);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [campRes, tmpRes, segRes, tagRes, dfRes] = await Promise.allSettled([
        campaignApi.list({ type: 'broadcast' }),
        templateApi.list({ status: 'approved', limit: 500 }),
        segmentApi.list(),
        tagApi.list(),
        // Picker needs names + stages only; 'light' skips every deal (ignored by servers without PERF-11).
        
        dataFieldApi.list(),
        
      ]);
      if (campRes.status === 'fulfilled') setCampaigns(campRes.value.data.data || []);
      if (tmpRes.status === 'fulfilled') setTemplates(tmpRes.value.data.data || []);
      if (segRes.status === 'fulfilled') setSegments(segRes.value.data.data || []);
      if (tagRes.status === 'fulfilled') setTags(tagRes.value.data.data || []);
      
      if (dfRes.status === 'fulfilled') setDataFields((dfRes.value.data.data || []).map((f: { name: string; label?: string }) => ({ name: f.name, label: f.label || f.name })));
      
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (submitting) return;
    setSubmitting(true);

    if (headerMediaMode === 'custom' && !customHeaderUrl) { toast.error(translateApiMessage("上传新的标题媒体或选择批准的模板媒体")); setSubmitting(false); return; }
    const numbers = form.audienceType === 'numbers' ? parseNumbers(numbersText) : [];
    if (form.audienceType === 'numbers' && !numbers.length) { toast.error(translateApiMessage("请输入至少一个有效数字")); setSubmitting(false); return; }

    if (form.audienceType === 'combo' && !form.tags.length && !form.segments.length) { toast.error(translateApiMessage("为过滤器选择至少一个标签或细分")); setSubmitting(false); return; }
    const selTplBody = templates.find(t => t._id === form.template)?.body || '';
    const missingVars = (selTplBody.match(/\{\{\s*(?:\d+|[a-z][a-z0-9_]*)\s*\}\}/g) || [])
      .map(v => v.replace(/[{}]/g, '').trim())
      .filter(num => !(variables[num] || '').trim());
    if (missingVars.length) { toast.error(translateApiMessage(`填充模板变量${''} ${missingVars.map(n => `{{${n}}}`).join(', ')} 保存前`)); setSubmitting(false); return; }
    try {
      const payload = {
        name: form.name, type: 'broadcast', template: form.template, senderNumberId: form.senderNumberId || '',
        abTest: abTest.enabled && abTest.templateB ? { enabled: true, templateB: abTest.templateB, splitPercent: abTest.splitPercent } : { enabled: false },
        variables: (() => {
          const v: Record<string, string> = { ...variables };
          if (headerMediaMode === 'custom' && customHeaderUrl) v._headerMediaUrl = customHeaderUrl;
          for (const [idx, url] of Object.entries(carouselMedia)) { if (url) v[`_carouselMedia${idx}`] = url; }
          return Object.keys(v).length > 0 ? v : undefined;
        })(),
        audience: { type: form.audienceType, channel: form.channel || undefined, segments: form.segments, tags: form.tags, numbers,    },
        schedule: form.scheduledAt ? { sendAt: form.scheduledAt, timezone: form.timezone } : undefined,
      };
      if (editId) {
        await campaignApi.update(editId, payload);
        if (createSchedAt) await campaignApi.schedule(editId, { scheduledAt: new Date(createSchedAt).toISOString(), recurrence: createSchedRec });
      } else {
        const created = await campaignApi.create(payload);
        const newId = created.data.data?._id;
        if (createSchedAt && newId) await campaignApi.schedule(newId, { scheduledAt: new Date(createSchedAt).toISOString(), recurrence: createSchedRec });
      }
      toast.success(translateApiMessage(editId ? "广播已更新" : "广播已创建"));
      setShowModal(false); resetForm();
      setCreateSchedAt(''); setCreateSchedRec('none'); fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    } finally { setSubmitting(false); }
  };

  const handleEdit = (c: Campaign & { targetType?: string; targetChannel?: string; senderNumberId?: string; targetSegments?: string[]; targetTags?: string[]; targetNumbers?: string[];    template?: { _id?: string } | string }) => {
    setEditId(c._id);
    setForm({
      name: c.name, template: typeof c.template === 'string' ? c.template : (c.template?._id || ''),
      audienceType: c.targetType || 'all', channel: c.targetChannel || '',
      segments: (c.targetSegments || []).map(String), tags: (c.targetTags || []).map(String),

      scheduledAt: '', timezone: 'Asia/Kolkata',
      senderNumberId: c.senderNumberId || '',
    });
    setNumbersText((c.targetNumbers || []).join(String.fromCharCode(10)));
    const existingVars = (c as { variables?: Record<string, string> }).variables || {};
    const existingOverride = existingVars._headerMediaUrl || '';
    setHeaderMediaMode(existingOverride ? 'custom' : 'approved');
    setCustomHeaderUrl(existingOverride);
    setVariables(Object.fromEntries(Object.entries(existingVars).filter(([k, val]) => !k.startsWith('_') && typeof val === 'string')));
    const cards: Record<number, string> = {};
    for (const [k, val] of Object.entries(existingVars)) {
      const m = k.match(/^_carouselMedia(\d+)$/);
      if (m && val) cards[parseInt(m[1])] = val;
    }
    setCarouselMedia(cards);
    setShowModal(true);
  };

  const [createSchedAt, setCreateSchedAt] = useState('');
  const [createSchedRec, setCreateSchedRec] = useState('none');
  const [schedId, setSchedId] = useState<string | null>(null);
  const [schedAt, setSchedAt] = useState('');
  const [schedRec, setSchedRec] = useState('none');

  const handleSchedule = async () => {
    if (!schedId || !schedAt) { toast.error(translateApiMessage("选择日期和时间")); return; }
    try {
      await campaignApi.schedule(schedId, { scheduledAt: new Date(schedAt).toISOString(), recurrence: schedRec });
      toast.success(translateApiMessage("活动已安排"));
      setSchedId(null); setSchedAt(''); setSchedRec('none');
      fetchData();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(err.response?.data?.message || "计划失败"));
    }
  };
  const handleAction = async (id: string, action: 'start' | 'pause' | 'delete') => {
    if (submitting) return;
    setSubmitting(true);

    try {
      if (action === 'delete') { if (!confirm("确定删除？")) return; await campaignApi.delete(id); }
      else if (action === 'start') {
        await campaignApi.start(id);
        toast.success(translateApiMessage("活动开始 - 发送..."));
        // Poll until campaign completes (running → completed/failed)
        const poll = async (retries: number) => {
          for (let i = 0; i < retries; i++) {
            await new Promise(r => setTimeout(r, 2000));
            try {
              const res = await campaignApi.list({ type: 'broadcast' });
              const updated = (res.data.data || []) as Campaign[];
              setCampaigns(updated);
              const c = updated.find((x: Campaign) => x._id === id);
              if (c && c.status !== 'running') return;
            } catch { /* retry */ }
          }
        };
        await poll(15);
        setSubmitting(false);
        return;
      }
      else await campaignApi.pause(id);
      toast.success(translateApiMessage(action === 'delete' ? "已删除" : "已暂停"));
      fetchData();
    } catch { toast.error(translateApiMessage("操作失败")); } finally { setSubmitting(false); }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'default'; icon: React.ReactNode }> = {
      draft: { variant: 'default', icon: <Clock className="w-3 h-3" /> },
      scheduled: { variant: 'info', icon: <Clock className="w-3 h-3" /> },
      running: { variant: 'success', icon: <Play className="w-3 h-3" /> },
      completed: { variant: 'success', icon: <CheckCircle className="w-3 h-3" /> },
      paused: { variant: 'warning', icon: <Pause className="w-3 h-3" /> },
      failed: { variant: 'danger', icon: <AlertCircle className="w-3 h-3" /> },
    };
    const s = map[status] || map.draft;
    return <Badge variant={s.variant}>{s.icon} {status}</Badge>;
  };

  const columns = [
    { key: 'name', title: "营销活动", render: (c: Campaign) => (
      <div>
        <span className="font-medium text-gray-900">{c.name}</span>
        {c.summary && <p className="text-xs text-amber-600 mt-0.5 max-w-xs">{c.summary}</p>}
      </div>
    ) },
    { key: 'status', title: "状态", render: (c: Campaign) => getStatusBadge(c.status) },
    { key: 'stats', title: "已发送/已送达", render: (c: Campaign) => <span>{c.stats?.sent || 0} / {c.stats?.delivered || 0}</span> },
    { key: 'read', title: "读", render: (c: Campaign) => c.stats?.read || 0 },
    { key: 'failed', title: "操作失败", render: (c: Campaign) => c.stats?.failed || 0 },
    { key: 'date', title: "已创建", render: (c: Campaign) => new Date(c.createdAt).toLocaleDateString() },
    { key: 'actions', title: '', render: (c: Campaign) => (
      <div className="flex gap-1">
        {c.status === 'draft' && <button onClick={() => handleAction(c._id, 'start')} className="p-1 hover:bg-emerald-50 rounded"><Play className="w-4 h-4 text-emerald-500" /></button>}
        {(c.status === 'draft' || c.status === 'scheduled') && <button title={"时间表"} onClick={() => { setSchedId(c._id); setSchedAt(''); setSchedRec('none'); }} className="p-1 hover:bg-amber-50 rounded"><CalendarClock className="w-4 h-4 text-amber-500" /></button>}
        {(c.status === 'draft' || c.status === 'paused' || c.status === 'scheduled') && <button onClick={() => handleEdit(c)} className="p-1 hover:bg-blue-50 rounded"><Edit className="w-4 h-4 text-blue-400" /></button>}
        {c.status === 'running' && <button onClick={() => handleAction(c._id, 'pause')} className="p-1 hover:bg-yellow-50 rounded"><Pause className="w-4 h-4 text-yellow-500" /></button>}
        {(['running', 'completed', 'paused'].includes(c.status) || ((c.stats?.sent || 0) + (c.stats?.failed || 0)) > 0) && <button title={"报告"} onClick={() => setReportCampaign({ id: c._id, name: c.name })} className="p-1 hover:bg-indigo-50 rounded"><BarChart3 className="w-4 h-4 text-indigo-500" /></button>}
        {(c as unknown as { abTest?: { enabled?: boolean } }).abTest?.enabled && (c.status === 'completed' || c.status === 'running') && (
          <button title={"A/B测试结果"} onClick={async () => {
            try { const r = await campaignApi.abResults(c._id); setAbResults({ id: c._id, data: r.data.data }); } catch { toast.error(translateApiMessage("无法加载结果")); }
          }} className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700 hover:bg-violet-200">A/B</button>
        )}
        <button onClick={() => handleAction(c._id, 'delete')} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">广播活动</h1>
          <p className="text-gray-500 text-sm mt-1">向您的联系人发送批量消息</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { resetForm(); setHeaderMediaMode('approved'); setCustomHeaderUrl(''); setCarouselMedia({}); setVariables({}); setShowModal(true); }}>新广播</Button>
      </div>

      <Table columns={columns} data={campaigns} loading={loading} emptyText={"还没有广播"} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => campaignApi.delete(id).catch(() => null))); fetchData(); }} />

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditId(null); }} title={editId ? "编辑广播" : "创建广播"} size="lg">
        <div className="space-y-4" data-kkhs-wiz>
          <Input label={"活动名称"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Select label={"模板"} value={form.template} onChange={(e) => {
            setForm({ ...form, template: e.target.value });
            setVariables({});
            setHeaderMediaMode('approved'); setCustomHeaderUrl(''); setCarouselMedia({});
          }}
            options={[{ value: '', label: senderTemplates.length ? 'Select template' : 'No approved template for this number — create/sync it in Templates' }, ...senderTemplates.map(t => ({ value: t._id, label: `${t.name} — ${(t.category || '').toUpperCase() || 'UNKNOWN'} (${t.status})` }))]} />
          {(() => {
            const selTpl = templates.find(t => t._id === form.template);
            if (!selTpl) return null;
            const cat = (selTpl.category || '').toUpperCase();
            const isMarketing = cat === 'MARKETING';
            return (
              <div className="flex items-start gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${isMarketing ? 'bg-amber-100 text-amber-700' : cat === 'UTILITY' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                  {cat || 'UNKNOWN'}
                </span>
                <span className="text-[11px] text-gray-500">
                  {isMarketing
                    ? "营销模板 - WhatsApp 限制一个人接受营销的频率，因此传递保护会跳过过去 24 小时内发消息的任何人。"
                    : cat === 'UTILITY'
                      ? "服务通知模板：用于现有请求的订单或账户更新，不受营销冷却期限制。"
                      : "类别未知 — 从频道 → WhatsApp 刷新模板。"}
                </span>
              </div>
            );
          })()}
          {(() => {
            const selTpl = templates.find(t => t._id === form.template);
            if (!selTpl) return null;
            const fill = (t: string) => (t || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, key) => variables[key] || m);
            const hdr = selTpl.header;
            const headerUrl = headerMediaMode === 'custom' && customHeaderUrl ? customHeaderUrl : (hdr?.mediaUrl || '');
            return (
              <div className="border rounded-lg p-3 bg-gray-50 border-gray-200" data-kkhs-preview>
                <p className="text-xs font-medium text-gray-700 mb-2">预览 — 联系人收到的内容</p>
                <div className="flex justify-center">
                  <WhatsAppPhonePreview title={selTpl.name} data={{
                    headerType: hdr?.type,
                    headerText: fill(hdr?.content || ''),
                    headerMediaUrl: headerUrl,
                    body: fill(selTpl.body || ''),
                    footer: selTpl.footer || '',
                    buttons: (selTpl.buttons || []).map(b => ({
                      type: (b.type || '').toUpperCase() === 'URL' ? 'URL' : (b.type || '').toUpperCase() === 'PHONE' ? 'PHONE_NUMBER' : 'QUICK_REPLY',
                      text: b.text,
                    })),
                  }} />
                </div>
              </div>
            );
          })()}
          {waNumbers.length > 1 && (
            <Select label={"发送号码"} value={form.senderNumberId} onChange={(e) => {
              const keep = senderWabaId(e.target.value) === senderWabaId(form.senderNumberId);
              setForm({ ...form, senderNumberId: e.target.value, template: keep ? form.template : '' });
              if (!keep) setVariables({});
            }}
              options={waNumbers.map(n => ({ value: n.id, label: n.label }))} />
          )}
          {(() => {
            const selTpl = templates.find(t => t._id === form.template) as (Template & { header?: { type?: string; mediaUrl?: string } }) | undefined;
            const hdr = selTpl?.header;
            if (!hdr || !['image', 'video', 'document'].includes(hdr.type || '')) return null;
            return (
              <div className="border rounded-lg p-3 bg-emerald-50/40 border-emerald-100 space-y-2">
                <p className="text-xs font-medium text-gray-700">标头 {translateDisplay(hdr.type)} — 选择发送内容</p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={headerMediaMode === 'approved'} onChange={() => setHeaderMediaMode('approved')} className="accent-emerald-600" />
                  发送批准的模板 {translateDisplay(hdr.type)} （无需上传）
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={headerMediaMode === 'custom'} onChange={() => setHeaderMediaMode('custom')} className="accent-emerald-600" />
                  改变 {translateDisplay(hdr.type)} 仅限本次活动
                </label>
                {headerMediaMode === 'custom' && (
                  <div className="space-y-1">
                    <label className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium cursor-pointer hover:text-emerald-700">
                      <Plus className="w-4 h-4" /> {uploadingHeader ? "正在上传..." : (customHeaderUrl ? "替换文件" : "上传文件")}
                      <input type="file" accept={hdr.type === 'image' ? 'image/*' : hdr.type === 'video' ? 'video/*' : undefined} className="hidden" onChange={handleHeaderUpload} />
                    </label>
                    {customHeaderUrl && hdr.type === 'image' && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={customHeaderUrl} alt={"标题"} className="h-20 rounded border" />
                    )}
                    {customHeaderUrl && hdr.type !== 'image' && <p className="text-xs text-gray-500 break-all">{customHeaderUrl}</p>}
                    <p className="text-[11px] text-gray-400">Meta 批准模板文本，而不是媒体 — 不同的 {translateDisplay(hdr.type)} 无需重新批准即可发送。</p>
                  </div>
                )}
              </div>
            );
          })()}
          {(() => {
            const selTpl = templates.find(t => t._id === form.template) as (Template & { carousel?: { cards?: { mediaUrl?: string; mediaType?: string }[] } }) | undefined;
            const cards = selTpl?.carousel?.cards || [];
            if (!cards.length) return null;
            return (
              <div className="border rounded-lg p-3 bg-emerald-50/40 border-emerald-100 space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-700">轮播卡（{cards.length}) — 仅更改此活动的媒体</p>
                  <p className="text-[11px] text-gray-400">Meta 批准模板文本，而不是媒体 - 可以发送不同的图像/视频而无需重新批准。保持卡片不变以发送其批准的媒体。</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {cards.map((card, i) => {
                    const isVideo = (card.mediaType || 'image') === 'video';
                    const shown = carouselMedia[i] || card.mediaUrl || '';
                    return (
                      <div key={i} className="border rounded-lg p-2 bg-white space-y-1.5">
                        <p className="text-[11px] font-medium text-gray-600">卡 {i + 1} {carouselMedia[i] && <span className="text-emerald-600">（已更改）</span>}</p>
                        {shown && !isVideo && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={shown} alt={`卡 ${i + 1}`} className="h-20 w-full object-cover rounded border" />
                        )}
                        {shown && isVideo && <video src={shown} className="h-20 w-full object-cover rounded border" muted />}
                        <label className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium cursor-pointer hover:text-emerald-700">
                          <Plus className="w-3.5 h-3.5" /> {uploadingCard === i ? "正在上传..." : (carouselMedia[i] ? "再次更换" : `改变 ${isVideo ? 'video' : 'image'}`)}
                          <input type="file" accept={isVideo ? 'video/*' : 'image/*'} className="hidden" onChange={(e) => handleCardUpload(i, e)} />
                        </label>
                        {carouselMedia[i] && (
                          <button onClick={() => setCarouselMedia(prev => { const n = { ...prev }; delete n[i]; return n; })}
                            className="block text-[11px] text-gray-400 hover:text-red-500">重置为批准的媒体</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {(() => {
            const selTpl = templates.find(t => t._id === form.template);
            const bodyVars = (selTpl?.body || '').match(/\{\{\s*(?:\d+|[a-z][a-z0-9_]*)\s*\}\}/g) || [];
            if (!bodyVars.length) return null;
            return (
              <div className="border rounded-lg p-3 bg-blue-50/40 border-blue-100 space-y-2">
                <p className="text-xs font-medium text-gray-700">模板变量（{bodyVars.length})</p>
                <p className="text-[11px] text-gray-400">在左侧键入任何自定义值（每个人都相同），或在右侧选择一个联系人字段以自动填充每个联系人自己的值。您在“联系人”中添加的自定义字段也会显示在下拉列表中。</p>
                {bodyVars.map((v: string) => {
                  const num = v.replace(/[{}]/g, '').trim();
                  const fieldOptions = [
                    { value: '', label: "— 从联系人字段自动填写 —" },
                    { value: '{contact_name}', label: "联系人姓名" },
                    { value: '{first_name}', label: "名字" },
                    { value: '{last_name}', label: "姓氏" },
                    { value: '{profile_name}', label: "WhatsApp 个人资料名称" },
                    { value: '{phone}', label: "电话" },
                    { value: '{country_code}', label: "国家代码" },
                    { value: '{email}', label: "邮箱" },
                    ...dataFields.map(f => ({ value: `{${f.name}}`, label: `自定义字段： ${f.label}` })),
                  ];
                  return (
                    <div key={num} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                      <Input label={`变量 ${num} — 自定义值`} placeholder={`为 {{ 键入任何内容${num}}}`}
                        value={variables[num] || ''}
                        onChange={(e) => setVariables(prev => ({ ...prev, [num]: e.target.value }))} />
                      <Select label={"…或从字段自动填充"} value={fieldOptions.some(o => o.value === (variables[num] || '')) ? (variables[num] || '') : ''}
                        onChange={(e) => { if (e.target.value) setVariables(prev => ({ ...prev, [num]: e.target.value })); }}
                        options={fieldOptions} />
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <Select label={"观众"} value={form.audienceType} onChange={(e) => setForm({ ...form, audienceType: e.target.value })}
            options={[{ value: 'all', label: "所有联系人" }, { value: 'segment', label: "按细分市场" }, { value: 'tag', label: "按标签" }, { value: 'combo', label: "过滤器 — 标签 + 细分（全部必须匹配）" },  { value: 'numbers', label: "号码列表/CSV（不保存联系人）" }]} />
          
          {form.audienceType !== 'numbers' && (
            <Select label={"平台（可选）"} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}
              options={[{ value: '', label: "所有平台" }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'whatsapp_qr', label: "WhatsApp 二维码" }, { value: 'facebook', label: 'Facebook' }, { value: 'instagram', label: 'Instagram' }, { value: 'telegram', label: 'Telegram' }, { value: 'telegram_personal', label: "电报个人" }, { value: 'email', label: "Gmail/电子邮件" }]} />
          )}
          {form.audienceType === 'numbers' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">电话号码</label>
              <textarea rows={5} value={numbersText} onChange={(e) => setNumbersText(e.target.value)}
                placeholder={"9198765XXXXX 9198123XXXXX（每行一个数字，或用逗号分隔）"}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium cursor-pointer hover:text-emerald-700">
                  <Plus className="w-4 h-4" /> 上传 CSV
                  <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvUpload(f); e.target.value = ''; }} />
                </label>
                <span className="text-xs text-gray-400">{parseNumbers(numbersText).length} 有效号码{parseNumbers(numbersText).length === 1 ? '' : 's'}{ignoredCount(numbersText) > 0 ? ` · ${ignoredCount(numbersText)} 被忽略（无效/重复）` : ''}</span>
              </div>
              <p className="text-xs text-gray-400">这些号码不会保存为联系人 - 模板会直接发送。</p>
            </div>
          )}
          {form.audienceType === 'combo' && (
            <p className="text-[11px] text-gray-500">选择下面的任意组合 - 联系人必须匹配 <b>每</b> 您使用的过滤器（例如标签“Jaipur” <b>and</b> “数字营销”部分）。一个过滤器内的多个值意味着“其中任何一个”。</p>
          )}
          {(form.audienceType === 'segment' || form.audienceType === 'combo') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">选择段</label>
              <div className="flex flex-wrap gap-2">
                {segments.map(s => (
                  <button key={s._id} onClick={() => setForm({ ...form, segments: form.segments.includes(s._id) ? form.segments.filter(x => x !== s._id) : [...form.segments, s._id] })}
                    className={`px-3 py-1 text-xs rounded-full border ${form.segments.includes(s._id) ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200'}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {(form.audienceType === 'tag' || form.audienceType === 'combo') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">选择标签（允许多个）</label>
              <div className="flex flex-wrap gap-2">
                {tags.map(t => (
                  <button key={t._id} onClick={() => setForm({ ...form, tags: form.tags.includes(t._id) ? form.tags.filter(x => x !== t._id) : [...form.tags, t._id] })}
                    className={`px-3 py-1 text-xs rounded-full border ${form.tags.includes(t._id) ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200'}`}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="border rounded-lg p-3 bg-violet-50/40 border-violet-100 space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
              <input type="checkbox" checked={abTest.enabled} onChange={(e) => setAbTest({ ...abTest, enabled: e.target.checked })} className="w-4 h-4 accent-violet-600" />
              A/B 测试（可选）- 向部分观众发送第二个模板并比较结果
            </label>
            {abTest.enabled && (
              <div className="space-y-2">
                <Select label={"模板B（变体）"} value={abTest.templateB} onChange={(e) => setAbTest({ ...abTest, templateB: e.target.value })}
                  options={[{ value: '', label: "选择变体模板" }, ...templates.filter(t => t._id !== form.template).map(t => ({ value: t._id, label: `${t.name} — ${(t.category || '').toUpperCase() || 'UNKNOWN'}` }))]} />
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">分裂- {abTest.splitPercent}%得到模板A， {100 - abTest.splitPercent}%得到模板B</label>
                  <input type="range" min={10} max={90} step={5} value={abTest.splitPercent} onChange={(e) => setAbTest({ ...abTest, splitPercent: parseInt(e.target.value) })} className="w-full accent-violet-600" />
                </div>
                <p className="text-[11px] text-gray-400">发送后，单击活动行上的 A/B 按钮来比较发送率、阅读率和回复率。</p>
              </div>
            )}
          </div>
          <div className="border rounded-lg p-3 bg-amber-50/40 border-amber-100 space-y-2">
            <p className="text-xs font-medium text-gray-700">时间表（可选）- 留空以保留草稿并手动启动</p>
            <div className="flex gap-2">
              <input type="datetime-local" value={createSchedAt} onChange={(e) => setCreateSchedAt(e.target.value)}
                className="flex-1 px-2 py-1.5 border rounded-lg text-sm" />
              <select value={createSchedRec} onChange={(e) => setCreateSchedRec(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm">
                <option value="none">一次（不重复）</option>
                <option value="daily">每日</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
              </select>
            </div>
            {createSchedAt && <p className="text-[11px] text-amber-700">活动将在选定的时间自动运行{createSchedRec !== 'none' ? ` 并重复 ${createSchedRec}` : ''}.</p>}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
            <Button onClick={handleCreate} icon={<Send className="w-4 h-4" />}>创建广播</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!abResults} onClose={() => setAbResults(null)} title={"A/B测试结果"} size="lg">
        {abResults && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">比较每个模板变体的表现。较高的阅读率和回复率表明消息性能较好。</p>
            <div className="grid grid-cols-2 gap-4">
              {(['A', 'B'] as const).map(v => {
                const r = abResults.data.results[v] || { sent: 0, delivered: 0, read: 0, failed: 0, replied: 0 };
                const rate = (n: number) => r.sent > 0 ? Math.round((n / r.sent) * 100) : 0;
                return (
                  <div key={v} className="border rounded-xl p-4 space-y-2">
                    <h3 className="font-semibold text-gray-900">变体 {v}</h3>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div className="flex justify-between"><span>已发送</span><b>{r.sent}</b></div>
                      <div className="flex justify-between"><span>已交付</span><b>{r.delivered} ({rate(r.delivered)}%)</b></div>
                      <div className="flex justify-between"><span>读</span><b>{r.read} ({rate(r.read)}%)</b></div>
                      <div className="flex justify-between"><span>已回复</span><b>{r.replied} ({rate(r.replied)}%)</b></div>
                      <div className="flex justify-between text-red-500"><span>操作失败</span><b>{r.failed}</b></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!schedId} onClose={() => setSchedId(null)} title={"安排活动"} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日期和时间</label>
            <input type="datetime-local" value={schedAt} onChange={e => setSchedAt(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">重复</label>
            <select value={schedRec} onChange={e => setSchedRec(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="none">一次（不重复）</option>
              <option value="daily">每日</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
            </select>
          </div>
          <button onClick={handleSchedule} className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">时间表</button>
        </div>
      </Modal>

      <CampaignReportModal
        campaignId={reportCampaign?.id ?? null}
        campaignName={reportCampaign?.name}
        onClose={() => setReportCampaign(null)}
      />
    </div>
  );
}
