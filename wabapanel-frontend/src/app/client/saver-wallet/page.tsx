'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Coins, Send, ReceiptText, Copy, CheckCircle2, XCircle, Clock } from 'lucide-react';
import QRCode from 'react-qr-code';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { saverCheckApi } from '@/lib/api';
import { SAVER_GROUPS } from '@/lib/saverTypes';

interface LedgerRow {
  _id: string;
  type: 'topup' | 'charge' | 'refund' | 'adjust';
  amount: number;
  balanceAfter: number;
  note?: string;
  task?: { fileName?: string; taskType?: string; total?: number } | null;
  createdAt: string;
}
interface TopupRow { _id: string; amount: number; note?: string; status: string; adminNote?: string; createdAt: string }
interface UsdtOrder { orderNo: string; rmb: number; usdtAmount: number; status: string; createdAt: string }
interface PayingOrder { orderNo: string; payAmount: number; address: string; rmb: number; rate: number; expiresAt: string }

const LEDGER_TYPE: Record<string, { label: string; cls: string }> = {
  topup: { label: '充值', cls: 'bg-emerald-50 text-emerald-700' },
  charge: { label: '消费', cls: 'bg-gray-100 text-gray-600' },
  refund: { label: '退款', cls: 'bg-blue-50 text-blue-600' },
  adjust: { label: '扣减', cls: 'bg-red-50 text-red-600' },
};
const REQ_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '待审核', cls: 'bg-amber-50 text-amber-600' },
  approved: { label: '已到账', cls: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: '已拒绝', cls: 'bg-red-50 text-red-600' },
};
const USDT_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '待支付', cls: 'bg-amber-50 text-amber-600' },
  paid: { label: '已到账', cls: 'bg-emerald-50 text-emerald-700' },
  failed: { label: '失败', cls: 'bg-red-50 text-red-600' },
  expired: { label: '已超时', cls: 'bg-gray-100 text-gray-500' },
};
const typeName = (v?: string) => SAVER_GROUPS.flatMap(g => g.types).find(t => t.value === v)?.name || v || '';
const round2 = (n: number) => Math.round((n || 0) * 100) / 100;
const rmb = (n: number) => `￥${round2(n)}`;

