'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { Settings as SettingsIcon, Lock } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { adminPartnersApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Form {
  enabled: boolean;
  defaultCommissionRate: string;
  recurringCommission: boolean;
  clearingDays: string;
  minWithdrawAmount: string;
  maskCustomerContact: boolean;
  signupOpen: boolean;
  terms: string;
}

const Toggle = ({ checked, onChange, label, hint, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean;
}) => (
  <label className={`flex items-start justify-between gap-4 py-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
    <span>
      <span className="block text-sm font-medium text-gray-800">{label}</span>
      {hint && <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>}
    </span>
    <input type="checkbox" className="mt-1 w-4 h-4 accent-emerald-600" checked={checked} disabled={disabled}
      onChange={(e) => onChange(e.target.checked)} />
  </label>
);

export default function AffiliateSettingsPage() {
  const [licensed, setLicensed] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminPartnersApi.settings()
      .then((r) => {
        const d = r.data.data;
        setLicensed(!!d.licensed);
        setForm({
          enabled: d.enabled === true,
          defaultCommissionRate: String(d.defaultCommissionRate ?? 20),
          recurringCommission: d.recurringCommission === true,
          clearingDays: String(d.clearingDays ?? 15),
          minWithdrawAmount: String(d.minWithdrawAmount ?? 1000),
          maskCustomerContact: d.maskCustomerContact === true,
          signupOpen: d.signupOpen === true,
          terms: d.terms || '',
        });
      })
      .catch(() => toast.error(translateApiMessage("无法加载联属网络营销设置")));
  }, []);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await adminPartnersApi.saveSettings({
        enabled: form.enabled,
        defaultCommissionRate: Number(form.defaultCommissionRate),
        recurringCommission: form.recurringCommission,
        clearingDays: Number(form.clearingDays),
        minWithdrawAmount: Number(form.minWithdrawAmount),
        maskCustomerContact: form.maskCustomerContact,
        signupOpen: form.signupOpen,
        terms: form.terms,
      });
      toast.success(translateApiMessage("联盟设置已保存"));
    } catch (err) {
      toast.error(translateApiMessage(isAxiosError(err) ? err.response?.data?.message || "无法保存设置" : "无法保存设置"));
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <p className="text-sm text-gray-400 py-8 text-center">加载中…</p>;

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><SettingsIcon className="w-6 h-6" /> 附属设置</h1>
          <p className="text-emerald-50 text-sm mt-1">配置合作伙伴佣金率和支付规则</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={licensed ? 'success' : 'danger'} size="md">{licensed ? "附加许可" : "附加组件未获得许可"}</Badge>
          <Button onClick={save} loading={saving}>保存设置</Button>
        </div>
      </div>

      {!licensed && (
        <Card className="border border-amber-200 bg-amber-50/60">
          <p className="text-sm text-amber-800 flex items-start gap-2">
            <Lock className="w-4 h-4 mt-0.5 shrink-0" />
            联盟合作伙伴是一个高级附加组件。在 KKHS 媒体商店中为此域启用它 — 在此之前，该模块无法打开，并且所有合作伙伴路由均保持阻止状态。现有联属网络营销数据得到安全保护。
          </p>
        </Card>
      )}

      <Card>
        <h3 className="text-base font-semibold text-gray-900">计划状态</h3>
        <p className="text-sm text-gray-500 mt-1 mb-2">在面板范围内打开或关闭联属计划。</p>
        <Toggle
          label={"联属合作伙伴模块已启用"}
          hint={"打开该面板的合作伙伴门户、注册和佣金跟踪"}
          checked={form.enabled}
          disabled={!licensed}
          onChange={(v) => setForm({ ...form, enabled: v })}
        />
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-gray-900">佣金和支出</h3>
        <p className="text-sm text-gray-500 mt-1 mb-2">
          适用于每个合作伙伴，除非在合作伙伴页面上单独覆盖。
        </p>
        <div className="divide-y divide-gray-100">
          <Toggle
            label={"续订佣金也"}
            hint={"关闭 = 仅对客户的首次付款收取佣金"}
            checked={form.recurringCommission}
            onChange={(v) => setForm({ ...form, recurringCommission: v })}
          />
          <Toggle
            label={"合作伙伴注册开放"}
            hint={"关闭 = 只有管理员可以创建合作伙伴账户"}
            checked={form.signupOpen}
            onChange={(v) => setForm({ ...form, signupOpen: v })}
          />
          <Toggle
            label={"口罩客户联系方式"}
            hint={"合作伙伴看到他们推荐的客户的隐藏电话/电子邮件"}
            checked={form.maskCustomerContact}
            onChange={(v) => setForm({ ...form, maskCustomerContact: v })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <Input label={"默认佣金率(%)"} type="number" min={0} max={100}
            value={form.defaultCommissionRate} onChange={(e) => setForm({ ...form, defaultCommissionRate: e.target.value })} />
          <Input label={"清算期（天）"} type="number" min={0} max={180}
            value={form.clearingDays} onChange={(e) => setForm({ ...form, clearingDays: e.target.value })} />
          <Input label={"最低提款额（卢比）"} type="number" min={0}
            value={form.minWithdrawAmount} onChange={(e) => setForm({ ...form, minWithdrawAmount: e.target.value })} />
        </div>

        <div className="mt-4">
          <Textarea label={"计划条款（向合作伙伴展示）"} rows={6}
            value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
        </div>
      </Card>
    </div>
  );
}
