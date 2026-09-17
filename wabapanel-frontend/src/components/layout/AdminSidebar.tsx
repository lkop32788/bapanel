'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import useBranding from '@/lib/useBranding';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, User, Shield, Globe, Settings, Brain, Languages, ChevronDown, ChevronRight, Menu, X, LogOut, Store, Megaphone, Activity, ToggleRight, Trash2, Handshake, UserCheck, IndianRupee, Banknote, ShieldCheck, BarChart3 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { OmniNavIcon, OmniSidebarBrand } from '@/components/layout/OmniSidebar';
import { useAuthStore } from '@/stores/authStore';
import { adminPartnersApi } from '@/lib/api';
import useKkhsTheme from '@/lib/useKkhsTheme';
import { usePins, PinStar, KkhsBrandbar, KkhsPinned } from '@/components/kkhs/KkhsNav';

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href?: string;
  children?: { label: string; href: string; icon: React.ReactNode }[];
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, href: '/admin/dashboard' },
  { label: 'Vendors', icon: <Store className="w-5 h-5" />, href: '/admin/vendors' },
  { label: 'Feature Controls', icon: <ToggleRight className="w-5 h-5" />, href: '/admin/features' },
  { label: 'Data Cleanup', icon: <Trash2 className="w-5 h-5" />, href: '/admin/data-cleanup' },
  { label: 'System Health', icon: <Activity className="w-5 h-5" />, href: '/admin/system' },
  { label: 'One Click Signup', icon: <FacebookIcon className="w-5 h-5 text-blue-600" />, href: '/admin/one-click-signup' },
  {
    label: 'Settings',
    icon: <Settings className="w-5 h-5" />,
    children: [
      { label: 'My Profile', href: '/admin/profile', icon: <User className="w-4 h-4" /> },
      { label: 'Site Settings', href: '/admin/site-settings', icon: <Globe className="w-4 h-4" /> },
      { label: 'System Settings', href: '/admin/settings', icon: <Settings className="w-4 h-4" /> },
      { label: 'AI Intelligence', href: '/admin/ai', icon: <Brain className="w-4 h-4" /> },
      { label: 'Permissions', href: '/admin/permissions', icon: <Shield className="w-4 h-4" /> },
      { label: 'Knowledge Base', href: '/admin/knowledge', icon: <Brain className="w-4 h-4" /> },
      { label: 'Staff & Members', href: '/admin/users', icon: <Users className="w-4 h-4" /> },
      { label: 'Languages', href: '/admin/languages', icon: <Languages className="w-4 h-4" /> },
    ],
  },
  
];

