'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Play, Pause, Trash2, Droplets, Edit, Clock, Users, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import { dripApi, templateApi, segmentApi, tagApi } from '@/lib/api';
import type { Template } from '@/types';
import toast from 'react-hot-toast';

interface DripStep {
  order: number;
  message: string;
  template?: string;
  delayValue: number;
  delayType: string;
}

interface Drip {
  _id: string;
  name: string;
  status: string;
  targetType: string;
  targetSegments: string[];
  targetTags: string[];
  dripSteps: DripStep[];
  stats: { totalRecipients: number; sent: number; delivered: number; read: number; failed: number };
  createdAt: string;
}

interface SegmentItem { _id: string; name: string }
interface TagItem { _id: string; name: string }

export default function DripsPage() {
  const [drips, setDrips] = useState<Drip[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [segments, setSegments] = useState<SegmentItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editDrip, setEditDrip] = useState<Drip | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', targetType: 'all' as string,
    targetSegments: [] as string[], targetTags: [] as string[],
    steps: [{ order: 1, message: '', template: '', delayValue: 0, delayType: 'minutes' }] as DripStep[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchAll = async () => {
    try {
      const [dripRes, tmpRes, segRes, tagRes] = await Promise.allSettled([
        dripApi.list(), templateApi.list({ limit: 500 }), segmentApi.list(), tagApi.list(),
      ]);
      if (dripRes.status === 'fulfilled') setDrips(dripRes.value.data.data || []);
      if (tmpRes.status === 'fulfilled') setTemplates(tmpRes.value.data.data || []);
      if (segRes.status === 'fulfilled') setSegments(segRes.value.data.data || []);
      if (tagRes.status === 'fulfilled') setTags(tagRes.value.data.data || []);
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const addStep = () => {
    setForm({
      ...form,
      steps: [...form.steps, { order: form.steps.length + 1, message: '', template: '', delayValue: 1, delayType: 'hours' }],
    });
  };

  const removeStep = (idx: number) => {
    if (form.steps.length <= 1) return;
    const steps = form.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 }));
    setForm({ ...form, steps });
  };

  const updateStep = (idx: number, updates: Partial<DripStep>) => {
    const steps = [...form.steps];
    steps[idx] = { ...steps[idx], ...updates };
    setForm({ ...form, steps });
  };

  const openModal = (drip?: Drip) => {
    if (drip) {
      setEditDrip(drip);
      setForm({
        name: drip.name,
        targetType: drip.targetType || 'all',
        targetSegments: drip.targetSegments || [],
        targetTags: drip.targetTags || [],
        steps: drip.dripSteps?.length ? drip.dripSteps.map((s, i) => ({
          order: i + 1,
          message: s.message || '',
          template: (s.template as string) || '',
          delayValue: s.delayValue || 0,
          delayType: s.delayType || 'minutes',
        })) : [{ order: 1, message: '', template: '', delayValue: 0, delayType: 'minutes' }],
      });
    } else {
      setEditDrip(null);
      setForm({
        name: '', targetType: 'all', targetSegments: [], targetTags: [],
        steps: [{ order: 1, message: '', template: '', delayValue: 0, delayType: 'minutes' }],
      });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (submitting) return;
    if (!form.name.trim()) { toast.error(translateApiMessage("活动名称为必填项")); return; }
    if (form.steps.every(s => !s.message.trim() && !s.template)) { toast.error(translateApiMessage("至少有一个步骤需要消息或模板")); return; }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        targetType: form.targetType,
        targetSegments: form.targetSegments,
        targetTags: form.targetTags,
        dripSteps: form.steps.map(s => ({
          order: s.order,
          message: s.message,
          template: s.template || undefined,
          delayValue: s.delayValue,
          delayType: s.delayType,
        })),
      };
      if (editDrip) {
        await dripApi.update(editDrip._id, payload);
        toast.success(translateApiMessage("水滴活动已更新"));
      } else {
        await dripApi.create(payload);
        toast.success(translateApiMessage("已创建水滴营销活动"));
      }
      setShowModal(false);
      fetchAll();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "保存失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStart = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);
    try { await dripApi.start(id); toast.success(translateApiMessage("滴水开始")); fetchAll(); }
    catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "启动失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePause = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    try { await dripApi.pause(id); toast.success(translateApiMessage("滴水暂停")); fetchAll(); } catch { toast.error(translateApiMessage("操作失败")); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    if (!confirm("删除此滴灌活动？")) return;
    try { await dripApi.delete(id); toast.success(translateApiMessage("已删除")); fetchAll(); } catch { toast.error(translateApiMessage("操作失败")); } finally { setSubmitting(false); }
  };

  const statusColor = (s: string) => {
    if (s === 'running') return 'success';
    if (s === 'paused') return 'warning';
    if (s === 'completed') return 'info';
    if (s === 'failed') return 'danger';
    return 'default';
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const allSelected = drips.length > 0 && selectedIds.length === drips.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : drips.map(d => d._id));

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm("删除" + selectedIds.length + "选择的项目？")) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => dripApi.delete(id)));
      toast.success(translateApiMessage(selectedIds.length + "项目已删除"));
      setSelectedIds([]);
      fetchAll();
    } catch { toast.error(translateApiMessage("删除某些项目失败")); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">分阶段营销</h1>
          <p className="text-gray-500 text-sm mt-1">有延迟的自动顺序消息流</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => openModal()}>新的滴水活动</Button>
      </div>

      {!loading && drips.length > 0 && (
        <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 border ${selectedIds.length ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-red-500 cursor-pointer" />
            全选{selectedIds.length > 0 && <span className="text-red-700"> · {selectedIds.length} 已选择</span>}
          </label>
          {selectedIds.length > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setSelectedIds([])}>清除</Button>
              <Button size="sm" variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={handleBulkDelete} disabled={submitting}>删除所选内容</Button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">加载中…</div>
      ) : drips.length === 0 ? (
        <Card className="text-center py-12">
          <Droplets className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-2">还没有滴灌活动</p>
          <p className="text-sm text-gray-400 mb-4">创建自动消息序列，并在每个步骤之间自定义延迟</p>
          <Button onClick={() => openModal()}>创建你的第一个点滴</Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {drips.map((drip) => (
            <Card key={drip._id} className="overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <input type="checkbox" checked={selectedIds.includes(drip._id)} onChange={() => toggleSelect(drip._id)} className="w-4 h-4 accent-red-500 cursor-pointer shrink-0" />
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Droplets className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{drip.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {drip.dripSteps?.length || 0} 步骤</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {drip.stats?.totalRecipients || 0} 收件人</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(drip.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={statusColor(drip.status)}>{drip.status}</Badge>
                  <div className="flex gap-1">
                    {drip.status === 'draft' || drip.status === 'paused' ? (
                      <button onClick={() => handleStart(drip._id)} className="p-1.5 hover:bg-emerald-50 rounded-lg" title={"开始"}><Play className="w-4 h-4 text-emerald-500" /></button>
                    ) : drip.status === 'running' ? (
                      <button onClick={() => handlePause(drip._id)} className="p-1.5 hover:bg-yellow-50 rounded-lg" title={"暂停"}><Pause className="w-4 h-4 text-yellow-500" /></button>
                    ) : null}
                    <button onClick={() => openModal(drip)} className="p-1.5 hover:bg-gray-100 rounded-lg" title={"编辑"}><Edit className="w-4 h-4 text-gray-400" /></button>
                    <button onClick={() => handleDelete(drip._id)} className="p-1.5 hover:bg-red-50 rounded-lg" title={"删除"}><Trash2 className="w-4 h-4 text-red-400" /></button>
                    <button onClick={() => setExpandedId(expandedId === drip._id ? null : drip._id)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                      {expandedId === drip._id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </button>
                  </div>
                </div>
              </div>
              {expandedId === drip._id && drip.dripSteps?.length > 0 && (
                <div className="border-t border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-3 mb-3 text-sm text-gray-600">
                    <span>发送： <strong>{drip.stats?.sent || 0}</strong></span>
                    <span>已交付： <strong>{drip.stats?.delivered || 0}</strong></span>
                    <span>读： <strong>{drip.stats?.read || 0}</strong></span>
                    <span>失败： <strong>{drip.stats?.failed || 0}</strong></span>
                  </div>
                  <div className="space-y-3">
                    {drip.dripSteps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">{idx + 1}</div>
                          {idx < drip.dripSteps.length - 1 && <div className="w-0.5 h-8 bg-blue-200 mt-1" />}
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 p-3 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {step.delayValue > 0 && (
                              <Badge variant="warning">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 等待 {step.delayValue} {step.delayType}</span>
                              </Badge>
                            )}
                            {idx === 0 && step.delayValue === 0 && <Badge variant="info">立即</Badge>}
                          </div>
                          <p className="text-sm text-gray-700">{step.message || "发送模板"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editDrip ? "编辑水滴营销活动" : "创建水滴营销活动"} size="xl">
        <div className="space-y-6">
          <Input label={"活动名称"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={"例如7 天入职系列"} required />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">目标受众</label>
            <Select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}
              options={[
                { value: 'all', label: "所有联系人" },
                { value: 'segment', label: "特定部分" },
                { value: 'tag', label: "带标签的联系人" },
              ]} />
            {form.targetType === 'segment' && segments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {segments.map(seg => (
                  <button key={seg._id} onClick={() => {
                    const segs = form.targetSegments.includes(seg._id) ? form.targetSegments.filter(s => s !== seg._id) : [...form.targetSegments, seg._id];
                    setForm({ ...form, targetSegments: segs });
                  }} className={`px-3 py-1 rounded-full text-xs border ${form.targetSegments.includes(seg._id) ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-600'}`}>
                    {seg.name}
                  </button>
                ))}
              </div>
            )}
            {form.targetType === 'tag' && tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map(tag => (
                  <button key={tag._id} onClick={() => {
                    const tgs = form.targetTags.includes(tag._id) ? form.targetTags.filter(t => t !== tag._id) : [...form.targetTags, tag._id];
                    setForm({ ...form, targetTags: tgs });
                  }} className={`px-3 py-1 rounded-full text-xs border ${form.targetTags.includes(tag._id) ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-600'}`}>
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-semibold text-gray-700">滴水步骤</label>
              <Button variant="ghost" size="sm" onClick={addStep} icon={<Plus className="w-3 h-3" />}>添加步骤</Button>
            </div>
            <div className="space-y-4">
              {form.steps.map((step, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">步骤 {idx + 1}</span>
                    {form.steps.length > 1 && (
                      <button onClick={() => removeStep(idx)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <Input label={"延迟"} type="number" value={String(step.delayValue)}
                      onChange={(e) => updateStep(idx, { delayValue: parseInt(e.target.value) || 0 })} min="0" />
                    <Select label={"单位"} value={step.delayType} onChange={(e) => updateStep(idx, { delayType: e.target.value })}
                      options={[{ value: 'minutes', label: "分钟" }, { value: 'hours', label: "小时" }, { value: 'days', label: "天" }]} />
                  </div>
                  <Textarea label={"留言"} value={step.message} onChange={(e) => updateStep(idx, { message: e.target.value })}
                    placeholder={"键入此步骤的消息..."} rows={2} />
                  {templates.length > 0 && (
                    <Select label={"或使用模板"} value={step.template || ''} onChange={(e) => updateStep(idx, { template: e.target.value })}
                      options={[{ value: '', label: "-- 没有模板 --" }, ...templates.map(t => ({ value: t._id, label: t.name }))]} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
            <Button onClick={handleSave}>{editDrip ? "更新" : "创建"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
