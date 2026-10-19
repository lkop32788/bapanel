'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Search, Coins, Plus, Minus, ReceiptText, RefreshCw } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { SAVER_GROUPS } from '@/lib/saverTypes';

interface WalletRow {
  workspaceId: string;
  name: string;
  owner?: { name?: string; email?: string } | null;
  balance: number;
  spent: number;
  chargedTasks: number;
}
interface LedgerRow {
  _id: string;
  type: 'topup' | 'charge' | 'refund' | 'adjust';
  amount: number;
  balanceAfter: number;
  note?: string;
  task?: { fileName?: string; taskType?: string; total?: number } | null;
  by?: { name?: string } | null;
  createdAt: string;
}

const LEDGER_TYPE: Record<string, { label: string; cls: string }> = {
  topup: { label: '充值', cls: 'bg-emerald-50 text-emerald-700' },
  charge: { label: '扣费', cls: 'bg-gray-100 text-gray-600' },
  refund: { label: '退款', cls: 'bg-blue-50 text-blue-600' },
  adjust: { label: '扣减', cls: 'bg-red-50 text-red-600' },
};
const typeName = (v?: string) => SAVER_GROUPS.flatMap(g => g.types).find(t => t.value === v)?.name || v || '';
const round3 = (n: number) => Math.round((n || 0) * 1000) / 1000;

