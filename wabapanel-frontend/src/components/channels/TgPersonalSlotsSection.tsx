'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, QrCode, Settings as SettingsIcon, Trash2, Unplug } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { tgPersonalApi } from '@/lib/api';
import type { TgPersonalSlot } from '@/types';
import { translateApiMessage } from '@/lib/zhMessages';
import toast from 'react-hot-toast';
import { SlotStatusBadge } from '@/components/channels/WaQrSlotsSection';

const errMsg = (err: unknown, fallback: string) => {
  const e = err as { response?: { data?: { message?: string } } };
  return translateApiMessage(e.response?.data?.message || fallback);
};

const qrSrc = (qr?: string | null) => (!qr ? '' : qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`);

type SlotStatus = { status: string; qr?: string; phone?: string; username?: string; error?: string };

export default function TgPersonalSlotsSection() {
  const [slots, setSlots] = useState<TgPersonalSlot[]>([]);
  const [busyId, setBusyId] = useState('');
  // 添加账号
  const [addOpen, setAddOpen] = useState(false);
  const [addLabel, setAddLabel] = useState('');
  const [adding, setAdding] = useState(false);
  // 登录弹窗（复用主号登录向导交互：二维码 / 手机号+验证码+2FA）
  const [loginId, setLoginId] = useState<string | null>(null);
  const [info, setInfo] = useState<SlotStatus>({ status: 'disconnected' });
  const [mode, setMode] = useState<'qr' | 'phone'>('qr');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // 账号设置
  const [settingsTarget, setSettingsTarget] = useState<TgPersonalSlot | null>(null);
  const [settingsForm, setSettingsForm] = useState({ label: '', enabled: true });
  const [settingsSaving, setSettingsSaving] = useState(false);

  const fetchSlots = useCallback(async () => {
    try {
      const res = await tgPersonalApi.slots();
      setSlots(res.data.data || []);
    } catch { /* 后端未就绪时静默 */ }
  }, []);
  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  // 登录弹窗打开期间轮询槽位状态
  useEffect(() => {
    if (!loginId) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await tgPersonalApi.slotStatus(loginId);
        if (stop) return;
        const d = res.data.data || {};
        setInfo(d);
        if (d.status === 'connected') {
          toast.success(translateApiMessage('Telegram 账号已连接'));
          setLoginId(null);
          fetchSlots();
        }
      } catch { /* */ }
    };
    poll();
    const t = setInterval(poll, 2500);
    return () => { stop = true; clearInterval(t); };
  }, [loginId, fetchSlots]);

  const createSlot = async () => {
    if (adding) return;
    setAdding(true);
    try {
      await tgPersonalApi.createSlot(addLabel.trim() || '新账号');
      toast.success(translateApiMessage('账号已添加，点击「登录」完成绑定'));
      setAddOpen(false);
      setAddLabel('');
      fetchSlots();
    } catch (err) { toast.error(errMsg(err, '添加账号失败')); }
    setAdding(false);
  };

  const openLogin = (slotId: string) => {
    setMode('qr');
    setPhone('');
    setCode('');
    setPassword('');
    setInfo({ status: 'disconnected' });
    setLoginId(slotId);
  };

  const startQr = async () => {
    if (!loginId) return;
    setBusy(true);
    try {
      const res = await tgPersonalApi.slotConnectQr(loginId);
      setInfo(res.data.data || { status: 'connecting' });
      if (res.data.data?.status === 'error') toast.error(translateApiMessage(res.data.data.error || '生成二维码失败'));
    } catch (err) { toast.error(errMsg(err, '生成二维码失败')); }
    setBusy(false);
  };

  const startPhone = async () => {
    if (!loginId) return;
    if (!phone.trim()) { toast.error(translateApiMessage('输入您的电话号码和国家/地区代码')); return; }
    setBusy(true);
    try {
      const res = await tgPersonalApi.slotConnect(loginId, phone.trim());
      setInfo(res.data.data || { status: 'connecting' });
      if (res.data.data?.status === 'awaiting_code') toast.success(translateApiMessage('验证码已发送 — 请查看您的 Telegram 应用'));
      if (res.data.data?.status === 'error') toast.error(translateApiMessage(res.data.data.error || '登录失败'));
    } catch (err) { toast.error(errMsg(err, '无法开始登录')); }
    setBusy(false);
  };

  const submitCode = async () => {
    if (!loginId || !code.trim()) return;
    setBusy(true);
    try {
      await tgPersonalApi.slotCode(loginId, code.trim());
      setInfo((i) => ({ ...i, status: 'verifying' }));
      setCode('');
    } catch (err) { toast.error(errMsg(err, '操作失败')); }
    setBusy(false);
  };

  const submitPassword = async () => {
    if (!loginId || !password) return;
    setBusy(true);
    try {
      await tgPersonalApi.slotPassword(loginId, password);
      setInfo((i) => ({ ...i, status: 'verifying' }));
      setPassword('');
    } catch (err) { toast.error(errMsg(err, '操作失败')); }
    setBusy(false);
  };

  const disconnectSlot = async (s: TgPersonalSlot) => {
    if (!confirm(`断开账号「${s.label || s.phone || s.slotId}」吗？`)) return;
    setBusyId(s.slotId);
    try { await tgPersonalApi.slotDisconnect(s.slotId); toast.success(translateApiMessage('已断开连接')); fetchSlots(); } catch (err) { toast.error(errMsg(err, '操作失败')); }
    setBusyId('');
  };

  const removeSlot = async (s: TgPersonalSlot) => {
    if (!confirm(`删除账号「${s.label || s.phone || s.slotId}」？该账号将退出登录并停止使用。`)) return;
    setBusyId(s.slotId);
    try { await tgPersonalApi.deleteSlot(s.slotId); toast.success(translateApiMessage('账号已删除')); fetchSlots(); } catch (err) { toast.error(errMsg(err, '操作失败')); }
    setBusyId('');
  };

  const openSettings = (s: TgPersonalSlot) => {
    setSettingsForm({ label: s.label || '', enabled: s.enabled !== false });
    setSettingsTarget(s);
  };

  const saveSettings = async () => {
    if (!settingsTarget) return;
    setSettingsSaving(true);
    try {
      await tgPersonalApi.updateSlotSettings(settingsTarget.slotId, { label: settingsForm.label.trim(), enabled: settingsForm.enabled });
      toast.success(translateApiMessage('设置已保存'));
      setSettingsTarget(null);
      fetchSlots();
    } catch (err) { toast.error(errMsg(err, '保存失败')); }
    setSettingsSaving(false);
  };

  const loginBusy = busy || ['connecting', 'verifying'].includes(info.status);

  return (
    <div className="border-t border-gray-100 pt-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">Telegram 账号</p>
        <p className="text-xs text-gray-500">可连接多个 Telegram 个人账号，分摊发送量</p>
      </div>
      <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
        已连接多个账号时，系统自动轮流分配发送，老客户固定由原账号接待，无需任何设置。
      </p>

      {slots.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {slots.map((s) => (
            <div key={s.slotId} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.label || '未命名账号'}</p>
                  {s.isDefault && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 shrink-0">主号</span>}
                  {s.enabled === false && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">已停用</span>}
                </div>
                <SlotStatusBadge status={s.status} />
              </div>
              <p className="text-xs text-gray-500">
                {s.phone ? `+${s.phone}` : '未绑定账号'}{s.username ? ` (@${s.username})` : ''}
              </p>
              {s.isDefault ? (
                <p className="text-[11px] text-gray-400">主号请在上方卡片操作（登录/断开）。</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {s.status !== 'connected' && (
                    <Button size="sm" variant="outline" loading={busyId === s.slotId} onClick={() => openLogin(s.slotId)}>
                      <QrCode className="w-3.5 h-3.5" /> 登录
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

      <Button size="sm" variant="outline" icon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>添加账号</Button>

      {/* 添加账号 */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title={'添加账号'} size="sm">
        <div className="space-y-4">
          <Input label={'名称/备注'} value={addLabel} onChange={(e) => setAddLabel(e.target.value)} placeholder={'例如：客服号 2'} />
          <p className="text-xs text-gray-500">添加后在账号卡片上点击「登录」，通过二维码或手机号+验证码绑定 Telegram 账号。</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(false)}>取消</Button>
            <Button size="sm" loading={adding} onClick={createSlot}>添加</Button>
          </div>
        </div>
      </Modal>

      {/* 登录向导 */}
      <Modal isOpen={!!loginId} onClose={() => setLoginId(null)} title={'登录 Telegram 账号'} size="sm" guard={false}>
        <div className="space-y-3">
          {!['awaiting_code', 'awaiting_password', 'verifying'].includes(info.status) && (
            <>
              {mode === 'qr' ? (
                <>
                  {info.status === 'qr' && info.qr ? (
                    <div className="flex flex-col items-center gap-2 py-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrSrc(info.qr)} alt={'Telegram 登录二维码'} className="w-56 h-56 border rounded-lg" />
                      <p className="text-xs text-gray-500 text-center">在手机上打开 Telegram → <b>设置 → 设备 → 链接桌面设备</b> → 扫描此二维码。二维码会自动刷新。</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Button size="sm" onClick={startQr} loading={loginBusy}>通过二维码登录</Button>
                      {info.status === 'error' && <span className="text-xs text-red-500">{info.error || '登录失败'}</span>}
                    </div>
                  )}
                  <button type="button" className="text-xs text-sky-600 underline" onClick={() => setMode('phone')}>使用电话号码+验证码登录</button>
                </>
              ) : (
                <>
                  <Input label={'电话号码（带国家/地区代码）'} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+60123456789" />
                  <div className="flex items-center gap-3">
                    <Button size="sm" onClick={startPhone} loading={loginBusy}>发送登录代码</Button>
                    {info.status === 'error' && <span className="text-xs text-red-500">{info.error || '登录失败'}</span>}
                  </div>
                  <button type="button" className="text-xs text-sky-600 underline" onClick={() => setMode('qr')}>使用二维码扫描登录</button>
                </>
              )}
            </>
          )}
          {info.status === 'awaiting_code' && (
            <div className="flex items-end gap-3">
              <Input label={'登录代码（发送到您的 Telegram 应用程序）'} value={code} onChange={(e) => setCode(e.target.value)} placeholder="12345" />
              <Button size="sm" loading={busy} onClick={submitCode}>验证码</Button>
            </div>
          )}
          {info.status === 'awaiting_password' && (
            <div className="flex items-end gap-3">
              <Input label={'两步验证密码'} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button size="sm" loading={busy} onClick={submitPassword}>验证密码</Button>
            </div>
          )}
          {info.status === 'verifying' && <p className="text-xs text-gray-400">正在验证...</p>}
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => setLoginId(null)}>关闭</Button>
          </div>
        </div>
      </Modal>

      {/* 账号设置 */}
      <Modal isOpen={!!settingsTarget} onClose={() => setSettingsTarget(null)} title={'账号设置'} size="sm">
        <div className="space-y-4">
          <Input label={'名称/备注'} value={settingsForm.label} onChange={(e) => setSettingsForm({ ...settingsForm, label: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={settingsForm.enabled} onChange={(e) => setSettingsForm({ ...settingsForm, enabled: e.target.checked })} className="w-4 h-4 accent-sky-600" />
            启用该账号（停用后不再分配发送）
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