// Premium add-on: only rendered when the affiliate module is licensed for this panel.
const affiliateNav: NavItem = {
  label: 'Affiliate Partners',
  icon: <Handshake className="w-5 h-5" />,
  children: [
    { label: 'Dashboard', href: '/admin/affiliate-partners/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { label: 'Partners', href: '/admin/affiliate-partners/partners', icon: <Users className="w-4 h-4" /> },
    { label: 'Referrals', href: '/admin/affiliate-partners/referrals', icon: <UserCheck className="w-4 h-4" /> },
    { label: 'Commissions', href: '/admin/affiliate-partners/commissions', icon: <IndianRupee className="w-4 h-4" /> },
    { label: 'Withdraw Requests', href: '/admin/affiliate-partners/withdraw-requests', icon: <Banknote className="w-4 h-4" /> },
    { label: 'KYC', href: '/admin/affiliate-partners/kyc', icon: <ShieldCheck className="w-4 h-4" /> },
    { label: 'Announcements', href: '/admin/affiliate-partners/announcements', icon: <Megaphone className="w-4 h-4" /> },
    { label: 'Reports', href: '/admin/affiliate-partners/reports', icon: <BarChart3 className="w-4 h-4" /> },
    { label: 'Settings', href: '/admin/affiliate-partners/settings', icon: <Settings className="w-4 h-4" /> },
  ],
};

export default function AdminSidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { logout, user } = useAuthStore();
  const [affiliateLicensed, setAffiliateLicensed] = useState(false);

  useEffect(() => {
    adminPartnersApi.module()
      .then((r) => setAffiliateLicensed(!!r.data.data?.licensed))
      .catch(() => setAffiliateLicensed(false));
  }, []);

  const items = affiliateLicensed
    ? navItems.flatMap((item) => (item.label === 'Vendors' ? [item, affiliateNav] : [item]))
    : navItems;

  const toggleSection = (label: string) => {
    setExpandedSections((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [label]
    );
  };

  const brand = useBranding();
  const kkhs = useKkhsTheme();
  const { pins, toggle: togglePin, isPinned } = usePins('admin');
  const flatNav = items.flatMap(s => s.href
    ? [{ label: s.label, href: s.href, icon: s.icon }]
    : (s.children || []).map(c => ({ label: c.label, href: c.href, icon: c.icon })));

  const sidebar = (
    <div className="flex flex-col h-full" data-kkhs-side="admin">
      {kkhs ? (
        <KkhsBrandbar logo={brand.logo} name={brand.name} sub={`${user?.role === 'super_admin' ? "超级管理员" : "管理员"} · ${user?.name || ''}`} />
      ) : (
      <OmniSidebarBrand logo={brand.logo} name={brand.name} />
      )}

      {kkhs && (
        <KkhsPinned items={flatNav} pins={pins} pathname={pathname} onToggle={togglePin} onNavigate={() => setMobileOpen(false)} />
      )}

      <nav className="flex-1 overflow-y-auto py-2" data-kkhs-nav>
        {items.map((section) => (
          <div key={section.label} className="mb-1" data-kkhs-grp={expandedSections.includes(section.label) ? 'open' : ''}>
            {section.href ? (
              <Link
                href={section.href}
                onClick={() => setMobileOpen(false)}
                title={t(section.label)} aria-label={t(section.label)} data-kkhs-ghead={pathname === section.href ? 'on' : ''}
                className={`flex items-center gap-2 w-[calc(100%-16px)] mx-2 px-3 py-2 text-base font-bold tracking-wide rounded-xl transition-colors ${
                  pathname === section.href
                    ? 'text-emerald-600 bg-emerald-50'
                    : 'text-gray-900 hover:bg-gray-100/70'
                }`}
              >
                <OmniNavIcon label={section.label} fallback={section.icon} /> <span className="flex-1 min-w-0 truncate"><span data-ui-nav-label>{t(section.label)}</span></span>
                {kkhs && <PinStar pinned={isPinned(section.href)} onToggle={() => togglePin(section.href!)} />}
              </Link>
            ) : (
              <>
                <button
                  onClick={() => toggleSection(section.label)}
                  title={t(section.label)} aria-label={t(section.label)} data-kkhs-ghead=""
                  className="flex items-center justify-between w-[calc(100%-16px)] mx-2 px-3 py-2 text-base font-bold text-gray-900 tracking-wide hover:bg-gray-100/70 rounded-xl transition-colors"
                >
                  <span className="flex items-center gap-2"><OmniNavIcon label={section.label} fallback={section.icon} /> <span data-ui-nav-label>{t(section.label)}</span></span>
                  {expandedSections.includes(section.label) ? <ChevronDown className="w-3 h-3" data-kkhs-cv /> : <ChevronRight className="w-3 h-3" data-kkhs-cv />}
                </button>
                {expandedSections.includes(section.label) && (
                <div data-kkhs-gkids>
                {section.children?.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    title={t(item.label)} aria-label={t(item.label)} data-kkhs-ni={pathname === item.href ? 'on' : ''}
                    className={`flex items-center gap-3 pl-3 pr-4 py-1.5 mr-2 text-[13px] font-bold border-l-2 ml-5 rounded-r-xl transition-colors ${
                      pathname === item.href
                        ? 'text-emerald-600 bg-emerald-50 border-l-emerald-600 shadow-sm shadow-emerald-600/5'
                        : 'text-gray-500 border-l-gray-200 hover:bg-gray-50 hover:text-gray-900 hover:border-l-gray-400'
                    }`}
                  >
                    <OmniNavIcon label={item.label} fallback={item.icon} />
                    <span className="flex-1"><span data-ui-nav-label>{t(item.label)}</span></span>
                    {kkhs && <PinStar pinned={isPinned(item.href)} onToggle={() => togglePin(item.href)} />}
                  </Link>
                ))}
                </div>
                )}
              </>
            )}
          </div>
        ))}
      </nav>

      <div className="border-t border-gray-200 p-4" data-kkhs-userfoot>
        <div className="flex items-center gap-3">
          <Link href="/admin/profile" className="flex items-center gap-3 flex-1 min-w-0 rounded-lg -m-1 p-1 hover:bg-gray-50" title={"个人资料"}>
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-medium text-emerald-700">
              {user?.name?.charAt(0) || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{translateDisplay(user?.role)}</p>
            </div>
          </Link>
          <button onClick={logout} className="text-gray-400 hover:text-red-600" title={"退出登录"}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button data-ui-nav-toggle
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />}
      <aside data-kkhs-aside="admin" className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-100 shadow-[1px_0_8px_rgba(0,0,0,0.03)] transition-transform lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {sidebar}
      </aside>
    </>
  );
}