export default function RechargeCenterPage() {
  const [wallet, setWallet] = useState<{ enabled: boolean; balance?: number; usdt?: { enabled: boolean; rate: number } } | null>(null);
  const [requests, setRequests] = useState<TopupRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  const [usdtOrders, setUsdtOrders] = useState<UsdtOrder[]>([]);
  const [usdtInput, setUsdtInput] = useState('');
  const [usdtSubmitting, setUsdtSubmitting] = useState(false);
  const [usdtMsg, setUsdtMsg] = useState('');
  // 支付弹窗
  const [paying, setPaying] = useState<PayingOrder | null>(null);
  const [payStatus, setPayStatus] = useState<'pending' | 'paid' | 'expired' | 'failed'>('pending');
  const [paidRmb, setPaidRmb] = useState(0);
  const [leftSec, setLeftSec] = useState(0);
  const [copied, setCopied] = useState<'addr' | 'amt' | null>(null);
  const payingRef = useRef<PayingOrder | null>(null);

  const loadAll = useCallback(() => {
    saverCheckApi.wallet().then(r => setWallet(r.data.data || { enabled: false })).catch(() => {});
    saverCheckApi.topupRequests().then(r => setRequests(r.data.data || [])).catch(() => {});
    saverCheckApi.usdtOrders().then(r => setUsdtOrders(r.data.data || [])).catch(() => {});
  }, []);
  const loadLedger = useCallback((p: number) => {
    saverCheckApi.walletLedger({ page: p, limit: 20 }).then(r => {
      setLedger(r.data.data || []);
      setPages(r.data.pagination?.pages || 1);
    }).catch(() => {});
  }, []);
  useEffect(() => { loadAll(); loadLedger(1); }, [loadAll, loadLedger]);

  // 支付弹窗：倒计时 + 5 秒轮询订单状态
  useEffect(() => {
    payingRef.current = paying;
    if (!paying) return;
    setPayStatus('pending');
    const deadline = new Date(paying.expiresAt).getTime();
    const timer = setInterval(() => {
      setLeftSec(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    }, 1000);
    const poll = setInterval(async () => {
      const cur = payingRef.current;
      if (!cur) return;
      try {
        const r = await saverCheckApi.usdtOrderStatus(cur.orderNo);
        const st = r.data.data?.status;
        if (st === 'paid') {
          setPayStatus('paid');
          setPaidRmb(r.data.data?.rmb || 0);
          loadAll();
          loadLedger(1);
        } else if (st === 'expired' || st === 'failed') {
          setPayStatus(st);
        }
      } catch { /* empty */ }
    }, 5000);
    return () => { clearInterval(timer); clearInterval(poll); };
  }, [paying, loadAll, loadLedger]);

  const createUsdtOrder = async () => {
    const n = Number(usdtInput);
    if (!Number.isFinite(n) || n < 1) { setUsdtMsg('请输入 USDT 金额（最低 1）'); return; }
    setUsdtSubmitting(true);
    setUsdtMsg('');
    try {
      const res = await saverCheckApi.usdtOrder({ usdt: n });
      setPaying(res.data.data);
      setUsdtInput('');
      loadAll();
    } catch (e) {
      const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setUsdtMsg(m || '创建订单失败，请稍后重试');
    }
    setUsdtSubmitting(false);
  };

  const copyText = async (text: string, which: 'addr' | 'amt') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* empty */ }
  };

  const submitRequest = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setMsg('请输入有效金额'); return; }
    setSubmitting(true);
    setMsg('');
    try {
      await saverCheckApi.topupRequest({ amount: n, note });
      setAmount('');
      setNote('');
      setMsg('申请已提交，管理员审核后自动到账');
      loadAll();
    } catch (e) {
      const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMsg(m || '提交失败，请稍后重试');
    }
    setSubmitting(false);
  };

  if (wallet && !wallet.enabled) {
    return (
      <div className="space-y-6">
        <div className="page-hero">
          <h1 className="text-2xl font-bold text-gray-900">充值中心</h1>
        </div>
        <Card><p className="text-gray-500 text-sm py-8 text-center">检测功能当前免费使用，无需充值 🎉</p></Card>
      </div>
    );
  }

  const fmtSec = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center gap-3">
        <Coins className="w-7 h-7 text-amber-500 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">充值中心</h1>
          <p className="text-gray-500 text-sm mt-1">USDT(TRC20) 充值，到账自动按汇率折算为人民币余额</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <p className="text-sm text-gray-500">账户余额</p>
          <p className="text-4xl font-bold text-emerald-600 mt-2">{rmb(wallet?.balance || 0)}</p>
          {wallet?.usdt?.enabled && <p className="text-xs text-gray-400 mt-2">汇率：1 USDT = ￥{wallet.usdt.rate}</p>}
        </Card>

        {wallet?.usdt?.enabled ? (
          <Card>
            <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2"><Coins className="w-4 h-4 text-amber-500" />USDT 充值</h3>
            <div className="space-y-3">
              <input type="number" min="1" value={usdtInput} onChange={e => setUsdtInput(e.target.value)} placeholder="充值金额（USDT）"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <p className="text-xs text-gray-400">
                {Number(usdtInput) > 0
                  ? <>到账约 <span className="font-semibold text-emerald-600">{rmb(Number(usdtInput) * (wallet.usdt.rate || 0))}</span></>
                  : '输入 USDT 金额，确认后获取收款地址和二维码'}
              </p>
              <div className="flex items-center gap-3">
                <Button onClick={createUsdtOrder} loading={usdtSubmitting}>确认充值</Button>
                {usdtMsg && <span className="text-xs text-red-500">{usdtMsg}</span>}
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2"><Send className="w-4 h-4 text-emerald-600" />申请充值</h3>
            <div className="space-y-3">
              <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="充值金额（元）"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="备注：付款方式/凭证说明（选填）"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <div className="flex items-center gap-3">
                <Button onClick={submitRequest} loading={submitting}>提交申请</Button>
                {msg && <span className="text-xs text-gray-500">{msg}</span>}
              </div>
            </div>
          </Card>
        )}
      </div>

      {usdtOrders.length > 0 && (
        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-3">充值订单</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">订单号</th>
                  <th className="pb-2 font-medium">时间</th>
                  <th className="pb-2 font-medium text-right">USDT</th>
                  <th className="pb-2 font-medium text-right">到账(元)</th>
                  <th className="pb-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {usdtOrders.map(o => (
                  <tr key={o.orderNo} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 font-mono text-xs text-gray-500">{o.orderNo}</td>
                    <td className="py-2 text-xs text-gray-500">{new Date(o.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="py-2 text-right font-medium">{o.usdtAmount}</td>
                    <td className="py-2 text-right">{o.status === 'paid' ? <span className="text-emerald-600 font-medium">{rmb(o.rmb)}</span> : '—'}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${USDT_STATUS[o.status]?.cls || ''}`}>{USDT_STATUS[o.status]?.label || o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {requests.length > 0 && (
        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-3">线下充值申请</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">时间</th>
                  <th className="pb-2 font-medium text-right">金额(元)</th>
                  <th className="pb-2 font-medium">状态</th>
                  <th className="pb-2 font-medium">备注</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r._id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 text-xs text-gray-500">{new Date(r.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="py-2 text-right font-medium">{round2(r.amount)}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REQ_STATUS[r.status]?.cls || ''}`}>{REQ_STATUS[r.status]?.label || r.status}</span>
                    </td>
                    <td className="py-2 text-xs text-gray-500">{r.note || ''}{r.adminNote ? ` · 管理员：${r.adminNote}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2"><ReceiptText className="w-4 h-4 text-emerald-600" />余额明细</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 font-medium">时间</th>
                <th className="pb-2 font-medium">类型</th>
                <th className="pb-2 font-medium text-right">变动(元)</th>
                <th className="pb-2 font-medium text-right">余额(元)</th>
                <th className="pb-2 font-medium">说明</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400">暂无明细</td></tr>
              ) : ledger.map(l => (
                <tr key={l._id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-xs text-gray-500">{new Date(l.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEDGER_TYPE[l.type]?.cls || ''}`}>{LEDGER_TYPE[l.type]?.label || l.type}</span>
                  </td>
                  <td className={`py-2 text-right font-medium ${l.amount >= 0 ? 'text-emerald-600' : 'text-gray-700'}`}>{l.amount >= 0 ? '+' : ''}{round2(l.amount)}</td>
                  <td className="py-2 text-right text-gray-500">{round2(l.balanceAfter)}</td>
                  <td className="py-2 text-xs text-gray-500 max-w-70 truncate">
                    {l.task ? `${l.task.fileName || ''}（${typeName(l.task.taskType)} ${l.task.total || 0}条）` : (l.note || '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-1.5 text-xs text-gray-500 mt-3">
          <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); loadLedger(p); }}
            className="px-2.5 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">上一页</button>
          <span className="px-1">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => { const p = page + 1; setPage(p); loadLedger(p); }}
            className="px-2.5 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">下一页</button>
        </div>
      </Card>

      {/* 支付弹窗 */}
      <Modal isOpen={!!paying} onClose={() => { setPaying(null); loadAll(); }} title="USDT 转账" size="md" guard={false}>
        {paying && (
          <div className="space-y-4">
            {payStatus === 'paid' ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
                <p className="text-lg font-semibold text-gray-900">充值成功</p>
                <p className="text-sm text-gray-500">已到账 <span className="text-emerald-600 font-semibold">{rmb(paidRmb)}</span></p>
                <Button onClick={() => { setPaying(null); }}>完成</Button>
              </div>
            ) : (payStatus === 'expired' || payStatus === 'failed') ? (
              <div className="py-8 text-center space-y-3">
                <XCircle className="w-14 h-14 text-red-400 mx-auto" />
                <p className="text-lg font-semibold text-gray-900">充值{payStatus === 'expired' ? '超时' : '失败'}</p>
                <p className="text-sm text-gray-500">如您已完成转账，请联系管理员人工核实入账</p>
                <Button variant="ghost" onClick={() => setPaying(null)}>关闭</Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center gap-2 text-sm text-amber-600">
                  <Clock className="w-4 h-4" />剩余支付时间 {fmtSec(leftSec)}
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4 flex justify-center">
                  <QRCode value={paying.address} size={160} />
                </div>
                <div className="space-y-2">
                  <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                    <p className="text-xs text-gray-400 mb-0.5">收款地址（TRC20）</p>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm text-gray-900 break-all flex-1">{paying.address}</p>
                      <button onClick={() => copyText(paying.address, 'addr')} className="text-gray-400 hover:text-emerald-600 shrink-0">
                        {copied === 'addr' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg bg-amber-50 px-3 py-2.5">
                    <p className="text-xs text-amber-600 mb-0.5">转账金额（必须与此金额完全一致，否则无法自动到账）</p>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-xl font-bold text-gray-900 flex-1">{paying.payAmount} <span className="text-sm font-normal">USDT</span></p>
                      <button onClick={() => copyText(String(paying.payAmount), 'amt')} className="text-gray-400 hover:text-emerald-600 shrink-0">
                        {copied === 'amt' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">到账 {rmb(paying.payAmount * paying.rate)}（1 USDT = ￥{paying.rate}）· 转账确认后自动到账，本页无需操作</p>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
