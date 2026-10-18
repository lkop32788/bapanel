'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState } from 'react';
import Button from '@/components/ui/Button';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export type DiagCheck = { key: string; label: string; ok: boolean; detail: string; fix?: string };
export type Diagnosis = { ok: boolean; summary: string; checks: DiagCheck[] };

export function DiagnosisList({ diag }: { diag: Diagnosis }) {
  return (
    <div className="space-y-2">
      <p className={`text-sm font-medium ${diag.ok ? 'text-green-700' : 'text-red-700'}`}>{diag.summary}</p>
      <ul className="space-y-1.5">
        {diag.checks.map((c) => (
          <li key={c.key} className={`text-xs rounded-md px-2.5 py-1.5 ${c.ok ? 'bg-green-50 text-gray-700' : 'bg-red-50 text-gray-800'}`}>
            <div className="flex gap-2">
              <span>{c.ok ? '✅' : '❌'}</span>
              <span><b>{c.label}</b>{c.detail ? ` — ${c.detail}` : ''}</span>
            </div>
            {!c.ok && c.fix && <p className="mt-1 ml-6 text-red-800"><b>如何修复：</b> {c.fix}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

type Channel = 'whatsapp' | 'telegram' | 'email' | 'waqr' | 'tgpersonal';

export default function ChannelDiagnose({ channel, extra }: { channel: Channel; extra?: React.ReactNode }) {
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [busy, setBusy] = useState(false);
  const errMsg = (err: unknown) => (err as { response?: { data?: { message?: string } } }).response?.data?.message;
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.get(`/channel-diagnose/${channel}`);
      setDiag(r.data.data);
    } catch (err) {
      toast.error(translateApiMessage(errMsg(err) || "诊断失败"));
    }
    setBusy(false);
  };
  const fixWebhook = async () => {
    setBusy(true);
    try {
      await api.post('/channel-diagnose/whatsapp/fix-webhook', {});
      toast.success(translateApiMessage("Webhook 订阅已刷新"));
      const r = await api.get('/channel-diagnose/whatsapp');
      setDiag(r.data.data);
    } catch (err) {
      toast.error(translateApiMessage(errMsg(err) || "修复失败"));
    }
    setBusy(false);
  };
  return (
    <div className="border-t border-gray-100 pt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" loading={busy} onClick={run}>检查连接</Button>
        {channel === 'whatsapp' && <Button size="sm" variant="outline" loading={busy} onClick={fixWebhook}>修复网络钩子</Button>}
        {extra}
        <span className="text-[11px] text-gray-400">保存后运行 — 验证每个设置并显示任何错误的准确修复。</span>
      </div>
      {diag && <DiagnosisList diag={diag} />}
    </div>
  );
}
