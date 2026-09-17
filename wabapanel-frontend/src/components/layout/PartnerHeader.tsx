'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, ChevronDown, Globe, RefreshCw, Wallet, X } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import { usePartnerAnnouncementStore } from '@/stores/partnerAnnouncementStore';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { announcementLabel, announcementVariant, inr } from '@/lib/affiliateLabels';
import { useI18n, LANGUAGES } from '@/lib/i18n';

export default function PartnerHeader() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const { items, load, markRead } = usePartnerAnnouncementStore();
  const account = usePartnerAuthStore((s) => s.account);
  const unread = items.filter((a) => !a.read);
  const { lang, setLang } = useI18n();
  const [showLang, setShowLang] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      if (langRef.current && !langRef.current.contains(e.target as Node)) setShowLang(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleClearCache = async () => {
    setClearing(true);
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      window.location.reload();
    } catch { window.location.reload(); }
  };

  return (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30 flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-4 flex-1">

      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 ring-1 ring-inset ring-emerald-600/10 rounded-full">
          <Wallet className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-medium text-emerald-700">{inr(account?.walletBalance)}</span>
        </div>
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setShowLang(!showLang)}
            title={"切换界面语言"}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <Globe className="w-4 h-4" />
            <span className="hidden sm:inline">{(LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0]).name}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>
          {showLang && (
            <div className="absolute right-0 top-full mt-2 w-44 max-h-80 overflow-y-auto bg-white rounded-xl shadow-xl ring-1 ring-gray-100 z-50 py-1">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => { setLang(l.code); setShowLang(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${l.code === lang ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-700'}`}
                >
                  {l.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleClearCache}
          disabled={clearing}
          title={"清除缓存并刷新"}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-emerald-600 rounded-full border border-gray-200 hover:bg-emerald-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${clearing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">清除缓存</span>
        </button>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="relative p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          title={"公告"}
        >
          <Bell className="w-5 h-5" />
          {unread.length > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl ring-1 ring-gray-100 z-50 overflow-hidden max-h-96 flex flex-col">
            <div className="p-3 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">公告</h4>
              <button onClick={() => setOpen(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">还没有公告</div>
              ) : (
                items.slice(0, 6).map((a) => (
                  <button
                    key={a._id}
                    onClick={() => markRead([a._id])}
                    className={`w-full text-left px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${!a.read ? 'bg-emerald-50/50' : ''}`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {!a.read && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                      <Badge variant={announcementVariant[a.type]} size="sm">{announcementLabel[a.type]}</Badge>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(a.postDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </button>
                ))
              )}
            </div>
            <div className="p-2 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => markRead(items.map((a) => a._id))}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium px-2 py-1"
              >
                将全部标记为已读
              </button>
              <Link href="/partner/announcements" onClick={() => setOpen(false)} className="text-xs text-emerald-600 hover:underline font-medium px-2 py-1">
                查看全部
              </Link>
            </div>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
