'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function PwaProvider({ apiBase = '/api' }: { apiBase?: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const handler = (e: Event) => {
      e.preventDefault();
      (window as unknown as { deferredPwaPrompt?: Event }).deferredPwaPrompt = e;
      window.dispatchEvent(new CustomEvent('pwa-installable'));
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Installing from the admin panel must produce an app that reopens on the admin
  // dashboard; from the user panel it reopens the user dashboard.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const admin = (pathname || '').startsWith('/admin');
    link.href = `${apiBase.replace(/\/$/, '')}/public/manifest.webmanifest${admin ? '?scope=admin' : ''}`;
  }, [pathname, apiBase]);

  return null;
}