export default function SaverBillingPage() {
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kw, setKw] = useState('');

  const load = useCallback(async (keyword?: string) => {
    setLoading(true);
    try {
      const res = await adminApi.saverWallets(keyword);
      setRows(res.data.data || []);
    } catch { /* empty */ }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // 充值/扣减弹窗
  const [topupWs, setTopupWs] = useState<WalletRow | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [minus, setMinus] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const openTopup = (w: WalletRow, isMinus: boolean) => {
    setTopupWs(w); setMinus(isMinus); setAmount(''); setNote('');
  };
  const doTopup = async () => {
    const n = Math.abs(Number(amount));
    if (!topupWs || !Number.isFinite(n) || n <= 0) { toast.error('请输入有效金额'); return; }
    setSubmitting(true);
    try {
      await adminApi.saverTopup({ workspaceId: topupWs.workspaceId, amount: minus ? -n : n, note });
      toast.success(minus ? '已扣减' : '已充值');
      setTopupWs(null);
      load(kw.trim() || undefined);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || '操作失败');
    }
    setSubmitting(false);
  };

  // 流水弹窗
  const [ledgerWs, setLedgerWs] = useState<WalletRow | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPages, setLedgerPages] = useState(1);
  const loadLedger = useCallback(async (wsId: string, page: number) => {
    try {
      const res = await adminApi.saverLedger({ workspace: wsId, page, limit: 20 });
      setLedger(res.data.data || []);
      setLedgerPages(res.data.pagination?.pages || 1);
    } catch { /* empty */ }
  }, []);
  const openLedger = (w: WalletRow) => { setLedgerWs(w); setLedgerPage(1); loadLedger(w.workspaceId, 1); };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center gap-3">
        <Coins className="w-7 h-7 text-amber-500 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">商家计费</h1>
          <p className="text-gray-500 text-sm mt-1">省钱专家检测的商家积分：充值、扣减、消费流水。单价和计费开关在 系统偏好设置 → 省钱专家</p>
        </div>
      </div>

      <Card padding={false} className="overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <input value={kw} onChange={e => setKw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') load(kw.trim() || undefined); }}
            placeholder="商家名称"
            className="w-56 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <Button size="sm" variant="outline" icon={<Search className="w-4 h-4" />} onClick={() => load(kw.trim() || undefined)}>查询</Button>
          <span className="flex-1" />
          <Button size="sm" variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => load(kw.trim() || undefined)}>刷新</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50/60">
                <th className="px-4 py-3 font-medium">商家</th>
                <th className="px-3 py-3 font-medium">所有者</th>
                <th className="px-3 py-3 font-medium text-right">积分余额</th>
                <th className="px-3 py-3 font-medium text-right">累计消费</th>
                <th className="px-3 py-3 font-medium text-right">扣费任务数</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-14 text-center text-gray-400">加载中…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-14 text-center text-gray-400">没有商家</td></tr>
              ) : rows.map(w => (
                <tr key={w.workspaceId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{w.name}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">{w.owner?.name || ''}<br />{w.owner?.email || ''}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${w.balance > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{round3(w.balance)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{round3(w.spent)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500">{w.chargedTasks}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => openTopup(w, false)}>充值</Button>
                      <Button size="sm" variant="outline" icon={<Minus className="w-3.5 h-3.5" />} onClick={() => openTopup(w, true)}>扣减</Button>
                      <Button size="sm" variant="outline" icon={<ReceiptText className="w-3.5 h-3.5" />} onClick={() => openLedger(w)}>流水</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 充值/扣减 */}
      <Modal isOpen={!!topupWs} onClose={() => setTopupWs(null)} title={`${minus ? '扣减' : '充值'} — ${topupWs?.name || ''}`} size="sm" guard={false}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">当前余额 <span className="font-semibold text-gray-900">{round3(topupWs?.balance || 0)}</span> 积分</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{minus ? '扣减' : '充值'}金额（积分）</label>
            <input type="number" min="0" step="0.001" value={amount} onChange={e => setAmount(e.target.value)} autoFocus
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">备注（可选）</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder={minus ? '扣减原因' : '如：收款 500 元'}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTopupWs(null)}>取消</Button>
            <Button variant={minus ? 'danger' : 'primary'} onClick={doTopup} loading={submitting}>确认{minus ? '扣减' : '充值'}</Button>
          </div>
        </div>
      </Modal>

      {/* 流水 */}
      <Modal isOpen={!!ledgerWs} onClose={() => setLedgerWs(null)} title={`积分流水 — ${ledgerWs?.name || ''}`} size="xl" guard={false}>
        <div className="space-y-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 font-medium">时间</th>
                <th className="pb-2 font-medium">类型</th>
                <th className="pb-2 font-medium text-right">变动</th>
                <th className="pb-2 font-medium text-right">余额</th>
                <th className="pb-2 font-medium">关联任务 / 备注</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400">暂无流水</td></tr>
              ) : ledger.map(l => (
                <tr key={l._id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-xs text-gray-500">{new Date(l.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEDGER_TYPE[l.type]?.cls || ''}`}>{LEDGER_TYPE[l.type]?.label || l.type}</span>
                  </td>
                  <td className={`py-2 text-right font-medium ${l.amount >= 0 ? 'text-emerald-600' : 'text-gray-700'}`}>{l.amount >= 0 ? '+' : ''}{round3(l.amount)}</td>
                  <td className="py-2 text-right text-gray-500">{round3(l.balanceAfter)}</td>
                  <td className="py-2 text-xs text-gray-500 max-w-70 truncate">
                    {l.task ? `${l.task.fileName || ''}（${typeName(l.task.taskType)} ${l.task.total || 0}条）` : ''}
                    {l.note ? ` ${l.note}` : ''}
                    {l.by?.name ? ` · 操作人 ${l.by.name}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-end gap-1.5 text-xs text-gray-500">
            <button disabled={ledgerPage <= 1}
              onClick={() => { const p = ledgerPage - 1; setLedgerPage(p); if (ledgerWs) loadLedger(ledgerWs.workspaceId, p); }}
              className="px-2.5 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">上一页</button>
            <span className="px-1">{ledgerPage} / {ledgerPages}</span>
            <button disabled={ledgerPage >= ledgerPages}
              onClick={() => { const p = ledgerPage + 1; setLedgerPage(p); if (ledgerWs) loadLedger(ledgerWs.workspaceId, p); }}
              className="px-2.5 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">下一页</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
