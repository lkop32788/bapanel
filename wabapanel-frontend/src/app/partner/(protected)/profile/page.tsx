'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { Copy } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { partnerApi } from '@/lib/api';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { inr, kycStatusLabel, kycStatusVariant } from '@/lib/affiliateLabels';
import toast from 'react-hot-toast';

const emptyPayout = {
  method: '' as '' | 'upi' | 'bank',
  upiId: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankIfsc: '',
  bankName: '',
};

export default function PartnerProfilePage() {
  const { profile, account, loadPartner, setProfile } = usePartnerAuthStore();
  const [form, setForm] = useState({ name: '', phone: '' });
  const [payout, setPayout] = useState(emptyPayout);
  const [saving, setSaving] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);

  useEffect(() => {
    if (profile) setForm({ name: profile.name || '', phone: profile.phone || '' });
  }, [profile]);

  useEffect(() => {
    if (account?.payoutDetails) setPayout({ ...emptyPayout, ...account.payoutDetails });
  }, [account]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await partnerApi.updateProfile(form);
      setProfile(res.data.data);
      await loadPartner();
      toast.success(translateApiMessage("个人资料已更新"));
    } catch (err) {
      toast.error(translateApiMessage(isAxiosError(err) ? err.response?.data?.message || "无法更新个人资料" : "无法更新个人资料"));
    } finally {
      setSaving(false);
    }
  };

  const savePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPayout(true);
    try {
      await partnerApi.savePayoutDetails(payout);
      await loadPartner();
      toast.success(translateApiMessage("付款详情已保存"));
    } catch (err) {
      toast.error(translateApiMessage(isAxiosError(err) ? err.response?.data?.message || "无法保存付款详细信息" : "无法保存付款详细信息"));
    } finally {
      setSavingPayout(false);
    }
  };

  const copyCode = () => {
    if (!account?.code) return;
    navigator.clipboard.writeText(account.code)
      .then(() => toast.success(translateApiMessage("已复制推荐代码")))
      .catch(() => toast.error(translateApiMessage("无法复制代码")));
  };

  const initial = (profile?.name || 'P').charAt(0).toUpperCase();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="page-hero">
        <h1 className="text-2xl font-bold">简介</h1>
        <p className="text-emerald-50 text-sm mt-1">您的联属合作伙伴账户和付款详细信息</p>
      </div>

      <Card>
        <div className="flex items-center gap-4">
          <span className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-700 text-2xl font-semibold flex items-center justify-center shrink-0">
            {initial}
          </span>
          <div>
            <p className="text-xl font-semibold text-gray-900">{profile?.name || '—'}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="success">附属合作伙伴</Badge>
              <button
                onClick={copyCode}
                className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 text-violet-700 text-xs font-semibold font-mono px-2 py-1 hover:bg-violet-100"
              >
                {account?.code || '—'}
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-100 my-5" />

        <h3 className="text-base font-semibold text-gray-900 mb-4">账户详细信息</h3>
        <form onSubmit={save} className="space-y-4">
          <Input label={"全名"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={"邮箱"} value={profile?.email || ''} disabled />
          <Input label={"电话"} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Button type="submit" loading={saving}>保存更改</Button>
        </form>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-gray-900">支付详情</h3>
        <p className="text-sm text-gray-500 mt-1 mb-4">用作新提款请求的默认设置。</p>
        <form onSubmit={savePayout} className="space-y-4">
          <Select
            label={"优选方法"}
            value={payout.method}
            onChange={(e) => setPayout({ ...payout, method: e.target.value as '' | 'upi' | 'bank' })}
            options={[
              { value: '', label: "未设置" },
              { value: 'upi', label: 'UPI' },
              { value: 'bank', label: "银行转账" },
            ]}
          />
          {payout.method === 'upi' && (
            <Input label="UPI ID" placeholder={"姓名@银行"} value={payout.upiId} onChange={(e) => setPayout({ ...payout, upiId: e.target.value })} />
          )}
          {payout.method === 'bank' && (
            <>
              <Input label={"账户持有人姓名"} value={payout.bankAccountName} onChange={(e) => setPayout({ ...payout, bankAccountName: e.target.value })} />
              <Input label={"帐号"} value={payout.bankAccountNumber} onChange={(e) => setPayout({ ...payout, bankAccountNumber: e.target.value })} />
              <Input label={"IFSC 代码"} value={payout.bankIfsc} onChange={(e) => setPayout({ ...payout, bankIfsc: e.target.value })} />
              <Input label={"银行名称"} value={payout.bankName} onChange={(e) => setPayout({ ...payout, bankName: e.target.value })} />
            </>
          )}
          <Button type="submit" loading={savingPayout}>保存支付详情</Button>
        </form>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-gray-900 mb-4">合作伙伴账户</h3>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">账户状态</dt>
            <dd><Badge variant={account?.status === 'active' ? 'success' : 'danger'}>{account?.status === 'active' ? "启用" : "暂停"}</Badge></dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">KYC</dt>
            <dd>
              <Badge variant={kycStatusVariant[account?.kycStatus || 'not_started']}>
                {kycStatusLabel[account?.kycStatus || 'not_started']}
              </Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">佣金率</dt>
            <dd className="font-semibold text-gray-900">{account?.settings.commissionRate ?? 0}%</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">佣金类型</dt>
            <dd className="text-gray-900">{account?.settings.recurringCommission ? "首次销售+续订" : "仅限首次销售"}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">结算期</dt>
            <dd className="text-gray-900">{account?.settings.clearingDays ?? 0} 天</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">最低提款额</dt>
            <dd className="text-gray-900">{inr(account?.settings.minWithdrawAmount)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">钱包余额</dt>
            <dd className="font-semibold text-emerald-700">{inr(account?.walletBalance)}</dd>
          </div>
        </dl>
      </Card>

      {account?.settings.terms && (
        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-2">计划条款</h3>
          <p className="text-sm text-gray-600 whitespace-pre-line">{account.settings.terms}</p>
        </Card>
      )}
    </div>
  );
}
