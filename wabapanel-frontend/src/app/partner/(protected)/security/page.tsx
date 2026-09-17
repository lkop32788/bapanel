'use client';
import React from 'react';
import AccountSecurity from '@/components/AccountSecurity';

export default function PartnerSecurityPage() {
  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold">安全</h1>
        <p className="text-emerald-50 text-sm mt-1">通过双因素身份验证保护您的合作伙伴账户</p>
      </div>
      <AccountSecurity />
    </div>
  );
}
