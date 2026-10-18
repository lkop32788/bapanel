'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Play, Pause, Trash2, Clock, CheckCircle, AlertCircle, Layers, X, Edit, Users, Ban, MessageSquare, Hourglass, Zap, ArrowRight, ArrowLeft, GitBranch, Workflow, Rocket, Tag as TagIcon, Filter, Trash } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { sequenceApi, presetMessageApi, segmentApi, tagApi, templateApi, teamApi, dataFieldApi } from '@/lib/api';
import type { Segment, Tag } from '@/types';
import toast from 'react-hot-toast';

interface Preset { _id: string; name: string; }
interface Agent { _id: string; name?: string; email?: string; }
interface DataField { _id: string; name: string; label: string; isActive?: boolean; }
type StepKind = 'send' | 'wait' | 'action';
type ActionType = '' | 'assign_agent' | 'add_label' | 'end';
interface SequenceStep {
  kind: StepKind;
  presetMessage: string;
  template: string;
  delayDays: number;
  delayHours: number;
  delayMinutes: number;
  checkReplied: boolean;
  actionType: ActionType;
  actionAgent: string;
  actionLabel: string;
}
interface EntryCondition { field: string; operator: 'equals' | 'contains' | 'not_equals'; value: string; }
interface EntryConfig { labelsEnabled?: boolean; labels?: string[]; conditions?: EntryCondition[]; }
interface EnrollmentCounts { active: number; completed: number; stopped_reply: number; stopped: number; }
interface Sequence {
  _id: string;
  name: string;
  status: string;
  createdAt: string;
  dripSteps?: Partial<SequenceStep>[];
  sequence?: { stopOnReply?: boolean; autoEnroll?: boolean; builderMode?: string; entry?: EntryConfig };
  stats?: { totalRecipients?: number; sent?: number; failed?: number; skipped?: number };
  enrollments?: EnrollmentCounts;
  targetType?: string;
  targetSegments?: string[];
  targetTags?: string[];
}
interface Enrollment {
  _id: string;
  step: number;
  status: string;
  nextRunAt: string;
  contact?: { _id: string; name?: string; phone?: string };
}

const emptyStep = (kind: StepKind = 'send'): SequenceStep => ({
  kind,
  presetMessage: '',
  template: '',
  delayDays: kind === 'wait' ? 1 : 0,
  delayHours: 0,
  delayMinutes: 0,
  checkReplied: false,
  actionType: kind === 'action' ? 'assign_agent' : '',
  actionAgent: '',
  actionLabel: '',
});

const STANDARD_FIELDS = [
  { value: 'name', label: "名称" },
  { value: 'email', label: "邮箱" },
  { value: 'phone', label: "WhatsApp 号码" },
];

const WIZARD_STEPS = ['Name & mode', 'Entry', 'Steps', 'Exit & launch'];

