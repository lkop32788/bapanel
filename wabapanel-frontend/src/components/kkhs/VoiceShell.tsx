'use client';

/**
 * New UI (Voice v3) shell extras.
 *
 * Renders three things that the design asks for and the existing sidebar /
 * header markup has no place for, using portals so no page component has to
 * change:
 *   - the "Menu colour" picker (presets + a custom colour), saved per browser,
 *   - a clock pill in the top bar.
 * Both live in the top bar so the side menu keeps its full height for links.
 *
 * Every piece degrades to nothing if its host element is missing, so a page
 * that renders no sidebar simply gets no extras.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Palette } from 'lucide-react';

const PRESETS: { id: string; label: string; swatch: string }[] = [
  { id: 'blue', label: "蓝色", swatch: 'linear-gradient(135deg,#4d7bff,#1c2f8f)' },
  { id: 'violet', label: "紫罗兰色", swatch: 'linear-gradient(135deg,#8f74ee,#3b1f8f)' },
  { id: 'teal', label: "青色", swatch: 'linear-gradient(135deg,#2fc0aa,#05493f)' },
  { id: 'sunset', label: "日落", swatch: 'linear-gradient(135deg,#ff9640,#7a2a12)' },
  { id: 'night', label: "晚上", swatch: 'linear-gradient(135deg,#3a3f4c,#0c0d12)' },
  { id: 'slate', label: "石板", swatch: 'linear-gradient(135deg,#7d8798,#2b3340)' },
  { id: 'light', label: "光", swatch: 'linear-gradient(135deg,#ffffff,#e4e8f2)' },
];

const SIDE_KEY = 'wp-side';
const CUSTOM_KEY = 'wp-side-custom';

function toRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [40, 87, 224];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const shade = (c: number[], k: number) => `rgb(${c.map((v) => clamp(k < 0 ? v * (1 + k) : v + (255 - v) * k)).join(' ')})`;

function applySide(side: string, custom?: string | null) {
  const el = document.documentElement;
  if (side === 'custom' && custom) {
    const c = toRgb(custom);
    el.style.setProperty('--v-c1', shade(c, -0.35));
    el.style.setProperty('--v-c2', shade(c, 0));
    el.style.setProperty('--v-c3', shade(c, -0.25));
    el.style.setProperty('--v-c4', shade(c, -0.55));
    el.style.setProperty('--v-c-accent', shade(c, 0));
    el.style.setProperty('--v-c-soft', shade(c, 0.88));
  }
  el.setAttribute('data-side', side);
}

/** Creates a host element next to `selector` and returns it once it exists. */
function usePortalHost(selector: string): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let node: HTMLElement | null = null;
    let timer = 0;
    let tries = 0;
    const attach = () => {
      const target = document.querySelector(selector);
      if (!target || !target.parentNode) {
        if (tries++ < 25) timer = window.setTimeout(attach, 200);
        return;
      }
      node = document.createElement('div');
      node.style.display = 'contents';
      target.insertBefore(node, target.firstChild);
      setHost(node);
    };
    attach();
    return () => {
      window.clearTimeout(timer);
      if (node && node.parentNode) node.parentNode.removeChild(node);
      setHost(null);
    };
  }, [selector]);
  return host;
}

function Clock() {
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    tick();
    const iv = window.setInterval(tick, 30000);
    return () => window.clearInterval(iv);
  }, []);
  if (!now) return null;
  return <span className="v-clock">{now}</span>;
}

function ColourPicker() {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState('');
  const [custom, setCustom] = useState('#2857e0');
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ right: number; top: number }>({ right: 16, top: 72 });

  useEffect(() => {
    // No preset until someone picks one: the panel's own brand colour (or the
    // admin console's violet) stays in charge by default.
    let saved: string | null = null;
    let savedCustom: string | null = null;
    try {
      saved = localStorage.getItem(SIDE_KEY);
      savedCustom = localStorage.getItem(CUSTOM_KEY);
    } catch { /* private mode */ }
    if (savedCustom) setCustom(savedCustom);
    if (saved) {
      setSide(saved);
      applySide(saved, savedCustom);
    } else {
      setSide('');
    }
    return () => { document.documentElement.removeAttribute('data-side'); };
  }, []);

  const pick = useCallback((id: string, hex?: string) => {
    setSide(id);
    applySide(id, hex || custom);
    try {
      localStorage.setItem(SIDE_KEY, id);
      if (hex) localStorage.setItem(CUSTOM_KEY, hex);
    } catch { /* private mode */ }
  }, [custom]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current && btnRef.current.contains(t)) return;
      const pop = document.querySelector('.v-picker');
      if (pop && pop.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ right: Math.max(8, Math.round(window.innerWidth - r.right)), top: Math.round(r.bottom + 10) });
    setOpen((o) => !o);
  };

  return (
    <>
      <button type="button" ref={btnRef} className="v-colour" onClick={toggle} aria-expanded={open} title={"菜单颜色"}>
        <Palette aria-hidden="true" /><span>菜单颜色</span>
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div className="v-picker" style={{ right: pos.right, top: pos.top }}>
          <div className="v-core">
            <h4>菜单颜色</h4>
            <div className="v-sw">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" data-on={side === p.id ? '1' : '0'} onClick={() => pick(p.id)} title={p.label}>
                  <i style={{ background: p.swatch }} />
                  {p.label}
                </button>
              ))}
            </div>
            <div className="v-custom">
              <label htmlFor="v-side-custom">自定义颜色</label>
              <input
                id="v-side-custom"
                type="color"
                value={custom}
                onChange={(e) => { setCustom(e.target.value); pick('custom', e.target.value); }}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default function VoiceShell() {
  const topHost = usePortalHost('[data-kkhs-top-actions]');
  return topHost ? createPortal(<><Clock /><ColourPicker /></>, topHost) : null;
}
