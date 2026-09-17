'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const PANEL_PREFIXES = ['/admin', '/client', '/auth', '/install'];

// Snippets can mount their own DOM (a chat widget button/panel) which removing the
// <script> tag does not undo, so widgets expose a destroy hook we call on cleanup.
function unloadWidgets() {
  const w = window as unknown as { __wabaWidgetDestroy?: (() => void) | null };
  if (typeof w.__wabaWidgetDestroy === 'function') {
    try { w.__wabaWidgetDestroy(); } catch { /* already gone */ }
  }
}

/**
 * Runs the embed snippet the admin pasted in Site Settings -> Embed Code on the
 * public website only. innerHTML never executes scripts, so each node is
 * recreated before mounting.
 */
export default function CustomCodeInjector({ code }: { code?: string }) {
  const pathname = usePathname();

  useEffect(() => {
    const html = (code || '').trim();
    if (!html || PANEL_PREFIXES.some((p) => (pathname || '').startsWith(p))) {
      unloadWidgets();
      return;
    }
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const mounted: Node[] = [];
    Array.from(holder.childNodes).forEach((node) => {
      if (node instanceof HTMLScriptElement) {
        const s = document.createElement('script');
        Array.from(node.attributes).forEach((a) => s.setAttribute(a.name, a.value));
        s.text = node.text;
        document.body.appendChild(s);
        mounted.push(s);
      } else {
        document.body.appendChild(node);
        mounted.push(node);
      }
    });
    return () => {
      mounted.forEach((n) => { if (n.parentNode) n.parentNode.removeChild(n); });
      unloadWidgets();
    };
  }, [code, pathname]);

  return null;
}
