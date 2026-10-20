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
  const [progress, setProgress] = useState('');
  const [q, setQ] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  // 读取 txt 文件内容填入文本框（支持批量，一行一个凭证）
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setRaw((prev) => (prev.trim() ? prev.trimEnd() + '\n' : '') + String(r.result || ''));
    r.onerror = () => toast.error(translateApiMessage('读取文件失败'));
    r.readAsText(f);
    e.target.value = '';
  };

  // 把一行里的注释/@前缀等杂质去掉，保留凭证主体；空行/注释返回空
  const cleanLine = (line: string) => {
    let s = line.trim();
    if (!s || s.startsWith('#') || s.startsWith('//')) return '';
    if (s.startsWith('@')) s = s.slice(1); // 兼容某些导出里 @ 前缀
    return s;
  };

  // 批量导入：一行一个凭证，逐条登录（每条可能十几秒），带进度；最后汇总
  const doImport = async () => {
    if (importing) return;
    const lines = raw.split(/\r?\n/).map(cleanLine).filter(Boolean);
    if (lines.length === 0) { toast.error(translateApiMessage('请粘贴或上传六段凭证')); return; }
    setImporting(true);
    let ok = 0;
    const failedLines: string[] = [];
    let firstErr = '';
    for (let i = 0; i < lines.length; i++) {
      setProgress(`正在导入 ${i + 1}/${lines.length}…`);
      try {
        await wabridgeApi.import({ raw: lines[i], platform, label: lines.length === 1 ? label.trim() : '' });
        ok += 1;
        fetchSlots();
      } catch (err) {
        const e = err as { response?: { data?: { message?: string } } };
        failedLines.push(lines[i]);
        if (!firstErr) firstErr = e.response?.data?.message || '失败';
      }
    }
    setProgress('');
    setImporting(false);
    fetchSlots();
    if (failedLines.length === 0) {
      toast.success(translateApiMessage(`全部导入成功（${ok} 个）`));
      setOpen(false); setRaw(''); setLabel('');
    } else if (ok > 0) {
      toast.success(translateApiMessage(`成功 ${ok} 个，失败 ${failedLines.length} 个`));
      setRaw(failedLines.join('\n')); // 失败行留在框里便于重试
    } else {
      toast.error(translateApiMessage(`全部失败：${firstErr}`));
      setRaw(failedLines.join('\n'));
    }
  };

  const remove = async (s: BridgeSlot) => {
    if (!confirm(`删除号码「${s.label || s.phone || s.slotId}」？将下线该 WhatsApp 会话并移除。`)) return;
    setBusyId(s.slotId);
    try { await wabridgeApi.deleteSlot(s.slotId); toast.success(translateApiMessage('已下线并移除')); fetchSlots(); }
    catch (err) { toast.error(errMsg(err, '操作失败')); }
    setBusyId('');
  };

  const kw = q.trim().toLowerCase();
  const filtered = kw
    ? slots.filter((s) => (s.phone || '').toLowerCase().includes(kw) || (s.label || '').toLowerCase().includes(kw))
    : slots;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
        用六段凭证免扫码接入 WhatsApp 号码，登录后常驻在线，收发消息和其它号码一样进收件箱、参与号池轮流发送。凭证无效或被登出的号码会显示「已登出」。
      </p>

      {slots.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">还没有六段凭证号，点击下方「导入六段凭证号」开始。</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* 工具条：计数 + 搜索（号多也不撑长页面） */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/60">
            <span className="text-xs text-gray-500 shrink-0">
              共 <b className="text-gray-700">{slots.length}</b> · 在线{' '}
              <b className="text-emerald-600">{slots.filter((s) => s.status === 'connected').length}</b>
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索号码 / 备注"
              className="ml-auto w-40 max-w-[50%] px-2.5 py-1 text-xs border border-gray-200 rounded-md bg-white"
            />
          </div>
          {/* 定高滚动列表：行数再多，容器高度封顶，页面不无限增长 */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 py-6 text-center">没有匹配的号码</p>
            ) : filtered.map((s) => (
              <div key={s.slotId} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.status === 'connected' ? 'bg-emerald-500' : s.status === 'logged_out' ? 'bg-red-500' : s.status === 'connecting' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 truncate leading-tight">{s.phone ? `+${s.phone}` : '未绑定号码'}</p>
                  {s.label && <p className="text-[11px] text-gray-400 truncate leading-tight">{s.label}</p>}
                </div>
                <StatusBadge status={s.status} />
                <button
                  type="button"
                  onClick={() => remove(s)}
                  disabled={busyId === s.slotId}
                  className="shrink-0 p-1.5 rounded-md hover:bg-red-50 disabled:opacity-50"
                  aria-label="删除"
                  title="删除"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button size="sm" variant="outline" icon={<KeyRound className="w-4 h-4" />} onClick={() => setOpen(true)}>导入六段凭证号</Button>

      <Modal isOpen={open} onClose={() => { if (!importing) setOpen(false); }} title={'导入六段凭证号'} size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              每行一个凭证，可批量。支持逗号格式
              <code className="bg-gray-100 px-1 rounded">手机号,noisePub,noisePriv,identPub,identPriv,hash</code>
              （可带 <code className="bg-gray-100 px-1 rounded">|代理</code>）或 JSON。号码带不带 <code className="bg-gray-100 px-1 rounded">+</code>、有无空格都可识别。
            </p>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>上传 txt</Button>
            <input ref={fileRef} type="file" accept=".txt,.csv,text/plain" className="hidden" onChange={onFile} />
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={6}
            placeholder={'201044239393,<noisePub>,<noisePriv>,<identPub>,<identPriv>,<hash>\n每行一个，可粘贴多行或上传 txt'}
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
          <div className="flex items-center justify-end gap-2">
            {progress && <span className="text-xs text-gray-500 mr-auto">{progress}</span>}
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={importing}>取消</Button>
            <Button size="sm" loading={importing} onClick={doImport}>导入并连接</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
