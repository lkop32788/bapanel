'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Zap, Trash2, Edit, Play, Pause, Save, ArrowLeft, Clock, MessageSquare, GitBranch, Tag, Users, Send } from 'lucide-react';
import { automationApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface AutoStep {
  id: string;
  type: string;
  data: Record<string, string>;
}

interface Automation {
  _id: string;
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: { keywords?: string[]; matchType?: string; event?: string; schedule?: string };
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, string> }>;
  edges: Array<{ id: string; source: string; target: string }>;
  status: string;
  stats: { triggered: number; completed: number; failed: number };
  createdAt: string;
}

const stepTypes = [
  { type: 'message', label: "发送消息", icon: MessageSquare, color: 'blue', desc: "发送短信" },
  { type: 'delay', label: "等待/延迟", icon: Clock, color: 'yellow', desc: "下一步之前请等待" },
  { type: 'condition', label: "状况", icon: GitBranch, color: 'purple', desc: "根据条件进行分支" },
  { type: 'tag', label: "添加标签", icon: Tag, color: 'emerald', desc: "为联系人添加标签" },
  { type: 'assign', label: "指定代理", icon: Users, color: 'orange', desc: "分配给团队成员" },
  { type: 'template', label: "发送模板", icon: Send, color: 'teal', desc: "发送 WhatsApp 模板" },
];

