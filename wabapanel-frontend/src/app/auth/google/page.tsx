'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

// Landing page for the Google OAuth callback: stores the token issued by the API
// and sends the user to their dashboard.
function GoogleLanding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loadUser } = useAuthStore();

  useEffect(() => {
    const token = searchParams.get('token');
    const next = searchParams.get('next') || '/client/dashboard';
    if (!token) { router.replace('/auth/login?google_error=failed'); return; }
    localStorage.setItem('token', token);
    loadUser().then(() => {
      const u = useAuthStore.getState().user;
      if (!u) { router.replace('/auth/login?google_error=failed'); return; }
      toast.success(translateApiMessage("使用 Google 登录"));
      const isAdmin = u.role === 'admin' || u.role === 'super_admin';
      router.replace(next.startsWith('/admin') && !isAdmin ? '/client/dashboard' : next);
    }).catch(() => {
      localStorage.removeItem('token');
      router.replace('/auth/login?google_error=failed');
    });
  }, [searchParams, loadUser, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400">正在为您签名……</p>
    </div>
  );
}

export default function GoogleAuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-400">加载中…</p></div>}>
      <GoogleLanding />
    </Suspense>
  );
}
