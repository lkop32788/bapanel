'use client';
import { useI18n } from '@/lib/i18n';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import VoiceShell from './VoiceShell';

export interface FlatNavItem { label: string; href: string; icon: React.ReactNode }

const key = (panel: string) => `kkhs-pins-${panel}`;

export function usePins(panel: 'client' | 'admin') {
  const [pins, setPins] = useState<string[]>([]);
  useEffect(() => {
    try { setPins(JSON.parse(localStorage.getItem(key(panel)) || '[]')); } catch { setPins([]); }
  }, [panel]);
  const toggle = useCallback((href: string) => {
    setPins(prev => {
      const next = prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href];
      try { localStorage.setItem(key(panel), JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, [panel]);
  return { pins, toggle, isPinned: (href: string) => pins.includes(href) };
}

export function PinStar({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      data-kkhs-pin={pinned ? 'on' : 'off'}
      title={pinned ? "取消固定" : "固定到顶部"}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
    >
      <Star className="w-3.5 h-3.5" fill={pinned ? 'currentColor' : 'none'} />
    </button>
  );
}

export function KkhsBrandbar({ logo, name, sub }: { logo?: string; name: string; sub?: string }) {
  const [rail, setRail] = useState(false);
  useEffect(() => {
    const r = localStorage.getItem('kkhs-rail') === '1';
    setRail(r);
    document.documentElement.setAttribute('data-kkhs-rail', r ? '1' : '0');
    return () => { document.documentElement.removeAttribute('data-kkhs-rail'); };
  }, []);
  const toggle = () => {
    const r = !rail;
    setRail(r);
    localStorage.setItem('kkhs-rail', r ? '1' : '0');
    document.documentElement.setAttribute('data-kkhs-rail', r ? '1' : '0');
  };
  return (
    <div data-kkhs-brandbar>
      {logo ? <img src={logo} alt={name} /> : <div data-kkhs-logo>{(name || 'W').charAt(0).toUpperCase()}</div>}
      <div className="min-w-0 flex-1">
        <b>{name}</b>
        {sub && <span>{sub}</span>}
      </div>
      <button type="button" data-kkhs-collapse onClick={toggle} title={rail ? "展开菜单" : "折叠菜单"} className="hidden lg:inline-grid">
        {rail ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
      </button>
      <VoiceShell />
    </div>
  );
}

export function KkhsPinned({
  items, pins, pathname, onToggle, onNavigate,
}: {
  items: FlatNavItem[]; pins: string[]; pathname: string | null; onToggle: (href: string) => void; onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const list = pins.map(h => items.find(i => i.href === h)).filter(Boolean) as FlatNavItem[];
  if (!list.length) return null;
  return (
    <div data-kkhs-pins>
      <p><Star className="w-2.5 h-2.5" fill="currentColor" /> 固定</p>
      {list.map(item => (
        <Link key={item.href} href={item.href} onClick={onNavigate} data-kkhs-ni={(pathname === item.href || (!item.href.includes('?') && (pathname || '').split('?')[0] === item.href)) ? 'on' : ''} data-kkhs-ch={item.href.match(/channel=([a-z_]+)/)?.[1] || undefined}>
          {item.icon}
          <span>{t(item.label)}</span>
          <PinStar pinned onToggle={() => onToggle(item.href)} />
        </Link>
      ))}
    </div>
  );
}


