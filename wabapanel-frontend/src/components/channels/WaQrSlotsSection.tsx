'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, QrCode, Settings as SettingsIcon, Trash2, Unplug, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { waqrApi } from '@/lib/api';
import type { WaQrSlot } from '@/types';
import { translateApiMessage } from '@/lib/zhMessages';
import toast from 'react-hot-toast';

const errMsg = (err: unknown, fallback: string) => {
  const e = err as { response?: { data?: { message?: string } } };
  return translateApiMessage(e.response?.data?.message || fallback);
};

const qrSrc = (qr?: string | null) => (!qr ? '' : qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`);

export const SlotStatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { cls: string; text: string }> = {
    connected: { cls: 'bg-emerald-100 text-emerald-700', text: '已连接' },
    qr: { cls: 'bg-amber-100 text-amber-700', text: '等待扫码' },
    connecting: { cls: 'bg-blue-100 text-blue-700', text: '连接中' },
    reconnecting: { cls: 'bg-blue-100 text-blue-700', text: '重连中' },
    verifying: { cls: 'bg-blue-100 text-blue-700', text: '验证中' },
    awaiting_code: { cls: 'bg-amber-100 text-amber-700', text: '等待验证码' },
    awaiting_password: { cls: 'bg-amber-100 text-amber-700', text: '等待密码' },
    error: { cls: 'bg-red-100 text-red-700', text: '出错' },
  };
  const s = map[status] || { cls: 'bg-gray-100 text-gray-600', text: '未连接' };
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${s.cls}`}>{s.text}</span>;
};

