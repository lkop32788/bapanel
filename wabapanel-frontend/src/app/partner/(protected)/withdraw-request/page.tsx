'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { isAxiosError } from 'axios';
import { AlertTriangle, Banknote } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { partnerApi } from '@/lib/api';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { inr, withdrawalStatusLabel, withdrawalStatusVariant } from '@/lib/affiliateLabels';
import toast from 'react-hot-toast';

interface Withdrawal {
  _id: string;
  amount: number;
  status: string;
  createdAt: string;
  processedAt?: string;
  reference?: string;
  adminNote?: string;
  payoutSnapshot?: { method?: string; upiId?: string; bankAccountNumber?: string };
}

const emptyPayout = {
  method: 'upi' as '' | 'upi' | 'bank',
  upiId: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankIfsc: '',
  bankName: '',
};

export default function PartnerWithdrawRequestPage() {
  const { account, loadPartner } = usePartnerAuthStore();
  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [amount, setAmount] = useState('');
  const [payout, setPayout] = useState(emptyPayout);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await partnerApi.withdrawals();
      setRows(res.data.data || []);
    } catch {
      toast.error(translateApiMessage("无法加载您的提款请求"));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (account?.payoutDetails) {
      setPayout({ ...emptyPayout, ...account.payoutDetails, method: account.payoutDetails.method || 'upi' });
    }
  }, [account]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await partnerApi.savePayoutDetails(payout);
      await partnerApi.requestWithdrawal(Number(amount));
      toast.success(translateApiMessage("提款请求已提交"));
      setAmount('');
      await Promise.all([load(), loadPartner()]);
    } catch (err) {
      toast.error(translateApiMessage(isAxiosError(err) ? err.response?.data?.message || "无法提交请求" : "无法提交请求"));
    } finally {
      setSubmitting(false);
    }
  };

  const min = account?.settings.minWithdrawAmount || 0;
  const kycApproved = account?.kycStatus === 'approved';
  const hasPending = rows.some((r) => r.status === 'pending');

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold">提款请求</h1>
        <p className="text-emerald-50 text-sm mt-1">请求从您的联属钱包付款</p>
      </div>

      {!kycApproved && (
        <Card className="p-4! border border-amber-200 bg-amber-50/60">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800">
              您的 KYC 必须获得批准，然后才能请求付款。{' '}
              <Link href="/partner/kyc" className="font-semibold underline">完成 KYC</Link>
            </p>
          </div>
        </Card>
      )}

      <Card className="max-w-xl">
        <p className="text-sm text-gray-500">可用余额</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{inr(account?.walletBalance)}</p>
        <div className="h-px bg-gray-100 my-5" />

        <form onSubmit={submit} className="space-y-4">
          <Select
            label={"提款方法"}
            value={payout.method}
            onChange={(e) => setPayout({ ...payout, method: e.target.value as '' | 'upi' | 'bank' })}
            options={[
              { value: 'upi', label: 'UPI' },
              { value: 'bank', label: "银行转账" },
            ]}
          />
          <Input
            label={"金额"}
            type="number"
            min={min}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder={String(min)}
          />
          {payout.method === 'upi' && (
            <Input label="UPI ID" value={payout.upiId} onChange={(e) => setPayout({ ...payout, upiId: e.target.value })} placeholder={"姓名@银行"} required />
          )}
          {payout.method === 'bank' && (
            <>
              <Input label={"账户持有人姓名"} value={payout.bankAccountName} onChange={(e) => setPayout({ ...payout, bankAccountName: e.target.value })} required />
              <Input label={"帐号"} value={payout.bankAccountNumber} onChange={(e) => setPayout({ ...payout, bankAccountNumber: e.target.value })} required />
              <Input label={"IFSC 代码"} value={payout.bankIfsc} onChange={(e) => setPayout({ ...payout, bankIfsc: e.target.value })} required />
              <Input label={"银行名称"} value={payout.bankName} onChange={(e) => setPayout({ ...payout, bankName: e.target.value })} />
            </>
          )}
          <Button type="submit" loading={submitting} disabled={!kycApproved || hasPending || !payout.method} className="w-full">
            <Banknote className="w-4 h-4" />
            {hasPending ? "您已有一个待处理的请求" : "提交提款请求"}
          </Button>
          <p className="text-xs text-gray-400">最低提款金额为 {inr(min)}.</p>
        </form>
      </Card>

      <Card padding={false}>
        <h3 className="text-base font-semibold text-gray-900 px-5 pt-5 pb-3">提款历史</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 bg-gray-50/70 border-y border-gray-100">
                <th className="py-3 px-5">金额</th>
                <th className="py-3 px-5">方法</th>
                <th className="py-3 px-5">状态</th>
                <th className="py-3 px-5">注意</th>
                <th className="py-3 px-5">已请求</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-gray-500">尚无提款请求</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r._id} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 px-5 font-semibold text-gray-900">{inr(r.amount)}</td>
                  <td className="py-3 px-5 text-gray-500 uppercase">{r.payoutSnapshot?.method || '—'}</td>
                  <td className="py-3 px-5">
                    <Badge variant={withdrawalStatusVariant[r.status] || 'default'}>
                      {withdrawalStatusLabel[r.status] || r.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-5 text-gray-500 text-xs">{r.reference || r.adminNote || '—'}</td>
                  <td className="py-3 px-5 text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
