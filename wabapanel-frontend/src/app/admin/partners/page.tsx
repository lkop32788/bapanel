'use client';
import React, { useState } from 'react';
import { Users, Banknote, Settings as SettingsIcon } from 'lucide-react';
import AdminPartnersPage from '../affiliate-partners/partners/page';
import AdminWithdrawalsPage from '../affiliate-partners/withdraw-requests/page';
import AffiliateSettingsPage from '../affiliate-partners/settings/page';

const TABS = [
  { key: 'partners', label: "合作伙伴", icon: Users },
  { key: 'withdrawals', label: "提款请求", icon: Banknote },
  { key: 'settings', label: "设置", icon: SettingsIcon },
] as const;

export default function AffiliateClassicPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('partners');

  return (
    <div className="space-y-6">
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'partners' && <AdminPartnersPage />}
      {tab === 'withdrawals' && <AdminWithdrawalsPage />}
      {tab === 'settings' && <AffiliateSettingsPage />}
    </div>
  );
}
