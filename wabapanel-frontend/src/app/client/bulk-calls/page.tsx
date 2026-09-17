'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Phone, Play, Pause, Trash2, RefreshCw, Eye } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { aiCallingApi, tagApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface CallTarget {
  phone: string;
  name?: string;
  status: string;
  error?: string;
  calledAt?: string;
}

interface CallCampaignItem {
  _id: string;
  name: string;
  status: string;
  agent?: { _id: string; name: string } | null;
  callingHours?: { start: string; end: string };
  dailyLimit: number;
  callsToday: number;
  stats: { total: number; done: number; failed: number; permissionRequested: number };
  createdAt: string;
}

interface AgentItem { _id: string; name: string; status: string }
interface TagItem { _id: string; name: string }

const statusColor = (s: string) =>
  s === 'running' ? 'success' : s === 'completed' ? 'info' : s === 'failed' ? 'danger' : 'default';

export default function BulkCallsPage() {
  const [campaigns, setCampaigns] = useState<CallCampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [detail, setDetail] = useState<(CallCampaignItem & { targets: CallTarget[] }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    agentId: '',
    tagId: '',
    phonesText: '',
    startHour: '10:00',
    endHour: '19:00',
    dailyLimit: 50,
  });

  const load = async () => {
    try {
      const res = await aiCallingApi.getCallCampaigns();
      setCampaigns(res.data.data || []);
    } catch { /* */ }
    setLoading(false);
  };

  useEffect(() => {
    load();
    aiCallingApi.getAgents().then(r => setAgents((r.data.data || []).filter((a: AgentItem) => a.status === 'active'))).catch(() => {});
    tagApi.list().then(r => setTags(r.data.data || [])).catch(() => {});
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const create = async () => {
    if (!form.name.trim()) { toast.error(translateApiMessage("姓名为必填项")); return; }
    const phones = form.phonesText.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
    if (!phones.length && !form.tagId) { toast.error(translateApiMessage("添加电话号码或选择标签")); return; }
    setSaving(true);
    try {
      await aiCallingApi.createCallCampaign({
        name: form.name,
        agentId: form.agentId || undefined,
        tagId: form.tagId || undefined,
        phones,
        callingHours: { start: form.startHour, end: form.endHour },
        dailyLimit: form.dailyLimit,
      });
      toast.success(translateApiMessage("活动已创建"));
      setShowModal(false);
      setForm({ name: '', agentId: '', tagId: '', phonesText: '', startHour: '10:00', endHour: '19:00', dailyLimit: 50 });
      load();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(err.response?.data?.message || "未能创建营销活动"));
    }
    setSaving(false);
  };

  const doAction = async (id: string, action: 'start' | 'pause' | 'delete') => {
    try {
      if (action === 'start') await aiCallingApi.startCallCampaign(id);
      if (action === 'pause') await aiCallingApi.pauseCallCampaign(id);
      if (action === 'delete') {
        if (!confirm("删除此营销活动？")) return;
        await aiCallingApi.deleteCallCampaign(id);
      }
      load();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(err.response?.data?.message || "操作失败"));
    }
  };

  const openDetail = async (id: string) => {
    try {
      const res = await aiCallingApi.getCallCampaign(id);
      setDetail(res.data.data);
    } catch { toast.error(translateApiMessage("无法加载广告活动")); }
  };

  return (
    <div className="p-6">
      <div className="page-hero mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Phone className="w-6 h-6" /> 批量人工智能呼叫
          </h1>
          <p className="text-sm mt-1">AI 代理自动呼叫您的联系人列表 — 每分钟 1 次呼叫，通话时间和每日限制内。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4 mr-1" /> 新活动</Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">名称</th>
              <th className="px-4 py-3">客服</th>
              <th className="px-4 py-3">进展</th>
              <th className="px-4 py-3">小时</th>
              <th className="px-4 py-3">今天</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3 text-right">行动</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">加载中…</td></tr>}
            {!loading && campaigns.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">尚无通话活动。创建一个以开始批量 AI 呼叫。</td></tr>
            )}
            {campaigns.map(c => (
              <tr key={c._id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-600">{c.agent?.name || "默认代理"}</td>
                <td className="px-4 py-3 text-gray-600">
                  {c.stats.done + c.stats.failed + c.stats.permissionRequested}/{c.stats.total}
                  <span className="text-xs text-gray-400 ml-1">({c.stats.done} 好的， {c.stats.failed} 失败， {c.stats.permissionRequested} 允许。）</span>
                </td>
                <td className="px-4 py-3 text-gray-600">{c.callingHours?.start}–{c.callingHours?.end}</td>
                <td className="px-4 py-3 text-gray-600">{c.callsToday}/{c.dailyLimit}</td>
                <td className="px-4 py-3"><Badge variant={statusColor(c.status)}>{c.status}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openDetail(c._id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title={"查看"}><Eye className="w-4 h-4" /></button>
                    {(c.status === 'draft' || c.status === 'paused') && (
                      <button onClick={() => doAction(c._id, 'start')} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600" title={"开始"}><Play className="w-4 h-4" /></button>
                    )}
                    {c.status === 'running' && (
                      <button onClick={() => doAction(c._id, 'pause')} className="p-1.5 rounded hover:bg-amber-50 text-amber-600" title={"暂停"}><Pause className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => doAction(c._id, 'delete')} className="p-1.5 rounded hover:bg-red-50 text-red-500" title={"删除"}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={"新的批量通话活动"}>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">活动名称</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder={"例如七月后续电话"} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">人工智能代理</label>
            <select value={form.agentId} onChange={e => setForm({ ...form, agentId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="">默认代理</option>
              {agents.map(a => <option key={a._id} value={a._id}>{translateDisplay(a.name)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">按标签列出的联系人（可选）</label>
            <select value={form.tagId} onChange={e => setForm({ ...form, tagId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="">— 无 —</option>
              {tags.map(t => <option key={t._id} value={t._id}>{translateDisplay(t.name)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">电话号码（每行一个，可选）</label>
            <textarea value={form.phonesText} onChange={e => setForm({ ...form, phonesText: e.target.value })}
              rows={4} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder={'919876543210\n919812345678'} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">开始时间</label>
              <input type="time" value={form.startHour} onChange={e => setForm({ ...form, startHour: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">结束时间</label>
              <input type="time" value={form.endHour} onChange={e => setForm({ ...form, endHour: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">每日限额</label>
              <input type="number" min={1} max={1000} value={form.dailyLimit}
                onChange={e => setForm({ ...form, dailyLimit: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>取消</Button>
            <Button onClick={create} disabled={saving}>{saving ? "创建..." : "创建活动"}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail?.name || "营销活动"}>
        {detail && (
          <div className="max-h-[60vh] overflow-y-auto">
            <p className="text-sm text-gray-500 mb-3">
              {detail.stats.done} 完成· {detail.stats.failed} 失败· {detail.stats.permissionRequested} 请求许可· {detail.stats.total} 总计
            </p>
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr><th className="py-1">电话</th><th className="py-1">名称</th><th className="py-1">状态</th><th className="py-1">注意</th></tr>
              </thead>
              <tbody>
                {detail.targets.map((t, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1.5">{t.phone}</td>
                    <td className="py-1.5 text-gray-600">{t.name || '-'}</td>
                    <td className="py-1.5"><Badge variant={t.status === 'done' ? 'success' : t.status === 'failed' ? 'danger' : 'default'}>{t.status}</Badge></td>
                    <td className="py-1.5 text-xs text-gray-500">{t.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
