'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import useBranding from '@/lib/useBranding';
import { usePathname } from 'next/navigation';
import { ArrowLeft, LayoutDashboard, BarChart3, Users, Tags, Layers, FileText, Send, Zap, Keyboard, ShoppingBag, Share2, FormInput, Phone, UserPlus, Settings, ChevronDown, ChevronRight, Menu, X, LogOut, Database, MessageCircle, ImageIcon, Wrench, BookOpen, Brain, Plug, Sparkles, PiggyBank, Shield, Puzzle, QrCode, Bot } from 'lucide-react';
import { FaWhatsapp, FaInstagram, FaFacebook, FaTelegram, FaEnvelope } from 'react-icons/fa';
import { OmniNavIcon, OmniSidebarBrand } from '@/components/layout/OmniSidebar';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import useKkhsTheme from '@/lib/useKkhsTheme';
import { usePins, PinStar, KkhsBrandbar, KkhsPinned } from '@/components/kkhs/KkhsNav';

// Map sidebar item href → feature key for lock checking

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href?: string;
  children?: { label: string; href: string; icon: React.ReactNode }[];
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, href: '/client/dashboard' },
  { label: 'Analytics', icon: <BarChart3 className="w-5 h-5" />, href: '/client/analytics' },
  {
    label: 'Inbox',
    icon: <MessageCircle className="w-5 h-5" />,
    children: [
      { label: 'WhatsApp Inbox', href: '/client/chat?channel=whatsapp', icon: <FaWhatsapp className="w-4 h-4 text-green-600" /> },
      { label: 'WhatsApp QR Inbox', href: '/client/chat?channel=whatsapp_qr', icon: <FaWhatsapp className="w-4 h-4 text-emerald-500" /> },
      { label: 'Instagram Inbox', href: '/client/chat?channel=instagram', icon: <FaInstagram className="w-4 h-4 text-pink-600" /> },
      { label: 'Facebook Inbox', href: '/client/chat?channel=facebook', icon: <FaFacebook className="w-4 h-4 text-blue-600" /> },
      { label: 'Telegram Bot Inbox', href: '/client/chat?channel=telegram', icon: <FaTelegram className="w-4 h-4 text-sky-500" /> },
      { label: 'Personal Telegram Inbox', href: '/client/chat?channel=telegram_personal', icon: <FaTelegram className="w-4 h-4 text-sky-600" /> },
      { label: 'Email Inbox', href: '/client/chat?channel=email', icon: <FaEnvelope className="w-4 h-4 text-orange-500" /> },
    ],
  },
  {
    label: 'Campaigns',
    icon: <Send className="w-5 h-5" />,
    children: [
      { label: 'Message Templates', href: '/client/templates', icon: <FileText className="w-4 h-4" /> },
      { label: 'Broadcast', href: '/client/broadcasts', icon: <Send className="w-4 h-4" /> },
      { label: 'Smart Broadcast', href: '/client/smart-broadcast', icon: <Zap className="w-4 h-4" /> },
      { label: 'Sequence Campaigns', href: '/client/sequence-campaigns', icon: <Layers className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Save Money',
    icon: <PiggyBank className="w-5 h-5" />,
    children: [
      { label: 'Preset Templates', href: '/client/save-money/templates', icon: <FileText className="w-4 h-4" /> },
      { label: 'Preset Campaigns', href: '/client/save-money/campaigns', icon: <Send className="w-4 h-4" /> },
      { label: 'Web WhatsApp Campaigns', href: '/client/save-money/qr-campaigns', icon: <QrCode className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Contacts',
    icon: <Users className="w-5 h-5" />,
    children: [
      { label: 'Contact Directory', href: '/client/contacts', icon: <Users className="w-4 h-4" /> },
      { label: 'Segments', href: '/client/segments', icon: <Layers className="w-4 h-4" /> },
      { label: 'Labels', href: '/client/tags', icon: <Tags className="w-4 h-4" /> },
      { label: 'Custom Fields', href: '/client/data-fields', icon: <Database className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Automation',
    icon: <Zap className="w-5 h-5" />,
    children: [
      { label: 'Automations', href: '/client/automations', icon: <Zap className="w-4 h-4" /> },
      { label: 'Bulk AI Calls', href: '/client/bulk-calls', icon: <Phone className="w-4 h-4" /> },
      { label: 'Bot Flow Builder', href: '/client/bot-flows', icon: <Zap className="w-4 h-4" /> },
      { label: 'AI Follow-ups', href: '/client/followups', icon: <Sparkles className="w-4 h-4" /> },
      { label: 'Quick Replies', href: '/client/quick-replies', icon: <MessageCircle className="w-4 h-4" /> },
      { label: 'Keyword Triggers', href: '/client/keywords', icon: <Keyboard className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Leads & Commerce',
    icon: <ShoppingBag className="w-5 h-5" />,
    children: [
      { label: 'All Leads', href: '/client/leads', icon: <FormInput className="w-4 h-4" /> },
      { label: 'Lead Gen Forms', href: '/client/forms', icon: <FormInput className="w-4 h-4" /> },
      { label: 'Facebook Leads', href: '/client/facebook-leads', icon: <Share2 className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Channels',
    icon: <Plug className="w-5 h-5" />,
    children: [
      { label: 'Channel Config', href: '/client/channels', icon: <Plug className="w-4 h-4" /> },
      { label: 'WhatsApp Settings', href: '/client/whatsapp', icon: <FaWhatsapp className="w-4 h-4 text-green-600" /> },
    ],
  },
  {
    label: 'Settings',
    icon: <Settings className="w-5 h-5" />,
    children: [
      { label: 'Teams & Agents', href: '/client/agents', icon: <UserPlus className="w-4 h-4" /> },
      { label: 'Integrations', href: '/client/integrations', icon: <Puzzle className="w-4 h-4" /> },
      { label: 'AI Settings', href: '/client/ai-settings', icon: <Brain className="w-4 h-4" /> },
      { label: 'AI Calling Settings', href: '/client/ai-calling', icon: <Phone className="w-4 h-4" /> },
      { label: 'Knowledge Base', href: '/client/knowledge-base', icon: <BookOpen className="w-4 h-4" /> },
      { label: 'Audit Log', href: '/client/audit-log', icon: <Shield className="w-4 h-4" /> },
      { label: 'Business Settings', href: '/client/settings', icon: <Wrench className="w-4 h-4" /> },
    ],
  },
  { label: 'Media Library', icon: <ImageIcon className="w-5 h-5" />, href: '/client/media-library' },
  { label: 'Lead Source & QR', icon: <QrCode className="w-5 h-5" />, href: '/client/tracked-links' },
  { label: 'Instagram Auto DM', icon: <FaInstagram className="w-5 h-5 text-pink-600" />, href: '/client/instagram-auto-dm' },
  { label: 'AI Assistant', icon: <Bot className="w-5 h-5 text-emerald-600" />, href: '/client/ai-assistant' },
];

// Client route -> admin feature-control key (admin can switch these off per client)
const ADMIN_FEATURE_MAP: Record<string, string> = {
  '/client/chat?channel=whatsapp': 'chat',
  '/client/chat?channel=whatsapp_qr': 'whatsappQr',
  '/client/chat?channel=instagram': 'inboxInstagram',
  '/client/chat?channel=facebook': 'inboxFacebook',
  '/client/chat?channel=telegram': 'inboxTelegram',
  '/client/chat?channel=telegram_personal': 'inboxTelegram',
  '/client/chat?channel=email': 'inboxEmail',
  '/client/contacts': 'contacts',
  '/client/segments': 'segments',
  '/client/tags': 'tags',
  '/client/data-fields': 'dataFields',
  '/client/badges': 'badges',
  '/client/save-money/templates': 'presetTemplates',
  '/client/save-money/campaigns': 'presetCampaigns',
  '/client/save-money/qr-campaigns': 'qrCampaigns',
  '/client/predefined-actions': 'predefinedActions',
  '/client/response-resources': 'responseResources',
  '/client/media-library': 'mediaLibrary',
  '/client/instagram-auto-dm': 'igAutoDm',
  '/client/ai-assistant': 'aiAssistant',
  '/client/audit-log': 'auditLog',
  '/client/templates': 'templates',
  '/client/broadcasts': 'broadcasts',
  '/client/smart-broadcast': 'smartBroadcast',
  '/client/sequence-campaigns': 'sequenceCampaigns',
  '/client/followups': 'followups',
  '/client/bot-flows': 'botFlows',
  '/client/automations': 'automations',
  '/client/automations/flows': 'automations',
  '/client/quick-replies': 'quickReplies',
  '/client/keywords': 'keywords',
  '/client/events': 'events',
  '/client/leads': 'leads',
  '/client/forms': 'forms',
  '/client/facebook-leads': 'leads',
  '/client/short-links': 'shortLinks',
  '/client/analytics': 'analytics',
  '/client/teams': 'teams',
  '/client/agents': 'teams',
  '/client/integrations': 'integrations',
  '/client/ai-settings': 'aiChatbot',
  '/client/ai-calling': 'aiCalling',
  '/client/bulk-calls': 'aiCalling',
  '/client/knowledge-base': 'knowledgeBase',
  '/client/tracked-links': 'trackedLinks',
};

// Section label -> permission module key (granular agent permissions)
export const MODULE_KEY_MAP: Record<string, string> = {
  'Dashboard': 'dashboard',
  'Analytics': 'analytics',
  'Inbox': 'inbox',
  'Contacts': 'contacts',
  'Campaigns': 'campaigns',
  'Save Money': 'campaigns',
  'Automation': 'automation',
  'Leads & Commerce': 'commerce',
  'Channels': 'channels',
  'Settings': 'settings',
  'Media Library': 'media',
};

// Permission tree for the agent Permissions modal: each grantable section with
// its module key and sub-pages (by href). Granting the module key unlocks the
// whole section; granting individual child hrefs unlocks only those sub-pages.
export const PERMISSION_TREE = navItems
  .filter(s => MODULE_KEY_MAP[s.label])
  .map(s => ({
    label: s.label,
    moduleKey: MODULE_KEY_MAP[s.label],
    children: (s.children || []).map(c => ({ label: c.label, href: c.href })),
  }));

export default function ClientSidebar() {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { logout, user, features } = useAuthStore();
  const { t } = useI18n();
  const [isImpersonating, setIsImpersonating] = useState(false);
  useEffect(() => { setIsImpersonating(!!localStorage.getItem('adminToken')); }, []);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const loadUnread = () => api.get('/conversations/unread-counts')
      .then(r => setUnreadCounts(r.data.data || {}))
      .catch(() => {});
    loadUnread();
    const t = setInterval(loadUnread, 30000);
    window.addEventListener('focus', loadUnread);
    return () => { clearInterval(t); window.removeEventListener('focus', loadUnread); };
  }, []);

  const unreadForHref = (href: string) => {
    const m = href.match(/[?&]channel=([a-z_]+)/);
    return m ? unreadCounts[m[1]] || 0 : 0;
  };

  // Filter nav items based on feature locks (1 = locked = hidden)
  // plus admin per-client feature controls (features[key] === false = hidden)
  const itemVisible = (href: string) => {
    const adminKey = ADMIN_FEATURE_MAP[href];
    if (adminKey && features[adminKey] === false) return false;
    return true;
  };
  const unlockedNav = navItems.filter(section => section.label !== 'Leads & Commerce').map(section => ({
    ...section,
    children: (section.children || []).filter(item => itemVisible(item.href)),
  })).filter(section => {
    if (section.href) return itemVisible(section.href);
    return (section.children || []).length > 0;
  });

  // Granular agent permissions: when an agent has module permissions set,
  // only the allowed modules are shown
  const perms = (user as unknown as { permissions?: string[] })?.permissions || [];
  const permNav = (user?.role === 'agent' && perms.length > 0)
    ? unlockedNav
        .filter(section => {
          const key = MODULE_KEY_MAP[section.label];
          if (!key) return true; // ungoverned sections (Support, User Guide) always visible
          if (perms.includes(key)) return true;
          // sub-menu grants: show the section if any of its sub-pages are granted
          return (section.children || []).some(c => perms.includes(c.href));
        })
        .map(section => {
          const key = MODULE_KEY_MAP[section.label];
          // Full section grant (or ungoverned/leaf section) keeps all children
          if (!key || perms.includes(key) || !section.children) return section;
          // Otherwise keep only the individually granted sub-pages
          return { ...section, children: section.children.filter(c => perms.includes(c.href)) };
        })
    : unlockedNav;

  // Channel restrictions: agents with allowedChannels only see those inbox links
  const allowedCh = (user as unknown as { allowedChannels?: string[] })?.allowedChannels || [];
  const channelNav = (user?.role === 'agent' && allowedCh.length > 0)
    ? permNav.map(section => section.label !== 'Inbox' ? section : {
        ...section,
        children: (section.children || []).filter(item => {
          const m = item.href.match(/channel=([a-z_]+)/);
          return !m || allowedCh.includes(m[1]);
        }),
      }).filter(section => section.href ? true : (section.children || []).length > 0)
    : permNav;

  const toggleSection = (label: string) => {
    setExpandedSections((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [label]
    );
  };

  const brand = useBranding();
  const kkhs = useKkhsTheme();
  const { pins, toggle: togglePin, isPinned } = usePins('client');
  const [kkhsHref, setKkhsHref] = useState<string | null>(null);
  useEffect(() => {
    if (!kkhs || !pathname) { setKkhsHref(null); return; }
    const sync = () => setKkhsHref(pathname + window.location.search);
    sync();
    const sec = channelNav.find(s => (s.children || []).some(c => c.href.split('?')[0] === pathname));
    if (sec) setExpandedSections(prev => prev.includes(sec.label) ? prev : [sec.label]);
    // query-string changes (e.g. ?channel=) don't change pathname, so poll lightly
    const iv = window.setInterval(sync, 400);
    return () => window.clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kkhs, pathname]);
  const flatNav = channelNav.flatMap(s => s.href
    ? [{ label: t(s.label), href: s.href, icon: s.icon }]
    : (s.children || []).map(c => ({ label: t(c.label), href: c.href, icon: c.icon })));
  const { currentWorkspace } = useAuthStore();

  const sidebar = (
    <div className="flex flex-col h-full" data-kkhs-side="client">
      {kkhs ? (
        <KkhsBrandbar logo={brand.logo} name={brand.name} sub={currentWorkspace?.name || user?.email || ''} />
      ) : (
      <OmniSidebarBrand logo={brand.logo} name={brand.name} />
      )}

      {kkhs && (
        <KkhsPinned items={flatNav} pins={pins} pathname={kkhsHref ?? pathname} onToggle={togglePin} onNavigate={() => setMobileOpen(false)} />
      )}

      <nav className="flex-1 overflow-y-auto py-2" data-kkhs-nav>
        {channelNav.map((section) => (
          <div key={section.label} className="mb-1" data-kkhs-grp={expandedSections.includes(section.label) ? 'open' : ''}>
            {section.href ? (
              <Link
                href={section.href}
                onClick={() => setMobileOpen(false)}
                title={t(section.label)} aria-label={t(section.label)} data-kkhs-ghead={pathname === section.href ? 'on' : ''}
                className={`flex items-center gap-2 w-[calc(100%-16px)] mx-2 px-3 py-2 text-base font-bold tracking-wide rounded-xl transition-colors ${
                  pathname === section.href
                    ? 'text-emerald-600 bg-emerald-50'
                    : 'text-gray-900 hover:bg-gray-100/70'
                }`}
              >
                <OmniNavIcon label={section.label} fallback={section.icon} /> <span className="flex-1 min-w-0 truncate"><span data-ui-nav-label>{t(section.label)}</span></span>
                {kkhs && <PinStar pinned={isPinned(section.href)} onToggle={() => togglePin(section.href!)} />}
              </Link>
            ) : (
              <>
                <button
                  onClick={() => toggleSection(section.label)}
                  title={t(section.label)} aria-label={t(section.label)} data-kkhs-ghead=""
                  className="flex items-center justify-between w-[calc(100%-16px)] mx-2 px-3 py-2 text-base font-bold text-gray-900 tracking-wide hover:bg-gray-100/70 rounded-xl transition-colors"
                >
                  <span className="flex items-center gap-2"><OmniNavIcon label={section.label} fallback={section.icon} /> <span data-ui-nav-label>{t(section.label)}</span></span>
                  {expandedSections.includes(section.label) ? <ChevronDown className="w-3 h-3" data-kkhs-cv /> : <ChevronRight className="w-3 h-3" data-kkhs-cv />}
                </button>
                {expandedSections.includes(section.label) && (
                <div data-kkhs-gkids>
                {section.children?.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    title={t(item.label)} aria-label={t(item.label)} data-kkhs-ni={(pathname === item.href || (kkhsHref !== null && kkhsHref === item.href)) ? 'on' : ''}
                    data-kkhs-ch={kkhs ? (item.href.match(/channel=([a-z_]+)/)?.[1] || undefined) : undefined}
                    className={`flex items-center gap-3 pl-3 pr-4 py-1.5 mr-2 text-[13px] font-bold border-l-2 ml-5 rounded-r-xl transition-colors ${
                      pathname === item.href
                        ? 'text-emerald-600 bg-emerald-50 border-l-emerald-600 shadow-sm shadow-emerald-600/5'
                        : 'text-gray-500 border-l-gray-200 hover:bg-gray-50 hover:text-gray-900 hover:border-l-gray-400'
                    }`}
                  >
                    <OmniNavIcon label={item.label} fallback={item.icon} />
                    <span className="flex-1"><span data-ui-nav-label>{t(item.label)}</span></span>
                    {unreadForHref(item.href) > 0 && (
                      <span data-kkhs-bg className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {unreadForHref(item.href) > 99 ? '99+' : unreadForHref(item.href)}
                      </span>
                    )}
                    {kkhs && <PinStar pinned={isPinned(item.href)} onToggle={() => togglePin(item.href)} />}
                  </Link>
                ))}
                </div>
                )}
              </>
            )}
          </div>
        ))}
      </nav>

      {isImpersonating && (
        <div className="px-4 py-2 border-t border-gray-200">
          <button onClick={() => { const at = localStorage.getItem('adminToken'); if (at) { localStorage.setItem('token', at); localStorage.removeItem('adminToken'); window.location.href = '/admin/dashboard'; } }} className="flex items-center gap-2 w-full px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 text-sm font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" /> 返回管理
          </button>
        </div>
      )}
      <div className="px-4 py-3 border-t border-gray-200" data-kkhs-userfoot>
        <div className="flex items-center gap-3">
          <Link href="/client/settings" className="flex items-center gap-3 flex-1 min-w-0 rounded-lg -m-1 p-1 hover:bg-gray-50" title={"个人资料"}>
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-semibold">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name || "用户"}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email || ''}</p>
            </div>
          </Link>
          <button onClick={() => logout()} title={"退出登录"} className="text-gray-400 hover:text-red-500">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button data-ui-nav-toggle
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 bg-white rounded-lg shadow-md"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      <aside data-kkhs-aside="client" className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-100 shadow-[1px_0_8px_rgba(0,0,0,0.03)] transform transition-transform duration-200 ease-in-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {sidebar}
      </aside>
    </>
  );
}
