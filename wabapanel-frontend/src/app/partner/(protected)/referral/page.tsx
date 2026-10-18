'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React from 'react';
import { Copy, Mail, MessageCircle } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import toast from 'react-hot-toast';

export default function PartnerReferralLinkPage() {
  const account = usePartnerAuthStore((s) => s.account);
  const code = account?.code || '';
  const link = code && typeof window !== 'undefined' ? `${window.location.origin}/auth/register?ref=${code}` : '';

  const copy = (value: string, label: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value)
      .then(() => toast.success(translateApiMessage(`${label} 已复制`)))
      .catch(() => toast.error(translateApiMessage(`无法复制 ${label.toLowerCase()}`)));
  };

  const shareText = `Join me on this WhatsApp Business platform and grow your business: ${link}`;

  return (
    <div className="space-y-6">
      <div className="page-hero max-w-2xl">
        <h1 className="text-2xl font-bold">推荐链接</h1>
        <p className="text-emerald-50 text-sm mt-1">
          分享此链接 - 任何通过该链接注册的人都会映射到您，并且您可以从他们的付款中赚取佣金。
        </p>
      </div>

      <Card className="max-w-2xl">
        <label className="text-sm text-gray-500">您的合作伙伴代码</label>
        <div className="flex items-center gap-3 mt-1.5">
          <div className="flex-1 px-4 py-3 rounded-xl bg-purple-50 text-purple-700 font-bold tracking-[0.2em] text-center">
            {code || '—'}
          </div>
          <Button variant="outline" onClick={() => copy(code, 'Partner code')}>
            <Copy className="w-4 h-4" /> 复制
          </Button>
        </div>

        <label className="text-sm text-gray-500 block mt-5">您的推荐链接</label>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-1.5">
          <div className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-sm text-gray-700 truncate">
            {link || '—'}
          </div>
          <Button onClick={() => copy(link, 'Referral link')}>
            <Copy className="w-4 h-4" /> 复制
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 mt-4">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            <MessageCircle className="w-4 h-4" /> 在 WhatsApp 上分享
          </a>
          <a
            href={`mailto:?subject=${encodeURIComponent('Join this WhatsApp Business platform')}&body=${encodeURIComponent(shareText)}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            <Mail className="w-4 h-4" /> 通过电子邮件分享
          </a>
        </div>
      </Card>

      <Card className="max-w-2xl">
        <h3 className="text-base font-semibold text-gray-900 mb-3">它是如何工作的</h3>
        <ol className="space-y-2 text-sm text-gray-600">
          <li>1. 与可以使用此平台的企业分享您的推荐链接。</li>
          <li>2. 当他们通过您的链接注册时，他们会自动映射到您作为客户。</li>
          <li>3. 当他们支付计划费用或充值钱包时，您会自动赚取佣金。</li>
          <li>4. 您的佣金将直接存入您的合作伙伴钱包 - 随时跟踪并请求提款。</li>
        </ol>
      </Card>
    </div>
  );
}