export default function WaQrSlotsSection({ initialPoolEnabled }: { initialPoolEnabled: boolean }) {
  const [slots, setSlots] = useState<WaQrSlot[]>([]);
  const [poolEnabled, setPoolEnabled] = useState(initialPoolEnabled);
  const [poolSaving, setPoolSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  // 添加槽位
  const [addOpen, setAddOpen] = useState(false);
  const [addLabel, setAddLabel] = useState('');
  const [adding, setAdding] = useState(false);
  // 扫码连接弹窗
  const [connectId, setConnectId] = useState<string | null>(null);
  const [connectInfo, setConnectInfo] = useState<{ status: string; qr?: string | null; phone?: string }>({ status: 'connecting' });
  // 槽位设置弹窗
  const [settingsTarget, setSettingsTarget] = useState<WaQrSlot | null>(null);
  const [settingsForm, setSettingsForm] = useState({ label: '', dailyLimit: '', enabled: true });
  const [settingsSaving, setSettingsSaving] = useState(false);

  useEffect(() => { setPoolEnabled(initialPoolEnabled); }, [initialPoolEnabled]);

  const fetchSlots = useCallback(async () => {
    try {
      const res = await waqrApi.slots();
      setSlots(res.data.data || []);
    } catch { /* 后端未就绪时静默 */ }
  }, []);
  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  // 扫码弹窗打开期间轮询槽位状态
  useEffect(() => {
    if (!connectId) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await waqrApi.slotStatus(connectId);
        if (stop) return;
        const d = res.data.data || {};
        setConnectInfo(d);
        if (d.status === 'connected') {
          toast.success(translateApiMessage('号码已连接'));
          setConnectId(null);
          fetchSlots();
        }
      } catch { /* */ }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [connectId, fetchSlots]);

  const togglePool = async () => {
    const next = !poolEnabled;
    setPoolSaving(true);
    try {
      await waqrApi.setPool(next);
      setPoolEnabled(next);
      toast.success(translateApiMessage(next ? '号池模式已开启' : '号池模式已关闭'));
    } catch (err) { toast.error(errMsg(err, '操作失败')); }
    setPoolSaving(false);
  };

  const createSlot = async () => {
    if (adding) return;
    setAdding(true);
    try {
      await waqrApi.createSlot(addLabel.trim() || '新号码');
      toast.success(translateApiMessage('槽位已创建，点击「扫码连接」绑定号码'));
      setAddOpen(false);
      setAddLabel('');
      fetchSlots();
    } catch (err) { toast.error(errMsg(err, '创建槽位失败')); }
    setAdding(false);
  };

  const openConnect = async (slotId: string) => {
    setConnectInfo({ status: 'connecting' });
    setConnectId(slotId);
    try { await waqrApi.connectSlot(slotId); } catch (err) { toast.error(errMsg(err, '无法启动 QR 会话')); }
  };

  const disconnectSlot = async (s: WaQrSlot) => {
    if (!confirm(`断开槽位「${s.label || s.phone || s.slotId}」的连接吗？`)) return;
    setBusyId(s.slotId);
    try { await waqrApi.disconnectSlot(s.slotId); toast.success(translateApiMessage('已断开连接')); fetchSlots(); } catch (err) { toast.error(errMsg(err, '操作失败')); }
    setBusyId('');
  };

  const removeSlot = async (s: WaQrSlot) => {
    if (!confirm(`删除槽位「${s.label || s.phone || s.slotId}」？该号码将断开连接并从号池移除。`)) return;
    setBusyId(s.slotId);
    try { await waqrApi.deleteSlot(s.slotId); toast.success(translateApiMessage('槽位已删除')); fetchSlots(); } catch (err) { toast.error(errMsg(err, '操作失败')); }
    setBusyId('');
  };

  const openSettings = (s: WaQrSlot) => {
    setSettingsForm({ label: s.label || '', dailyLimit: s.dailyLimit ? String(s.dailyLimit) : '', enabled: s.enabled !== false });
    setSettingsTarget(s);
  };

  const saveSettings = async () => {
    if (!settingsTarget) return;
    setSettingsSaving(true);
    try {
      await waqrApi.updateSlotSettings(settingsTarget.slotId, {
        label: settingsForm.label.trim(),
        dailyLimit: Math.max(0, parseInt(settingsForm.dailyLimit, 10) || 0),
        enabled: settingsForm.enabled,
      });
      toast.success(translateApiMessage('槽位设置已保存'));
      setSettingsTarget(null);
      fetchSlots();
    } catch (err) { toast.error(errMsg(err, '保存失败')); }
    setSettingsSaving(false);
  };

  return (
    <div className="border-t border-gray-100 pt-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">号池槽位（多号码）</p>
          <p className="text-xs text-gray-500">为群发和接待挂接多个 WhatsApp 号码，分摊发送量、降低封号风险</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer shrink-0">
          <input type="checkbox" checked={poolEnabled} disabled={poolSaving} onChange={togglePool} className="w-4 h-4 accent-emerald-600" />
          号池模式
        </label>
      </div>
      <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
        开启号池模式后：群发任务可选择「号池轮询」由已连接槽位平均分摊发送；新会话会自动轮询取一个号接待并粘住绑定（后续消息固定走同一号码）。
      </p>

      {slots.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {slots.map((s) => (
            <div key={s.slotId} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.label || '未命名槽位'}</p>
                  {s.isDefault && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 shrink-0">主号</span>}
                  {s.enabled === false && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">已停用</span>}
                </div>
                <SlotStatusBadge status={s.status} />
              </div>
              <p className="text-xs text-gray-500">
                {s.phone ? `+${s.phone}` : '未绑定号码'} · 今日已发 {s.sentToday || 0} / {s.dailyLimit ? s.dailyLimit : '自动'}
              </p>
              {s.isDefault ? (
                <p className="text-[11px] text-gray-400">主号请在上方卡片操作（连接/断开/限额）。</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {s.status !== 'connected' && (
                    <Button size="sm" variant="outline" loading={busyId === s.slotId} onClick={() => openConnect(s.slotId)}>
                      <QrCode className="w-3.5 h-3.5" /> 扫码连接
                    </Button>
                  )}
                  {s.status === 'connected' && (
                    <Button size="sm" variant="outline" loading={busyId === s.slotId} onClick={() => disconnectSlot(s)}>
                      <Unplug className="w-3.5 h-3.5" /> 断开
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openSettings(s)}>
                    <SettingsIcon className="w-3.5 h-3.5" /> 设置
                  </Button>
                  <Button size="sm" variant="outline" loading={busyId === s.slotId} onClick={() => removeSlot(s)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" /> 删除
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Button size="sm" variant="outline" icon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>添加号码槽位</Button>

      {/* 添加槽位 */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title={'添加号码槽位'} size="sm">
        <div className="space-y-4">
          <Input label={'名称/备注'} value={addLabel} onChange={(e) => setAddLabel(e.target.value)} placeholder={'例如：业务号 2'} />
          <p className="text-xs text-gray-500">创建后在槽位卡片上点击「扫码连接」，用对应手机的 WhatsApp 扫码绑定。</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(false)}>取消</Button>
            <Button size="sm" loading={adding} onClick={createSlot}>创建槽位</Button>
          </div>
        </div>
      </Modal>

      {/* 扫码连接 */}
      <Modal isOpen={!!connectId} onClose={() => setConnectId(null)} title={'扫码连接 WhatsApp'} size="sm" guard={false}>
        <div className="space-y-3">
          {connectInfo.status === 'qr' && connectInfo.qr ? (
            <div className="flex flex-col items-center gap-2 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSrc(connectInfo.qr)} alt={'WhatsApp 二维码'} className="w-56 h-56 rounded-lg border" />
              <p className="text-xs text-gray-500 text-center">在手机上打开 WhatsApp → <b>设置 → 链接设备 → 链接设备</b> → 扫描此码。二维码会自动刷新。</p>
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-4 text-center">正在生成二维码...几秒后会显示在这里。</p>
          )}
          <div className="flex justify-between items-center">
            <Button size="sm" variant="outline" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => connectId && openConnect(connectId)}>刷新二维码</Button>
            <Button size="sm" variant="secondary" onClick={() => setConnectId(null)}>关闭</Button>
          </div>
        </div>
      </Modal>

      {/* 槽位设置 */}
      <Modal isOpen={!!settingsTarget} onClose={() => setSettingsTarget(null)} title={'槽位设置'} size="sm">
        <div className="space-y-4">
          <Input label={'名称/备注'} value={settingsForm.label} onChange={(e) => setSettingsForm({ ...settingsForm, label: e.target.value })} />
          <Input label={'每日发送限额（0 = 自动预热限额）'} type="number" min={0} value={settingsForm.dailyLimit}
            onChange={(e) => setSettingsForm({ ...settingsForm, dailyLimit: e.target.value })} placeholder={'自动（预热）'} />
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={settingsForm.enabled} onChange={(e) => setSettingsForm({ ...settingsForm, enabled: e.target.checked })} className="w-4 h-4 accent-emerald-600" />
            启用该槽位（停用后不参与号池轮询和群发）
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSettingsTarget(null)}>取消</Button>
            <Button size="sm" loading={settingsSaving} onClick={saveSettings}>保存</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
