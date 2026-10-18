'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Layers, Trash2, Edit, Users, Search } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import { segmentApi, campaignApi } from '@/lib/api';
import type { Segment, SegmentRule } from '@/types';
import toast from 'react-hot-toast';

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editSegment, setEditSegment] = useState<Segment | null>(null);
  type BehaviorRule = { campaign: string; condition: string };
  const [form, setForm] = useState({ name: '', description: '', rules: [{ field: 'name', operator: 'contains', value: '' }] as SegmentRule[], behaviorRules: [] as BehaviorRule[] });
  const [campaigns, setCampaigns] = useState<{ _id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  type Member = { _id: string; name?: string; phone?: string; email?: string };
  const [membersOf, setMembersOf] = useState<Segment | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const openMembers = async (seg: Segment) => {
    setMembersOf(seg); setMembers([]); setMemberSearch(''); setMembersLoading(true);
    try {
      const res = await segmentApi.getContacts(seg._id);
      setMembers(res.data.data || []);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "无法加载成员"));
    } finally {
      setMembersLoading(false);
    }
  };

  const fetchSegments = async () => {
    try {
      const res = await segmentApi.list();
      setSegments(res.data.data || []);
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchSegments();
    campaignApi.list({ limit: 100 }).then(r => setCampaigns(r.data.data || [])).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (submitting) return;
    if (!form.name.trim()) { toast.error(translateApiMessage("分组名称为必填项")); return; }
    setSubmitting(true);
    const payload = { ...form, behaviorRules: form.behaviorRules.filter(br => br.campaign) };
    try {
      if (editSegment) {
        await segmentApi.update(editSegment._id, payload);
        toast.success(translateApiMessage("分组已更新"));
      } else {
        await segmentApi.create(payload);
        toast.success(translateApiMessage("分组已创建"));
      }
      setShowModal(false); setEditSegment(null);
      setForm({ name: '', description: '', rules: [{ field: 'name', operator: 'contains', value: '' }], behaviorRules: [] });
      fetchSegments();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    if (!confirm("删除该分组？")) return;
    try { await segmentApi.delete(id); toast.success(translateApiMessage("已删除")); fetchSegments(); } catch { toast.error(translateApiMessage("操作失败")); } finally { setSubmitting(false); }
  };

  const addRule = () => setForm({ ...form, rules: [...form.rules, { field: 'name', operator: 'contains', value: '' }] });
  const removeRule = (i: number) => setForm({ ...form, rules: form.rules.filter((_, idx) => idx !== i) });
  const updateRule = (i: number, updates: Partial<SegmentRule>) => {
    const rules = [...form.rules]; rules[i] = { ...rules[i], ...updates }; setForm({ ...form, rules });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const allSelected = segments.length > 0 && selectedIds.length === segments.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : segments.map(s => s._id));

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm("删除" + selectedIds.length + "选择的项目？")) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => segmentApi.delete(id)));
      toast.success(translateApiMessage(selectedIds.length + "项目已删除"));
      setSelectedIds([]);
      fetchSegments();
    } catch { toast.error(translateApiMessage("删除某些项目失败")); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">联系人分组</h1>
          <p className="text-gray-500 text-sm mt-1">动态对联系人进行分组</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditSegment(null); setForm({ name: '', description: '', rules: [{ field: 'name', operator: 'contains', value: '' }], behaviorRules: [] }); setShowModal(true); }}>
          创建分组
        </Button>
      </div>

      {!loading && segments.length > 0 && (
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
      ) : segments.length === 0 ? (
        <Card className="text-center py-12">
          <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">尚未创建任何分组</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {segments.map((seg) => (
            <Card key={seg._id}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={selectedIds.includes(seg._id)} onChange={() => toggleSelect(seg._id)} className="w-4 h-4 accent-red-500 cursor-pointer shrink-0" />
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Layers className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{seg.name}</h3>
                    <p className="text-xs text-gray-500">{seg.description || "无描述"}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditSegment(seg); setForm({ name: seg.name, description: seg.description, rules: seg.rules, behaviorRules: ((seg as unknown as { behaviorRules?: BehaviorRule[] }).behaviorRules || []) }); setShowModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
                  <button onClick={() => handleDelete(seg._id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <button onClick={() => openMembers(seg)} className="flex items-center gap-2 text-purple-600 hover:text-purple-700 hover:underline font-medium">
                  <Users className="w-4 h-4" />
                  <span>{seg.contactCount || 0} 联系人</span>
                </button>
                <span className="text-gray-300">|</span>
                <span>{seg.rules?.length || 0} 规则</span>
                <button onClick={() => openMembers(seg)} className="ml-auto text-xs text-gray-500 hover:text-purple-600">查看成员</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={!!membersOf} onClose={() => setMembersOf(null)} title={membersOf ? `${membersOf.name} — 分组成员` : ''} size="lg">
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder={"搜索姓名或号码..."}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          {membersLoading ? (
            <div className="text-center py-8 text-gray-400">正在加载成员...</div>
          ) : (() => {
            const q = memberSearch.trim().toLowerCase();
            const shown = q
              ? members.filter(m => (m.name || '').toLowerCase().includes(q) || (m.phone || '').includes(q))
              : members;
            if (!members.length) return <div className="text-center py-8 text-gray-500">该组中还没有联系人</div>;
            return (
              <>
                <p className="text-xs text-gray-500">显示 {shown.length} / {members.length} 位联系人</p>
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
                  {shown.map((m) => (
                    <div key={m._id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-medium text-gray-900">{m.name || "未命名"}</span>
                      <span className="text-gray-600">{m.phone || '-'}</span>
                    </div>
                  ))}
                  {!shown.length && <div className="px-3 py-6 text-center text-gray-500">没有匹配项</div>}
                </div>
              </>
            );
          })()}
        </div>
      </Modal>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editSegment ? "编辑分组" : "创建分组"} size="lg">
        <div className="space-y-4">
          <Input label={"分组名称"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={"说明"} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">规则</label>
            {form.rules.map((rule, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <Select value={rule.field} onChange={(e) => updateRule(i, { field: e.target.value })} options={[
                  { value: 'name', label: "名称" }, { value: 'phone', label: "电话" }, { value: 'email', label: "邮箱" },
                  { value: 'tag', label: "标签" }, { value: 'source', label: "来源" }, { value: 'status', label: "状态" },
                ]} />
                <Select value={rule.operator} onChange={(e) => updateRule(i, { operator: e.target.value })} options={[
                  { value: 'contains', label: "包含" }, { value: 'equals', label: "等于" },
                  { value: 'not_equals', label: "不等于" }, { value: 'starts_with', label: "开头为" },
                ]} />
                <Input value={rule.value} onChange={(e) => updateRule(i, { value: e.target.value })} placeholder={"值"} />
                {form.rules.length > 1 && <button onClick={() => removeRule(i)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addRule} icon={<Plus className="w-3 h-3" />}>添加规则</Button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">广播重定向（可选）</label>
            <p className="text-xs text-gray-500 mb-2">根据联系人对过去广播的反应来定位联系人——例如向所有阅读但从未回复的人重新发送报价。</p>
            {form.behaviorRules.map((br, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <Select value={br.campaign} onChange={(e) => { const rules = [...form.behaviorRules]; rules[i] = { ...rules[i], campaign: e.target.value }; setForm({ ...form, behaviorRules: rules }); }} options={[{ value: '', label: "选择广播..." }, ...campaigns.map(c => ({ value: c._id, label: c.name }))]} />
                <Select value={br.condition} onChange={(e) => { const rules = [...form.behaviorRules]; rules[i] = { ...rules[i], condition: e.target.value }; setForm({ ...form, behaviorRules: rules }); }} options={[
                  { value: 'delivered_not_replied', label: "已送达但未回复" },
                  { value: 'read_not_replied', label: "已阅读但未回复" },
                  { value: 'not_read', label: "未读" },
                  { value: 'replied', label: "已回复" },
                  { value: 'failed', label: "递送失败" },
                  { value: 'sent', label: "已发送（大家）" },
                ]} />
                <button onClick={() => setForm({ ...form, behaviorRules: form.behaviorRules.filter((_, idx) => idx !== i) })} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, behaviorRules: [...form.behaviorRules, { campaign: '', condition: 'delivered_not_replied' }] })} icon={<Plus className="w-3 h-3" />}>添加重定向规则</Button>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
            <Button onClick={handleSave}>{editSegment ? "更新" : "创建"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
