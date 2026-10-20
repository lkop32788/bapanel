'use client';
// 外部通道管理（平台级）：按商户配置第三方消息 API 对接。
// 商户端以「专线通道」名义收发，不暴露任何 endpoint/密钥配置。
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Settings as SettingsIcon, Trash2, Copy, Globe, Zap, RefreshCw, AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { adminExtChannelApi } from '@/lib/api';
import type { ExternalApiSlot } from '@/types';
import { translateApiMessage } from '@/lib/zhMessages';
import toast from 'react-hot-toast';

const errMsg = (err: unknown, fallback: string) => {
  const e = err as { response?: { data?: { message?: string } } };
  return translateApiMessage(e.response?.data?.message || fallback);
};

const StatusBadge = ({ status }: { status: string }) => {
  const configured = status === 'configured';
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${configured ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
      {configured ? '已配置' : '未配置'}
    </span>
  );
};

const emptyForm = { label: '', endpoint: '', apiKey: '', authHeader: 'Authorization' };

const timeAgo = (iso?: string) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0 || isNaN(diff)) return '';
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
};

type TestResult = { ok: boolean; httpStatus: number; latencyMs: number; error?: string };

export default function ExtChannelManager({ workspaceId }: { workspaceId: string }) {
  const [slots, setSlots] = useState<ExternalApiSlot[]>([]);
  const [busyId, setBusyId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [adding, setAdding] = useState(false);
  const [editTarget, setEditTarget] = useState<ExternalApiSlot | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);
  const [testingId, setTestingId] = useState('');
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [rotatingId, setRotatingId] = useState('');

  const fetchSlots = useCallback(async () => {
    if (!workspaceId) { setSlots([]); return; }
    try {
      const res = await adminExtChannelApi.listSlots(workspaceId);
      setSlots(res.data.data || []);
    } catch (e) { toast.error(errMsg(e, '加载通道失败')); }
  }, [workspaceId]);

  useEffect(() => { setTestResults({}); fetchSlots(); }, [fetchSlots]);

  const handleAdd = async () => {
    if (!addForm.endpoint.trim()) { toast.error('请填写 API 端点 URL'); return; }
    setAdding(true);
    try {
      const created = await adminExtChannelApi.createSlot(workspaceId, addForm.label || '外部通道');
      const slotId: string | undefined = created.data?.data?.slotId;
      if (slotId) {
        await adminExtChannelApi.updateSlot(workspaceId, slotId, {
          endpoint: addForm.endpoint,
          apiKey: addForm.apiKey || undefined,
          authHeader: addForm.authHeader || 'Authorization',
          enabled: true,
        });
      }
      await fetchSlots();
      setAddOpen(false);
      setAddForm(emptyForm);
      toast.success('通道已创建');
    } catch (e) { toast.error(errMsg(e, '创建失败')); }
    setAdding(false);
  };

  const openEdit = (slot: ExternalApiSlot) => {
    setEditTarget(slot);
    setEditForm({ label: slot.label, endpoint: slot.endpoint, apiKey: '', authHeader: slot.authHeader || 'Authorization' });
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!editForm.endpoint.trim()) { toast.error('请填写 API 端点 URL'); return; }
    setEditSaving(true);
    try {
      const payload: Record<string, unknown> = {
        label: editForm.label,
        endpoint: editForm.endpoint,
        authHeader: editForm.authHeader || 'Authorization',
      };
      if (editForm.apiKey) payload.apiKey = editForm.apiKey;
      await adminExtChannelApi.updateSlot(workspaceId, editTarget.slotId, payload);
      await fetchSlots();
      setEditTarget(null);
      toast.success('已保存');
    } catch (e) { toast.error(errMsg(e, '保存失败')); }
    setEditSaving(false);
  };

  const handleDelete = async (slotId: string, label: string) => {
    if (!confirm(`确认删除通道"${label || slotId}"？绑定该通道的会话将自动重新分配，此操作不可逆。`)) return;
    setBusyId(slotId);
    try {
      await adminExtChannelApi.deleteSlot(workspaceId, slotId);
      await fetchSlots();
      toast.success('通道已删除');
    } catch (e) { toast.error(errMsg(e, '删除失败')); }
    setBusyId('');
  };

  const copyWebhook = (url: string) => {
    navigator.clipboard.writeText(url).then(() => toast.success('已复制')).catch(() => toast.error('复制失败'));
  };

  const handleTest = async (slotId: string) => {
    setTestingId(slotId);
    try {
      const res = await adminExtChannelApi.testSlot(workspaceId, slotId);
      setTestResults(prev => ({ ...prev, [slotId]: res.data.data }));
      await fetchSlots(); // 测试成功后端会清 lastError
    } catch (e) { toast.error(errMsg(e, '测试失败')); }
    setTestingId('');
  };

  const handleRotate = async (slotId: string, label: string) => {
    if (!confirm(`确认轮换通道"${label || slotId}"的 Webhook 密钥？旧 webhook URL 将立即失效，需要把新 URL 重新配置给第三方。`)) return;
    setRotatingId(slotId);
    try {
      await adminExtChannelApi.rotateSecret(workspaceId, slotId);
      await fetchSlots();
      toast.success('密钥已轮换，请复制新的 Webhook URL');
    } catch (e) { toast.error(errMsg(e, '轮换失败')); }
    setRotatingId('');
  };

  const webhookBase = `${process.env.NEXT_PUBLIC_API_URL || ''}/webhook/extapi/${workspaceId}`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
            <Globe className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">通道列表</h2>
            <p className="text-xs text-gray-500">多个通道时系统自动轮询分摊，老客户固定由原通道接待</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> 新增通道
        </Button>
      </div>

      {slots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
          该商户暂无外部通道 — 点击「新增通道」接入第一个第三方 API
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {slots.map(slot => {
            const wh = `${webhookBase}/${slot.slotId}${slot.webhookSecret ? `?secret=${slot.webhookSecret}` : ''}`;
            const tr = testResults[slot.slotId];
            return (
              <div key={slot.slotId} className="rounded-lg border border-gray-200 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe className="w-4 h-4 text-violet-500 shrink-0" />
                    <span className="font-medium text-sm text-gray-900 truncate">{slot.label || slot.slotId}</span>
                  </div>
                  <StatusBadge status={slot.status} />
                </div>
                {slot.endpoint && (
                  <p className="text-xs text-gray-500 truncate" title={slot.endpoint}>{slot.endpoint}</p>
                )}
                {(slot.lastSentAt || slot.lastInboundAt) && (
                  <p className="text-[11px] text-gray-400">
                    {slot.lastSentAt && <span>最近发送 {timeAgo(slot.lastSentAt)}</span>}
                    {slot.lastSentAt && slot.lastInboundAt && <span> · </span>}
                    {slot.lastInboundAt && <span>最近接收 {timeAgo(slot.lastInboundAt)}</span>}
                  </p>
                )}
                {slot.lastError && (
                  <p className="flex items-center gap-1 text-[11px] text-red-600 bg-red-50 rounded px-2 py-1 truncate" title={slot.lastError}>
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span className="truncate">{slot.lastError}</span>
                  </p>
                )}
                <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-50 rounded px-2 py-1">
                  <span className="truncate flex-1" title={wh}>{wh}</span>
                  <button onClick={() => copyWebhook(wh)} title="复制入站 Webhook URL（含验签密钥）" className="shrink-0 hover:text-gray-600">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                {tr && (
                  <p className={`text-[11px] ${tr.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                    {tr.ok
                      ? `HTTP ${tr.httpStatus} · ${tr.latencyMs}ms`
                      : `${tr.httpStatus ? `HTTP ${tr.httpStatus}` : '连接失败/超时'} · ${tr.latencyMs}ms${tr.error ? ` — ${tr.error}` : ''}`}
                  </p>
                )}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <Button size="sm" variant="outline" loading={testingId === slot.slotId} onClick={() => handleTest(slot.slotId)} disabled={!slot.endpoint}>
                    <Zap className="w-3.5 h-3.5" /> 测试连通
                  </Button>
                  <Button size="sm" variant="outline" loading={rotatingId === slot.slotId} onClick={() => handleRotate(slot.slotId, slot.label)}>
                    <RefreshCw className="w-3.5 h-3.5" /> 轮换密钥
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(slot)}>
                    <SettingsIcon className="w-3.5 h-3.5" /> 设置
                  </Button>
                  <Button size="sm" variant="outline" loading={busyId === slot.slotId} onClick={() => handleDelete(slot.slotId, slot.label)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 接口约定说明 */}
      <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
        <p className="font-semibold text-gray-700">外发接口约定（第三方 API 需实现）</p>
        <p>面板将 POST 以下 JSON 到配置的端点（认证头 <code className="bg-gray-100 px-1 rounded">Authorization: Bearer &lt;apiKey&gt;</code> 或自定义头），期望响应返回 <code className="bg-gray-100 px-1 rounded">{`{ "messageId": "..." }`}</code>（用于状态回执匹配）：</p>
        <pre className="bg-white border border-gray-200 rounded p-2 overflow-auto">{`{
  "to": "6012345678",      // 收件人号码
  "type": "text",          // text | image | video | audio | document
  "text": "消息内容",
  "media": { "url": "...", "caption": "..." }  // 仅媒体消息
}`}</pre>
        <p>入站消息 POST 到通道的 Webhook URL（上方卡片中，已含 <code className="bg-gray-100 px-1 rounded">?secret=</code> 验签参数；也可改用 <code className="bg-gray-100 px-1 rounded">x-webhook-secret</code> 请求头，缺失或错误返回 401）：</p>
        <pre className="bg-white border border-gray-200 rounded p-2 overflow-auto">{`{
  "from": "6012345678",    // 发件人号码
  "type": "text",
  "text": "消息内容",
  "messageId": "ext_xxx"   // 可选，用于去重与状态追踪
}`}</pre>
        <p>消息状态回执（送达/已读/失败）POST 到同一 Webhook URL：</p>
        <pre className="bg-white border border-gray-200 rounded p-2 overflow-auto">{`{
  "event": "status",
  "messageId": "ext_xxx",  // 外发时响应里返回的 messageId
  "status": "delivered"    // sent | delivered | read | failed
}`}</pre>
      </div>

      {/* 新增通道弹窗 */}
      <Modal isOpen={addOpen} onClose={() => { setAddOpen(false); setAddForm(emptyForm); }} title="新增外部通道">
        <div className="space-y-4">
          <div className="space-y-3">
            <Input label="标签（可选）" value={addForm.label} onChange={e => setAddForm({ ...addForm, label: e.target.value })} placeholder="例：第三方 WA API" />
            <Input label="外发端点 URL *" value={addForm.endpoint} onChange={e => setAddForm({ ...addForm, endpoint: e.target.value })} placeholder="https://api.example.com/send" />
            <Input label="API 密钥" type="password" value={addForm.apiKey} onChange={e => setAddForm({ ...addForm, apiKey: e.target.value })} placeholder="可选" />
            <Input label="认证头字段名" value={addForm.authHeader} onChange={e => setAddForm({ ...addForm, authHeader: e.target.value })} placeholder="Authorization" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setAddOpen(false); setAddForm(emptyForm); }}>取消</Button>
            <Button loading={adding} onClick={handleAdd}>创建</Button>
          </div>
        </div>
      </Modal>

      {/* 编辑通道弹窗 */}
      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title={`编辑通道 — ${editTarget?.label || editTarget?.slotId}`}>
        <div className="space-y-4">
          <div className="space-y-3">
            <Input label="标签（可选）" value={editForm.label} onChange={e => setEditForm({ ...editForm, label: e.target.value })} />
            <Input label="外发端点 URL *" value={editForm.endpoint} onChange={e => setEditForm({ ...editForm, endpoint: e.target.value })} placeholder="https://api.example.com/send" />
            <Input label="API 密钥（不填则保持原密钥）" type="password" value={editForm.apiKey} onChange={e => setEditForm({ ...editForm, apiKey: e.target.value })} placeholder="••••" />
            <Input label="认证头字段名" value={editForm.authHeader} onChange={e => setEditForm({ ...editForm, authHeader: e.target.value })} placeholder="Authorization" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditTarget(null)}>取消</Button>
            <Button loading={editSaving} onClick={handleEditSave}>保存</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
