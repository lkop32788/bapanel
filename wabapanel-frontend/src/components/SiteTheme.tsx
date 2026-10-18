'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { fetchSiteTheme, type SiteThemeData } from '@/lib/siteTheme';

const PUBLIC_PREFIXES = ['/auth', '/about', '/contact', '/team', '/features', '/privacy', '/terms', '/blog', '/knowledge-base', '/p/'];

function isPublicPath(path: string) {
  return path === '/' || PUBLIC_PREFIXES.some(p => path === p || path.startsWith(p + '/') || path.startsWith(p));
}

// `initial` comes from the server (root layout) so a public page paints with the
// panel's own theme immediately instead of restyling after a client fetch.
export default function SiteTheme({ initial }: { initial?: SiteThemeData | null }) {
  const pathname = usePathname() || '/';
  const showInitial = !!initial && isPublicPath(pathname);
  useEffect(() => {
    const root = document.documentElement;
    const old = document.getElementById('site-theme-css');
    if (!isPublicPath(pathname)) {
      root.removeAttribute('data-site-theme');
      if (old) old.remove();
      return;
    }
    // A ?previewTheme=... link must still override the server-rendered theme.
    if (initial && !new URLSearchParams(window.location.search).get('previewTheme')) return;
    fetchSiteTheme().then(t => {
      root.setAttribute('data-site-theme', t.id);
      let style = document.getElementById('site-theme-css') as HTMLStyleElement | null;
      if (!style) { style = document.createElement('style'); style.id = 'site-theme-css'; document.head.appendChild(style); }
      style.textContent = t.css || '';
      if (t.font && t.font !== 'Inter') {
        const id = 'site-theme-font';
        let link = document.getElementById(id) as HTMLLinkElement | null;
        if (!link) { link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; document.head.appendChild(link); }
        link.href = `https://fonts.googleapis.com/css2?family=${t.font.replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap`;
      }
    });
  }, [pathname, initial]);
  if (!showInitial || !initial) return null;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: `document.documentElement.setAttribute('data-site-theme',${JSON.stringify(initial.id)});` }} />
      <style id="site-theme-css" dangerouslySetInnerHTML={{ __html: initial.css || '' }} />
      {initial.font && initial.font !== 'Inter' ? (
        <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${initial.font.replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap`} />
      ) : null}
    </>
  );
}
