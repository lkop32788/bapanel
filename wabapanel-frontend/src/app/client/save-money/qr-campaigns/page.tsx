'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Play, Pause, Trash2, Send, Clock, CheckCircle, AlertCircle, QrCode, ShieldAlert, Edit, CalendarClock, BarChart3 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import CampaignReportModal from '@/components/campaigns/CampaignReportModal';
import { campaignApi, presetMessageApi, segmentApi, tagApi } from '@/lib/api';
import type { Campaign, Segment, Tag } from '@/types';
import toast from 'react-hot-toast';

interface Preset { _id: string; name: string; body: string; }

export default function QrCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', preset: '', audienceType: 'all', segments: [] as string[], tags: [] as string[],   minInterval: 5, maxInterval: 15 });
  const [numbersText, setNumbersText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);

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
      const [campRes, presetRes, segRes, tagRes] = await Promise.allSettled([
        campaignApi.list({ type: 'preset', sendChannel: 'whatsapp_qr' }),
        presetMessageApi.list(),
        segmentApi.list(),
        tagApi.list(),
        
      ]);
      if (campRes.status === 'fulfilled') setCampaigns(campRes.value.data.data || []);
      if (presetRes.status === 'fulfilled') setPresets(presetRes.value.data.data || []);
      if (segRes.status === 'fulfilled') setSegments(segRes.value.data.data || []);
      if (tagRes.status === 'fulfilled') setTags(tagRes.value.data.data || []);
      
    } catch { /* empty */ }
    setLoading(false);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (submitting) return;
    if (!form.name || !form.preset) { toast.error(translateApiMessage("需要名称和预设模板")); return; }
    setSubmitting(true);
    const numbers = form.audienceType === 'numbers' ? parseNumbers(numbersText) : [];
    if (form.audienceType === 'numbers' && !numbers.length) { toast.error(translateApiMessage("请输入至少一个有效数字")); setSubmitting(false); return; }
    
    try {
      const minSec = Math.max(0, Number(form.minInterval) || 0);
      const maxSec = Math.max(minSec, Number(form.maxInterval) || 0);
      const payload = {
        name: form.name, type: 'preset', presetMessage: form.preset, sendChannel: 'whatsapp_qr',
        sendInterval: { minSec, maxSec },
        audience: { type: form.audienceType, segments: form.segments, tags: form.tags, numbers,   },
      };
      if (editId) {
        await campaignApi.update(editId, payload);
        if (createSchedAt) await campaignApi.schedule(editId, { scheduledAt: new Date(createSchedAt).toISOString(), recurrence: createSchedRec });
      } else {
        const created = await campaignApi.create(payload);
        const newId = created.data.data?._id;
        if (createSchedAt && newId) await campaignApi.schedule(newId, { scheduledAt: new Date(createSchedAt).toISOString(), recurrence: createSchedRec });
      }
      toast.success(translateApiMessage(editId ? "WhatsApp 网络营销活动已更新" : "已创建 Web WhatsApp 活动"));
      setShowModal(false); setEditId(null);
      setCreateSchedAt(''); setCreateSchedRec('none');
      setForm({ name: '', preset: '', audienceType: 'all', segments: [], tags: [],   minInterval: 5, maxInterval: 15 });
      fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    }
    setSubmitting(false);
  };

  const handleEdit = (c: Campaign & { targetType?: string; targetSegments?: string[]; targetTags?: string[]; targetNumbers?: string[];   presetMessage?: { _id?: string } | string }) => {
    setEditId(c._id);
    setForm({
      name: c.name, preset: typeof c.presetMessage === 'string' ? c.presetMessage : (c.presetMessage?._id || ''),
      audienceType: c.targetType || 'all',
      segments: (c.targetSegments || []).map(String), tags: (c.targetTags || []).map(String),
       
      minInterval: (c as { sendInterval?: { minSec?: number } }).sendInterval?.minSec ?? 5,
      maxInterval: (c as { sendInterval?: { maxSec?: number } }).sendInterval?.maxSec ?? 15,
    });
    setNumbersText((c.targetNumbers || []).join(String.fromCharCode(10)));
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

  const getStatusBadge = (c: Campaign) => {
    const map: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'default'; icon: React.ReactNode }> = {
      draft: { variant: 'default', icon: <Clock className="w-3 h-3" /> },
      scheduled: { variant: 'info', icon: <Clock className="w-3 h-3" /> },
      running: { variant: 'success', icon: <Play className="w-3 h-3" /> },
      completed: { variant: 'success', icon: <CheckCircle className="w-3 h-3" /> },
      paused: { variant: 'warning', icon: <Pause className="w-3 h-3" /> },
      failed: { variant: 'danger', icon: <AlertCircle className="w-3 h-3" /> },
    };
    const s = map[c.status] || map.draft;
    const autoPaused = c.status === 'paused' && (c as { variables?: { qrAutoPaused?: boolean } }).variables?.qrAutoPaused;
    return <Badge variant={s.variant}>{s.icon} {autoPaused ? "已暂停（每日限制 — 自动恢复）" : c.status}</Badge>;
  };

  const columns = [
    { key: 'name', title: "营销活动", render: (c: Campaign) => <span className="font-medium text-gray-900">{c.name}</span> },
    { key: 'status', title: "状态", render: (c: Campaign) => getStatusBadge(c) },
    { key: 'sent', title: "已发送", render: (c: Campaign) => c.stats?.sent || 0 },
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
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><QrCode className="w-6 h-6 text-emerald-600" /> 网络 WhatsApp 活动</h1>
          <p className="text-gray-500 text-sm mt-1">通过您的 Web WhatsApp (QR) 号码批量发送预设模板 — 无模板费用，无需 24 小时窗口</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>新的网络 WhatsApp 活动</Button>
      </div>

      <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <span>消息来自您 <b>网络 WhatsApp (QR)</b> 数字具有类似人类的延迟和每日安全限制（热身）。如果达到限制，活动将暂停并 <b>第二天自动恢复</b>。通过 Web WhatsApp 批量发送总是会带来一些禁令风险 - 保持内容非垃圾邮件。</span>
      </div>

      <Table columns={columns} data={campaigns} loading={loading} emptyText={"尚无网络 WhatsApp 活动"} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => campaignApi.delete(id).catch(() => null))); fetchData(); }} />

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditId(null); }} title={editId ? "编辑网络 WhatsApp 营销活动" : "创建网络 WhatsApp 活动"} size="lg">
        <div className="space-y-4">
          <Input label={"活动名称"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Select label={"预设模板"} value={form.preset} onChange={(e) => setForm({ ...form, preset: e.target.value })}
            options={[{ value: '', label: "选择预设模板" }, ...presets.map(p => ({ value: p._id, label: p.name }))]} />
          {presets.length === 0 && <p className="text-xs text-amber-600">首先在“预设模板”页面上创建一个模板。</p>}
          <Select label={"观众"} value={form.audienceType} onChange={(e) => setForm({ ...form, audienceType: e.target.value })}
            options={[{ value: 'all', label: "所有联系人" }, { value: 'segment', label: "按细分市场" }, { value: 'tag', label: "按标签" },  { value: 'numbers', label: "号码列表/CSV（bina 联系人保存 kiye）" }]} />
          
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
              <p className="text-xs text-gray-400">新号码会自动保存为联系人并通过 QR 通道发送消息。</p>
            </div>
          )}
          {form.audienceType === 'segment' && (
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
          {form.audienceType === 'tag' && (
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
          <div className="border rounded-lg p-3 bg-emerald-50/40 border-emerald-100 space-y-2">
            <p className="text-xs font-medium text-gray-700">发送速度——每条消息之间的延迟（反禁令）</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label={"分钟秒"} type="number" min={0} value={form.minInterval}
                onChange={(e) => setForm({ ...form, minInterval: Number(e.target.value) })} />
              <Input label={"最大秒数"} type="number" min={0} value={form.maxInterval}
                onChange={(e) => setForm({ ...form, maxInterval: Number(e.target.value) })} />
            </div>
            <p className="text-[11px] text-gray-500">哈尔消息克山毛榉 {form.minInterval}-{form.maxInterval}s ka 随机间隙。 0 = 无延迟（最快，封禁风险较高）。</p>
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
