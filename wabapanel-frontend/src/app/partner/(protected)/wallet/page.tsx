'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet, TrendingUp, TrendingDown, CircleArrowDown, Clock } from 'lucide-react';
import Card, { StatCard } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { partnerApi } from '@/lib/api';
import { inr, withdrawalStatusLabel, withdrawalStatusVariant } from '@/lib/affiliateLabels';
import toast from 'react-hot-toast';

interface WalletTxn {
  _id: string;
  type: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  category: string;
  description: string;
  createdAt: string;
}

interface Payout {
  _id: string;
  amount: number;
  status: string;
  createdAt: string;
  processedAt?: string;
  reference?: string;
  adminNote?: string;
  payoutSnapshot?: { method?: string };
}

interface WalletData {
  balance: number;
  pendingClearing: number;
  totalEarned: number;
  pendingWithdrawal: number;
  totalPaidOut: number;
  minWithdrawAmount: number;
  transactions: WalletTxn[];
  payouts: Payout[];
}

const categoryLabel: Record<string, string> = {
  commission: 'Commission',
  withdrawal: 'Withdrawal',
  withdrawal_refund: "提现退款",
  reversal: "佣金被撤销",
  adjustment: 'Adjustment',
};

export default function PartnerWalletPage() {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    partnerApi.wallet()
      .then((res) => setData(res.data.data))
      .catch(() => toast.error(translateApiMessage("无法加载您的钱包")))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">加载中…</p>;
  if (!data) return <Card>无法加载您的钱包。请刷新。</Card>;

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">钱包</h1>
          <p className="text-emerald-50 text-sm mt-1">您的佣金余额和完整交易历史记录</p>
        </div>
        <Link href="/partner/withdraw-request">
          <Button variant="secondary" icon={<CircleArrowDown className="w-4 h-4" />}>请求提款</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title={"可用余额"} value={inr(data.balance)} icon={<Wallet className="w-6 h-6" />} color="emerald" />
        <StatCard title={"总收入"} value={inr(data.totalEarned)} icon={<TrendingUp className="w-6 h-6" />} color="blue" />
        <StatCard title={"撤回总数"} value={inr(data.totalPaidOut)} icon={<TrendingDown className="w-6 h-6" />} color="purple" />
        <StatCard title={"待提款"} value={inr(data.pendingWithdrawal)} icon={<Clock className="w-6 h-6" />} color="yellow" />
      </div>

      <Card padding={false}>
        <h3 className="text-base font-semibold text-gray-900 px-5 pt-5 pb-3">交易记录</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 bg-gray-50/70 border-y border-gray-100">
                <th className="py-3 px-5">说明</th>
                <th className="py-3 px-5">类型</th>
                <th className="py-3 px-5">金额</th>
                <th className="py-3 px-5">平衡后</th>
                <th className="py-3 px-5">日期</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-gray-500">尚未有钱包交易</td></tr>
              )}
              {data.transactions.map((t) => (
                <tr key={t._id} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 px-5 text-gray-900">{t.description || categoryLabel[t.category] || t.category}</td>
                  <td className="py-3 px-5">
                    <Badge variant={t.type === 'credit' ? 'success' : 'danger'}>{t.type === 'credit' ? "信用" : "借方"}</Badge>
                  </td>
                  <td className={`py-3 px-5 font-semibold ${t.type === 'credit' ? 'text-emerald-700' : 'text-red-600'}`}>
                    {t.type === 'credit' ? '+' : '−'}{inr(t.amount)}
                  </td>
                  <td className="py-3 px-5 text-gray-700">{inr(t.balanceAfter)}</td>
                  <td className="py-3 px-5 text-gray-500">{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padding={false}>
        <h3 className="text-base font-semibold text-gray-900 px-5 pt-5 pb-3">支付历史记录</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 bg-gray-50/70 border-y border-gray-100">
                <th className="py-3 px-5">已请求</th>
                <th className="py-3 px-5">金额</th>
                <th className="py-3 px-5">方法</th>
                <th className="py-3 px-5">状态</th>
                <th className="py-3 px-5">已处理</th>
                <th className="py-3 px-5">注意</th>
              </tr>
            </thead>
            <tbody>
              {data.payouts.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-500">尚未付款</td></tr>
              )}
              {data.payouts.map((p) => (
                <tr key={p._id} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 px-5 text-gray-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="py-3 px-5 font-semibold text-gray-900">{inr(p.amount)}</td>
                  <td className="py-3 px-5 text-gray-500 uppercase">{p.payoutSnapshot?.method || '—'}</td>
                  <td className="py-3 px-5">
                    <Badge variant={withdrawalStatusVariant[p.status] || 'default'}>
                      {withdrawalStatusLabel[p.status] || p.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-5 text-gray-500">{p.processedAt ? new Date(p.processedAt).toLocaleDateString() : '—'}</td>
                  <td className="py-3 px-5 text-gray-500 text-xs">{p.reference || p.adminNote || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-gray-400">最低提款金额为 {inr(data.minWithdrawAmount)}.</p>
    </div>
  );
}
