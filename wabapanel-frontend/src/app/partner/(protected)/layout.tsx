'use client';
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import PartnerSidebar from '@/components/layout/PartnerSidebar';
import PartnerHeader from '@/components/layout/PartnerHeader';

// Route protection for the Partner Portal. Reads usePartnerAuthStore only, so
// an admin/vendor session can never render partner pages.
export default function PartnerProtectedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, loadPartner } = usePartnerAuthStore();
  const router = useRouter();

  useEffect(() => { loadPartner(); }, [loadPartner]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/partner/login');
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <PartnerSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <PartnerHeader />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
