'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, LogOut, Menu, X } from 'lucide-react';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { partnerNavItems } from '@/lib/partnerNav';
import useBranding from '@/lib/useBranding';
import ThemePicker from '@/components/layout/ThemePicker';

export default function PartnerSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, logout } = usePartnerAuthStore();
  const brand = useBranding();
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => { setIsImpersonating(!!localStorage.getItem('adminToken')); }, []);

  const handleLogout = () => {
    logout();
    router.push('/partner/login');
  };

  const backToAdmin = () => {
    const at = localStorage.getItem('adminToken');
    if (!at) return;
    localStorage.setItem('token', at);
    localStorage.removeItem('adminToken');
    window.location.href = '/admin/affiliate-partners/partners';
  };

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-gray-200">
        <div className="relative flex items-center justify-center min-h-[3rem]">
          {brand.logo
            ? <img src={brand.logo} alt={brand.name} className="max-w-full w-auto h-auto max-h-12 object-contain mx-auto" />
            : <h1 className="text-xl font-bold text-emerald-600 truncate">{brand.name}</h1>}
          <div className="absolute right-0 top-0"><ThemePicker /></div>
        </div>
        <p className="mt-1 text-center text-[11px] font-semibold tracking-[0.18em] uppercase text-purple-600">合作伙伴小组</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {partnerNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-2 w-[calc(100%-16px)] mx-2 mb-1 px-3 py-2 text-[15px] rounded-xl transition-colors ${
              pathname === item.href
                ? 'text-emerald-600 bg-emerald-50 font-semibold'
                : 'text-gray-800 font-medium hover:bg-gray-100/70'
            }`}
          >
            {item.icon} {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-gray-200 p-4">
        {isImpersonating && (
          <button onClick={backToAdmin} className="flex items-center gap-2 w-full mb-3 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 text-sm font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" /> 返回管理
          </button>
        )}
        <div className="flex items-center gap-3">
          <Link href="/partner/profile" className="flex items-center gap-3 flex-1 min-w-0" onClick={() => setMobileOpen(false)}>
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-medium text-emerald-700 shrink-0">
              {profile?.name?.charAt(0)?.toUpperCase() || 'P'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{profile?.name || "合作伙伴"}</p>
              <p className="text-xs text-gray-500 truncate">{profile?.email || "附属合作伙伴"}</p>
            </div>
          </Link>
          <button onClick={handleLogout} className="text-gray-400 hover:text-red-600 shrink-0" title={"退出登录"}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-100 shadow-[1px_0_8px_rgba(0,0,0,0.03)] transition-transform lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {sidebar}
      </aside>
    </>
  );
}
