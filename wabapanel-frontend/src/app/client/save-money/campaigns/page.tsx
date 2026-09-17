'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Play, Pause, Trash2, Send, Clock, CheckCircle, AlertCircle, PiggyBank, Users, Edit, CalendarClock, BarChart3 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import CampaignReportModal from '@/components/campaigns/CampaignReportModal';
import WhatsAppPhonePreview from '@/components/WhatsAppPhonePreview';
import { campaignApi, presetMessageApi, segmentApi, tagApi, mediaApi } from '@/lib/api';
import type { Campaign, Segment, Tag } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

interface Preset { _id: string; name: string; body: string; headerType?: string; headerText?: string; mediaUrl?: string; footer?: string; buttons?: { text?: string; type?: string }[]; }

export default function PresetCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  
  const [eligible, setEligible] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', preset: '', audienceType: 'all', channel: '', segments: [] as string[], tags: [] as string[],   senderNumberId: '' });
  const { currentWorkspace } = useAuthStore();
  const waNumbers = React.useMemo(() => {
    const wa = currentWorkspace?.whatsapp;
    if (!wa) return [] as { id: string; label: string }[];
    const list = [{ id: wa.phoneNumberId || '', label: `${wa.displayName || 'Default'} (${wa.phoneNumber || wa.phoneNumberId || ''})` }];
    for (const n of (wa.extraNumbers || [])) {
      list.push({ id: n.phoneNumberId, label: `${n.displayName || 'Number'} (${n.phoneNumber || n.phoneNumberId})` });
    }
    return list.filter(n => n.id);
  }, [currentWorkspace]);
  const [numbersText, setNumbersText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);
  const [headerMediaMode, setHeaderMediaMode] = useState<'approved' | 'custom'>('approved');
  const [customHeaderUrl, setCustomHeaderUrl] = useState('');
  const [uploadingHeader, setUploadingHeader] = useState(false);

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [campRes, presetRes, segRes, tagRes, eligRes] = await Promise.allSettled([
        campaignApi.list({ type: 'preset', sendChannel: 'cloud' }),
        presetMessageApi.list(),
        segmentApi.list(),
        tagApi.list(),
        presetMessageApi.eligibleCount(),
        
      ]);
      if (campRes.status === 'fulfilled') setCampaigns(campRes.value.data.data || []);
      if (presetRes.status === 'fulfilled') setPresets(presetRes.value.data.data || []);
      if (segRes.status === 'fulfilled') setSegments(segRes.value.data.data || []);
      if (tagRes.status === 'fulfilled') setTags(tagRes.value.data.data || []);
      
      if (eligRes.status === 'fulfilled') setEligible(eligRes.value.data.data?.count ?? null);
    } catch { /* empty */ }
    setLoading(false);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (submitting) return;
    if (!form.name || !form.preset) { toast.error(translateApiMessage("需要名称和预设模板")); return; }
    if (headerMediaMode === 'custom' && !customHeaderUrl) { toast.error(translateApiMessage("上传新媒体或选择已保存的预设媒体")); return; }
    setSubmitting(true);
    const numbers = form.audienceType === 'numbers' ? parseNumbers(numbersText) : [];
    if (form.audienceType === 'numbers' && !numbers.length) { toast.error(translateApiMessage("请输入至少一个有效数字")); setSubmitting(false); return; }
    
    if (form.audienceType === 'combo' && !form.tags.length && !form.segments.length) { toast.error(translateApiMessage("为过滤器选择至少一个标签或段")); setSubmitting(false); return; }
    try {
      const payload = {
        name: form.name, type: 'preset', presetMessage: form.preset, senderNumberId: form.senderNumberId || '',
        variables: headerMediaMode === 'custom' && customHeaderUrl ? { _headerMediaUrl: customHeaderUrl } : undefined,
        audience: { type: form.audienceType, channel: form.channel || undefined, segments: form.segments, tags: form.tags, numbers,   },
      };
      if (editId) {
        await campaignApi.update(editId, payload);
        if (createSchedAt) await campaignApi.schedule(editId, { scheduledAt: new Date(createSchedAt).toISOString(), recurrence: createSchedRec });
      } else {
        const created = await campaignApi.create(payload);
        const newId = created.data.data?._id;
        if (createSchedAt && newId) await campaignApi.schedule(newId, { scheduledAt: new Date(createSchedAt).toISOString(), recurrence: createSchedRec });
      }
      toast.success(translateApiMessage(editId ? "预设活动已更新" : "预设活动已创建"));
      setShowModal(false); setEditId(null);
      setCreateSchedAt(''); setCreateSchedRec('none');
      setForm({ name: '', preset: '', audienceType: 'all', channel: '', segments: [], tags: [],   senderNumberId: '' });
      fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    }
    setSubmitting(false);
  };

  const handleEdit = (c: Campaign & { targetType?: string; targetChannel?: string; targetSegments?: string[]; targetTags?: string[]; targetNumbers?: string[];   presetMessage?: { _id?: string } | string }) => {
    setEditId(c._id);
    setForm({
      name: c.name, preset: typeof c.presetMessage === 'string' ? c.presetMessage : (c.presetMessage?._id || ''),
      audienceType: c.targetType || 'all', channel: c.targetChannel || '',
      segments: (c.targetSegments || []).map(String), tags: (c.targetTags || []).map(String),
       
      senderNumberId: (c as { senderNumberId?: string }).senderNumberId || '',
    });
    setNumbersText((c.targetNumbers || []).join(String.fromCharCode(10)));
    const existingOverride = (c as { variables?: Record<string, string> }).variables?._headerMediaUrl || '';
    setHeaderMediaMode(existingOverride ? 'custom' : 'approved');
    setCustomHeaderUrl(existingOverride);
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
    try {
      if (action === 'delete') { if (!confirm("确定删除？")) return; await campaignApi.delete(id); }
      else if (action === 'start') await campaignApi.start(id);
      else await campaignApi.pause(id);
      toast.success(translateApiMessage(action === 'delete' ? "已删除" : action === 'start' ? "开始" : "已暂停"));
      fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    }
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
    { key: 'name', title: "营销活动", render: (c: Campaign) => <span className="font-medium text-gray-900">{c.name}</span> },
    { key: 'status', title: "状态", render: (c: Campaign) => getStatusBadge(c.status) },
    { key: 'sent', title: "已发送", render: (c: Campaign) => c.stats?.sent || 0 },
    { key: 'skipped', title: "已跳过（窗口关闭）", render: (c: Campaign) => (c.stats as { skipped?: number })?.skipped || 0 },
    { key: 'failed', title: "操作失败", render: (c: Campaign) => c.stats?.failed || 0 },
    { key: 'date', title: "已创建", render: (c: Campaign) => new Date(c.createdAt).toLocaleDateString() },
    { key: 'actions', title: '', render: (c: Campaign) => (
      <div className="flex gap-1">
        {c.status === 'draft' && <button onClick={() => handleAction(c._id, 'start')} className="p-1 hover:bg-emerald-50 rounded"><Play className="w-4 h-4 text-emerald-500" /></button>}
        {(c.status === 'draft' || c.status === 'scheduled') && <button title={"时间表"} onClick={() => { setSchedId(c._id); setSchedAt(''); setSchedRec('none'); }} className="p-1 hover:bg-amber-50 rounded"><CalendarClock className="w-4 h-4 text-amber-500" /></button>}
        {(c.status === 'draft' || c.status === 'paused') && <button onClick={() => handleEdit(c)} className="p-1 hover:bg-blue-50 rounded"><Edit className="w-4 h-4 text-blue-400" /></button>}
        {c.status === 'running' && <button onClick={() => handleAction(c._id, 'pause')} className="p-1 hover:bg-yellow-50 rounded"><Pause className="w-4 h-4 text-yellow-500" /></button>}
        {['running', 'completed', 'paused'].includes(c.status) && <button title={"报告"} onClick={() => setReportTarget({ id: c._id, name: c.name })} className="p-1 hover:bg-indigo-50 rounded"><BarChart3 className="w-4 h-4 text-indigo-500" /></button>}
        <button onClick={() => handleAction(c._id, 'delete')} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><PiggyBank className="w-6 h-6 text-emerald-600" /> 预设营销活动</h1>
          <p className="text-gray-500 text-sm mt-1">使用预设模板的免费活动 — 仅面向具有 24 小时开放窗口的客户，无元费用</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setHeaderMediaMode('approved'); setCustomHeaderUrl(''); setShowModal(true); }}>新预设活动</Button>
      </div>

      <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
        <Users className="w-4 h-4" />
        <b>{eligible ?? '...'}</b> 客户目前拥有 24 小时开放窗口 — 可以免费向他们发送预设消息。关闭窗口的客户将被自动跳过。
      </div>

      <Table columns={columns} data={campaigns} loading={loading} emptyText={"尚无预设活动"} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => campaignApi.delete(id).catch(() => null))); fetchData(); }} />

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditId(null); }} title={editId ? "编辑预设活动" : "创建预设活动"} size="lg">
        <div className="space-y-4">
          <Input label={"活动名称"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Select label={"预设模板"} value={form.preset} onChange={(e) => { setForm({ ...form, preset: e.target.value }); setHeaderMediaMode('approved'); setCustomHeaderUrl(''); }}
            options={[{ value: '', label: "选择预设模板" }, ...presets.map(p => ({ value: p._id, label: p.name }))]} />
          {(() => {
            const selPreset = presets.find(p => p._id === form.preset);
            if (!selPreset?.mediaUrl) return null;
            const mType = ['image', 'video', 'document'].includes(selPreset.headerType || '') ? (selPreset.headerType as string) : 'image';
            return (
              <div className="border rounded-lg p-3 bg-emerald-50/40 border-emerald-100 space-y-2">
                <p className="text-xs font-medium text-gray-700">预设 {mType} — 选择发送内容</p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={headerMediaMode === 'approved'} onChange={() => setHeaderMediaMode('approved')} className="accent-emerald-600" />
                  发送保存的预设 {mType} （无需上传）
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={headerMediaMode === 'custom'} onChange={() => setHeaderMediaMode('custom')} className="accent-emerald-600" />
                  改变 {mType} 仅限本次活动
                </label>
                {headerMediaMode === 'custom' && (
                  <div className="space-y-1">
                    <label className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium cursor-pointer hover:text-emerald-700">
                      <Plus className="w-4 h-4" /> {uploadingHeader ? "正在上传..." : (customHeaderUrl ? "替换文件" : "上传文件")}
                      <input type="file" accept={mType === 'image' ? 'image/*' : mType === 'video' ? 'video/*' : undefined} className="hidden" onChange={handleHeaderUpload} />
                    </label>
                    {customHeaderUrl && mType === 'image' && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={customHeaderUrl} alt={"媒体"} className="h-20 rounded border" />
                    )}
                    {customHeaderUrl && mType !== 'image' && <p className="text-xs text-gray-500 break-all">{customHeaderUrl}</p>}
                  </div>
                )}
              </div>
            );
          })()}
          {(() => {
            const selPreset = presets.find(p => p._id === form.preset);
            if (!selPreset) return null;
            return (
              <div className="border rounded-lg p-3 bg-gray-50 border-gray-200">
                <p className="text-xs font-medium text-gray-700 mb-2">预览 — 联系人收到的内容</p>
                <div className="flex justify-center">
                  <WhatsAppPhonePreview
                    title={selPreset.name}
                    data={{
                      headerType: selPreset.headerType,
                      headerText: selPreset.headerText || '',
                      headerMediaUrl: headerMediaMode === 'custom' && customHeaderUrl ? customHeaderUrl : (selPreset.mediaUrl || ''),
                      body: selPreset.body || '',
                      footer: selPreset.footer || '',
                      buttons: (selPreset.buttons || []).map(b => ({ type: (b.type || 'QUICK_REPLY').toUpperCase(), text: b.text || '' })),
                    }}
                  />
                </div>
              </div>
            );
          })()}
          {presets.length === 0 && <p className="text-xs text-amber-600">首先在“预设模板”页面上创建一个模板。</p>}
          {waNumbers.length > 1 && (
            <Select label={"从号码发送"} value={form.senderNumberId} onChange={(e) => setForm({ ...form, senderNumberId: e.target.value })}
              options={[{ value: '', label: "默认号码" }, ...waNumbers.map(n => ({ value: n.id, label: n.label }))]} />
          )}
          <Select label={"观众"} value={form.audienceType} onChange={(e) => setForm({ ...form, audienceType: e.target.value })}
            options={[{ value: 'all', label: "所有联系人" }, { value: 'segment', label: "按细分市场" }, { value: 'tag', label: "按标签" }, { value: 'combo', label: "过滤器 — 标签 + 细分（dono match ho tabhi）" },  { value: 'numbers', label: "号码列表/CSV（bina 联系人保存 kiye）" }]} />
          
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
                <span className="text-xs text-gray-400">{parseNumbers(numbersText).length} 有效号码{ignoredCount(numbersText) > 0 ? ` · ${ignoredCount(numbersText)} 被忽略（无效/重复）` : ''}</span>
              </div>
              <p className="text-xs text-gray-400">预设仅适用于具有开放的 24 小时窗口的号码；其余的被跳过。</p>
            </div>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">选择标签</label>
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
          {form.audienceType === 'combo' && (
            <p className="text-xs text-gray-500">Har chuni gayi 类别匹配 honi chahiye（标签和段）。 Ek 类别 me kai 重视 chunein 至 unme se koi bhi chalega。</p>
          )}
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
            <Button onClick={handleCreate} icon={<Send className="w-4 h-4" />} loading={submitting}>创建活动</Button>
          </div>
        </div>
      </Modal>

      <CampaignReportModal campaignId={reportTarget?.id || null} campaignName={reportTarget?.name} onClose={() => setReportTarget(null)} />

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
    </div>
  );
}