const genId = () => `step_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editAuto, setEditAuto] = useState<Automation | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', triggerType: 'keyword',
    keywords: '', matchType: 'contains', event: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [steps, setSteps] = useState<AutoStep[]>([]);

  const fetchAutomations = async () => {
    try { const res = await automationApi.list(); setAutomations(res.data.data || []); } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchAutomations(); }, []);

  const openBuilder = (auto?: Automation) => {
    if (auto) {
      setEditAuto(auto);
      setForm({
        name: auto.name, description: auto.description || '',
        triggerType: auto.triggerType || 'keyword',
        keywords: (auto.triggerConfig?.keywords || []).join(', '),
        matchType: auto.triggerConfig?.matchType || 'contains',
        event: auto.triggerConfig?.event || '',
      });
      const autoSteps = (auto.nodes || [])
        .filter(n => n.type !== 'trigger')
        .map(n => ({ id: n.id, type: n.type, data: n.data || {} }));
      setSteps(autoSteps.length > 0 ? autoSteps : []);
    } else {
      setEditAuto(null);
      setForm({ name: '', description: '', triggerType: 'keyword', keywords: '', matchType: 'contains', event: '' });
      setSteps([]);
    }
    setShowBuilder(true);
  };

  const addStep = (type: string) => {
    const defaultData: Record<string, string> = {};
    if (type === 'message') defaultData.message = '';
    if (type === 'delay') { defaultData.delay = '5'; defaultData.unit = 'minutes'; }
    if (type === 'condition') defaultData.condition = '';
    if (type === 'tag') defaultData.tag = '';
    if (type === 'assign') defaultData.agent = '';
    if (type === 'template') defaultData.template = '';
    setSteps([...steps, { id: genId(), type, data: defaultData }]);
  };

  const updateStep = (idx: number, data: Record<string, string>) => {
    const newSteps = [...steps];
    newSteps[idx] = { ...newSteps[idx], data: { ...newSteps[idx].data, ...data } };
    setSteps(newSteps);
  };

  const removeStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (submitting) return;
    if (!form.name.trim()) { toast.error(translateApiMessage("自动化名称为必填项")); return; }
    if (form.triggerType === 'keyword' && !form.keywords.trim()) { toast.error(translateApiMessage("需要关键字")); return; }

    const triggerNode = {
      id: 'trigger_1', type: 'trigger',
      position: { x: 250, y: 50 },
      data: { label: "触发器", keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean) },
    };

    const actionNodes = steps.map((s, i) => ({
      id: s.id, type: s.type,
      position: { x: 250, y: 180 + i * 120 },
      data: s.data,
    }));

    const allNodes = [triggerNode, ...actionNodes];
    const allEdges = allNodes.slice(0, -1).map((n, i) => ({
      id: `edge_${i}`, source: n.id, target: allNodes[i + 1].id,
      type: 'smoothstep',
    }));

    const payload = {
      name: form.name, description: form.description,
      triggerType: form.triggerType,
      triggerConfig: {
        keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
        matchType: form.matchType,
        event: form.event,
      },
      nodes: allNodes, edges: allEdges,
    };

    setSubmitting(true);
    try {
      if (editAuto) {
        await automationApi.update(editAuto._id, payload);
        toast.success(translateApiMessage("自动化已更新"));
      } else {
        await automationApi.create(payload);
        toast.success(translateApiMessage("已创建自动化"));
      }
      setShowBuilder(false);
      fetchAutomations();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "保存失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    try { await automationApi.toggle(id); toast.success(translateApiMessage("状态已切换")); fetchAutomations(); }
    catch { toast.error(translateApiMessage("操作失败")); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    if (!confirm("删除此自动化操作？")) return;
    try { await automationApi.delete(id); toast.success(translateApiMessage("已删除")); fetchAutomations(); }
    catch { toast.error(translateApiMessage("操作失败")); } finally { setSubmitting(false); }
  };

  const renderStepInput = (step: AutoStep, idx: number) => {
    switch (step.type) {
      case 'message':
        return (
          <textarea value={step.data.message || ''} onChange={(e) => updateStep(idx, { message: e.target.value })}
            placeholder={"输入要发送的消息..."} rows={2}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none" />
        );
      case 'delay':
        return (
          <div className="flex gap-2">
            <input type="number" value={step.data.delay || '5'} onChange={(e) => updateStep(idx, { delay: e.target.value })}
              className="w-24 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" min="1" />
            <select value={step.data.unit || 'minutes'} onChange={(e) => updateStep(idx, { unit: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              <option value="seconds">秒</option>
              <option value="minutes">分钟</option>
              <option value="hours">小时</option>
              <option value="days">天</option>
            </select>
          </div>
        );
      case 'condition':
        return (
          <input type="text" value={step.data.condition || ''} onChange={(e) => updateStep(idx, { condition: e.target.value })}
            placeholder={"例如，contact.tag == 'VIP'"} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
        );
      case 'tag':
        return (
          <input type="text" value={step.data.tag || ''} onChange={(e) => updateStep(idx, { tag: e.target.value })}
            placeholder={"要添加的标签名称"} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
        );
      case 'assign':
        return (
          <input type="text" value={step.data.agent || ''} onChange={(e) => updateStep(idx, { agent: e.target.value })}
            placeholder={"代理姓名或电子邮件"} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
        );
      case 'template':
        return (
          <input type="text" value={step.data.template || ''} onChange={(e) => updateStep(idx, { template: e.target.value })}
            placeholder={"模板名称"} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
        );
      default:
        return null;
    }
  };

  // Builder view
  if (showBuilder) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowBuilder(false)} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
            <h1 className="text-xl font-bold text-gray-900">{editAuto ? "编辑自动化" : "创建自动化"}</h1>
          </div>
          <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium">
            <Save className="w-4 h-4" /> 保存自动化
          </button>
        </div>

        {/* Automation Settings */}
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">自动化详细信息</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder={"欢迎消息流程"} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">触发类型</label>
              <select value={form.triggerType} onChange={(e) => setForm({ ...form, triggerType: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                <option value="keyword">关键字</option>
                <option value="event">事件</option>
                <option value="contact_created">联系人已创建</option>
                <option value="message_received">已收到消息</option>
                <option value="schedule">时间表</option>
                <option value="webhook">网络钩子</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">说明</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder={"可选描述"} />
          </div>
          {form.triggerType === 'keyword' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">关键字 *（逗号分隔）</label>
                <input type="text" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder={"你好，嗨，开始，帮助"} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">匹配类型</label>
                <select value={form.matchType} onChange={(e) => setForm({ ...form, matchType: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  <option value="contains">包含</option>
                  <option value="exact">完全匹配</option>
                  <option value="starts_with">开头为</option>
                </select>
              </div>
            </div>
          )}
          {form.triggerType === 'event' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">事件名称</label>
              <input type="text" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder={"contact_created、 message_received 等。"} />
            </div>
          )}
        </div>

        {/* Trigger display */}
        <div className="flex flex-col items-center">
          <div className="bg-emerald-600 text-white rounded-xl px-6 py-3 shadow-lg w-64 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Zap className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase">触发器</span>
            </div>
            <p className="text-sm font-medium">{form.triggerType === 'keyword' ? `关键词： ${form.keywords || '(none)'}` : form.triggerType}</p>
          </div>
          {steps.length > 0 && <div className="w-0.5 h-8 bg-gray-300" />}
        </div>

        {/* Steps */}
        {steps.map((step, idx) => {
          const stepDef = stepTypes.find(s => s.type === step.type);
          const Icon = stepDef?.icon || MessageSquare;
          const colorMap: Record<string, string> = {
            blue: 'border-blue-400 bg-blue-50', yellow: 'border-yellow-400 bg-yellow-50',
            purple: 'border-purple-400 bg-purple-50', emerald: 'border-emerald-400 bg-emerald-50',
            orange: 'border-orange-400 bg-orange-50', teal: 'border-teal-400 bg-teal-50',
          };
          return (
            <div key={step.id} className="flex flex-col items-center">
              <div className={`border-2 rounded-xl p-4 w-full max-w-lg shadow-sm ${colorMap[stepDef?.color || 'blue'] || 'border-gray-300 bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-semibold">{stepDef?.label || step.type}</span>
                    <span className="text-xs text-gray-500">步骤 {idx + 1}</span>
                  </div>
                  <button onClick={() => removeStep(idx)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
                {renderStepInput(step, idx)}
              </div>
              {idx < steps.length - 1 && <div className="w-0.5 h-8 bg-gray-300" />}
            </div>
          );
        })}

        {/* Add Step */}
        <div className="flex flex-col items-center">
          {steps.length > 0 && <div className="w-0.5 h-8 bg-gray-300 mb-2" />}
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-4 w-full max-w-lg">
            <p className="text-sm font-semibold text-gray-600 mb-3 text-center">添加步骤</p>
            <div className="grid grid-cols-3 gap-2">
              {stepTypes.map(({ type, label, icon: SIcon }) => (
                <button key={type} onClick={() => addStep(type)} className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-gray-50 border border-gray-100 text-center">
                  <SIcon className="w-5 h-5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-700">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const allSelected = automations.length > 0 && selectedIds.length === automations.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : automations.map(a => a._id));

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm("删除" + selectedIds.length + "选择的项目？")) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => automationApi.delete(id)));
      toast.success(translateApiMessage(selectedIds.length + "项目已删除"));
      setSelectedIds([]);
      fetchAutomations();
    } catch { toast.error(translateApiMessage("删除某些项目失败")); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">自动化</h1>
          <p className="text-gray-500 text-sm mt-1">构建由关键字、事件或计划触发的自动化工作流程</p>
        </div>
        <button onClick={() => openBuilder()} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> 新的自动化
        </button>
      </div>

      {!loading && automations.length > 0 && (
        <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 border ${selectedIds.length ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-red-500 cursor-pointer" />
            全选{selectedIds.length > 0 && <span className="text-red-700"> · {selectedIds.length} 已选择</span>}
          </label>
          {selectedIds.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => setSelectedIds([])} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">清除</button>
              <button onClick={handleBulkDelete} disabled={submitting} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">删除所选内容</button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">加载中…</div>
      ) : automations.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Zap className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-500">还没有自动化</h3>
          <p className="text-sm text-gray-400 mt-1">创建关键字触发流以自动响应</p>
          <button onClick={() => openBuilder()} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
            <Plus className="w-4 h-4 inline mr-1" /> 创建自动化
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {automations.map((auto) => (
            <div key={auto._id} className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow">
                <input type="checkbox" checked={selectedIds.includes(auto._id)} onChange={() => toggleSelect(auto._id)} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 mr-3 mt-1 shrink-0 cursor-pointer" />
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{auto.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{auto.description || `触发： ${auto.triggerType}`}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${auto.status === 'active' ? 'bg-emerald-100 text-emerald-700' : auto.status === 'draft' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                  {translateDisplay(auto.status)}
                </span>
              </div>
              {auto.triggerConfig?.keywords && auto.triggerConfig.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {auto.triggerConfig.keywords.map((kw: string, i: number) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{kw}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                <span>触发： {auto.stats?.triggered || 0}</span>
                <span>已完成： {auto.stats?.completed || 0}</span>
                <span>{Math.max(0, (auto.nodes || []).length - 1)} 步骤</span>
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <button onClick={() => handleToggle(auto._id)} className="p-1.5 hover:bg-gray-100 rounded-lg" title={auto.status === 'active' ? "暂停" : "启用"}>
                  {auto.status === 'active' ? <Pause className="w-4 h-4 text-yellow-500" /> : <Play className="w-4 h-4 text-emerald-500" />}
                </button>
                <button onClick={() => openBuilder(auto)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit className="w-4 h-4 text-gray-400" /></button>
                <button onClick={() => handleDelete(auto._id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
