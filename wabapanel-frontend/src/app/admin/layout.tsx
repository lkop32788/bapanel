'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import AdminSidebar from '@/components/layout/AdminSidebar';
import Header from '@/components/layout/Header';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, loadUser, isLoading } = useAuthStore();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { (() => { try { sessionStorage.setItem('postLoginRedirect', window.location.pathname + window.location.search); } catch { /* */ } router.push('/auth/login'); })(); return; }
    if (!isAuthenticated) { loadUser().then(() => setReady(true)).catch(() => router.push('/auth/login')); }
    else setReady(true);
  }, [isAuthenticated, loadUser, router]);

  useEffect(() => {
    if (ready && user && !['super_admin', 'admin'].includes(user.role)) {
      router.push('/client/dashboard');
    }
  }, [ready, user, router]);

  if (isLoading || !ready) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header isAdmin />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
