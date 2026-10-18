'use client';
import { useI18n } from '@/lib/i18n';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, CornerDownLeft, Sun, Moon, Monitor } from 'lucide-react';
import { navItems as clientNav } from '@/components/layout/ClientSidebar';
import { navItems as adminNav } from '@/components/layout/AdminSidebar';

interface Cmd { label: string; group: string; href: string; icon: React.ReactNode }

function flatten(isAdmin: boolean): Cmd[] {
  const src = isAdmin ? adminNav : clientNav;
  const out: Cmd[] = [];
  src.forEach(s => {
    if (s.href) out.push({ label: s.label, group: isAdmin ? 'Admin' : 'Client', href: s.href, icon: s.icon });
    (s.children || []).forEach(c => out.push({ label: c.label, group: s.label, href: c.href, icon: c.icon }));
  });
  return out;
}

export function KkhsCrumb({ isAdmin }: { isAdmin?: boolean }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const sp = useSearchParams();
  const items = useMemo(() => flatten(!!isAdmin), [isAdmin]);
  const full = pathname + (sp?.toString() ? `?${sp.toString()}` : '');
  const hit = items.find(i => i.href === full) || items.find(i => i.href === pathname)
    || items.filter(i => !i.href.includes('?') && pathname?.startsWith(i.href + '/')).sort((a, b) => b.href.length - a.href.length)[0];
  const label = hit?.label || (pathname?.split('/').filter(Boolean).pop() || '').replace(/[-_]/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  return (
    <div data-kkhs-crumb>
      {isAdmin ? "管理员" : "客户端"}{hit && hit.group !== 'Client' && hit.group !== 'Admin' ? <> / {t(hit.group)}</> : null} / <b>{t(label)}</b>
    </div>
  );
}

export function KkhsCmdk({ isAdmin }: { isAdmin?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const items = useMemo(() => flatten(!!isAdmin), [isAdmin]);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);

  const s = q.trim().toLowerCase();
  const list = (s ? items.filter(i => t(i.label).toLowerCase().includes(s) || t(i.group).toLowerCase().includes(s)) : items).slice(0, 12);

  const go = (c: Cmd) => { setOpen(false); router.push(c.href); };

  return (
    <>
      <button type="button" data-kkhs-cmdk onClick={() => setOpen(true)} title={"转到页面"}>
        <Search className="w-3.5 h-3.5" />
        <span>搜索页面、工具等等......</span>
        <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      {open && (
        <div data-kkhs-cmdk-overlay onMouseDown={() => setOpen(false)}>
          <div data-kkhs-cmdk-panel onMouseDown={e => e.stopPropagation()}>
            <div data-kkhs-cmdk-input>
              <Search className="w-4 h-4" />
              <input
                ref={inputRef}
                value={q}
                onChange={e => { setQ(e.target.value); setIdx(0); }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, list.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
                  if (e.key === 'Enter' && list[idx]) go(list[idx]);
                }}
                placeholder={"跳转到页面..."}
                autoComplete="off"
              />
              <kbd>esc</kbd>
            </div>
            <div data-kkhs-cmdk-list>
              {list.length === 0 && <div data-kkhs-cmdk-empty>没有匹配项</div>}
              {list.map((c, i) => (
                <button key={c.href} type="button" data-kkhs-cmdk-item={i === idx ? 'on' : ''} onMouseEnter={() => setIdx(i)} onClick={() => go(c)}>
                  {c.icon}
                  <span>{t(c.label)}</span>
                  <small>{t(c.group)}</small>
                  {i === idx && <CornerDownLeft className="w-3 h-3" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type Mode = 'light' | 'dark' | 'system';
const applyMode = (m: Mode) => {
  const dark = m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  localStorage.setItem('darkMode', String(dark));
};

const ACCENTS = ['#12876A', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#0D9488', '#DC2626', '#4B5563'];
function applyAccent(hex: string) {
  const el = document.documentElement;
  if (hex) { el.style.setProperty('--k-accent', hex); el.setAttribute('data-kkhs-accent', '1'); }
  else { el.style.removeProperty('--k-accent'); el.removeAttribute('data-kkhs-accent'); }
}

export function KkhsThemeMenu() {
  const [mode, setMode] = useState<Mode>('light');
  const [accent, setAccent] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const saved = localStorage.getItem('kkhs-theme-mode') as Mode | null;
    const m: Mode = saved || (localStorage.getItem('darkMode') === 'true' ? 'dark' : 'light');
    setMode(m); applyMode(m);
    const a = localStorage.getItem('kkhs-accent') || '';
    setAccent(a); applyAccent(a);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => { if ((localStorage.getItem('kkhs-theme-mode') || 'light') === 'system') applyMode('system'); };
    mq.addEventListener('change', onMq);
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => { mq.removeEventListener('change', onMq); document.removeEventListener('mousedown', onDoc); };
  }, []);
  const pick = (m: Mode) => { setMode(m); localStorage.setItem('kkhs-theme-mode', m); applyMode(m); setOpen(false); };
  const pickAccent = (hex: string) => { setAccent(hex); if (hex) localStorage.setItem('kkhs-accent', hex); else localStorage.removeItem('kkhs-accent'); applyAccent(hex); };
  const Icon = mode === 'dark' ? Moon : mode === 'system' ? Monitor : Sun;
  return (
    <div data-kkhs-thm ref={ref}>
      <button type="button" data-kkhs-ib onClick={() => setOpen(o => !o)} title={"主题"} aria-label={"主题"}><Icon className="w-4 h-4" /></button>
      {open && (
        <div data-kkhs-thm-menu role="menu">
          <button type="button" data-on={mode === 'light' ? '1' : '0'} onClick={() => pick('light')}><Sun /> 光</button>
          <button type="button" data-on={mode === 'dark' ? '1' : '0'} onClick={() => pick('dark')}><Moon /> 黑暗</button>
          <button type="button" data-on={mode === 'system' ? '1' : '0'} onClick={() => pick('system')}><Monitor /> 系统</button>
          <div data-kkhs-acc>
            <p>主题色</p>
            <div data-kkhs-acc-row>
              {ACCENTS.map(c => (
                <button key={c} type="button" data-kkhs-sw data-on={accent === c ? '1' : '0'} style={{ background: c }} title={c} aria-label={c} onClick={() => pickAccent(c)} />
              ))}
              <label data-kkhs-sw data-kkhs-sw-custom data-on={accent && !ACCENTS.includes(accent) ? '1' : '0'} title={"自定义颜色"} style={accent && !ACCENTS.includes(accent) ? { background: accent } : undefined}>
                <input type="color" value={accent || '#12876A'} onChange={e => pickAccent(e.target.value)} />
              </label>
            </div>
            {accent && <button type="button" data-kkhs-acc-reset onClick={() => pickAccent('')}>重置为默认值</button>}
          </div>
        </div>
      )}
    </div>
  );
}
