'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, Workflow, BarChart3, Sparkles, LayoutTemplate, Download, Upload, FileBarChart, Copy } from 'lucide-react';
import FlowMarketplace from '@/components/FlowMarketplace';
import BotFlowReport from '@/components/BotFlowReport';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { botFlowApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

import useKkhsTheme from '@/lib/useKkhsTheme';
import toast from 'react-hot-toast';

interface FlowNode { id: string; name?: string; type?: string; text?: string }
interface BotFlow {
  _id: string; name: string; triggerKeywords: string[]; matchType: string;
  isActive: boolean; nodes: FlowNode[]; updatedAt: string; runs?: number;
  nodeHits?: Record<string, number>; startNode?: string; eventTrigger?: string;
  eventValue?: string; dateOffsetDays?: number; scheduleMode?: string; scheduleAt?: string;
  scheduleTime?: string; scheduleWeekday?: number; scheduleDay?: number; audienceTag?: string;
}

// Events that can auto-start a flow (keyword triggers keep working alongside these)
const EVENT_OPTIONS = [
  { value: '', label: "无（仅限关键字）" },
  { value: 'new_lead', label: "已创建新线索" },
  { value: 'tag_added', label: "标签已添加到联系人" },
  
  { value: 'lead_assigned', label: "分配给客服人员的聊天" },
  { value: 'deal_won', label: "线索以获胜结束" },
  { value: 'deal_lost', label: "线索因丢失/不感兴趣而关闭" },
  { value: 'form_submitted', label: "表格已提交" },
  { value: 'link_qr', label: "来自跟踪链接/二维码" },
  { value: 'followup_due', label: "后续提醒到期" },
  { value: 'session_end', label: "24小时聊天窗口结束（使用模板卡）" },
  { value: 'contact_date', label: "联系日期（生日/纪念日/定制）" },
  { value: 'scheduled', label: "按计划（一次/每天/每周/每月）" },
  { value: 'dnp', label: "标记为“未接听”/无人应答的呼叫" },
  
  { value: 'webhook', label: "外部 webhook（从任何应用程序/Zapier 调用 URL）" },
  { value: 'google_sheet', label: "Google 表格 — 添加了新行（费用/销售线索表）" },
];

const appsScript = (url: string) => `// WabaPanel: nayi row aane par flow start karo (Extensions → Apps Script → paste → Save → Run setup once)
const WEBHOOK_URL = '${url}';
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(SpreadsheetApp.getActive()).onChange().create();
  PropertiesService.getScriptProperties().setProperty('lastRow', String(SpreadsheetApp.getActive().getSheets()[0].getLastRow()));
}
function onSheetChange(e) {
  const sheet = SpreadsheetApp.getActive().getSheets()[0]; // first tab
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('lastRow') || 1);
  const now = sheet.getLastRow();
  if (now <= last) { props.setProperty('lastRow', String(now)); return; }
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const rows = sheet.getRange(last + 1, 1, now - last, sheet.getLastColumn()).getDisplayValues();
  rows.forEach((row, i) => {
    const body = { row: last + 1 + i };
    header.forEach((h, c) => { if (h) body[h] = row[c]; });
    if (!row.join('').trim()) return;
    UrlFetchApp.fetch(WEBHOOK_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
  });
  props.setProperty('lastRow', String(now));
}`;

const emptyForm = {
  name: '', keywords: '', matchType: 'exact', eventTrigger: '', eventValue: '',
  dateOffsetDays: 0, scheduleMode: 'once', scheduleAt: '', scheduleTime: '10:00',
  scheduleWeekday: 1, scheduleDay: 1, audienceTag: '',
};

export default function BotFlowsPage() {
  const router = useRouter();
  const { currentWorkspace } = useAuthStore();
  const [flows, setFlows] = useState<BotFlow[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [tags, setTags] = useState<{ _id: string; name: string }[]>([]);
  
  const [forms, setForms] = useState<{ _id: string; title?: string; name?: string }[]>([]);
  const [trackedLinks, setTrackedLinks] = useState<{ _id: string; title: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [statsFlow, setStatsFlow] = useState<BotFlow | null>(null);
  const [showPreset, setShowPreset] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiForm, setAiForm] = useState({ name: '', business: '', goal: '' });
  const [generating, setGenerating] = useState(false);
  // White-label: the example text shows this panel's own domain, never a fixed brand.
  const [siteHost, setSiteHost] = useState('yourdomain.com');
  useEffect(() => { setSiteHost(window.location.hostname.replace(/^www\./, '')); }, []);
  const webhookUrl = (flowId: string) =>
    `${(process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')}/ext/webhook/${currentWorkspace?._id || ''}/${flowId}`;
  // SEC-15: a flow's trigger URL carries its key (?key=...). The server returns it only once
  // (create / import / "Generate key"), so hand it to the builder and show it here once.
  const [keyUrl, setKeyUrl] = useState<{ id: string; url: string } | null>(null);
  const [genKey, setGenKey] = useState(false);
  const triggerUrlFor = (flowId: string) => (keyUrl && keyUrl.id === flowId ? keyUrl.url : webhookUrl(flowId));
  const rememberTriggerUrl = (res: { data: { data: { _id: string }; webhookTriggerUrl?: string } }) => {
    try { if (res.data.webhookTriggerUrl) sessionStorage.setItem(`bfTriggerUrl:${res.data.data._id}`, res.data.webhookTriggerUrl); } catch { /* ignore */ }
  };
  const generateModalKey = async (flowId: string) => {
    if (!confirm("为此流程生成新密钥？任何旧的触发器 URL/Apps 脚本都会立即停止工作。")) return;
    setGenKey(true);
    try {
      const r = await botFlowApi.update(flowId, { generateWebhookKey: true });
      if (r.data.webhookTriggerUrl) setKeyUrl({ id: flowId, url: r.data.webhookTriggerUrl });
      toast.success(translateApiMessage("生成新密钥 — 立即复制 URL/脚本"));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "无法生成密钥"));
    }
    setGenKey(false);
  };
  const keyNote = (flowId: string) => (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <p className="flex-1 min-w-0 text-xs text-gray-600">
        {keyUrl && keyUrl.id === flowId
          ? "此 URL 包含流程键 — 立即复制，它仅显示一次。"
          : "新流通过密钥进行保护：调用者必须将 ?key=... 添加到此 URL。完整的 URL 将显示一次（在创建流程或生成新密钥后）。没有密钥的旧流程将继续工作，直到您生成密钥为止。"}
      </p>
      <Button type="button" size="sm" variant="outline" loading={genKey} onClick={() => generateModalKey(flowId)}>生成密钥</Button>
    </div>
  );

  const load = () => {
    botFlowApi.list().then(r => setFlows(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.name) { toast.error(translateApiMessage("姓名为必填项")); return; }
    const payload = {
      name: form.name,
      triggerKeywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
      matchType: form.matchType,
      eventTrigger: form.eventTrigger,
      eventValue: form.eventValue,
      dateOffsetDays: Number(form.dateOffsetDays) || 0,
      scheduleMode: form.scheduleMode,
      scheduleAt: form.scheduleAt || null,
      scheduleTime: form.scheduleTime,
      scheduleWeekday: Number(form.scheduleWeekday) || 0,
      scheduleDay: Number(form.scheduleDay) || 1,
      audienceTag: form.audienceTag,
    };
    try {
      if (editId) {
        await botFlowApi.update(editId, payload);
        toast.success(translateApiMessage("流程已更新"));
      } else {
        const res = await botFlowApi.create(payload);
        toast.success(translateApiMessage("流程已创建 — 打开构建器"));
        rememberTriggerUrl(res);
        router.push(`/client/bot-flows/${res.data.data._id}`);
        return;
      }
      setShowModal(false); load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "操作失败"));
    }
  };

  const toggleActive = async (f: BotFlow) => {
    try {
      await botFlowApi.update(f._id, { isActive: !f.isActive });
      setFlows(prev => prev.map(x => x._id === f._id ? { ...x, isActive: !f.isActive } : x));
    } catch { toast.error(translateApiMessage("操作失败")); }
  };

  const handleGenerate = async () => {
    if (!aiForm.business.trim() || !aiForm.goal.trim()) { toast.error(translateApiMessage("需要业务详细信息和流量目标")); return; }
    setGenerating(true);
    try {
      const res = await botFlowApi.generate(aiForm);
      toast.success(translateApiMessage("生成的流程 — 打开构建器"));
      rememberTriggerUrl(res);
      router.push(`/client/bot-flows/${res.data.data._id}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "AI生成失败"));
    }
    setGenerating(false);
  };

  const exportFlow = async (f: BotFlow) => {
    try {
      const res = await botFlowApi.export(f._id);
      const blob = new Blob([JSON.stringify(res.data.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${f.name.replace(/[^a-zA-Z0-9-_]+/g, '_')}-flow.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error(translateApiMessage("导出失败")); }
  };

  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const res = await botFlowApi.import(parsed);
      toast.success(translateApiMessage("导入为非活动流 — 查看它，然后将其变为活动状态"));
      rememberTriggerUrl(res);
      router.push(`/client/bot-flows/${res.data.data._id}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "流文件无效"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("删除此机器人流程？")) return;
    try { await botFlowApi.delete(id); toast.success(translateApiMessage("已删除")); load(); } catch { toast.error(translateApiMessage("操作失败")); }
  };

  const kkhs = useKkhsTheme();
  const columns = [
    { key: 'name', title: "标题", render: (f: BotFlow) => (
      <span className="font-medium text-sm">{f.name}</span>
    ) },
    { key: 'trigger', title: "开始触发关键字", render: (f: BotFlow) => (
      <div className="flex flex-wrap gap-1">
        {(f.triggerKeywords || []).length ? f.triggerKeywords.map((k, i) => <Badge key={i} variant="info">{k}</Badge>) : <span className="text-xs text-gray-400">—</span>}
      </div>
    )},
    { key: 'steps', title: "回复", render: (f: BotFlow) => (f.nodes || []).length },
    { key: 'runs', title: "运行", render: (f: BotFlow) => <span className="text-sm font-semibold text-indigo-600">{f.runs || 0}</span> },
    { key: 'status', title: "状态", render: (f: BotFlow) => (
      <button onClick={() => toggleActive(f)}>
        <Badge variant={f.isActive ? 'success' : 'default'}>{f.isActive ? "启用" : "停用"}</Badge>
      </button>
    )},
    { key: 'actions', title: "行动", render: (f: BotFlow) => (
      <div className="flex gap-1">
        <Button size="sm" onClick={() => router.push(`/client/bot-flows/${f._id}`)} icon={<Workflow className="w-3.5 h-3.5" />}>流程设计器</Button>
        <button onClick={() => setStatsFlow(f)} className="p-1.5 hover:bg-indigo-50 rounded" title={"分析 — 查看客户离开的地方"}><BarChart3 className="w-4 h-4 text-indigo-500" /></button>
        <button onClick={() => {
          setEditId(f._id);
          setForm({
            ...emptyForm,
            name: f.name,
            keywords: (f.triggerKeywords || []).join(', '),
            matchType: f.matchType || 'exact',
            eventTrigger: f.eventTrigger || '',
            eventValue: f.eventValue || '',
            dateOffsetDays: f.dateOffsetDays || 0,
            scheduleMode: f.scheduleMode || 'once',
            scheduleAt: f.scheduleAt ? String(f.scheduleAt).slice(0, 10) : '',
            scheduleTime: f.scheduleTime || '10:00',
            scheduleWeekday: f.scheduleWeekday ?? 1,
            scheduleDay: f.scheduleDay ?? 1,
            audienceTag: f.audienceTag || '',
          });
          setShowModal(true);
        }}
          className="p-1.5 hover:bg-gray-100 rounded" title={"编辑"}><Edit className="w-4 h-4 text-gray-400" /></button>
        <button onClick={() => exportFlow(f)} className="p-1.5 hover:bg-gray-100 rounded" title={"将流导出为 JSON"}><Download className="w-4 h-4 text-gray-400" /></button>
        <button onClick={() => handleDelete(f._id)} className="p-1.5 hover:bg-red-50 rounded" title={"删除"}><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">机器人流程</h1>
          <p className="text-sm text-gray-500 mt-1">使用按钮、列表、媒体和模板构建由关键字触发的多步骤聊天机器人对话</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<FileBarChart className="w-4 h-4" />} onClick={() => setShowReport(true)}>报告</Button>
          <Button variant="secondary" icon={<LayoutTemplate className="w-4 h-4" />} onClick={() => setShowPreset(true)}>现成的市场</Button>
          <Button icon={<Sparkles className="w-4 h-4" />} onClick={() => setShowAiModal(true)}>用AI生成</Button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f); }} />
          <Button variant="secondary" icon={<Upload className="w-4 h-4" />} onClick={() => fileRef.current?.click()}>进口流程</Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditId(null); setForm({ ...emptyForm }); setShowModal(true); }}>添加新的机器人流程</Button>
        </div>
      </div>

      {kkhs && !loading && flows.length > 0 ? (
        <div className="kf-grid">
          {flows.map((f) => (
            <div key={f._id} className="kf-card" data-active={f.isActive ? '1' : '0'}>
              <div className="kf-top">
                <span className="kf-ch">WhatsApp</span>
                <span className="kf-dot" title={f.isActive ? "启用" : "停用"} />
                {columns[4].render(f)}
              </div>
              <h4>{columns[0].render(f)}</h4>
              {columns[1].render(f)}
              <div className="kf-meta"><span>{(f.nodes || []).length} 回复</span><span>{f.runs || 0} 运行</span></div>
              <div className="kf-acts">{columns[5].render(f)}</div>
            </div>
          ))}
        </div>
      ) : (
      <Table columns={columns} data={flows} loading={loading} emptyText={"尚无机器人流程 — 创建一个机器人流程以开始"} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => botFlowApi.delete(id).catch(() => null))); load(); }} />
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? "编辑机器人流程" : "添加新的机器人流程"}>
        <div className="space-y-4">
          <Input label={"标题"} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={"例如欢迎流程"} required />
          <Input label={"开始触发关键字（逗号分隔）"} value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} placeholder={"你好，嗨，菜单"} />
          <Select label={"关键字匹配"} value={form.matchType} onChange={e => setForm({ ...form, matchType: e.target.value })}
            options={[{ value: 'exact', label: "完全匹配" }, { value: 'contains', label: "部分匹配（消息包含关键字）" }, { value: 'starts_with', label: "以关键字开头" }, { value: 'any', label: "所有消息（无需关键字）" }]} />
          <Select label={"事件自动启动（可选）"} value={form.eventTrigger} onChange={e => setForm({ ...form, eventTrigger: e.target.value, eventValue: '' })}
            options={EVENT_OPTIONS} />

          {form.eventTrigger === 'tag_added' && (
            <Select label={"哪个标签？ （空白=任何标签）"} value={form.eventValue} onChange={e => setForm({ ...form, eventValue: e.target.value })}
              options={[{ value: '', label: "任何标签" }, ...tags.map(t => ({ value: t.name, label: t.name }))]} />
          )}
          
          {form.eventTrigger === 'form_submitted' && (
            <Select label={"哪种形式？ （空白=任何形式）"} value={form.eventValue} onChange={e => setForm({ ...form, eventValue: e.target.value })}
              options={[{ value: '', label: "任何形式" }, ...forms.map(f => ({ value: f._id, label: f.title || f.name || 'Form' }))]} />
          )}
          {form.eventTrigger === 'link_qr' && (
            <Select label={"哪个链接/QR？ （空白 = 任何跟踪链接）"} value={form.eventValue} onChange={e => setForm({ ...form, eventValue: e.target.value })}
              options={[{ value: '', label: "任何跟踪链接" }, ...trackedLinks.map(l => ({ value: l._id, label: l.title }))]} />
          )}
          {form.eventTrigger === 'contact_date' && (
            <div className="grid grid-cols-3 gap-3">
              <Select label={"日期字段"} value={form.eventValue || 'birthday'} onChange={e => setForm({ ...form, eventValue: e.target.value })}
                options={[{ value: 'birthday', label: "生日" }, { value: 'anniversary', label: "周年纪念日" }]} />
              <Input label={"天前"} type="number" value={String(form.dateOffsetDays)} onChange={e => setForm({ ...form, dateOffsetDays: Number(e.target.value) })} />
              <Input label={"发送至 (IST)"} type="time" value={form.scheduleTime} onChange={e => setForm({ ...form, scheduleTime: e.target.value })} />
            </div>
          )}
          {form.eventTrigger === 'scheduled' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select label={"重复"} value={form.scheduleMode} onChange={e => setForm({ ...form, scheduleMode: e.target.value })}
                  options={[{ value: 'once', label: "一次（约会时）" }, { value: 'daily', label: "每天" }, { value: 'weekly', label: "每周" }, { value: 'monthly', label: "每个月" }]} />
                <Input label={"时间（IST）"} type="time" value={form.scheduleTime} onChange={e => setForm({ ...form, scheduleTime: e.target.value })} />
              </div>
              {form.scheduleMode === 'once' && (
                <Input label={"日期"} type="date" value={form.scheduleAt} onChange={e => setForm({ ...form, scheduleAt: e.target.value })} />
              )}
              {form.scheduleMode === 'weekly' && (
                <Select label={"星期几"} value={String(form.scheduleWeekday)} onChange={e => setForm({ ...form, scheduleWeekday: Number(e.target.value) })}
                  options={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => ({ value: String(i), label: d }))} />
              )}
              {form.scheduleMode === 'monthly' && (
                <Input label={"一个月中的某一天 (1-28)"} type="number" value={String(form.scheduleDay)} onChange={e => setForm({ ...form, scheduleDay: Number(e.target.value) })} />
              )}
              <Select label={"发送至"} value={form.audienceTag} onChange={e => setForm({ ...form, audienceTag: e.target.value })}
                options={[{ value: '', label: "所有活跃联系人" }, ...tags.map(t => ({ value: t.name, label: `仅标记为“的联系人”${t.name}"` }))]} />
              <p className="text-xs text-amber-600">计划的和基于日期的流程只能通过批准的模板卡在 24 小时窗口之外到达客户。</p>
            </div>
          )}
          {form.eventTrigger === 'google_sheet' && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
              <p className="text-xs font-medium text-green-700">Google 表格设置 {editId ? '' : "（先保存流程，然后再次打开）"}</p>
              {editId ? (
                <>
                  <ol className="text-xs text-gray-600 list-decimal pl-4 space-y-0.5">
                    <li>表 ki 第一行标题 rakho — ek 列 <strong>电话</strong> zaroor（baaki jaise 学生姓名、费用金额、截止日期、状态）。</li>
                    <li>给我表 <strong>扩展 → Apps 脚本</strong> kholo，sab hata kar neeche ka 代码粘贴 karo，保存。</li>
                    <li>Upar功能我 <strong>设置</strong> chun kar ▶ 运行 karo — 允许 karo (ek baar)。</li>
                    <li>Bas — ab har nayi row par ye flow us Phone par start hoga。模板卡我 {'{{1}}'}..{'{{4}}'} = {"{学生姓名}"} {'{fee_amount}'} {'{due_date}'} {"{状态}"} （列名小写，空格→_）。</li>
                  </ol>
                  <div className="flex items-center gap-2">
                    <textarea readOnly rows={6} value={appsScript(triggerUrlFor(editId))} className="flex-1 px-3 py-2 border rounded-lg text-[11px] bg-white text-gray-700 font-mono" />
                    <button type="button" onClick={() => { navigator.clipboard.writeText(appsScript(triggerUrlFor(editId))); toast.success(translateApiMessage("脚本已复制！")); }}
                      className="px-3 py-2 rounded-lg bg-green-100 text-green-700 hover:bg-green-200"><Copy className="w-4 h-4" /></button>
                  </div>
                  {keyNote(editId)}
                </>
              ) : (
                <p className="text-xs text-gray-600">保存流程，再次打开它，准备好的 Apps 脚本（带有您的 webhook URL）将出现在此处。</p>
              )}
            </div>
          )}
          {form.eventTrigger === 'webhook' && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-700 mb-1">Webhook URL {editId ? '' : "（保存流程后可用）"}</p>
              {editId ? (
                <>
                  <div className="flex items-center gap-2">
                    <input readOnly value={triggerUrlFor(editId)} className="flex-1 px-3 py-2 border rounded-lg text-xs bg-white text-gray-700 font-mono" />
                    <button type="button" onClick={() => { navigator.clipboard.writeText(triggerUrlFor(editId)); toast.success(translateApiMessage("已复制！")); }}
                      className="px-3 py-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200"><Copy className="w-4 h-4" /></button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 font-mono break-all">帖子正文： {'{ "phone": "919876543210", "data": { "name": "Ramesh" } }'}</p>
                  {keyNote(editId)}
                </>
              ) : (
                <p className="text-xs text-gray-600">保存流程，再次打开它，从 Zapier / Make / 您自己的应用程序调用的 URL 将出现在此处。</p>
              )}
            </div>
          )}
          <p className="text-xs text-gray-500">When a customer sends a matching message, the flow starts automatically (skipped when Chat AI is ON for that conversation). An event trigger also starts it automatically — e.g. after a call is logged as &quot;Did Not Pick&quot;. Choose <strong>所有消息（无需关键字）</strong> 开始接收任何传入消息， <strong>已创建新线索</strong> 对于每个新联系人，或 <strong>外部 webhook</strong> 从另一个应用程序启动它。</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
            <Button onClick={handleSave}>{editId ? "保存" : "创建并打开生成器"}</Button>
          </div>
        </div>
      </Modal>

      <BotFlowReport isOpen={showReport} onClose={() => setShowReport(false)}
        flows={flows.map((f) => ({ _id: f._id, name: f.name }))} />

      <FlowMarketplace isOpen={showPreset} onClose={() => setShowPreset(false)}
        onInstalled={(id) => router.push(`/client/bot-flows/${id}`)} />

      <Modal isOpen={showAiModal} onClose={() => !generating && setShowAiModal(false)} title={"使用 AI 生成机器人流程"} size="lg">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">描述您的业务以及流程应执行的操作 - AI（使用 AI 设置中的 API 密钥）将构建包含菜单、按钮和消息的完整流程。之后您可以编辑构建器中的所有内容。</p>
          <Input label={"流名称（可选）"} value={aiForm.name} onChange={e => setAiForm({ ...aiForm, name: e.target.value })} placeholder={"例如客户支持流程"} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">您的公司详细信息 <span className="text-red-500">*</span></label>
            <textarea
              value={aiForm.business}
              onChange={e => setAiForm({ ...aiForm, business: e.target.value })}
              rows={5}
              placeholder={`例如您的业务 - 您销售什么或提供哪些服务、您的工作时间和城市。网站： ${siteHost}。添加客户通常询问的任何内容...`}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">流程应该做什么？ <span className="text-red-500">*</span></label>
            <textarea
              value={aiForm.goal}
              onChange={e => setAiForm({ ...aiForm, goal: e.target.value })}
              rows={3}
              placeholder={"例如迎接顾客，展示菜单（定价/演示/与人交谈），回答问题并收集他们的姓名和电子邮件"}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowAiModal(false)} disabled={generating}>取消</Button>
            <Button onClick={handleGenerate} disabled={generating} icon={<Sparkles className="w-4 h-4" />}>{generating ? "正在生成..." : "生成流"}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!statsFlow} onClose={() => setStatsFlow(null)} title={`流量分析 — ${statsFlow?.name || ''}`} size="lg">
        {statsFlow && (() => {
          const hits = statsFlow.nodeHits || {};
          const runs = statsFlow.runs || 0;
          const nodes = statsFlow.nodes || [];
          return (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">此流程开始 <b>{runs}</b> {runs === 1 ? "时间" : "次"}。下面的条形图显示了有多少客户到达了每个步骤——步骤之间的大幅下降意味着客户正在放弃那里的流程。</p>
              {nodes.length === 0 ? (
                <p className="text-sm text-gray-400">该流程还没有步骤。</p>
              ) : (
                <div className="space-y-2">
                  {nodes.map((n, i) => {
                    const count = hits[n.id] || 0;
                    const pct = runs > 0 ? Math.round((count / runs) * 100) : 0;
                    const prevCount = i === 0 ? runs : (hits[nodes[i - 1].id] || 0);
                    const dropOff = prevCount > 0 ? Math.max(0, Math.round(((prevCount - count) / prevCount) * 100)) : 0;
                    return (
                      <div key={n.id} className="border border-gray-100 rounded-lg p-3">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-gray-800">步骤 {i + 1}: {n.name || n.text?.slice(0, 40) || n.type || n.id}</span>
                          <span className="text-gray-500">{count} 达到({pct}%)</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        {i > 0 && dropOff > 0 && <p className="text-xs text-red-500 mt-1">{dropOff}% 在此步骤之前下降</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
