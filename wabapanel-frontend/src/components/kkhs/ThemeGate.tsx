'use client';

/**
 * KKHS Theme 2026 — ThemeGate
 *
 * Decides whether the new theme is allowed on this install and sets
 * data-kkhs="on" / data-kkhs-panel="client|admin" on <html>. Renders no
 * markup. If the decision is "no", every CSS rule in the theme stays inert.
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { shouldEnableTheme } from '@/lib/kkhsTheme';

const FONTS_ID = 'kkhs-fonts';
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap';

export default function ThemeGate() {
  const pathname = usePathname();
  const [on, setOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await shouldEnableTheme();
      if (cancelled || !ok) return;
      document.documentElement.setAttribute('data-kkhs', 'on');
      document.documentElement.setAttribute(
        'data-kkhs-panel',
        window.location.pathname.startsWith('/admin') ? 'admin' : 'client'
      );
      if (!document.getElementById(FONTS_ID)) {
        const l = document.createElement('link');
        l.id = FONTS_ID;
        l.rel = 'stylesheet';
        l.href = FONTS_HREF;
        document.head.appendChild(l);
      }
      setOn(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!on) return;
    const panel = pathname?.startsWith('/admin') ? 'admin' : 'client';
    document.documentElement.setAttribute('data-kkhs-panel', panel);
    const seg = (pathname || '').split('/').filter(Boolean)[1] || '';
    document.documentElement.setAttribute('data-kkhs-page', seg);
  }, [on, pathname]);

  return null;
}
