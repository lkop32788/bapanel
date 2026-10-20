'use client';
// 六段凭证号：whatsmeow 常驻桥接（不扫码、不走 Baileys）。号由 yuncang-proxy 常驻持有，
// 面板走 external_api 管线收发，和其它渠道一样进收件箱。本组件只做导入/列表/删除。
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { wabridgeApi } from '@/lib/api';
import { translateApiMessage } from '@/lib/zhMessages';
import toast from 'react-hot-toast';

const errMsg = (err: unknown, fallback: string) => {
  const e = err as { response?: { data?: { message?: string } } };
  return translateApiMessage(e.response?.data?.message || fallback);
};

type BridgeSlot = { slotId: string; label: string; phone: string; jid: string; enabled: boolean; status: string };

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { cls: string; text: string }> = {
    connected: { cls: 'bg-emerald-100 text-emerald-700', text: '已连接' },
    connecting: { cls: 'bg-blue-100 text-blue-700', text: '连接中' },
    logged_out: { cls: 'bg-red-100 text-red-700', text: '已登出' },
  };
  const s = map[status] || { cls: 'bg-gray-100 text-gray-600', text: '未连接' };
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${s.cls}`}>{s.text}</span>;
};

export default function WaBridgeSection() {
  const [slots, setSlots] = useState<BridgeSlot[]>([]);
  const [busyId, setBusyId] = useState('');
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [label, setLabel] = useState('');
  const [platform, setPlatform] = useState('0');
  const [importing, setImporting] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSlots = useCallback(async () => {
    try {
      const res = await wabridgeApi.slots();
      setSlots(res.data.data || []);
    } catch { /* 静默 */ }
  }, []);

  useEffect(() => {
    fetchSlots();
    timer.current = setInterval(fetchSlots, 5000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [fetchSlots]);

  const doImport = async () => {
    if (importing) return;
    if (!raw.trim()) { toast.error(translateApiMessage('请粘贴六段凭证')); return; }
    setImporting(true);
    try {
      const res = await wabridgeApi.import({ raw: raw.trim(), platform, label: label.trim() });
      toast.success(translateApiMessage(res.data?.message || '登录成功，已加入号池'));
      setOpen(false); setRaw(''); setLabel('');
      fetchSlots();
    } catch (err) { toast.error(errMsg(err, '导入失败')); }
    setImporting(false);
  };

  const remove = async (s: BridgeSlot) => {
    if (!confirm(`删除号码「${s.label || s.phone || s.slotId}」？将下线该 WhatsApp 会话并移除。`)) return;
    setBusyId(s.slotId);
    try { await wabridgeApi.deleteSlot(s.slotId); toast.success(translateApiMessage('已下线并移除')); fetchSlots(); }
    catch (err) { toast.error(errMsg(err, '操作失败')); }
    setBusyId('');
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
        用六段凭证免扫码接入 WhatsApp 号码，登录后常驻在线，收发消息和其它号码一样进收件箱、参与号池轮流发送。凭证无效或被登出的号码会显示「已登出」。
      </p>

      {slots.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {slots.map((s) => (
            <div key={s.slotId} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900 truncate">{s.label || (s.phone ? `+${s.phone}` : '未命名号码')}</p>
                <StatusBadge status={s.status} />
              </div>
              <p className="text-xs text-gray-500">{s.phone ? `+${s.phone}` : '未绑定号码'}</p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" loading={busyId === s.slotId} onClick={() => remove(s)}>
                  <Trash2 className="w-3.5 h-3.5 text-red-500" /> 删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {slots.length === 0 && (
        <p className="text-xs text-gray-400 py-2">还没有六段凭证号，点击下方「导入六段凭证号」开始。</p>
      )}

      <Button size="sm" variant="outline" icon={<KeyRound className="w-4 h-4" />} onClick={() => setOpen(true)}>导入六段凭证号</Button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={'导入六段凭证号'} size="md">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            粘贴一条六段凭证。支持逗号格式
            <code className="bg-gray-100 px-1 rounded">手机号,noisePub,noisePriv,identPub,identPriv,hash</code>
            （可带 <code className="bg-gray-100 px-1 rounded">|代理</code> 尾部），或 JSON
            <code className="bg-gray-100 px-1 rounded">{'{ phone, noisePriv, identityPriv, hash }'}</code>。
          </p>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={5}
            placeholder={'201044239393,<noisePub>,<noisePriv>,<identPub>,<identPriv>,<hash>'}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono resize-y"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label={'名称/备注（可选）'} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={'例如：业务号 1'} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">设备平台</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                <option value="0">Android（默认）</option>
                <option value="1">iOS</option>
                <option value="10">SMB Android（商业版）</option>
                <option value="12">SMB iOS（商业版）</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            导入会真实连接 WhatsApp 校验凭证，可能需要十几秒。凭证已失效的号码会返回「已登出」。
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>取消</Button>
            <Button size="sm" loading={importing} onClick={doImport}>导入并连接</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
