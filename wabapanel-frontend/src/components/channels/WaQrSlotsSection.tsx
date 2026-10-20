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

export default function WaQrSlotsSection() {
  const [slots, setSlots] = useState<WaQrSlot[]>([]);
  const [busyId, setBusyId] = useState('');
  const [q, setQ] = useState('');
  // 添加号码
  const [addOpen, setAddOpen] = useState(false);
  const [addLabel, setAddLabel] = useState('');
  const [adding, setAdding] = useState(false);
  // 扫码连接弹窗
  const [connectId, setConnectId] = useState<string | null>(null);
  const [connectInfo, setConnectInfo] = useState<{ status: string; qr?: string | null; phone?: string }>({ status: 'connecting' });
  // 号码设置弹窗
  const [settingsTarget, setSettingsTarget] = useState<WaQrSlot | null>(null);
  const [settingsForm, setSettingsForm] = useState({ label: '', enabled: true });
  const [settingsSaving, setSettingsSaving] = useState(false);

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

  const createSlot = async () => {
    if (adding) return;
    setAdding(true);
    try {
      await waqrApi.createSlot(addLabel.trim() || '新号码');
      toast.success(translateApiMessage('号码已添加，点击「扫码连接」完成绑定'));
      setAddOpen(false);
      setAddLabel('');
      fetchSlots();
    } catch (err) { toast.error(errMsg(err, '添加号码失败')); }
    setAdding(false);
  };

  const openConnect = async (slotId: string) => {
    setConnectInfo({ status: 'connecting' });
    setConnectId(slotId);
    try { await waqrApi.connectSlot(slotId); } catch (err) { toast.error(errMsg(err, '无法启动 QR 会话')); }
  };

  const disconnectSlot = async (s: WaQrSlot) => {
    if (!confirm(`断开号码「${s.label || s.phone || s.slotId}」的连接吗？`)) return;
    setBusyId(s.slotId);
    try { await waqrApi.disconnectSlot(s.slotId); toast.success(translateApiMessage('已断开连接')); fetchSlots(); } catch (err) { toast.error(errMsg(err, '操作失败')); }
    setBusyId('');
  };

  const removeSlot = async (s: WaQrSlot) => {
    if (!confirm(`删除号码「${s.label || s.phone || s.slotId}」？该号码将断开连接并停止使用。`)) return;
    setBusyId(s.slotId);
    try { await waqrApi.deleteSlot(s.slotId); toast.success(translateApiMessage('号码已删除')); fetchSlots(); } catch (err) { toast.error(errMsg(err, '操作失败')); }
    setBusyId('');
  };

  const openSettings = (s: WaQrSlot) => {
    setSettingsForm({ label: s.label || '', enabled: s.enabled !== false });
    setSettingsTarget(s);
  };

  const saveSettings = async () => {
    if (!settingsTarget) return;
    setSettingsSaving(true);
    try {
      await waqrApi.updateSlotSettings(settingsTarget.slotId, {
        label: settingsForm.label.trim(),
        enabled: settingsForm.enabled,
      });
      toast.success(translateApiMessage('设置已保存'));
      setSettingsTarget(null);
      fetchSlots();
    } catch (err) { toast.error(errMsg(err, '保存失败')); }
    setSettingsSaving(false);
  };

  return (
    <div className="border-t border-gray-100 pt-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">WhatsApp 号码</p>
        <p className="text-xs text-gray-500">可连接多个 WhatsApp 号码，分摊发送量、降低封号风险</p>
      </div>
      <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
        已连接多个号码时，系统自动轮流分配发送，老客户固定由原号码接待，无需任何设置。
      </p>

      {slots.length > 0 && (() => {
        const kw = q.trim().toLowerCase();
        const list = kw ? slots.filter((s) => (s.phone || '').toLowerCase().includes(kw) || (s.label || '').toLowerCase().includes(kw)) : slots;
        return (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/60">
              <span className="text-xs text-gray-500 shrink-0">
                共 <b className="text-gray-700">{slots.length}</b> · 在线 <b className="text-emerald-600">{slots.filter((s) => s.status === 'connected').length}</b>
              </span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索号码 / 备注" className="ml-auto w-40 max-w-[50%] px-2.5 py-1 text-xs border border-gray-200 rounded-md bg-white" />
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
              {list.length === 0 ? (
                <p className="text-xs text-gray-400 px-3 py-6 text-center">没有匹配的号码</p>
              ) : list.map((s) => (
                <div key={s.slotId} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm text-gray-900 truncate leading-tight">{s.label || (s.phone ? `+${s.phone}` : '未命名号码')}</p>
                      {s.enabled === false && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">已停用</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 truncate leading-tight">
                      {s.phone ? `+${s.phone}` : '未绑定'} · 今日 {s.sentToday || 0}/{s.dailyLimit ? s.dailyLimit : '自动'}
                    </p>
                  </div>
                  <SlotStatusBadge status={s.status} />
                  <div className="flex items-center gap-0.5 shrink-0">
                    {s.status !== 'connected' ? (
                      <button type="button" disabled={busyId === s.slotId} onClick={() => openConnect(s.slotId)} className="p-1.5 rounded-md hover:bg-green-50 disabled:opacity-50" title="扫码连接"><QrCode className="w-3.5 h-3.5 text-green-600" /></button>
                    ) : (
                      <button type="button" disabled={busyId === s.slotId} onClick={() => disconnectSlot(s)} className="p-1.5 rounded-md hover:bg-amber-50 disabled:opacity-50" title="断开"><Unplug className="w-3.5 h-3.5 text-amber-600" /></button>
                    )}
                    <button type="button" onClick={() => openSettings(s)} className="p-1.5 rounded-md hover:bg-gray-100" title="设置"><SettingsIcon className="w-3.5 h-3.5 text-gray-500" /></button>
                    <button type="button" disabled={busyId === s.slotId} onClick={() => removeSlot(s)} className="p-1.5 rounded-md hover:bg-red-50 disabled:opacity-50" title="删除"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {slots.length === 0 && (
        <p className="text-xs text-gray-400 py-2">还没有连接任何 WhatsApp 号码，点击下方「添加号码」开始绑定。</p>
      )}

      <Button size="sm" variant="outline" icon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>添加号码</Button>

      {/* 添加号码 */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title={'添加号码'} size="sm">
        <div className="space-y-4">
          <Input label={'名称/备注'} value={addLabel} onChange={(e) => setAddLabel(e.target.value)} placeholder={'例如：业务号 2'} />
          <p className="text-xs text-gray-500">添加后在号码卡片上点击「扫码连接」，用对应手机的 WhatsApp 扫码绑定。</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(false)}>取消</Button>
            <Button size="sm" loading={adding} onClick={createSlot}>添加</Button>
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

      {/* 号码设置 */}
      <Modal isOpen={!!settingsTarget} onClose={() => setSettingsTarget(null)} title={'号码设置'} size="sm">
        <div className="space-y-4">
          <Input label={'名称/备注'} value={settingsForm.label} onChange={(e) => setSettingsForm({ ...settingsForm, label: e.target.value })} />
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
            每日发送上限由系统自动管理（新号码从小量逐步提升，保护号码安全）。
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={settingsForm.enabled} onChange={(e) => setSettingsForm({ ...settingsForm, enabled: e.target.checked })} className="w-4 h-4 accent-emerald-600" />
            启用该号码（停用后不再分配发送）
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
