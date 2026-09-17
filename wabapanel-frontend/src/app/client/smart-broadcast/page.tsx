'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect, useMemo } from 'react';
import { Zap, Plus, Trash2, RefreshCw, Send, AlertTriangle, FileText, BarChart3, Pencil, Upload, Square } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import CampaignReportModal from '@/components/campaigns/CampaignReportModal';
import WaTextarea from '@/components/ui/WaTextarea';
import { smartBroadcastApi, tagApi, segmentApi, mediaApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

interface SeedTemplate { key: string; title: string; varCount: number; body: string }
interface TplButton { type: 'quick_reply' | 'url' | 'phone'; text: string; value: string }
interface TplHeader { type: 'none' | 'text' | 'image' | 'video' | 'document'; content?: string; mediaUrl?: string }
interface SmartTemplate {
  _id: string; name: string; body: string; status: string;
  smartVarCount: number; language: string; rejectionReason?: string; createdAt: string;
  header?: TplHeader; footer?: string; buttons?: TplButton[];
}
interface CampaignReport {
  _id: string; name: string; status: string; createdAt: string;
  template?: { name?: string } | null;
  stats: { totalRecipients: number; sent: number; delivered: number; read: number; failed: number };
}
interface ReportTarget {
  id: string; name: string;
}
interface TagItem { _id: string; name: string }
interface SegmentItem { _id: string; name: string }

const statusColor = (s: string) =>
  s === 'approved' || s === 'completed' ? 'success' : s === 'rejected' || s === 'failed' ? 'danger' : 'default';

// Mirrors the backend line-to-variable mapping for the live preview.
// 0-variable templates send the approved body as-is.
const fillBody = (body: string, message: string, varCount: number) => {
  if (!varCount || varCount < 1) return body;
  const lines = message.split('\n');
  let out = body;
  for (let i = 1; i <= varCount; i++) {
    const val = i < varCount ? (lines[i - 1] != null ? lines[i - 1].trim() : '') : lines.slice(varCount - 1).map((l) => l.trim()).join(' ');
    out = out.split(`{{${i}}}`).join(val || ' ');
  }
  return out;
};

const emptyForm = {
  name: '', body: '', footer: '',
  headerType: 'none' as TplHeader['type'], headerText: '', headerMediaUrl: '',
  buttons: [] as TplButton[],
  optOutButton: false, optOutFooter: false,
};

const OPT_OUT_FOOTER = 'Reply STOP to unsubscribe';
const isStopButton = (b: TplButton) => b.type === 'quick_reply' && /^\s*stop\s*$/i.test(b.text || '');

export default function SmartBroadcastPage() {
  const [tab, setTab] = useState<'templates' | 'send' | 'reports'>('templates');
  const [catalog, setCatalog] = useState<SeedTemplate[]>([]);
  const [templates, setTemplates] = useState<SmartTemplate[]>([]);
  const [reports, setReports] = useState<CampaignReport[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [segments, setSegments] = useState<SegmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);

  // create/edit template modal
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [seedKey, setSeedKey] = useState('');
  const [form, setForm] = useState({ ...emptyForm });
  const [savingTpl, setSavingTpl] = useState(false);
  const [uploading, setUploading] = useState(false);

  // send form
  const [sendForm, setSendForm] = useState({
    name: '', templateId: '', message: '', headerMediaUrl: '',
    targetType: 'all', targetTags: [] as string[], targetSegments: [] as string[],
    numbersText: '', senderNumberId: '',
  });
  const [sending, setSending] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  // One value per {{n}} placeholder of the selected template.
  const [varVals, setVarVals] = useState<string[]>([]);

  const { currentWorkspace } = useAuthStore();
  const waNumbers = useMemo(() => {
    const wa = currentWorkspace?.whatsapp;
    if (!wa) return [] as { id: string; label: string }[];
    const list = [{ id: wa.phoneNumberId || '', label: `${wa.displayName || 'Default'} (${wa.phoneNumber || wa.phoneNumberId || ''})` }];
    for (const n of (wa.extraNumbers || [])) {
      list.push({ id: n.phoneNumberId, label: `${n.displayName || 'Number'} (${n.phoneNumber || n.phoneNumberId})` });
    }
    return list.filter((n) => n.id);
  }, [currentWorkspace]);

  const load = async () => {
    setLoading(true);
    try {
      const [tplRes, tagRes, segRes] = await Promise.all([
        smartBroadcastApi.templates(), tagApi.list(), segmentApi.list(),
      ]);
      setCatalog(tplRes.data.data.catalog || []);
      setTemplates(tplRes.data.data.templates || []);
      setTags(tagRes.data.data || []);
      setSegments(segRes.data.data || []);
    } catch { /* */ }
    setLoading(false);
  };

  const loadReports = async () => {
    try { const r = await smartBroadcastApi.reports(); setReports(r.data.data || []); } catch { /* */ }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === 'reports') loadReports(); }, [tab]);
  // Auto-refresh reports while a campaign is running.
  useEffect(() => {
    if (tab !== 'reports' || !reports.some((c) => c.status === 'running')) return;
    const t = setInterval(loadReports, 5000);
    return () => clearInterval(t);
  }, [tab, reports]);

  const stopCampaign = async (id: string) => {
    try { await smartBroadcastApi.stopCampaign(id); toast.success(translateApiMessage("活动已停止")); loadReports(); }
    catch { toast.error(translateApiMessage("停止失败")); }
  };

  const approvedTemplates = templates.filter((t) => t.status === 'approved');
  const selectedTemplate = templates.find((t) => t._id === sendForm.templateId);

  // The body line that contains {{n}}, shown as context next to each input.
  const varContext = (body: string, n: number) =>
    (String(body || '').split('\n').find((l) => l.includes(`{{${n}}}`)) || '').trim();

  // Keep sendForm.message as the newline-joined values so the existing backend
  // line-to-variable mapping ({{1}}=line 1, {{2}}=line 2, …) works unchanged.
  const setVar = (idx: number, val: string) => {
    const next = [...varVals];
    next[idx] = val.replace(/[\n\r]+/g, ' ');
    setVarVals(next);
    setSendForm((f) => ({ ...f, message: next.join('\n') }));
  };

  const selectTemplate = (id: string) => {
    const t = templates.find((x) => x._id === id);
    setVarVals(Array((t?.smartVarCount ?? 0)).fill(''));
    setSendForm((f) => ({ ...f, templateId: id, headerMediaUrl: '', message: '' }));
  };

  const openCreate = () => {
    setEditingId(''); setSeedKey(''); setForm({ ...emptyForm }); setShowCreate(true);
  };

  const openEdit = (t: SmartTemplate) => {
    setEditingId(t._id); setSeedKey('');
    setForm({
      name: t.name, body: t.body, footer: t.footer || '',
      headerType: t.header?.type || 'none', headerText: t.header?.content || '', headerMediaUrl: t.header?.mediaUrl || '',
      buttons: (t.buttons || []).map((b) => ({ type: b.type, text: b.text, value: b.value })),
      optOutButton: false, optOutFooter: false,
    });
    setShowCreate(true);
  };

  const pickSeed = (key: string) => {
    setSeedKey(key);
    const seed = catalog.find((c) => c.key === key);
    if (seed) setForm((f) => ({ ...f, name: f.name || `sb_${seed.key}_${Date.now().toString(36)}`, body: seed.body }));
  };

  const uploadMedia = async (e: React.ChangeEvent<HTMLInputElement>, target: 'template' | 'send') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'smart-broadcast');
      const res = await mediaApi.upload(fd);
      const url = res.data?.data?.url || res.data?.url || '';
      if (target === 'template') setForm((f) => ({ ...f, headerMediaUrl: url }));
      else setSendForm((f) => ({ ...f, headerMediaUrl: url }));
      toast.success(translateApiMessage("已上传"));
    } catch { toast.error(translateApiMessage("上传失败")); }
    setUploading(false);
    e.target.value = '';
  };

  const setButton = (i: number, patch: Partial<TplButton>) =>
    setForm((f) => ({ ...f, buttons: f.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));

  const saveTemplate = async () => {
    if (!form.name || !form.body) { toast.error(translateApiMessage("姓名和正文为必填项")); return; }
    if (['image', 'video', 'document'].includes(form.headerType) && !form.headerMediaUrl) {
      toast.error(translateApiMessage("上传标题媒体或粘贴其 URL")); return;
    }
    let buttons = form.buttons.filter((b) => b.text);
    // Opt-out “Stop” quick-reply button: add if requested and not already present.
    if (form.optOutButton && !buttons.some(isStopButton)) {
      if (buttons.length >= 3) { toast.error(translateApiMessage("首先删除一个按钮 - 最多 3 个按钮（选择退出停止需要一个插槽）")); return; }
      buttons = [...buttons, { type: 'quick_reply', text: "停止", value: '' }];
    }
    // Opt-out footer line (Meta footer max 60 chars).
    let footer = form.footer || '';
    if (form.optOutFooter && !footer.toLowerCase().includes('stop')) {
      footer = footer ? `${footer} · ${OPT_OUT_FOOTER}`.slice(0, 60) : OPT_OUT_FOOTER;
    }
    setSavingTpl(true);
    try {
      const payload = {
        name: form.name,
        body: form.body,
        footer,
        header: form.headerType === 'none' ? { type: 'none' }
          : form.headerType === 'text' ? { type: 'text', content: form.headerText }
          : { type: form.headerType, mediaUrl: form.headerMediaUrl },
        buttons,
      };
      if (editingId) await smartBroadcastApi.updateTemplate(editingId, payload);
      else await smartBroadcastApi.createTemplate(payload);
      toast.success(translateApiMessage("已提交给 Meta — 等待批准"));
      setShowCreate(false);
      load();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to submit';
      toast.error(translateApiMessage(msg));
      load();
    }
    setSavingTpl(false);
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("删除此智能模板？")) return;
    try { await smartBroadcastApi.deleteTemplate(id); toast.success(translateApiMessage("已删除")); load(); }
    catch { toast.error(translateApiMessage("删除失败")); }
  };

  const send = async () => {
    if (!sendForm.templateId) { toast.error(translateApiMessage("选择批准的模板")); return; }
    if ((selectedTemplate?.smartVarCount ?? 0) > 0 && !sendForm.message.trim()) { toast.error(translateApiMessage("写下您的信息")); return; }
    const numbers = sendForm.numbersText.split(/[\s,;|]+/).map((n) => n.replace(/\D/g, '')).filter((n) => n.length >= 10);
    setSending(true);
    try {
      await smartBroadcastApi.send({
        name: sendForm.name || undefined,
        templateId: sendForm.templateId,
        message: sendForm.message,
        headerMediaUrl: sendForm.headerMediaUrl || undefined,
        targetType: sendForm.targetType,
        targetTags: sendForm.targetType === 'tag' ? sendForm.targetTags : [],
        targetSegments: sendForm.targetType === 'segment' ? sendForm.targetSegments : [],
        targetNumbers: sendForm.targetType === 'numbers' ? numbers : [],
        senderNumberId: sendForm.senderNumberId || '',
      });
      toast.success(translateApiMessage("智能直播启动"));
      setVarVals(Array((selectedTemplate?.smartVarCount ?? 0)).fill(''));
      setSendForm({ ...sendForm, name: '', message: '', numbersText: '', headerMediaUrl: '' });
      setTab('reports');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Send failed';
      toast.error(translateApiMessage(msg));
    }
    setSending(false);
  };

  const TabBtn = ({ id, label, icon }: { id: typeof tab; label: string; icon: React.ReactNode }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg ${tab === id ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
    >{icon}{label}</button>
  );

  const previewMediaUrl = sendForm.headerMediaUrl || selectedTemplate?.header?.mediaUrl || '';
  const filledLength = selectedTemplate ? fillBody(selectedTemplate.body, sendForm.message, selectedTemplate.smartVarCount).length : 0;

  return (
    <div className="p-6">
      <div className="page-hero mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Zap className="w-6 h-6" /> 智能广播</h1>
          <p className="text-sm mt-1">使用批准的实用模板发送 - 您编写消息，面板在发送时填充模板变量。</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <b>高级功能——负责任地使用。</b> 如果内容与实用程序类别不匹配，则元可以重新分类、暂停或限制模板/编号。发送 WhatsApp 号码会带来这种风险。缓慢发送，保持选择退出，并在模板暂停时停止。
            {!acknowledged && (
              <label className="mt-2 flex items-center gap-2 font-medium cursor-pointer">
                <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                我了解风险并对我的消息负责。
              </label>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-5">
        <TabBtn id="templates" label={"实用模板"} icon={<FileText className="w-4 h-4" />} />
        <TabBtn id="send" label={"新活动"} icon={<Send className="w-4 h-4" />} />
        <TabBtn id="reports" label={"报告"} icon={<BarChart3 className="w-4 h-4" />} />
      </div>

      {tab === 'templates' && (
        <div>
          <div className="flex justify-end mb-3">
            <Button onClick={openCreate} disabled={!acknowledged}><Plus className="w-4 h-4 mr-1" /> 新实用程序模板</Button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr><th className="p-3">名称</th><th className="p-3">变量</th><th className="p-3">标头</th><th className="p-3">状态</th><th className="p-3">原因</th><th className="p-3"></th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="p-6 text-center text-gray-400">加载中…</td></tr>
                ) : templates.length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-gray-400">还没有智能模板。创建一个并提交给 Meta。</td></tr>
                ) : templates.map((t) => (
                  <tr key={t._id} className="border-t border-gray-100">
                    <td className="p-3 font-medium">{t.name}</td>
                    <td className="p-3">{t.smartVarCount}</td>
                    <td className="p-3 text-xs text-gray-500">{t.header?.type && t.header.type !== 'none' ? t.header.type : '—'}</td>
                    <td className="p-3"><Badge variant={statusColor(t.status)}>{t.status}</Badge></td>
                    <td className="p-3 text-xs text-gray-500 max-w-xs truncate">{t.rejectionReason || '—'}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(t)} disabled={!acknowledged} className="text-gray-500 hover:text-gray-800 mr-3" title={"编辑并重新提交"}><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => deleteTemplate(t._id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'send' && (
        <div className="grid gap-5 lg:grid-cols-2 items-start">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            {approvedTemplates.length === 0 ? (
              <p className="text-sm text-gray-500">尚未获得批准的实用程序模板。创建一个在 <b>实用模板</b> 选项卡并等待元批准。</p>
            ) : (
              <div className="space-y-4">
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={"活动名称（可选）"}
                  value={sendForm.name} onChange={(e) => setSendForm({ ...sendForm, name: e.target.value })} />
                <div>
                  <label className="block text-sm font-medium mb-1">批准的模板</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={sendForm.templateId} onChange={(e) => selectTemplate(e.target.value)}>
                    <option value="">选择模板...</option>
                    {approvedTemplates.map((t) => <option key={t._id} value={t._id}>{translateDisplay(t.name)} ({translateDisplay(t.smartVarCount)} 字段）</option>)}
                  </select>
                </div>
                {selectedTemplate && !['image', 'video', 'document'].includes(selectedTemplate.header?.type || '') && (
                  <p className="text-xs text-gray-400">该模板在没有媒体标头的情况下获得批准，因此无法在发送时附加媒体。要发送媒体，请创建/编辑带有图像/视频/文档标题的模板。</p>
                )}
                {selectedTemplate && ['image', 'video', 'document'].includes(selectedTemplate.header?.type || '') && (
                  <div>
                    <label className="block text-sm font-medium mb-1">标头 {translateDisplay(selectedTemplate.header?.type)} （本次发送）</label>
                    <div className="flex gap-2 items-center">
                      <input className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={"媒体 URL（默认：模板媒体）"}
                        value={sendForm.headerMediaUrl} onChange={(e) => setSendForm({ ...sendForm, headerMediaUrl: e.target.value })} />
                      <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                        <Upload className="w-4 h-4" /> {uploading ? '…' : "上传"}
                        <input type="file" className="hidden" accept={selectedTemplate.header?.type === 'image' ? 'image/*' : selectedTemplate.header?.type === 'video' ? 'video/*' : '*'} onChange={(e) => uploadMedia(e, 'send')} />
                      </label>
                    </div>
                  </div>
                )}
                {!selectedTemplate && (
                  <p className="text-xs text-gray-400">选择上面批准的模板来填充其变量。</p>
                )}
                {selectedTemplate && (selectedTemplate.smartVarCount ?? 0) < 1 && (
                  <div>
                    <label className="block text-sm font-medium mb-1">留言</label>
                    <p className="text-xs text-gray-500 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">该模板没有变量 - 其批准的格式化文本完全按原样发送。没什么可填的。</p>
                  </div>
                )}
                {selectedTemplate && (selectedTemplate.smartVarCount ?? 0) > 0 && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium">填充模板变量</label>
                    {Array.from({ length: selectedTemplate.smartVarCount }, (_, i) => {
                      const n = i + 1;
                      const ctx = varContext(selectedTemplate.body, n);
                      return (
                        <div key={n}>
                          <label className="block text-xs font-medium text-gray-600 mb-1">变量 {`{{${n}}}`}{ctx ? <span className="text-gray-400 font-normal"> — “{ctx}”</span> : null}</label>
                          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={`的值{{${n}}}`}
                            value={varVals[i] || ''} onChange={(e) => setVar(i, e.target.value)} />
                        </div>
                      );
                    })}
                    <p className="text-xs text-gray-400">每个值都会填充已批准模板中的匹配占位符。值必须是单行（元会去除变量内的换行符）。</p>
                    <p className={`text-xs font-medium ${filledLength > 1024 ? 'text-red-600' : 'text-gray-400'}`}>
                      {filledLength} / 1024 个字符（模板 + 值）{filledLength > 1024 ? ` — 太长，缩短 ${filledLength - 1024}` : ''}
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">观众</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={sendForm.targetType} onChange={(e) => setSendForm({ ...sendForm, targetType: e.target.value })}>
                    <option value="all">所有联系人</option>
                    <option value="tag">按标签</option>
                    <option value="segment">按细分市场</option>
                    <option value="numbers">手册编号</option>
                  </select>
                </div>
                {sendForm.targetType === 'tag' && (
                  <select multiple className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-28"
                    value={sendForm.targetTags} onChange={(e) => setSendForm({ ...sendForm, targetTags: Array.from(e.target.selectedOptions, (o) => o.value) })}>
                    {tags.map((t) => <option key={t._id} value={t._id}>{translateDisplay(t.name)}</option>)}
                  </select>
                )}
                {sendForm.targetType === 'segment' && (
                  <select multiple className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-28"
                    value={sendForm.targetSegments} onChange={(e) => setSendForm({ ...sendForm, targetSegments: Array.from(e.target.selectedOptions, (o) => o.value) })}>
                    {segments.map((s) => <option key={s._id} value={s._id}>{translateDisplay(s.name)}</option>)}
                  </select>
                )}
                {sendForm.targetType === 'numbers' && (
                  <textarea rows={4} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={"每行一个数字"}
                    value={sendForm.numbersText} onChange={(e) => setSendForm({ ...sendForm, numbersText: e.target.value })} />
                )}
                {waNumbers.length > 1 && (
                  <div>
                    <label className="block text-sm font-medium mb-1">发送号码</label>
                    <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={sendForm.senderNumberId} onChange={(e) => setSendForm({ ...sendForm, senderNumberId: e.target.value })}>
                      <option value="">默认号码</option>
                      {waNumbers.map((n) => <option key={n.id} value={n.id}>{translateDisplay(n.label)}</option>)}
                    </select>
                  </div>
                )}
                <Button onClick={send} disabled={sending || !acknowledged || filledLength > 1024}><Send className="w-4 h-4 mr-1" /> {sending ? "正在发送..." : "发送智能广播"}</Button>
              </div>
            )}
          </div>

          {selectedTemplate && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-medium mb-2">预览 — 外观如何</p>
              <div className="rounded-xl p-4" style={{ background: '#e5ddd5' }}>
                <div className="bg-white rounded-lg shadow-sm max-w-sm p-2 text-sm space-y-2">
                  {['image', 'video', 'document'].includes(selectedTemplate.header?.type || '') && (
                    previewMediaUrl ? (
                      selectedTemplate.header?.type === 'image'
                        ? <img src={previewMediaUrl} alt={"标题"} className="w-full rounded-md object-cover max-h-44 bg-gray-100" />
                        : selectedTemplate.header?.type === 'video'
                          ? <video src={previewMediaUrl} className="w-full rounded-md max-h-44 bg-gray-100" muted controls />
                          : <div className="rounded-md bg-gray-100 p-3 text-xs text-gray-500">📄 随附文件</div>
                    ) : <div className="rounded-md bg-gray-100 p-6 text-center text-xs text-gray-400">{translateDisplay(selectedTemplate.header?.type)} 标题</div>
                  )}
                  {selectedTemplate.header?.type === 'text' && selectedTemplate.header.content && (
                    <p className="font-semibold">{selectedTemplate.header.content}</p>
                  )}
                  <p className="whitespace-pre-wrap">{fillBody(selectedTemplate.body, sendForm.message, selectedTemplate.smartVarCount)}</p>
                  {selectedTemplate.footer && <p className="text-xs text-gray-400">{selectedTemplate.footer}</p>}
                  {(selectedTemplate.buttons || []).length > 0 && (
                    <div className="border-t border-gray-100 pt-1 space-y-1">
                      {(selectedTemplate.buttons || []).map((b, i) => (
                        <div key={i} className="text-center text-sm text-sky-600 py-1 border border-gray-100 rounded-md">{b.text}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">您的消息行填写
已批准模板的 {'{{n}}'} 字段。</p>
            </div>
          )}
        </div>
      )}

      {tab === 'reports' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr><th className="p-3">营销活动</th><th className="p-3">模板</th><th className="p-3">状态</th><th className="p-3">收件人</th><th className="p-3">已发送</th><th className="p-3">已交付</th><th className="p-3">读</th><th className="p-3">操作失败</th><th className="p-3">日期</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr><td colSpan={10} className="p-6 text-center text-gray-400">尚未发送智能广播。</td></tr>
              ) : reports.map((c) => (
                <tr key={c._id} className="border-t border-gray-100">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">{c.template?.name || '—'}</td>
                  <td className="p-3"><Badge variant={statusColor(c.status)}>{c.status}</Badge></td>
                  <td className="p-3">{c.stats?.totalRecipients ?? 0}</td>
                  <td className="p-3 text-blue-600">{c.stats?.sent ?? 0}</td>
                  <td className="p-3 text-green-600">{c.stats?.delivered ?? 0}</td>
                  <td className="p-3 text-indigo-600">{c.stats?.read ?? 0}</td>
                  <td className="p-3 text-red-500">{c.stats?.failed ?? 0}</td>
                  <td className="p-3 text-xs text-gray-500">{new Date(c.createdAt).toLocaleString()}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {['running', 'completed', 'paused', 'failed'].includes(c.status) && (
                      <button title={"报告"} onClick={() => setReportTarget({ id: c._id, name: c.name })} className="p-1 hover:bg-indigo-50 rounded mr-1"><BarChart3 className="w-4 h-4 text-indigo-500" /></button>
                    )}
                    {c.status === 'running' && (
                      <button onClick={() => stopCampaign(c._id)} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-50"><Square className="w-3 h-3" /> 停止</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CampaignReportModal campaignId={reportTarget?.id || null} campaignName={reportTarget?.name} onClose={() => setReportTarget(null)} />

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title={editingId ? "编辑实用程序模板" : "新实用程序模板"}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {!editingId && (
            <div>
              <label className="block text-sm font-medium mb-1">选择一个现成的模板</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={seedKey} onChange={(e) => pickSeed(e.target.value)}>
                <option value="">— 自定义（我自己写） —</option>
                {catalog.map((c) => <option key={c.key} value={c.key}>{translateDisplay(c.title)}</option>)}
              </select>
            </div>
          )}
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={"模板名称（a-z、0-9、_）"}
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <WaTextarea rows={8} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={"正文。对于动态部分，请使用 {{1}}、{{2}} ...，或者不使用变量以按原样发送固定格式的消息。"}
            value={form.body} onChange={(v) => setForm({ ...form, body: v })} />
          <p className="text-xs text-gray-400 -mt-2">提示：对于固定格式的消息（带换行符），请将整个文本粘贴到此处 <b>没有</b> {'{{ }}'} 变量 — 格式保持与批准的完全相同。变量必须是单行（元会去除变量内的换行符）。</p>

          <div>
            <label className="block text-sm font-medium mb-1">标头（可选）</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.headerType}
              onChange={(e) => setForm({ ...form, headerType: e.target.value as TplHeader['type'] })}>
              <option value="none">无</option>
              <option value="text">文本</option>
              <option value="image">图片</option>
              <option value="video">视频</option>
              <option value="document">文件</option>
            </select>
          </div>
          {form.headerType === 'text' && (
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={"标题文本"}
              value={form.headerText} onChange={(e) => setForm({ ...form, headerText: e.target.value })} />
          )}
          {['image', 'video', 'document'].includes(form.headerType) && (
            <div className="flex gap-2 items-center">
              <input className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={"媒体 URL（或单击“上传”）"}
                value={form.headerMediaUrl} onChange={(e) => setForm({ ...form, headerMediaUrl: e.target.value })} />
              <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <Upload className="w-4 h-4" /> {uploading ? '…' : "上传"}
                <input type="file" className="hidden" accept={form.headerType === 'image' ? 'image/*' : form.headerType === 'video' ? 'video/*' : '*'} onChange={(e) => uploadMedia(e, 'template')} />
              </label>
            </div>
          )}

          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={"页脚（可选）"}
            value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })} />

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">按钮（可选，最多 3 个）</label>
              {form.buttons.length < 3 && (
                <button className="text-xs text-green-600 font-medium" onClick={() => setForm({ ...form, buttons: [...form.buttons, { type: 'quick_reply', text: '', value: '' }] })}>+ 添加按钮</button>
              )}
            </div>
            {form.buttons.map((b, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <select className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" value={b.type} onChange={(e) => setButton(i, { type: e.target.value as TplButton['type'], value: '' })}>
                  <option value="quick_reply">快速回复</option>
                  <option value="url">URL</option>
                  <option value="phone">电话</option>
                </select>
                <input className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" placeholder={"按钮文本"} value={b.text} onChange={(e) => setButton(i, { text: e.target.value })} />
                {b.type !== 'quick_reply' && (
                  <input className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" placeholder={b.type === 'url' ? 'https://…' : '+91…'} value={b.value} onChange={(e) => setButton(i, { value: e.target.value })} />
                )}
                <button className="text-red-500" onClick={() => setForm({ ...form, buttons: form.buttons.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
            <p className="text-sm font-medium">选择退出/取消订阅（建议用于广播）</p>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" className="mt-0.5" checked={form.optOutButton} onChange={(e) => setForm({ ...form, optOutButton: e.target.checked })} />
              <span>添加一个 <b>“停止”</b> 快速回复按钮 — 客户点击它即可取消订阅（使用 3 个按钮槽之一）。</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" className="mt-0.5" checked={form.optOutFooter} onChange={(e) => setForm({ ...form, optOutFooter: e.target.checked })} />
              <span>添加页脚行 <b>“{OPT_OUT_FOOTER}”</b> — 这样客户就知道他们可以回复“停止”。</span>
            </label>
            <p className="text-xs text-gray-400">无论哪种方式，当客户回复“停止”（或点击按钮）时，面板会自动取消订阅他们并在每次广播中跳过他们。将选择退出添加到实用程序模板可能会使 Meta 将其重新分类为营销。</p>
          </div>

          {editingId && <p className="text-xs text-amber-600">保存将删除 Meta 上的旧版本并重新提交此版本以供新批准（名称可以更改）。</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={saveTemplate} disabled={savingTpl || uploading}>{savingTpl ? "正在提交..." : "提交到元"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