export default function SequenceCampaignsPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [waTemplates, setWaTemplates] = useState<{ _id: string; name: string }[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [fields, setFields] = useState<DataField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [wizard, setWizard] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    builderMode: 'simple',
    labelsEnabled: false,
    entryLabels: [] as string[],
    conditions: [] as EntryCondition[],
    audienceType: 'all',
    segments: [] as string[],
    tags: [] as string[],
    stopOnReply: true,
    autoEnroll: false,
  });
  const [steps, setSteps] = useState<SequenceStep[]>([emptyStep('send')]);
  const [submitting, setSubmitting] = useState(false);
  const [enrollTarget, setEnrollTarget] = useState<Sequence | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [seqRes, presetRes, segRes, tagRes, tplRes, agentRes, fieldRes] = await Promise.allSettled([
      sequenceApi.list({ limit: 100 }),
      presetMessageApi.list(),
      segmentApi.list(),
      tagApi.list(),
      templateApi.list({ limit: 500 }),
      teamApi.listAgents(),
      dataFieldApi.list(),
    ]);
    if (seqRes.status === 'fulfilled') setSequences(seqRes.value.data.data || []);
    if (presetRes.status === 'fulfilled') setPresets(presetRes.value.data.data || []);
    if (segRes.status === 'fulfilled') setSegments(segRes.value.data.data || []);
    if (tagRes.status === 'fulfilled') setTags(tagRes.value.data.data || []);
    if (tplRes.status === 'fulfilled') {
      setWaTemplates(((tplRes.value.data.data || []) as { _id: string; name: string; status?: string }[])
        .filter(t => (t.status || '').toLowerCase() === 'approved'));
    }
    if (agentRes.status === 'fulfilled') setAgents(agentRes.value.data.data || []);
    if (fieldRes.status === 'fulfilled') {
      setFields(((fieldRes.value.data.data || []) as DataField[]).filter(f => f.isActive !== false));
    }
    setLoading(false);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setForm({
      name: '', builderMode: 'simple', labelsEnabled: false, entryLabels: [], conditions: [],
      audienceType: 'all', segments: [], tags: [], stopOnReply: true, autoEnroll: false,
    });
    setSteps([emptyStep('send')]);
    setEditId(null);
    setWizard(0);
  };

  const buildPayload = () => ({
    name: form.name,
    dripSteps: steps.map((s, i) => ({
      order: i,
      kind: s.kind,
      presetMessage: s.kind === 'send' && s.presetMessage ? s.presetMessage : undefined,
      template: s.kind === 'send' && s.template ? s.template : undefined,
      delayDays: s.kind === 'wait' ? s.delayDays || 0 : 0,
      delayHours: s.kind === 'wait' ? s.delayHours || 0 : 0,
      delayMinutes: s.kind === 'wait' ? s.delayMinutes || 0 : 0,
      checkReplied: s.kind === 'wait' ? s.checkReplied : false,
      actionType: s.kind === 'action' ? s.actionType : '',
      actionAgent: s.kind === 'action' && s.actionType === 'assign_agent' && s.actionAgent ? s.actionAgent : undefined,
      actionLabel: s.kind === 'action' && s.actionType === 'add_label' && s.actionLabel ? s.actionLabel : undefined,
    })),
    audience: { type: form.audienceType, segments: form.segments, tags: form.tags },
    sequence: {
      stopOnReply: form.stopOnReply,
      autoEnroll: form.autoEnroll,
      builderMode: form.builderMode,
      entry: {
        labelsEnabled: form.labelsEnabled,
        labels: form.entryLabels,
        conditions: form.conditions.filter(c => c.field && c.value),
      },
    },
  });

  const validate = () => {
    if (!form.name.trim()) { toast.error(translateApiMessage("需要序列名称")); setWizard(0); return false; }
    if (!steps.length) { toast.error(translateApiMessage("至少添加一个步骤")); setWizard(2); return false; }
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.kind === 'send' && !s.presetMessage && !s.template) {
        toast.error(translateApiMessage(`步骤 ${i + 1}：选择消息或模板`)); setWizard(2); return false;
      }
      if (s.kind === 'action' && s.actionType === 'assign_agent' && !s.actionAgent) {
        toast.error(translateApiMessage(`步骤 ${i + 1}：选择团队成员`)); setWizard(2); return false;
      }
      if (s.kind === 'action' && s.actionType === 'add_label' && !s.actionLabel) {
        toast.error(translateApiMessage(`步骤 ${i + 1}：选择标签`)); setWizard(2); return false;
      }
    }
    return true;
  };

  const handleSave = async (launch = false) => {
    if (submitting || !validate()) return;
    setSubmitting(true);
    try {
      const payload = buildPayload();
      const res = editId ? await sequenceApi.update(editId, payload) : await sequenceApi.create(payload);
      const id = editId || res.data?.data?._id;
      if (launch && id) {
        const started = await sequenceApi.start(id);
        toast.success(translateApiMessage(started.data.message || "序列启动"));
      } else {
        toast.success(translateApiMessage(editId ? "序列已更新" : "序列已保存 — 按“开始”以注册联系人"));
      }
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    }
    setSubmitting(false);
  };

  const handleEdit = (s: Sequence) => {
    setEditId(s._id);
    setForm({
      name: s.name,
      builderMode: s.sequence?.builderMode || 'simple',
      labelsEnabled: s.sequence?.entry?.labelsEnabled === true,
      entryLabels: (s.sequence?.entry?.labels || []).map(String),
      conditions: (s.sequence?.entry?.conditions || []).map(c => ({
        field: c.field, operator: c.operator || 'equals', value: c.value || '',
      })),
      audienceType: s.targetType || 'all',
      segments: (s.targetSegments || []).map(String),
      tags: (s.targetTags || []).map(String),
      stopOnReply: s.sequence?.stopOnReply !== false,
      autoEnroll: s.sequence?.autoEnroll === true,
    });
    setSteps((s.dripSteps && s.dripSteps.length ? s.dripSteps : [emptyStep('send')]).map(st => ({
      kind: (st.kind as StepKind) || 'send',
      presetMessage: String(st.presetMessage || ''),
      template: String(st.template || ''),
      delayDays: st.delayDays || 0,
      delayHours: st.delayHours || 0,
      delayMinutes: st.delayMinutes || 0,
      checkReplied: st.checkReplied === true,
      actionType: (st.actionType as ActionType) || '',
      actionAgent: String(st.actionAgent || ''),
      actionLabel: String(st.actionLabel || ''),
    })));
    setWizard(0);
    setShowModal(true);
  };

  const handleAction = async (id: string, action: 'start' | 'pause' | 'delete' | 'stop') => {
    try {
      if (action === 'delete') {
        if (!confirm("删除该序列？已注册的联系人将停止获取剩余步骤。")) return;
        await sequenceApi.delete(id);
        toast.success(translateApiMessage("已删除"));
      } else if (action === 'start') {
        const res = await sequenceApi.start(id);
        toast.success(translateApiMessage(res.data.message || "开始"));
      } else if (action === 'stop') {
        if (!confirm("停止仍按此顺序的所有联系人？他们将无法获得剩余的步骤。")) return;
        const res = await sequenceApi.stop(id);
        toast.success(translateApiMessage(res.data.message || "已停止"));
      } else {
        await sequenceApi.pause(id);
        toast.success(translateApiMessage("已暂停"));
      }
      fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    }
  };

  const openEnrollments = async (s: Sequence) => {
    setEnrollTarget(s);
    setEnrollments([]);
    try {
      const res = await sequenceApi.enrollments(s._id, { limit: 50 });
      setEnrollments(res.data.data || []);
    } catch {
      toast.error(translateApiMessage("无法加载联系人"));
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'default'; icon: React.ReactNode }> = {
      draft: { variant: 'default', icon: <Clock className="w-3 h-3" /> },
      running: { variant: 'success', icon: <Play className="w-3 h-3" /> },
      paused: { variant: 'warning', icon: <Pause className="w-3 h-3" /> },
      completed: { variant: 'success', icon: <CheckCircle className="w-3 h-3" /> },
      failed: { variant: 'danger', icon: <AlertCircle className="w-3 h-3" /> },
    };
    const s = map[status] || map.draft;
    return <Badge variant={s.variant}>{s.icon} {status}</Badge>;
  };

  const enrollLabel = (status: string) => ({
    active: "按顺序",
    completed: 'finished',
    stopped_reply: "已停止（已回复）",
    stopped: 'stopped',
  } as Record<string, string>)[status] || status;

  const columns = [
    { key: 'name', title: "序列", render: (s: Sequence) => <span className="font-medium text-gray-900">{s.name}</span> },
    { key: 'status', title: "状态", render: (s: Sequence) => statusBadge(s.status) },
    { key: 'steps', title: "步骤", render: (s: Sequence) => <span className="text-sm text-gray-600">{s.dripSteps?.length || 0}</span> },
    { key: 'in', title: "按顺序", render: (s: Sequence) => <span className="text-sm text-gray-600">{s.enrollments?.active || 0}</span> },
    { key: 'done', title: "完成", render: (s: Sequence) => <span className="text-sm text-gray-600">{s.enrollments?.completed || 0}</span> },
    { key: 'replied', title: "回复时停止", render: (s: Sequence) => <span className="text-sm text-gray-600">{s.enrollments?.stopped_reply || 0}</span> },
    { key: 'sent', title: "已发送", render: (s: Sequence) => s.stats?.sent || 0 },
    { key: 'skipped', title: "已跳过", render: (s: Sequence) => s.stats?.skipped || 0 },
    { key: 'failed', title: "操作失败", render: (s: Sequence) => s.stats?.failed || 0 },
    { key: 'actions', title: '', render: (s: Sequence) => (
      <div className="flex gap-1">
        {(s.status === 'draft' || s.status === 'paused' || s.status === 'completed') && (
          <button title={"开始"} onClick={() => handleAction(s._id, 'start')} className="p-1 hover:bg-emerald-50 rounded"><Play className="w-4 h-4 text-emerald-500" /></button>
        )}
        {s.status === 'running' && (
          <button title={"暂停"} onClick={() => handleAction(s._id, 'pause')} className="p-1 hover:bg-yellow-50 rounded"><Pause className="w-4 h-4 text-yellow-500" /></button>
        )}
        {s.status !== 'running' && (
          <button title={"编辑"} onClick={() => handleEdit(s)} className="p-1 hover:bg-blue-50 rounded"><Edit className="w-4 h-4 text-blue-400" /></button>
        )}
        <button title={"联系人"} onClick={() => openEnrollments(s)} className="p-1 hover:bg-indigo-50 rounded"><Users className="w-4 h-4 text-indigo-500" /></button>
        <button title={"阻止所有人"} onClick={() => handleAction(s._id, 'stop')} className="p-1 hover:bg-orange-50 rounded"><Ban className="w-4 h-4 text-orange-400" /></button>
        <button title={"删除"} onClick={() => handleAction(s._id, 'delete')} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  const updateStep = (i: number, patch: Partial<SequenceStep>) =>
    setSteps(steps.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addStep = (kind: StepKind) => setSteps([...steps, emptyStep(kind)]);
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i));

  const toggleId = (list: string[], id: string) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  const fieldOptions = [
    ...STANDARD_FIELDS,
    ...fields.map(f => ({ value: f.name, label: f.label || f.name })),
  ];

  const entrySummary = () => {
    const parts: string[] = [];
    if (form.labelsEnabled && form.entryLabels.length) {
      parts.push(`any of ${form.entryLabels.length} label(s)`);
    }
    const conds = form.conditions.filter(c => c.field && c.value);
    if (conds.length) parts.push(`${conds.length} field condition(s)`);
    if (!parts.length) return form.audienceType === 'all' ? 'All contacts' : `Audience: ${form.audienceType}`;
    return parts.join(' AND ');
  };

  const stepCard = (st: SequenceStep, i: number) => {
    const head = st.kind === 'send'
      ? { icon: <MessageSquare className="w-4 h-4" />, title: "发送消息", tone: 'bg-emerald-50 border-emerald-200 text-emerald-700' }
      : st.kind === 'wait'
        ? { icon: <Hourglass className="w-4 h-4" />, title: "等待", tone: 'bg-amber-50 border-amber-200 text-amber-700' }
        : { icon: <Zap className="w-4 h-4" />, title: "行动", tone: 'bg-indigo-50 border-indigo-200 text-indigo-700' };
    return (
      <div key={i} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-500">#{i + 1}</span>
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2 py-0.5 ${head.tone}`}>{head.icon} {head.title}</span>
          <div className="flex-1" />
          <button title={"删除步骤"} onClick={() => removeStep(i)} className="p-1 hover:bg-red-50 rounded"><X className="w-4 h-4 text-red-400" /></button>
        </div>

        {st.kind === 'send' && (
          <div className="space-y-2">
            <select value={st.presetMessage} onChange={(e) => updateStep(i, { presetMessage: e.target.value })}
              className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="">选择消息（免费，24 小时内）</option>
              {presets.map(p => <option key={p._id} value={p._id}>{translateDisplay(p.name)}</option>)}
            </select>
            <select value={st.template} onChange={(e) => updateStep(i, { template: e.target.value })}
              className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="">批准的模板（24 小时窗口关闭时使用）</option>
              {waTemplates.map(t => <option key={t._id} value={t._id}>{translateDisplay(t.name)}</option>)}
            </select>
          </div>
        )}

        {st.kind === 'wait' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <input type="number" min={0} value={st.delayDays} onChange={(e) => updateStep(i, { delayDays: parseInt(e.target.value) || 0 })}
                className="w-16 text-sm px-2 py-1 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              <span className="text-xs text-gray-500">天</span>
              <input type="number" min={0} max={23} value={st.delayHours} onChange={(e) => updateStep(i, { delayHours: parseInt(e.target.value) || 0 })}
                className="w-16 text-sm px-2 py-1 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              <span className="text-xs text-gray-500">hrs</span>
              <input type="number" min={0} max={59} value={st.delayMinutes} onChange={(e) => updateStep(i, { delayMinutes: parseInt(e.target.value) || 0 })}
                className="w-16 text-sm px-2 py-1 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              <span className="text-xs text-gray-500">min</span>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={st.checkReplied} onChange={(e) => updateStep(i, { checkReplied: e.target.checked })} />
              等待后，检查联系人是否回复 - 如果是，请在此处留下顺序
            </label>
          </div>
        )}

        {st.kind === 'action' && (
          <div className="space-y-2">
            <select value={st.actionType} onChange={(e) => updateStep(i, { actionType: e.target.value as ActionType })}
              className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="assign_agent">分配给团队成员</option>
              <option value="add_label">添加标签</option>
              <option value="end">结束序列</option>
            </select>
            {st.actionType === 'assign_agent' && (
              <select value={st.actionAgent} onChange={(e) => updateStep(i, { actionAgent: e.target.value })}
                className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
                <option value="">选择团队成员</option>
                {agents.map(a => <option key={a._id} value={a._id}>{translateDisplay(a.name || a.email)}</option>)}
              </select>
            )}
            {st.actionType === 'add_label' && (
              <select value={st.actionLabel} onChange={(e) => updateStep(i, { actionLabel: e.target.value })}
                className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
                <option value="">选择标签</option>
                {tags.map(t => <option key={t._id} value={t._id}>{translateDisplay(t.name)}</option>)}
              </select>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Layers className="w-6 h-6 text-indigo-600" /> 序列活动</h1>
          <p className="text-gray-500 text-sm mt-1">后续系列，每个联系人从加入之日起就按照自己的时间线运行，并在回复后立即退出。</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { resetForm(); setShowModal(true); }}>创建序列</Button>
      </div>

      <div className="flex items-center gap-2 p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-800">
        <Clock className="w-4 h-4" />
        用三张卡片构建——发送消息、等待、操作（分配、标签、结束）。选择退出的联系人永远不会收到消息，并且免费消息仅在 24 小时窗口内发送（添加批准的模板作为后备）。
      </div>

      <Table columns={columns} data={sequences} loading={loading} emptyText={"尚无序列活动"} />

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editId ? "编辑序列" : "创建序列"} size="lg">
        <div className="space-y-5">
          <div className="flex items-center gap-2 overflow-x-auto">
            {WIZARD_STEPS.map((label, idx) => (
              <button key={label} onClick={() => setWizard(idx)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${idx === wizard ? 'bg-indigo-600 border-indigo-600 text-white' : idx < wizard ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-500'}`}>
                <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center ${idx === wizard ? 'bg-white text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>{idx + 1}</span>
                {label}
              </button>
            ))}
          </div>

          {wizard === 0 && (
            <div className="space-y-4">
              <Input label={"序列名称"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={"例如新线索跟进"} required />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">建造者模式</label>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button onClick={() => setForm({ ...form, builderMode: 'simple' })}
                    className={`text-left p-3 rounded-xl border ${form.builderMode === 'simple' ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
                    <span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Layers className="w-4 h-4 text-indigo-600" /> 简单的构建器</span>
                    <span className="block text-xs text-gray-500 mt-1">直线台阶 — 推荐</span>
                  </button>
                  <div className="text-left p-3 rounded-xl border border-gray-200 bg-gray-50 opacity-70">
                    <span className="flex items-center gap-2 text-sm font-semibold text-gray-600"><GitBranch className="w-4 h-4" /> 分支建设者</span>
                    <span className="block text-xs text-gray-500 mt-1">是/否分支 — <span className="font-medium">即将推出</span></span>
                  </div>
                  <div className="text-left p-3 rounded-xl border border-gray-200 bg-gray-50 opacity-70">
                    <span className="flex items-center gap-2 text-sm font-semibold text-gray-600"><Workflow className="w-4 h-4" /> 高级画布</span>
                    <span className="block text-xs text-gray-500 mt-1">拖放画布 — <span className="font-medium">即将推出</span></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {wizard === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">谁进入这个序列。标签使用 <span className="font-medium">OR</span> （任何标签），现场条件使用 <span className="font-medium">AND</span> （全部必须匹配）。</p>

              <div className="p-3 rounded-xl border border-gray-200 space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <input type="checkbox" checked={form.labelsEnabled} onChange={(e) => setForm({ ...form, labelsEnabled: e.target.checked })} />
                  <TagIcon className="w-4 h-4 text-indigo-600" /> 分配标签时输入
                </label>
                {form.labelsEnabled && (
                  <div className="flex flex-wrap gap-2">
                    {tags.map(t => (
                      <button key={t._id} onClick={() => setForm({ ...form, entryLabels: toggleId(form.entryLabels, t._id) })}
                        className={`px-3 py-1 text-xs rounded-full border ${form.entryLabels.includes(t._id) ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200'}`}>
                        {t.name}
                      </button>
                    ))}
                    {!tags.length && <span className="text-xs text-amber-600">尚未创建标签。</span>}
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl border border-gray-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-800"><Filter className="w-4 h-4 text-indigo-600" /> 自定义字段条件（AND）</span>
                  <button onClick={() => setForm({ ...form, conditions: [...form.conditions, { field: 'email', operator: 'equals', value: '' }] })}
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium"><Plus className="w-3 h-3" /> 添加条件</button>
                </div>
                {form.conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 flex-wrap">
                    <select value={c.field} onChange={(e) => setForm({ ...form, conditions: form.conditions.map((x, idx) => idx === i ? { ...x, field: e.target.value } : x) })}
                      className="text-sm px-2 py-1.5 rounded-lg border border-gray-200 bg-white">
                      {fieldOptions.map(f => <option key={f.value} value={f.value}>{translateDisplay(f.label)}</option>)}
                    </select>
                    <select value={c.operator} onChange={(e) => setForm({ ...form, conditions: form.conditions.map((x, idx) => idx === i ? { ...x, operator: e.target.value as EntryCondition['operator'] } : x) })}
                      className="text-sm px-2 py-1.5 rounded-lg border border-gray-200 bg-white">
                      <option value="equals">等于</option>
                      <option value="contains">包含</option>
                      <option value="not_equals">不等于</option>
                    </select>
                    <input value={c.value} placeholder={"值"}
                      onChange={(e) => setForm({ ...form, conditions: form.conditions.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x) })}
                      className="flex-1 min-w-[120px] text-sm px-2 py-1.5 rounded-lg border border-gray-200" />
                    <button onClick={() => setForm({ ...form, conditions: form.conditions.filter((_, idx) => idx !== i) })} className="p-1 hover:bg-red-50 rounded"><Trash className="w-4 h-4 text-red-400" /></button>
                  </div>
                ))}
                {!form.conditions.length && <p className="text-xs text-gray-400">无条件-以下观众的每个联系人都可以进入。</p>}
              </div>

              <div className="p-3 rounded-xl border border-gray-200 space-y-2">
                <Select label={"后备受众（未设置入场信号时使用）"} value={form.audienceType}
                  onChange={(e) => setForm({ ...form, audienceType: e.target.value })}
                  options={[{ value: 'all', label: "所有联系人" }, { value: 'segment', label: "按细分市场" }, { value: 'tag', label: "按标签" }, { value: 'combo', label: "过滤器 — 标签 + 细分（dono match ho tabhi）" }]} />
                {(form.audienceType === 'segment' || form.audienceType === 'combo') && (
                  <div className="flex flex-wrap gap-2">
                    {segments.map(s => (
                      <button key={s._id} onClick={() => setForm({ ...form, segments: toggleId(form.segments, s._id) })}
                        className={`px-3 py-1 text-xs rounded-full border ${form.segments.includes(s._id) ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200'}`}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
                {(form.audienceType === 'tag' || form.audienceType === 'combo') && (
                  <div className="flex flex-wrap gap-2">
                    {tags.map(t => (
                      <button key={t._id} onClick={() => setForm({ ...form, tags: toggleId(form.tags, t._id) })}
                        className={`px-3 py-1 text-xs rounded-full border ${form.tags.includes(t._id) ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200'}`}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {wizard === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">步骤({steps.length})</span>
                <div className="flex gap-2">
                  <button onClick={() => addStep('send')} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1"><MessageSquare className="w-3 h-3" /> 发送</button>
                  <button onClick={() => addStep('wait')} className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1"><Hourglass className="w-3 h-3" /> 等待</button>
                  <button onClick={() => addStep('action')} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-1"><Zap className="w-3 h-3" /> 行动</button>
                </div>
              </div>
              <div className="max-h-[45vh] overflow-y-auto space-y-2 pr-1">
                {steps.map((st, i) => stepCard(st, i))}
                {!steps.length && <p className="text-sm text-gray-400">尚无步骤 — 添加发送、等待或操作卡。</p>}
              </div>
              {presets.length === 0 && <p className="text-xs text-amber-600">首先在预设模板页面上创建消息。</p>}
            </div>
          )}

          {wizard === 3 && (
            <div className="space-y-4">
              <div className="space-y-2 p-3 bg-gray-50 rounded-xl">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.stopOnReply} onChange={(e) => setForm({ ...form, stopOnReply: e.target.checked })} />
                  联系人回复后立即退出序列
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.autoEnroll} onChange={(e) => setForm({ ...form, autoEnroll: e.target.checked })} />
                  继续注册符合录入规则的新联系人
                </label>
              </div>
              <div className="p-3 rounded-xl border border-gray-200 text-sm text-gray-600 space-y-1">
                <p><span className="font-medium text-gray-900">{form.name || "无标题序列"}</span> ·简单的构建器</p>
                <p>条目： {entrySummary()}</p>
                <p>步骤： {steps.filter(s => s.kind === 'send').length} 发送· {steps.filter(s => s.kind === 'wait').length} 等待· {steps.filter(s => s.kind === 'action').length} 行动</p>
                <p>回复后退出： {form.stopOnReply ? 'yes' : 'no'} ·自动注册： {form.autoEnroll ? 'yes' : 'no'}</p>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <Button variant="secondary" icon={<ArrowLeft className="w-4 h-4" />} disabled={wizard === 0} onClick={() => setWizard(Math.max(0, wizard - 1))}>返回</Button>
            <div className="flex gap-2">
              {wizard < 3 && <Button icon={<ArrowRight className="w-4 h-4" />} onClick={() => setWizard(Math.min(3, wizard + 1))}>下一步</Button>}
              {wizard === 3 && (
                <>
                  <Button variant="secondary" loading={submitting} onClick={() => handleSave(false)}>{editId ? "保存更改" : "另存为草稿"}</Button>
                  <Button icon={<Rocket className="w-4 h-4" />} loading={submitting} onClick={() => handleSave(true)}>启动顺序</Button>
                </>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!enrollTarget} onClose={() => setEnrollTarget(null)} title={`联系人 — ${enrollTarget?.name || ''}`} size="lg">
        <div className="max-h-[60vh] overflow-y-auto">
          {!enrollments.length && <p className="text-sm text-gray-500">尚未登记任何联系人。</p>}
          {!!enrollments.length && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2">联系方式</th><th>下一步</th><th>状态</th><th>下一步发送</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map(e => (
                  <tr key={e._id} className="border-t border-gray-100">
                    <td className="py-2">{e.contact?.name || e.contact?.phone || '—'}</td>
                    <td>{e.step + 1}</td>
                    <td>{enrollLabel(e.status)}</td>
                    <td>{e.status === 'active' ? new Date(e.nextRunAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>
    </div>
  );
}
