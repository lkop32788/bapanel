'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import { useSearchParams } from 'next/navigation';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Send, Paperclip, Smile, Reply, User, Sticker as StickerIcon, CheckCheck, Check, Clock, AlertCircle, Image as ImageIcon, FileText, MessageSquare, X, UserPlus, Video, Mic, Phone, PhoneCall, Zap, LayoutTemplate, ClipboardList, Bot, Check as CheckIcon, PiggyBank, Plus, Download, Loader2, StickyNote, Trash2, Bell, Pencil, Tag as TagIcon, Share2, Calendar, CheckSquare, Mail, MapPin, Pin, Megaphone } from 'lucide-react';
import WhatsAppPhonePreview from '@/components/WhatsAppPhonePreview';
import useBranding from '@/lib/useBranding';
import { conversationApi, teamApi, noteApi, formApi, tagApi, contactApi, workspaceApi, waqrApi, aiSettingsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';
import api from '@/lib/api';
import { useCall } from '@/contexts/CallProvider';
import { getSocket, joinConversation, leaveConversation, emitTyping } from '@/lib/socket';
import type { Conversation, Message, Contact } from '@/types';
import Badge from '@/components/ui/Badge';

import toast from 'react-hot-toast';
import useKkhsTheme from '@/lib/useKkhsTheme';
import KkhsInboxContext from '@/components/kkhs/KkhsInboxContext';

// Chat media keeps a WhatsApp-like size instead of filling the whole bubble on desktop.
const MEDIA_BOX = 'w-[min(320px,100%)] h-[240px] sm:h-[280px] object-contain bg-black/5';

// Lead source chips shown in the conversation list. Plain WhatsApp (organic) gets no chip.
const SOURCE_CHIPS: Record<string, { label: string; cls: string }> = {
  ctwa: { label: "CTWA（未知）", cls: "bg-indigo-100 文本-indigo-700" },
  ctwa_facebook: { label: "CTWA·Facebook", cls: "bg-blue-100 文本-blue-700" },
  ctwa_instagram: { label: "CTWA·Instagram", cls: "bg-粉红-100 文本-粉红-700" },
  facebook: { label: 'Facebook', cls: "bg-blue-100 文本-blue-700" },
  facebook_lead: { label: "FB表格", cls: "bg-blue-100 文本-blue-700" },
  instagram: { label: 'Instagram', cls: "bg-粉红-100 文本-粉红-700" },
  website: { label: "网站", cls: "bg-青色-100 文本-青色-700" },
  qr: { label: 'QR', cls: "bg-green-100 文本-green-700" },
  form: { label: "表格", cls: "bg-amber-100 文本-amber-700" },
  import: { label: "进口", cls: "bg-gray-100 文本-gray-600" },
  api: { label: 'API', cls: "bg-gray-100 文本-gray-600" },
  catalog: { label: "目录", cls: "bg-紫色-100 文本-紫色-700" },
};

const SOURCE_FILTERS: [string, string][] = [
  ['whatsapp', "WhatsApp（有机）"],
  ['ctwa_facebook', "CTWA 广告 - Facebook"],
  ['ctwa_instagram', "CTWA 广告 - Instagram"],
  ['ctwa', "CTWA 广告 - 未知"],
  ['facebook', 'Facebook'],
  ['facebook_lead', "Facebook 潜在客户表格"],
  ['instagram', 'Instagram'],
  ['website', "网站"],
  ['qr', "二维码"],
  ['form', "表格"],
  ['catalog', "目录"],
  ['api', 'API'],
  ['import', "进口"],
  ['manual', "手动添加"],
];

type TimelineItem = { kind: 'msg'; at: string; msg: Message };

interface ChatTemplate {
  _id: string; name: string; category?: string; body: string; status?: string; language?: string;
  footer?: string;
  header?: { type?: string; content?: string; mediaUrl?: string };
  buttons?: Array<{ type?: string; text: string }>;
}

function WindowTimer({ messages, channel }: { messages: Message[]; channel: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  if (channel !== 'whatsapp') return null;
  let lastInbound = 0;
  for (const m of messages) { if (m.direction === 'inbound') { const t = new Date(m.createdAt).getTime(); if (t > lastInbound) lastInbound = t; } }
  if (!lastInbound) return null;
  const left = lastInbound + 24 * 60 * 60 * 1000 - now;
  if (left <= 0) return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 whitespace-nowrap" title={"24 小时窗口关闭 - 现在只能发送批准的模板"}>⏱ 窗口已关闭 — 仅模板</span>;
  const h = Math.floor(left / 3600000), mn = Math.floor((left % 3600000) / 60000);
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 whitespace-nowrap" title={"WhatsApp 24 小时客户服务窗口剩余时间 — 允许自由格式消息，直至关闭"}>⏱ 收盘于 {h}h {mn}m</span>;
}

// Live socket payloads bypass the API, which is where the server masks numbers for
// agents that are not allowed to see them, so the same masking is applied here.
const maskPhoneText = (value?: string): string => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 6) return String(value || '');
  return `${digits.slice(0, 2)}${'*'.repeat(Math.max(4, digits.length - 5))}${digits.slice(-3)}`;
};

const maskConversation = (conv: Conversation): Conversation => {
  if (!conv?.contact || typeof conv.contact === 'string') return conv;
  const c = conv.contact as Contact & { waId?: string; profileName?: string };
  const isNumericName = (v?: string) => !!v && !/[a-z]/i.test(v) && v.replace(/\D/g, '').length >= 8;
  const masked: Contact & { waId?: string; profileName?: string } = {
    ...c,
    phone: maskPhoneText(c.phone),
    name: isNumericName(c.name) ? maskPhoneText(c.name) : c.name,
  };
  if (c.waId) masked.waId = maskPhoneText(c.waId);
  if (isNumericName(c.profileName)) masked.profileName = maskPhoneText(c.profileName);
  return { ...conv, contact: masked };
};

// Meta shares a Messenger/Instagram user's real name only when the app has
// Advanced Access, so a page-scoped ID is never shown as the chat title.
const metaUserLabel = (channel: string, id: string): string =>
  `${channel === 'instagram' ? 'Instagram' : 'Facebook'} user \u00b7 ${id.slice(-4)}`;

const getContactName = (conv: Conversation): string => {
  if (!conv?.contact) return 'Unknown';
  if (typeof conv.contact === 'string') return 'Unknown';
  const channel = (conv as unknown as { channel?: string })?.channel || 'whatsapp';
  const id = conv.contact.phone || '';
  const name = conv.contact.name || conv.contact.profileName || '';
  if ((channel === 'facebook' || channel === 'instagram') && (!name || name === id)) {
    return id ? metaUserLabel(channel, id) : 'Unknown';
  }
  return name || conv.contact.phone || conv.contact.email || 'Unknown';
};

// The Meta webhook stores events without text as a placeholder token like
// [ig_reel]; show a readable label for those instead of the raw token.
const META_EVENT_LABELS: Record<string, string> = {
  ig_reel: "🎬 卷轴共享",
  ig_story: "📸 故事已分享",
  story_mention: "📸 在故事中提到你",
  'story reply': "💬回复了你的故事",
  share: "🔗 分享了帖子",
  template: "📋 共享模板",
  fallback: "🔗 分享了链接",
  audio: "🎤 语音留言",
  video: "🎥 视频",
  image: "🖼️ 图片",
  file: "📄 文件",
  media: "📎 附件",
  message: "💬 留言",
  'unsupported message': "⚠️ 不支持的消息",
};

const prettyMetaText = (text: string): string => {
  const m = /^\[([^\]]+)\]$/.exec(text || '');
  if (!m) return text;
  return META_EVENT_LABELS[m[1]] || META_EVENT_LABELS[m[1].replace(/_/g, ' ')] || text;
};

const getContactPhone = (conv: Conversation): string => {
  if (!conv?.contact) return '';
  if (typeof conv.contact === 'string') return '';
  return conv.contact.phone || '';
};

// Facebook/Instagram give a page-scoped user ID (PSID/IGSID), not a phone
// number. Show a friendly label there instead of the raw numeric ID.
const getContactSubtitle = (conv: Conversation): string => {
  const channel = (conv as unknown as { channel?: string })?.channel || 'whatsapp';
  if (channel === 'facebook') return 'Facebook user';
  if (channel === 'instagram') return 'Instagram user';
  const phone = getContactPhone(conv);
  if (phone.endsWith('@g.us')) return 'WhatsApp group';
  if (phone.endsWith('@lid')) return 'WhatsApp user';
  return phone;
};

const getContactId = (conv: Conversation): string => {
  if (!conv?.contact) return '';
  if (typeof conv.contact === 'string') return conv.contact;
  return (conv.contact as { _id?: string })._id || '';
};

const getContactAvatar = (conv: Conversation): string => {
  if (!conv?.contact || typeof conv.contact === 'string') return '';
  return (conv.contact as { avatar?: string }).avatar || '';
};

// Shows the customer's WhatsApp profile photo (DP) when available (Web/QR),
// otherwise the name initial. Broken/expired photo URLs fall back gracefully.
const ContactAvatar = ({ conv, gradient = false, size = 40 }: { conv: Conversation; gradient?: boolean; size?: number }) => {
  const [err, setErr] = useState(false);
  const url = getContactAvatar(conv);
  const dim = { width: size, height: size };
  if (url && !err) {
    return <img src={url} alt="" onError={() => setErr(true)} style={dim} className="rounded-full object-cover shrink-0" />;
  }
  return (
    <div style={dim} className={`rounded-full flex items-center justify-center shrink-0 ${gradient ? 'bg-linear-to-br from-emerald-400 to-teal-500 text-white font-semibold text-sm shadow-sm' : 'bg-emerald-100 text-emerald-700 font-medium'}`}>
      {getContactInitial(conv)}
    </div>
  );
};

const getContactInitial = (conv: Conversation): string => {
  const name = getContactName(conv);
  return name.charAt(0).toUpperCase();
};

function ChatPageInner() {
  const brand = useBranding();
  const { startCall, active: callActive } = useCall();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  // On touch devices the on-screen keyboard's Enter must insert a newline (like
  // WhatsApp) and send only via the Send button; on desktop Enter still sends.
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(typeof window !== 'undefined'
      && (('ontouchstart' in window) || window.matchMedia('(pointer: coarse)').matches));
  }, []);
  const searchParams = useSearchParams();
  const channelFilter = searchParams.get('channel') || 'all';
  const { currentWorkspace, user } = useAuthStore();
  const [channelConn, setChannelConn] = useState<Record<string, boolean> | null>(null);
  // Global auto-AI (AI Chatbot Settings). Used so the per-chat "Chat AI" pill
  // reflects the effective state: ON when global AI applies, unless manually disabled.
  const [globalAiOn, setGlobalAiOn] = useState(false);
  useEffect(() => {
    aiSettingsApi.get().then(res => {
      const s = res.data.data || {};
      setGlobalAiOn(!!s.enabled && (!!s.apiKey || !!s.keyConfigured));
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!currentWorkspace) return;
    workspaceApi.get(currentWorkspace._id).then(res => {
      const w = res.data.data || {};
      setChannelConn({
        whatsapp: !!w?.whatsapp?.isConnected,
        whatsapp_qr: !!w?.waQr?.enabled,
        facebook: !!w?.metaChat?.fbEnabled && !!w?.metaChat?.pageAccessToken,
        instagram: !!w?.metaChat?.igEnabled && !!w?.metaChat?.igAccountId,
        telegram: !!w?.telegram?.enabled && !!w?.telegram?.botToken,
        telegram_personal: !!w?.tgPersonal?.enabled,
        email: !!w?.emailChannel?.enabled && !!w?.emailChannel?.user,
      });
    }).catch(() => {});
  }, [currentWorkspace]);
  const CHANNEL_META: Record<string, { label: string; href: string }> = {
    whatsapp: { label: "WhatsApp 商业 API", href: '/client/whatsapp' },
    whatsapp_qr: { label: "WhatsApp 二维码", href: '/client/channels' },
    facebook: { label: 'Facebook Messenger', href: '/client/channels' },
    instagram: { label: "Instagram 私信", href: '/client/channels' },
    telegram: { label: "电报机器人", href: '/client/channels' },
    telegram_personal: { label: "个人电报", href: '/client/channels' },
    email: { label: "电子邮件收件箱", href: '/client/channels' },
  };
  const notConnected = channelFilter !== 'all' && channelConn !== null && channelConn[channelFilter] === false;
  const [qrNewMsg, setQrNewMsg] = useState(false);
  const [qrNewPhone, setQrNewPhone] = useState('');
  const [qrNewText, setQrNewText] = useState('');
  const [qrNewSending, setQrNewSending] = useState(false);
  const [tgNewMsg, setTgNewMsg] = useState(false);
  const [tgNewPhone, setTgNewPhone] = useState('');
  const [tgNewText, setTgNewText] = useState('');
  const [tgNewSending, setTgNewSending] = useState(false);

  const deepLinkConv = searchParams.get('conv');
  const deepLinkContact = searchParams.get('contact');
  const deepLinkDraft = searchParams.get('draft');
  const deepLinkHandled = useRef(false);
  const contactLinkHandled = useRef(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presets, setPresets] = useState<Array<{_id: string; name: string; body: string}>>([]);
  const [respResources, setRespResources] = useState<Array<{_id: string; title: string; content: string; category: string; shortcut: string}>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [msgResults, setMsgResults] = useState<{ _id: string; text: string; direction: string; createdAt: string; conversation: string; contact?: { name?: string; phone?: string } }[]>([]);

  useEffect(() => {
    if (searchQuery.trim().length < 3) { setMsgResults([]); return; }
    const t = setTimeout(() => {
      conversationApi.searchMessages(searchQuery.trim())
        .then(r => setMsgResults(r.data.data || []))
        .catch(() => setMsgResults([]));
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Server-side conversation search: the sidebar only has a page of chats
  // loaded, so ask the server so any chat can be found without scrolling.
  const [searchConvs, setSearchConvs] = useState<Conversation[] | null>(null);
  const [searchingConvs, setSearchingConvs] = useState(false);
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchConvs(null); return; }
    const t = setTimeout(async () => {
      setSearchingConvs(true);
      try {
        const r = await conversationApi.list({ search: q, channel: channelFilter !== 'all' ? channelFilter : undefined, limit: 50 });
        setSearchConvs(r.data.data || []);
      } catch { setSearchConvs(null); }
      setSearchingConvs(false);
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, channelFilter]);

  const [filter, setFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'unread'>('newest');
  
  const [sourceFilter, setSourceFilter] = useState('all');
  const [allTags, setAllTags] = useState<{ _id: string; name: string; color?: string }[]>([]);
  const [labelFilter, setLabelFilter] = useState('all');
  
  const [labelMenu, setLabelMenu] = useState(false);
  const [labelMenuPos, setLabelMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const labelMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!labelMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (labelMenuRef.current && !labelMenuRef.current.contains(e.target as Node)) setLabelMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [labelMenu]);
  useEffect(() => { tagApi.list().then(r => setAllTags(r.data.data || [])).catch(() => {}); }, []);

  // A contact can be in multiple stages. Prefer the `stages` array; fall back to
  // the single `stage` for older data that predates multi-stage.

  const getContactTags = (conv: Conversation): { _id: string; name: string; color?: string }[] => {
    if (!conv?.contact || typeof conv.contact === 'string') return [];
    return ((conv.contact.tags || []) as unknown as { _id: string; name: string; color?: string }[]).filter(t => t && typeof t === 'object');
  };

  const getContactBadges = (conv: Conversation): { _id: string; name: string; color?: string }[] => {
    if (!conv?.contact || typeof conv.contact === 'string') return [];
    return (((conv.contact as unknown as { badges?: unknown }).badges || []) as { _id: string; name: string; color?: string }[]).filter(b => b && typeof b === 'object');
  };

  const toggleContactLabel = async (tagId: string) => {
    if (!selectedConv || typeof selectedConv.contact === 'string') return;
    const contact = selectedConv.contact;
    const current = getContactTags(selectedConv).map(t => t._id);
    const next = current.includes(tagId) ? current.filter(t => t !== tagId) : [...current, tagId];
    const newTags = allTags.filter(t => next.includes(t._id));
    const prevConv = selectedConv;
    const updConv = { ...selectedConv, contact: { ...contact, tags: newTags } } as unknown as Conversation;
    setSelectedConv(updConv);
    setConversations(prev => prev.map(c => c._id === prevConv._id ? updConv : c));
    try {
      await contactApi.update(contact._id, { tags: next });
    } catch {
      setSelectedConv(prevConv);
      setConversations(prev => prev.map(c => c._id === prevConv._id ? prevConv : c));
      toast.error(translateApiMessage("更新标签失败"));
    }
  };
  const [loadingConvs, setLoadingConvs] = useState(true);
  const convPageRef = useRef(1);
  const convTotalPagesRef = useRef(1);
  const [convTotal, setConvTotal] = useState(0);
  const [hasMoreConvs, setHasMoreConvs] = useState(false);
  const [convsLoadingMore, setConvsLoadingMore] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const sendLockRef = useRef(false);
  const [reminderContacts, setReminderContacts] = useState<Record<string, string>>({});
  const loadDueRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    loadDueRef.current = () => api.get('/contact-notes', { params: { due: 1, fields: 'light' } }).then(r => {
      const map: Record<string, string> = {};
      (r.data.data || []).forEach((n: { contact?: { _id?: string } | string; remindAt?: string }) => {
        const cid = typeof n.contact === 'string' ? n.contact : n.contact?._id;
        if (cid && n.remindAt) map[cid] = n.remindAt;
      });
      setReminderContacts(map);
    }).catch(() => {});
    const loadDue = () => loadDueRef.current?.();
    loadDue();
    const t = setInterval(loadDue, 60000);
    window.addEventListener('focus', loadDue);
    return () => { clearInterval(t); window.removeEventListener('focus', loadDue); };
  }, []);
  const hasReminder = (conv: Conversation) => !!reminderContacts[getContactId(conv)];
  const [reminderConvs, setReminderConvs] = useState<Conversation[] | null>(null);
  useEffect(() => {
    if (labelFilter !== '__reminder') { setReminderConvs(null); return; }
    let cancelled = false;
    conversationApi.list({ filter: 'reminder', channel: channelFilter !== 'all' ? channelFilter : undefined, limit: 500 } as Record<string, string | number | undefined>)
      .then(r => { if (!cancelled) setReminderConvs(r.data.data || []); })
      .catch(() => { if (!cancelled) setReminderConvs(null); });
    return () => { cancelled = true; };
  }, [labelFilter, channelFilter, reminderContacts]);
  const [aiSummaryText, setAiSummaryText] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  
  const fmtListTime = (val?: string) => {
    if (!val) return '';
    const d = new Date(val); if (isNaN(d.getTime())) return '';
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    if ((now.getTime() - d.getTime()) / 86400000 < 7) return d.toLocaleDateString([], { weekday: 'short' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };
  const sourceChip = (conv: Conversation) => {
    const c = conv.contact as { source?: string; sourceDetail?: string } | undefined;
    const s = c?.source || '';
    const meta = SOURCE_CHIPS[s];
    if (!meta) return null;
    return (
      <span className={`ml-1 text-[10px] px-1 py-0.5 rounded align-middle font-medium ${meta.cls}`}
        title={c?.sourceDetail ? `${meta.label} — ${c.sourceDetail}` : meta.label}>
        {meta.label}
      </span>
    );
  };
  const sentimentBadge = (conv: Conversation) => {
    
    const se = (conv as { sentiment?: string }).sentiment;
    return (<>
      
      
      
      {se === 'negative' && <span className="ml-1 text-[11px] align-middle" title={"顾客似乎不高兴"}>😟</span>}
    </>);
  };
  const [typingAgent, setTypingAgent] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // WhatsApp-style composer: one line by default, grows with the text up to 10rem.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [messageText]);
  const msgPageRef = useRef(1);
  const activeConvRef = useRef<string | null>(null);
  const msgTotalPagesRef = useRef(1);
  const skipAutoScrollRef = useRef(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [inChatSearch, setInChatSearch] = useState(false);
  const [inChatQuery, setInChatQuery] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const [chatSearching, setChatSearching] = useState(false);
  const chatSearchedRef = useRef('');
  const matchIds = inChatQuery.trim().length >= 2
    ? messages.filter(m => (m.text || '').toLowerCase().includes(inChatQuery.trim().toLowerCase())).map(m => m._id)
    : [];

  // Voice calls of this contact are shown inside the chat, in the same timeline as the messages.

  const timeline: TimelineItem[] = React.useMemo(() => {
    const items: TimelineItem[] = messages.map(m => ({ kind: 'msg' as const, at: m.createdAt, msg: m }));
    
    return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [messages]);

  // Server-side search: the chat may only have recent pages loaded, so when a
  // query matches older (unloaded) history, load the full conversation once.
  useEffect(() => {
    const q = inChatQuery.trim();
    if (!inChatSearch || q.length < 2 || !selectedConv) return;
    const convId = selectedConv._id;
    const key = `${convId}:${q.toLowerCase()}`;
    if (chatSearchedRef.current === key) return;
    const t = setTimeout(async () => {
      setChatSearching(true);
      try {
        const r = await conversationApi.searchMessages(q, convId);
        const results: Array<{ _id: string }> = r.data.data || [];
        chatSearchedRef.current = key;
        setMessages(prev => {
          if (results.some(m => !prev.some(p => p._id === m._id))) {
            conversationApi.getMessages(convId, { page: 1, limit: 2000 }).then(full => {
              setMessages(full.data.data || []);
              setHasOlder(false);
            }).catch(() => {});
          }
          return prev;
        });
      } catch { /* ignore */ }
      setChatSearching(false);
    }, 450);
    return () => clearTimeout(t);
  }, [inChatSearch, inChatQuery, selectedConv]);

  const jumpToMatch = (idx: number) => {
    const id = matchIds[idx];
    if (!id) return;
    setMatchIdx(idx);
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerModeRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showFormPicker, setShowFormPicker] = useState(false);
  const [forms, setForms] = useState<Array<{_id: string; name: string; description?: string; waFlow?: { flowId: string; status: string } }>>([]);
  const [quickReplies, setQuickReplies] = useState<Array<{_id: string; title: string; shortcut: string; message: string; stickerUrl?: string}>>([]);
  const [templates, setTemplates] = useState<ChatTemplate[]>([]);
  const [tplToSend, setTplToSend] = useState<ChatTemplate | null>(null);
  const [tplFromNumber, setTplFromNumber] = useState('');
  const [newMsgFrom, setNewMsgFrom] = useState('');
  const waNumbers = React.useMemo(() => {
    const wa = currentWorkspace?.whatsapp;
    if (!wa) return [] as { id: string; label: string }[];
    const list = [{ id: wa.phoneNumberId || '', label: `${wa.displayName || 'Default'} (${wa.phoneNumber || wa.phoneNumberId || ''})` }];
    for (const n of (wa.extraNumbers || [])) {
      list.push({ id: n.phoneNumberId, label: `${n.displayName || 'Number'} (${n.phoneNumber || n.phoneNumberId})` });
    }
    return list.filter(n => n.id);
  }, [currentWorkspace]);
  const [tplVars, setTplVars] = useState<string[]>([]);
  const [tplMediaUrl, setTplMediaUrl] = useState('');
  const [tplMediaUploading, setTplMediaUploading] = useState(false);
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [newMsgPhone, setNewMsgPhone] = useState('');
  const [newEmail, setNewEmail] = useState({ to: '', cc: '', subject: '', body: '' });
  const [emailMode, setEmailMode] = useState<'new' | 'reply' | 'replyAll' | 'forward'>('new');
  const [emailDraftHtml, setEmailDraftHtml] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [emailAttachments, setEmailAttachments] = useState<{ url: string; filename: string }[]>([]);
  const [emailUploading, setEmailUploading] = useState(false);
  const emailBodyRef = useRef<HTMLDivElement>(null);
  const emailFileRef = useRef<HTMLInputElement>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactPickerId, setReactPickerId] = useState<string | null>(null);
  const [presence, setPresence] = useState<{ online: boolean; lastSeen: number | null } | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; caption?: string } | null>(null);
  const [docPreview, setDocPreview] = useState<{ url: string; name: string } | null>(null);
  const [forwardingTo, setForwardingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  useEffect(() => {
    if (!docPreview) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDocPreview(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [docPreview]);

  const handleReact = async (msg: Message, emoji: string) => {
    if (!selectedConv) return;
    setReactPickerId(null);
    const mine = (msg.reactions || []).find((r) => r.from === 'outbound');
    const next = mine?.emoji === emoji ? '' : emoji;
    setMessages((prev) => prev.map((m) => m._id === msg._id
      ? { ...m, reactions: [...(m.reactions || []).filter((r) => r.from !== 'outbound'), ...(next ? [{ emoji: next, from: 'outbound' }] : [])] }
      : m));
    try { await conversationApi.react(selectedConv._id, msg._id, next); } catch { toast.error(translateApiMessage("反应失败")); }
  };

  useEffect(() => {
    setPresence(null);
    if (selectedConv && (selectedConv as unknown as { channel?: string }).channel === 'whatsapp_qr') {
      conversationApi.subscribePresence(selectedConv._id).catch(() => {});
    }
  }, [selectedConv?._id]);
  const [forwardSearch, setForwardSearch] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('');

  const [newMsgTpl, setNewMsgTpl] = useState<ChatTemplate | null>(null);
  const [newMsgVars, setNewMsgVars] = useState<string[]>([]);
  const [fileAccept, setFileAccept] = useState('*/*');
  const [submitting, setSubmitting] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const [showAssignMenu, setShowAssignMenu] = useState(false);

  const [agents, setAgents] = useState<Array<{_id: string; name: string; email?: string}>>([]);
  const [togglingAI, setTogglingAI] = useState(false);
  const [aiCalling, setAiCalling] = useState(false);
  const assignMenuRef = useRef<HTMLDivElement>(null);
  const [assignMenuPos, setAssignMenuPos] = useState<{top: number; left: number} | null>(null);

  useEffect(() => {
    teamApi.listAgents().then(res => {
      setAgents(res.data?.data || []);
    }).catch(() => {});
    
  }, []);

  const handleAssignAgent = async (agentId: string) => {
    if (!selectedConv) return;
    try {
      await conversationApi.assign(selectedConv._id, agentId);
      setSelectedConv({ ...selectedConv, assignedAgent: agents.find(a => a._id === agentId) });
      setShowAssignMenu(false);
      toast.success(translateApiMessage("分配成功"));
    } catch {
      toast.error(translateApiMessage("分配失败"));
    }
  };

  // The API reports aiEffective (the same decision the reply path makes); the local
  // calculation is only a fallback for panels still on an older backend.
  const chatAiOn = selectedConv
    ? (selectedConv.aiEffective !== undefined
      ? selectedConv.aiEffective
      : (!selectedConv.aiDisabled && (selectedConv.aiEnabled || globalAiOn)))
    : false;

  const handleToggleAI = async (mode: 'chat' | 'call') => {
    if (!selectedConv || togglingAI) return;
    setTogglingAI(true);
    const newVal = mode === 'call' ? !selectedConv.aiCallEnabled : !chatAiOn;
    try {
      await conversationApi.toggleAI(selectedConv._id, newVal, mode);
      if (mode === 'call') setSelectedConv({ ...selectedConv, aiCallEnabled: newVal });
      else setSelectedConv({ ...selectedConv, aiEnabled: newVal, aiDisabled: !newVal, aiEffective: newVal });
    } catch { /* empty */ } finally { setTogglingAI(false); }
  };

  const handleAiCall = async () => {
    if (!selectedConv || aiCalling) return;
    const phone = getContactPhone(selectedConv);
    if (!phone) return;
    setAiCalling(true);
    try {
      const res = await api.post('/ai-calling/ai-call', { contactPhone: phone });
      alert(res.data?.data?.message || "人工智能正在呼叫客户......");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'AI call failed';
      alert(msg);
    } finally { setAiCalling(false); }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const res = await conversationApi.list({ status: filter === 'resolved' ? 'closed' : filter === 'active' ? 'active' : undefined, filter: ['unread', 'assigned', 'unassigned'].includes(filter) ? filter : undefined,  source: sourceFilter !== 'all' ? sourceFilter : undefined, channel: channelFilter !== 'all' ? channelFilter : undefined } as Record<string, string | undefined>);
        setConversations(res.data.data || []);
        convPageRef.current = 1;
        convTotalPagesRef.current = res.data.pagination?.pages || 1;
        setConvTotal(res.data.pagination?.total || (res.data.data || []).length);
        setHasMoreConvs((res.data.pagination?.pages || 1) > 1);
      } catch { /* empty */ }
      setLoadingConvs(false);
    };
    fetchConversations();
  }, [filter, sourceFilter, channelFilter]);

  const loadMoreConversations = async () => {
    if (convsLoadingMore) return;
    const next = convPageRef.current + 1;
    if (next > convTotalPagesRef.current) return;
    setConvsLoadingMore(true);
    try {
      const res = await conversationApi.list({ page: next, status: filter === 'resolved' ? 'closed' : filter === 'active' ? 'active' : undefined, filter: ['unread', 'assigned', 'unassigned'].includes(filter) ? filter : undefined,  source: sourceFilter !== 'all' ? sourceFilter : undefined, channel: channelFilter !== 'all' ? channelFilter : undefined } as Record<string, string | number | undefined>);
      const more: Conversation[] = res.data.data || [];
      setConversations(prev => {
        const seen = new Set(prev.map(c => c._id));
        return [...prev, ...more.filter(c => !seen.has(c._id))];
      });
      convPageRef.current = next;
      convTotalPagesRef.current = res.data.pagination?.pages || convTotalPagesRef.current;
      setConvTotal(res.data.pagination?.total || convTotal);
      setHasMoreConvs(next < (res.data.pagination?.pages || 1));
    } catch { /* empty */ }
    setConvsLoadingMore(false);
  };

  // Fetch quick replies — PERF-12: composer lists are not needed to show the inbox, so they load
  // once the browser is idle (after the conversation list) instead of in the first request burst.
  useEffect(() => {
    const loadComposerLists = () => {
    api.get('/quick-replies-client').then(r => setQuickReplies(r.data.data || [])).catch(() => {});
    api.get('/preset-messages').then(r => setPresets(r.data.data || [])).catch(() => {});
    api.get('/response-resources').then(r => setRespResources((r.data.data || []).filter((x: {isActive: boolean}) => x.isActive !== false))).catch(() => {});
    api.get('/templates', { params: { limit: 500 } }).then(r => setTemplates((r.data.data || []).filter((t: {status: string}) => t.status === 'approved' || t.status === 'APPROVED'))).catch(() => {});
    api.get('/forms').then(r => setForms(r.data.data || [])).catch(() => {});
    
    };
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(loadComposerLists, { timeout: 2000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(loadComposerLists, 800);
    return () => clearTimeout(t);
  }, []);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const [exportMenu, setExportMenu] = useState<'chat' | 'all' | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const kkhs = useKkhsTheme();
  const [ctxOpen, setCtxOpen] = useState(true);
  const [kkhsFilters, setKkhsFilters] = useState(false);
  const KKHS_CH: Array<[string, string, string]> = [
    ['whatsapp', 'WhatsApp', '#25D366'], ['whatsapp_qr', "WhatsApp 二维码", '#128C7E'], ['instagram', 'Instagram', '#E1306C'], ['facebook', 'Facebook', '#0866FF'],
    ['telegram', "电报机器人", '#0088CC'], ['telegram_personal', "电报个人", '#229ED9'],  ['email', "邮箱", '#EA4335'],
  ];

  const [notes, setNotes] = useState<{ _id: string; text: string; remindAt?: string; reminderSent?: boolean; contacted?: boolean; contactedRemark?: string; createdAt: string }[]>([]);
  const [contactedFor, setContactedFor] = useState<string | null>(null);
  const [contactedRemark, setContactedRemark] = useState('');
  const handleContacted = async (noteId: string) => {
    try {
      await noteApi.update(noteId, { contacted: true, contactedRemark: contactedRemark.trim() } as { contacted: boolean; contactedRemark: string });
      setContactedFor(null); setContactedRemark('');
      if (selectedConv) loadNotes(getContactId(selectedConv));
      loadDueRef.current?.();
      toast.success(translateApiMessage("标记为已联系"));
    } catch { toast.error(translateApiMessage("操作失败")); }
  };
  const [noteText, setNoteText] = useState('');
  const [noteRemind, setNoteRemind] = useState('');
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editRemind, setEditRemind] = useState('');
  const toLocalInput = (iso: string) => {
    const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const handleEditRemind = async (id: string) => {
    try {
      await noteApi.update(id, { remindAt: editRemind ? new Date(editRemind).toISOString() : null });
      setEditingNote(null); setEditRemind('');
      if (selectedConv) loadNotes(getContactId(selectedConv));
      loadDueRef.current?.();
      toast.success(translateApiMessage("提醒已更新"));
    } catch { toast.error(translateApiMessage("操作失败")); }
  };

  const loadNotes = async (contactId: string) => {
    try {
      const r = await noteApi.list(contactId);
      setNotes(r.data.data || []);
    } catch { setNotes([]); }
  };

  const handleOpenNotes = () => {
    if (!selectedConv) return;
    setNotesOpen(true);
    loadNotes(getContactId(selectedConv));
  };

  const handleAddNote = async () => {
    if (!selectedConv || !noteText.trim()) return;
    try {
      await noteApi.create({ contact: getContactId(selectedConv), text: noteText.trim(), remindAt: noteRemind ? new Date(noteRemind).toISOString() : undefined });
      loadDueRef.current?.();
      setNoteText(''); setNoteRemind('');
      loadNotes(getContactId(selectedConv));
      toast.success(translateApiMessage("添加注释"));
    } catch { toast.error(translateApiMessage("添加备注失败")); }
  };

  const handleDeleteNote = async (id: string) => {
    if (!selectedConv) return;
    try {
      await noteApi.delete(id);
      loadNotes(getContactId(selectedConv));
    } catch { toast.error(translateApiMessage("删除失败")); }
  };

  const handleExportChat = async (format: string) => {
    if (!selectedConv) return;
    setExportMenu(null);
    try {
      const r = await conversationApi.exportChat(selectedConv._id, format);
      downloadBlob(r.data, `chat-${getContactName(selectedConv).replace(/[^a-zA-Z0-9]/g, '_')}.${format}`);
    } catch { toast.error(translateApiMessage("导出失败")); }
  };

  const handleExportAll = async (format: string) => {
    setExportMenu(null);
    try {
      const r = await conversationApi.exportAllChats(format);
      downloadBlob(r.data, `all-chats-export.${format}`);
    } catch { toast.error(translateApiMessage("导出失败")); }
  };

  const loadMessages = useCallback(async (conv: Conversation) => {
    if (selectedConv?._id) leaveConversation(selectedConv._id);
    activeConvRef.current = conv._id;
    setSelectedConv(conv);
    if (conv._id !== selectedConv?._id) { setMessages([]); setReplyTo(null); setTypingAgent(null); }
    setInChatSearch(false); setInChatQuery(''); setMatchIdx(0);
    setLoadingMsgs(true);
    joinConversation(conv._id);
    if (conv.unreadCount > 0) {
      setConversations(prev => prev.map(c => c._id === conv._id ? { ...c, unreadCount: 0 } : c));
      api.put(`/conversations/${conv._id}/read`).catch(() => {});
    }
    loadDueRef.current?.();
    try {
      const res = await conversationApi.getMessages(conv._id);
      // The user may have opened another chat while this request was in flight.
      if (activeConvRef.current !== conv._id) return;
      const rows: Message[] = (res.data.data || []).filter((m: Message) => !m.conversation || String(m.conversation) === conv._id);
      setMessages(rows);
      msgPageRef.current = 1;
      msgTotalPagesRef.current = res.data.pagination?.pages || 1;
      setHasOlder((res.data.pagination?.pages || 1) > 1);
    } catch { /* empty */ }
    if (activeConvRef.current === conv._id) setLoadingMsgs(false);
  }, [selectedConv]);

  const loadOlderMessages = async () => {
    if (!selectedConv || olderLoading) return;
    const next = msgPageRef.current + 1;
    if (next > msgTotalPagesRef.current) return;
    setOlderLoading(true);
    const container = messagesContainerRef.current;
    const prevHeight = container?.scrollHeight || 0;
    try {
      const res = await conversationApi.getMessages(selectedConv._id, { page: next });
      if (activeConvRef.current !== selectedConv._id) { setOlderLoading(false); return; }
      const older: Message[] = res.data.data || [];
      skipAutoScrollRef.current = true;
      setMessages(prev => {
        const seen = new Set(prev.map(m => m._id));
        return [...older.filter(m => !seen.has(m._id)), ...prev];
      });
      msgPageRef.current = next;
      setHasOlder(next < msgTotalPagesRef.current);
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - prevHeight;
      });
    } catch { /* empty */ }
    setOlderLoading(false);
  };

  useEffect(() => {
    if (skipAutoScrollRef.current) { skipAutoScrollRef.current = false; return; }
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (deepLinkHandled.current || !deepLinkConv || !conversations.length) return;
    deepLinkHandled.current = true;
    const conv = conversations.find(c => c._id === deepLinkConv);
    if (conv) {
      loadMessages(conv);
      if (deepLinkDraft) setMessageText(deepLinkDraft);
    } else {
      // Not in the loaded page (older chat / different filter) — fetch it directly
      conversationApi.get(deepLinkConv).then(r => {
        const fetched = r.data.data;
        if (!fetched) return;
        setConversations(prev => prev.some(c => c._id === fetched._id) ? prev : [fetched, ...prev]);
        loadMessages(fetched);
        if (deepLinkDraft) setMessageText(deepLinkDraft);
      }).catch(() => toast.error(translateApiMessage("未找到对话")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, deepLinkConv]);

  // ?contact=<id> deep link (call logs, CRM, follow-ups) — open that contact's chat
  useEffect(() => {
    if (contactLinkHandled.current || deepLinkConv || !deepLinkContact || !conversations.length) return;
    contactLinkHandled.current = true;
    const conv = conversations.find(c => {
      const cc = c.contact as unknown as { _id?: string } | string | undefined;
      const id = typeof cc === 'string' ? cc : cc?._id;
      return id === deepLinkContact;
    });
    if (conv) {
      loadMessages(conv);
      if (deepLinkDraft) setMessageText(deepLinkDraft);
      return;
    }
    conversationApi.startNew({ contactId: deepLinkContact }).then(r => {
      const fetched = r.data.data;
      if (!fetched) return;
      setConversations(prev => prev.some(c => c._id === fetched._id) ? prev : [fetched, ...prev]);
      loadMessages(fetched);
      if (deepLinkDraft) setMessageText(deepLinkDraft);
    }).catch(() => toast.error(translateApiMessage("找不到此联系人的聊天记录")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, deepLinkContact]);

  // Close attach menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // MSG-16: the socket is created by authStore (connectSocket) outside this page. It can appear
  // after this page mounts, or be replaced by a later connectSocket() (e.g. loadUser running again
  // while the old socket is down). Track the current instance so the listeners below are
  // (re)attached to the live socket instead of staying on a dead one.
  const [liveSocket, setLiveSocket] = useState<ReturnType<typeof getSocket>>(() => getSocket());
  useEffect(() => {
    const check = () => { const s = getSocket(); setLiveSocket((prev) => (prev === s ? prev : s)); };
    check();
    const t = setInterval(check, 1000);
    return () => clearInterval(t);
  }, []);

  // Socket listeners
  useEffect(() => {
    const socket = liveSocket;
    if (!socket) return;

    const onNewMessage = (data: { message: Message; conversationId: string } | Message) => {
      const msg = 'message' in data && data.conversationId ? data.message : data as Message;
      const rawConv = 'conversationId' in data ? data.conversationId : msg.conversation;
      const convId = String((rawConv as unknown as { _id?: string })?._id ?? rawConv);

      if (convId === selectedConv?._id) {
        setMessages((prev) => {
          if (prev.some(m => m._id === msg._id)) return prev;
          return [...prev, msg];
        });
      }
      let known = true;
      const now = new Date().toISOString();
      const preview = {
        text: msg.text || (msg.media && (msg.media as { caption?: string }).caption) || '',
        timestamp: msg.createdAt || now,
        direction: msg.direction,
        type: msg.type || 'text',
      } as unknown as Message;
      setConversations((prev) => {
        const exists = prev.some((c) => c._id === convId);
        if (exists) {
          return prev.map((c) =>
            c._id === convId ? { ...c, lastMessage: preview, unreadCount: c._id === selectedConv?._id ? 0 : msg.direction === 'inbound' ? (c.unreadCount || 0) + 1 : (c.unreadCount || 0), updatedAt: now } : c
          );
        }
        known = false;
        return prev;
      });
      if (!known) {
        conversationApi.list({ channel: channelFilter !== 'all' ? channelFilter : undefined } as Record<string, string | undefined>)
          .then(r => setConversations(prev => {
            const seen = new Set(prev.map(c => c._id));
            const fresh = (r.data.data || []).filter((c: Conversation) => !seen.has(c._id));
            return [...fresh, ...prev];
          })).catch(() => {});
      }
      if (convId === selectedConv?._id) api.put(`/conversations/${convId}/read`).catch(() => {});
    };

    const onConversationUpdated = (raw: Conversation) => {
      const conv = user?.maskNumbers ? maskConversation(raw) : raw;
      let exists = false;
      setConversations((prev) => {
        exists = prev.some((c) => c._id === conv._id);
        if (!exists) return prev;
        return prev.map((c) => {
          if (c._id !== conv._id) return c;
          const mergedContact = (typeof conv.contact === 'string' && typeof c.contact === 'object')
            ? c.contact
            : conv.contact;
          return { ...c, ...conv, contact: mergedContact };
        });
      });
      if (!exists) {
        // Unknown conversation: let the server (which enforces this user's inbox scope)
        // decide if it belongs here, so unassigned chats never leak into a scoped agent's inbox.
        conversationApi.list({ channel: channelFilter !== 'all' ? channelFilter : undefined } as Record<string, string | undefined>)
          .then(r => setConversations(prev => {
            if (prev.some(c => c._id === conv._id)) return prev;
            const found = (r.data.data || []).find((c: Conversation) => c._id === conv._id);
            return found ? [found, ...prev] : prev;
          })).catch(() => {});
      }
    };

    const onAgentTyping = ({ conversationId, agent }: { conversationId: string; agent: { name: string } }) => {
      if (conversationId === selectedConv?._id) setTypingAgent(agent.name);
    };

    const onAgentStoppedTyping = ({ conversationId }: { conversationId: string }) => {
      if (conversationId === selectedConv?._id) setTypingAgent(null);
    };

    const onMessageReaction = ({ messageId, reactions }: { messageId: string; reactions: { emoji: string; from: string }[] }) => {
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, reactions } : m)));
    };

    // Sent / delivered / read / failed ticks, pushed by the server as WhatsApp
    // receipts arrive. Only the open chat holds messages, and the status never
    // moves backwards (a read message stays read if a late "delivered" arrives).
    const onMessageStatus = ({ messageId, conversationId, status, errorMessage }: { messageId: string; conversationId?: string; status: Message['status']; errorMessage?: string }) => {
      if (conversationId && selectedConv?._id && String(conversationId) !== selectedConv._id) return;
      const RANK: Record<string, number> = { failed: 0, pending: 1, sent: 2, delivered: 3, read: 4 };
      setMessages((prev) => prev.map((m) => {
        if (String(m._id) !== String(messageId)) return m;
        if (status !== 'failed' && (RANK[status] ?? 0) <= (RANK[m.status] ?? 0)) return m;
        return { ...m, status, ...(errorMessage ? { errorMessage } : {}) };
      }));
    };

    const onPresence = ({ phone, online, lastSeen }: { phone: string; online: boolean; lastSeen: number | null }) => {
      const cp = (typeof selectedConv?.contact === 'object' && selectedConv?.contact) ? selectedConv.contact.phone : '';
      const norm = (s: string) => String(s || '').replace(/\D/g, '');
      if (selectedConv && norm(cp) && (norm(cp) === norm(phone) || norm(cp).endsWith(norm(phone)) || norm(phone).endsWith(norm(cp)))) {
        setPresence({ online, lastSeen: lastSeen || null });
      }
    };

    socket.on('waqr:presence', onPresence);
    socket.on('message_status', onMessageStatus);
    socket.on('message_reaction', onMessageReaction);
    socket.on('new_message', onNewMessage);
    socket.on('conversation_updated', onConversationUpdated);
    socket.on('agent_typing', onAgentTyping);
    socket.on('agent_stopped_typing', onAgentStoppedTyping);

    return () => {
      socket.off('waqr:presence', onPresence);
      socket.off('message_status', onMessageStatus);
      socket.off('message_reaction', onMessageReaction);
      socket.off('new_message', onNewMessage);
      socket.off('conversation_updated', onConversationUpdated);
      socket.off('agent_typing', onAgentTyping);
      socket.off('agent_stopped_typing', onAgentStoppedTyping);
    };
  }, [selectedConv, liveSocket]);

  const handleSend = async () => {
    if (sendLockRef.current || !messageText.trim() || !selectedConv) return;
    sendLockRef.current = true;
    setSending(true);
    emitTyping(selectedConv._id, false);
    try {
      const res = await conversationApi.sendMessage(selectedConv._id, { type: 'text', text: messageText, replyToId: replyTo?._id });
      setReplyTo(null);
      setMessages((prev) => {
        if (prev.some(m => m._id === res.data.data._id)) return prev;
        return [...prev, res.data.data];
      });
      setConversations(prev => prev.map(c => c._id === selectedConv._id ? { ...c, lastMessage: { ...(c.lastMessage || {}), text: res.data.data.text || '', type: res.data.data.type || 'text', direction: 'outbound', timestamp: new Date().toISOString() } as unknown as Message, updatedAt: new Date().toISOString() } : c));
      setMessageText('');
      if (res.data.data?.status === 'failed') toast.error(translateApiMessage(res.data.data.errorMessage || "消息无法发送"));
    } catch (err: unknown) {
      toast.error(translateApiMessage((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "发送消息失败"));
    }
    setSending(false);
    sendLockRef.current = false;
  };

  const loadStickerLib = async () => {
    try {
      const res = await conversationApi.stickerLibrary();
      setStickerLib(res.data.data || []);
    } catch { /* empty */ }
    setStickerLibLoaded(true);
  };

  const sendStickerUrl = async (url: string) => {
    if (!selectedConv || sendLockRef.current) return;
    sendLockRef.current = true;
    setShowStickers(false);
    try {
      const res = await conversationApi.sendMessage(selectedConv._id, { type: 'sticker', media: { url } });
      setMessages((prev) => prev.some(m => m._id === res.data.data._id) ? prev : [...prev, res.data.data]);
      if (res.data.data?.status === 'failed') {
        toast.error(translateApiMessage(res.data.data.errorMessage || "WhatsApp 无法发送此贴纸"));
      } else {
        setStickerLib((prev) => [{ url }, ...prev.filter(x => x.url !== url)]);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "发送贴纸失败"));
    }
    sendLockRef.current = false;
  };

  const handleAttachFile = (accept: string) => {
    setFileAccept(accept);
    setShowAttachMenu(false);
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv || sendLockRef.current) return;
    sendLockRef.current = true;
    setUploading(true);
    try {
      const asSticker = stickerModeRef.current;
      stickerModeRef.current = false;
      const formData = new FormData();
      formData.append('file', file);
      if (asSticker) formData.append('folder', 'stickers');
      const uploadRes = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { url, filename, mimetype } = uploadRes.data.data;
      const name = filename || file.name;
      const type = asSticker ? 'sticker' :
                   mimetype.startsWith('image/') ? 'image' :
                   mimetype.startsWith('video/') ? 'video' :
                   mimetype.startsWith('audio/') ? 'audio' : 'document';
      const caption = asSticker ? '' : messageText.trim();
      const res = await conversationApi.sendMessage(selectedConv._id, {
        type,
        media: { url, caption, mimetype, mimeType: mimetype, filename: type === 'document' ? name : '' },
      });
      if (caption) setMessageText('');
      setMessages((prev) => {
        if (prev.some(m => m._id === res.data.data._id)) return prev;
        return [...prev, res.data.data];
      });
      if (res.data.data?.status === 'failed') {
        toast.error(translateApiMessage(res.data.data.errorMessage || "WhatsApp 无法发送此文件"));
      }
    } catch (err: unknown) {
      console.error('Upload failed:', err);
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "无法发送文件 - 尝试较小的文件（视频最大 16 MB）"));
    }
    setUploading(false);
    sendLockRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const [showEmoji, setShowEmoji] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [stickerLib, setStickerLib] = useState<{ url: string; mimetype?: string }[]>([]);
  const [stickerLibLoaded, setStickerLibLoaded] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordCancelledRef = useRef(false);

  const stopRecordTimer = () => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
  };

  const startRecording = async () => {
    if (recording || !selectedConv) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
        .find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) || '';
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordChunksRef.current = [];
      recordCancelledRef.current = false;
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) recordChunksRef.current.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        stopRecordTimer();
        setRecording(false);
        if (recordCancelledRef.current || recordChunksRef.current.length === 0) return;
        const baseType = (rec.mimeType || 'audio/webm').split(';')[0];
        const ext = baseType.includes('ogg') ? 'ogg' : baseType.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(recordChunksRef.current, { type: baseType });
        setUploading(true);
        try {
          const fd = new FormData();
          fd.append('file', new File([blob], `voice-note.${ext}`, { type: baseType }));
          const uploadRes = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          const { url, mimetype } = uploadRes.data.data;
          const res = await conversationApi.sendMessage(selectedConv._id, {
            type: 'audio',
            media: { url, caption: "语音留言", mimetype },
          });
          setMessages((prev) => prev.some(m => m._id === res.data.data._id) ? prev : [...prev, res.data.data]);
        } catch { toast.error(translateApiMessage("语音留言失败")); }
        setUploading(false);
      };
      rec.start();
      mediaRecorderRef.current = rec;
      setRecording(true);
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
    } catch {
      toast.error(translateApiMessage("麦克风访问被拒绝"));
    }
  };

  const finishRecording = (cancel: boolean) => {
    recordCancelledRef.current = cancel;
    mediaRecorderRef.current?.stop();
  };

  const handleQuickReply = (reply: {message: string; stickerUrl?: string}) => {
    setShowQuickReplies(false);
    setShowAttachMenu(false);
    if (reply.stickerUrl) {
      sendStickerUrl(reply.stickerUrl);
      if (reply.message) setMessageText(reply.message);
      return;
    }
    setMessageText(reply.message);
  };

  const fillVars = (body: string, vars: string[]) =>
    (body || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => vars[parseInt(n, 10) - 1]?.trim() || m);

  const tplPreviewData = (t: ChatTemplate, vars: string[]) => ({
    headerType: t.header?.type,
    headerText: t.header?.content || '',
    headerMediaUrl: tplMediaUrl || t.header?.mediaUrl || '',
    body: fillVars(t.body, vars),
    footer: t.footer || '',
    buttons: (t.buttons || []).map(b => ({ type: (b.type || '').toUpperCase() === 'URL' ? 'URL' : (b.type || '').toUpperCase() === 'PHONE' ? 'PHONE_NUMBER' : 'QUICK_REPLY', text: b.text })),
  });

  const countTemplateVars = (body: string) => {
    const matches = (body || '').match(/\{\{\s*\d+\s*\}\}/g) || [];
    const nums = matches.map(m => parseInt(m.replace(/\D/g, ''), 10));
    return nums.length ? Math.max(...nums) : 0;
  };

  const handlePickTemplate = (template: ChatTemplate) => {
    const n = countTemplateVars(template.body);
    setTplToSend(template);
    setTplVars(Array(n).fill(''));
    setTplMediaUrl('');
  };

  const handleTplMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTplMediaUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setTplMediaUrl(res.data.data?.url || '');
      toast.success(translateApiMessage("文件已上传"));
    } catch { toast.error(translateApiMessage("上传失败")); }
    setTplMediaUploading(false);
    e.target.value = '';
  };

  const buildTplPayload = (template: ChatTemplate, vars: string[]) => {
    const components: Array<{type: string; parameters: Array<Record<string, unknown>>}> = [];
    const hType = template.header?.type;
    const headerMedia = tplMediaUrl || template.header?.mediaUrl || '';
    if (hType && ['image', 'video', 'document'].includes(hType) && headerMedia) {
      components.push({ type: 'header', parameters: [{ type: hType, [hType]: { link: headerMedia } }] });
    }
    if (vars.length) {
      components.push({ type: 'body', parameters: vars.map(v => ({ type: 'text', text: v })) });
    }
    return { id: template._id, name: template.name, language: template.language || 'en', components };
  };

  const sendTemplateToConv = async (convId: string, template: ChatTemplate, vars: string[], fromNumberId?: string) => {
    const res = await conversationApi.sendMessage(convId, {
      type: 'template',
      template: buildTplPayload(template, vars),
      ...(fromNumberId ? { fromNumberId } : {}),
    });
    return res;
  };

  const handleSendTemplate = async (template: ChatTemplate, vars: string[]) => {
    if (submitting || !selectedConv) return;
    setSubmitting(true);
    setSending(true);
    try {
      const res = await sendTemplateToConv(selectedConv._id, template, vars, tplFromNumber || undefined);
      setMessages((prev) => {
        if (prev.some(m => m._id === res.data.data._id)) return prev;
        return [...prev, res.data.data];
      });
      if (res.data.data?.status === 'failed') {
        toast.error(translateApiMessage(res.data.data.errorMessage || "模板发送失败"));
      } else {
        toast.success(translateApiMessage("模板已发送"));
      }
    } catch { toast.error(translateApiMessage("模板发送失败")); }
    setSending(false);
    setSubmitting(false);
    setShowTemplateModal(false);
    setTplToSend(null);
  };

  const handleSendNewMsg = async () => {
    if (submitting || !newMsgTpl) return;
    const phone = newMsgPhone.replace(/\D/g, '');
    if (phone.length < 10) { toast.error(translateApiMessage("输入有效的电话号码")); return; }
    setSubmitting(true);
    try {
      const convRes = await api.post('/conversations/by-phone', { phone });
      const conv = convRes.data.data;
      const res = await sendTemplateToConv(conv._id, newMsgTpl, newMsgVars, newMsgFrom || undefined);
      if (res.data.data?.status === 'failed') {
        toast.error(translateApiMessage(res.data.data.errorMessage || "模板发送失败"));
      } else {
        toast.success(translateApiMessage("消息已发送至" + phone));
        setShowNewMsg(false); setNewMsgPhone(''); setNewMsgTpl(null); setNewMsgVars([]);
        setConversations(prev => prev.some(c => c._id === conv._id) ? prev : [conv, ...prev]);
        loadMessages(conv);
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Send failed';
      toast.error(translateApiMessage(msg));
    }
    setSubmitting(false);
  };

  const getConvEmail = (conv: Conversation | null): string => {
    if (!conv || typeof conv.contact === 'string' || !conv.contact) return '';
    return (conv.contact as { email?: string }).email || (conv.contact as { phone?: string }).phone || '';
  };

  const stripSubjectPrefix = (raw: string): { subject: string; body: string } => {
    const m = (raw || '').match(/^Subject:\s*([\s\S]*?)\n\n([\s\S]*)$/);
    return m ? { subject: m[1].trim(), body: m[2].trim() } : { subject: '', body: (raw || '').trim() };
  };

  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const openEmailCompose = (mode: 'new' | 'reply' | 'replyAll' | 'forward', srcMsg?: Message) => {
    const base = (selectedConv as unknown as { lastSubject?: string } | null)?.lastSubject || '';
    const src = srcMsg || [...messages].reverse().find(m => (m as { metadata?: { source?: string } }).metadata?.source === 'email') || messages[messages.length - 1];
    const parsed = src ? stripSubjectPrefix(src.text || '') : { subject: '', body: '' };
    const origSubject = parsed.subject || base;
    let to = '', subject = '', quoted = '';
    const when = src ? new Date(src.createdAt).toLocaleString() : '';
    const fromEmail = getConvEmail(selectedConv);
    if (mode === 'new') {
      to = ''; subject = ''; quoted = '';
    } else if (mode === 'forward') {
      subject = /^fwd:/i.test(origSubject) ? origSubject : 'Fwd: ' + origSubject;
      quoted = `<br/><br/><div style="border-left:3px solid #ddd;padding-left:10px;color:#555">---------- Forwarded message ----------<br/>From: ${escapeHtml(fromEmail)}<br/>Subject: ${escapeHtml(origSubject)}<br/><br/>${escapeHtml(parsed.body).replace(/\n/g, '<br/>')}</div>`;
    } else {
      to = fromEmail;
      subject = /^re:/i.test(origSubject) ? origSubject : 'Re: ' + origSubject;
      quoted = `<br/><br/><div style="border-left:3px solid #ddd;padding-left:10px;color:#555">On ${escapeHtml(when)}, ${escapeHtml(fromEmail)} wrote:<br/>${escapeHtml(parsed.body).replace(/\n/g, '<br/>')}</div>`;
    }
    setEmailMode(mode);
    setNewEmail({ to, cc: '', subject, body: '' });
    setEmailDraftHtml(quoted);
    setShowCc(mode === 'replyAll');
    setEmailAttachments([]);
    setShowNewMsg(true);
  };

  useEffect(() => {
    if (showNewMsg && channelFilter === 'email' && emailBodyRef.current) {
      emailBodyRef.current.innerHTML = emailDraftHtml || '';
      setNewEmail(p => ({ ...p, body: emailBodyRef.current?.innerText || '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNewMsg]);

  const handleEmailAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setEmailUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const r = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        const { url, filename } = r.data.data;
        setEmailAttachments(prev => [...prev, { url, filename: filename || file.name }]);
      }
    } catch { toast.error(translateApiMessage("附件上传失败")); }
    setEmailUploading(false);
    if (emailFileRef.current) emailFileRef.current.value = '';
  };

  const execFmt = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    emailBodyRef.current?.focus();
  };

  const handleSendNewEmail = async () => {
    if (submitting) return;
    const html = emailBodyRef.current?.innerHTML || '';
    const text = (emailBodyRef.current?.innerText || newEmail.body).trim();
    if (!newEmail.to.trim() || !text) { toast.error(translateApiMessage("收件人电子邮件和消息为必填项")); return; }
    setSubmitting(true);
    try {
      const res = await api.post('/conversations/by-email', {
        to: newEmail.to, cc: newEmail.cc, subject: newEmail.subject, body: text, html, attachments: emailAttachments,
      });
      const conv = res.data.data?.conversation;
      if (res.data.data?.message?.status === 'failed') {
        toast.error(translateApiMessage(res.data.data.message.errorMessage || "电子邮件发送失败"));
      } else {
        toast.success(translateApiMessage("电子邮件已发送至" + newEmail.to));
        setShowNewMsg(false); setNewEmail({ to: '', cc: '', subject: '', body: '' });
        setEmailDraftHtml(''); setEmailMode('new');
        setEmailAttachments([]);
        if (emailBodyRef.current) emailBodyRef.current.innerHTML = '';
        if (conv) {
          setConversations(prev => prev.some(c => c._id === conv._id) ? prev : [conv, ...prev]);
          loadMessages(conv);
        }
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Email send failed';
      toast.error(translateApiMessage(msg));
    }
    setSubmitting(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent': return <Check className="w-3 h-3 text-gray-400" />;
      case 'delivered': return <CheckCheck className="w-3 h-3 text-gray-400" />;
      case 'read': return <CheckCheck className="w-3 h-3 text-blue-500" />;
      case 'failed': return <AlertCircle className="w-3 h-3 text-red-500" />;
      default: return <Clock className="w-3 h-3 text-gray-300" />;
    }
  };

  // Who sent an outbound message — the agent's name (admins can see which agent
  // replied), or the automation that sent it.
  const senderName = (msg: Message) => {
    const by = msg.sentBy;
    if (by && typeof by === 'object' && by.name) return by.name;
    const meta = (msg as { metadata?: { source?: string; flowName?: string } }).metadata;
    if (meta?.source === 'bot_flow') return meta.flowName ? `Bot · ${meta.flowName}` : 'Bot';
    return '';
  };

  const renderMessageContent = (msg: Message) => {
    // Email messages: show a compact card (subject + collapsible body) so a
    // long email never takes over the whole view.
    const isEmail = (msg as { metadata?: { source?: string } }).metadata?.source === 'email'
      || (selectedConv as unknown as { channel?: string } | null)?.channel === 'email';
    if (isEmail && (msg.text || '').length > 0) {
      const raw = msg.text || '';
      const m = raw.match(/^Subject:\s*([\s\S]*?)\n\n([\s\S]*)$/);
      const subject = m ? m[1].trim() : ((selectedConv as unknown as { lastSubject?: string } | null)?.lastSubject || '(no subject)');
      const body = (m ? m[2] : raw).trim();
      const emailHtml = (msg as { metadata?: { html?: string } }).metadata?.html || '';
      return (
        <div className="min-w-0 max-w-full">
          <div className="flex items-center gap-1 mb-1 text-xs font-semibold text-orange-600">
            <Mail className="w-3.5 h-3.5" /> 邮箱
          </div>
          <div className="text-sm font-semibold text-gray-900 wrap-break-word mb-1">{subject}</div>
          <details className="group/email" open>
            <summary className="cursor-pointer text-xs text-emerald-600 hover:underline list-none select-none">
              显示/隐藏完整电子邮件
            </summary>
            {emailHtml ? (
              <iframe
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                srcDoc={`<base target="_blank"><style>body{margin:8px;font-family:system-ui,sans-serif;font-size:14px;color:#111;word-break:break-word}img{max-width:100%;height:auto}</style>${emailHtml}`}
                className="w-full mt-2 border-t border-black/5 bg-white rounded"
                style={{ height: '60vh', minWidth: '280px' }}
                title={"电子邮件内容"}
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap wrap-break-word wrap-anywhere mt-2 max-h-[60vh] overflow-y-auto border-t border-black/5 pt-2">
                {body.replace(/<(https?:\/\/[^>\s]+)>/g, '$1').split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                  /^https?:\/\//.test(part)
                    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline break-all">{part.length > 60 ? part.slice(0, 57) + '…' : part}</a>
                    : part
                )}
              </p>
            )}
          </details>
          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-black/5 text-xs">
            <button onClick={() => openEmailCompose('reply', msg)} className="text-emerald-600 hover:underline font-medium">回复</button>
            <button onClick={() => openEmailCompose('replyAll', msg)} className="text-emerald-600 hover:underline font-medium">全部回复</button>
            <button onClick={() => openEmailCompose('forward', msg)} className="text-emerald-600 hover:underline font-medium">转发</button>
          </div>
        </div>
      );
    }
    // Stored interactive messages (bot flow / automation buttons & lists)
    const storedInter = msg.type === 'interactive'
      ? (msg.interactive as { type?: string; body?: string; ctaText?: string; ctaUrl?: string; buttons?: { id?: string; title?: string }[]; sections?: { title?: string; rows?: { id?: string; title?: string; description?: string }[] }[] } | undefined)
      : undefined;
    if (storedInter && ((storedInter.buttons?.length || 0) > 0 || (storedInter.sections?.length || 0) > 0 || storedInter.ctaUrl)) {
      return (
        <div>
          <p className="text-sm whitespace-pre-wrap wrap-break-word wrap-anywhere">{msg.text || storedInter.body || ''}</p>
          {(storedInter.buttons?.length || 0) > 0 && (
            <div className="mt-2 space-y-1">
              {storedInter.buttons!.map((b, i) => (
                <div key={b.id || i} className="text-center text-sm font-medium text-emerald-700 bg-white/70 border border-emerald-200 rounded-lg px-3 py-1.5">{b.title}</div>
              ))}
            </div>
          )}
          {storedInter.ctaUrl && (
            <a href={storedInter.ctaUrl} target="_blank" rel="noopener noreferrer" className="block mt-2 text-center text-sm font-medium text-emerald-700 bg-white/70 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-50">{storedInter.ctaText || "打开链接"}</a>
          )}
          {(storedInter.sections?.length || 0) > 0 && (
            <div className="mt-2 border border-emerald-200 rounded-lg overflow-hidden bg-white/70">
              {storedInter.sections!.map((s, si) => (
                <div key={si}>
                  {s.title && <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-emerald-50">{s.title}</div>}
                  {(s.rows || []).map((r, ri) => (
                    <div key={r.id || ri} className="px-3 py-1.5 text-sm border-t border-emerald-100 first:border-t-0">
                      <span className="font-medium text-gray-800">{r.title}</span>
                      {r.description && <span className="block text-xs text-gray-400">{r.description}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    // Interactive CTA (Form) messages
    const interRaw = msg.type === 'interactive' ? (msg.interactive as Record<string, unknown> | undefined) : undefined;
    const interHeader = interRaw?.header as Record<string, string> | undefined;
    const interBody = interRaw?.body as Record<string, string> | undefined;
    if (msg.type === 'interactive' && interRaw && (interHeader?.text || interBody?.text)) {
      const inter = interRaw;
      const header = interHeader;
      const body = interBody;
      const footer = inter.footer as Record<string, string> | undefined;
      const action = inter.action as Record<string, unknown> | undefined;
      const params = action?.parameters as Record<string, string> | undefined;
      return (
        <div className="border border-emerald-200 rounded-lg overflow-hidden max-w-[260px]">
          {header?.text && <div className="bg-emerald-50 px-3 py-2 font-semibold text-sm text-emerald-800">{header.text}</div>}
          {body?.text && <div className="px-3 py-2 text-sm text-gray-700">{body.text}</div>}
          {footer?.text && <div className="px-3 py-1 text-xs text-gray-400">{footer.text}</div>}
          {params?.url && (
            <a href={params.url} target="_blank" rel="noopener noreferrer" className="block border-t border-emerald-200 px-3 py-2 text-center text-sm font-medium text-emerald-600 hover:bg-emerald-50">
              {params.display_text || "打开"}
            </a>
          )}
        </div>
      );
    }

    const isTemplate = msg.type === 'template';
    const isCampaign = (msg.text || '').startsWith('Campaign:') || isTemplate;

    if (isTemplate || isCampaign) {
      return (
        <div>
          {isTemplate && (
            <div className="flex items-center gap-1 mb-1 text-xs opacity-70">
              <LayoutTemplate className="w-3 h-3" /> 模板{(msg.template as { name?: string })?.name ? `: ${(msg.template as { name?: string }).name}` : ''}
            </div>
          )}
          {msg.media?.url && /\.(mp4|webm|mov)$/i.test(msg.media.url) && (
            <video src={msg.media.url} controls className={`rounded-lg mb-1 ${MEDIA_BOX}`} />
          )}
          {msg.media?.url && /\.pdf$/i.test(msg.media.url) && (
            <a href={msg.media.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg mb-1 hover:bg-gray-200">
              <FileText className="w-5 h-5 text-blue-500" />
              <span className="text-sm underline">{msg.media.filename || "文件"}</span>
            </a>
          )}
          {msg.media?.url && !/\.(mp4|webm|mov|pdf)$/i.test(msg.media.url) && (
            <img src={msg.media.url} alt="" onClick={() => setLightbox({ url: msg.media!.url, caption: msg.media?.caption || msg.text || '' })} className={`rounded-lg mb-1 cursor-zoom-in ${MEDIA_BOX}`} />
          )}
          <p className="text-sm whitespace-pre-wrap">{msg.text || msg.media?.caption || (msg.template as { name?: string })?.name || ''}</p>
        </div>
      );
    }

    return (
      <>
        {msg.media?.url && (msg.type === 'image' || msg.type === 'sticker') && (
          <img src={msg.media.url} alt="" onClick={() => setLightbox({ url: msg.media!.url, caption: msg.media?.caption || msg.text || '' })}
            className={`rounded-lg mb-1 cursor-zoom-in ${msg.type === 'sticker' ? 'max-w-[140px]' : MEDIA_BOX}`} />
        )}
        {(() => {
          const loc = (msg as { location?: { latitude?: number; longitude?: number; name?: string; address?: string } }).location;
          if (loc?.latitude == null) return null;
          return (
            <a href={`https://maps.google.com/?q=${loc.latitude},${loc.longitude}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg mb-1 hover:bg-gray-200">
              <MapPin className="w-5 h-5 text-red-500 shrink-0" />
              <span className="text-sm underline">{loc.name || loc.address || "查看位置"}</span>
            </a>
          );
        })()}
        {msg.media?.url && msg.type === 'video' && (
          <video src={msg.media.url} controls className={`rounded-lg mb-1 ${MEDIA_BOX}`} />
        )}
        {msg.media?.url && msg.type === 'audio' && (
          <audio src={msg.media.url} controls className="w-full mb-1" />
        )}
        {msg.media?.url && msg.type === 'document' && (() => {
          const url = msg.media.url;
          const name = msg.media.filename || msg.media.caption || 'Document';
          const isPdf = /pdf/i.test(msg.media.mimeType || '') || /\.pdf($|\?)/i.test(url);
          return (
            <div className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg mb-1">
              <FileText className="w-5 h-5 text-blue-500 shrink-0" />
              {isPdf ? (
                <button type="button" onClick={() => setDocPreview({ url, name })} className="text-sm underline text-left break-all">{name}</button>
              ) : (
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline break-all">{name}</a>
              )}
              <a href={url} download target="_blank" rel="noopener noreferrer" title={"下载"} className="ml-auto shrink-0 text-gray-500 hover:text-gray-700"><Download className="w-4 h-4" /></a>
            </div>
          );
        })()}
        <p className="text-sm whitespace-pre-wrap wrap-break-word wrap-anywhere">{prettyMetaText(msg.text || msg.media?.caption || '')}</p>
        {(msg as { metadata?: { translation?: string } }).metadata?.translation && (
          <p className="text-xs italic opacity-70 mt-1 pt-1 border-t border-black/10">🌐 {(msg as { metadata?: { translation?: string } }).metadata!.translation}</p>
        )}
      </>
    );
  };

  const handleSendPreset = async (presetId: string) => {
    if (!selectedConv || sending || sendLockRef.current) return;
    sendLockRef.current = true;
    setSending(true);
    try {
      const res = await api.post(`/preset-messages/${presetId}/send`, { conversationId: selectedConv._id });
      if (res.data.success) toast.success(translateApiMessage("预设已发送（免费 — 无模板费用）"));
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "预设发送失败"));
    }
    setSending(false);
    sendLockRef.current = false;
    setShowPresetModal(false);
  };

  const handleForwardMessage = async (targetConvId: string) => {
    if (!forwardMsg || forwardingTo) return;
    setForwardingTo(targetConvId);
    try {
      if (forwardMsg.type === 'text') {
        await conversationApi.sendMessage(targetConvId, { type: 'text', text: forwardMsg.text || '' });
      } else if (forwardMsg.media?.url) {
        await conversationApi.sendMessage(targetConvId, { type: forwardMsg.type, media: forwardMsg.media });
      }
      toast.success(translateApiMessage("消息已转发"));
      setForwardMsg(null);
      setForwardSearch('');
    } catch { toast.error(translateApiMessage("转发失败")); }
    setForwardingTo(null);
  };

  const handleBulkAction = async (action: 'close' | 'delete') => {
    if (bulkSelected.size === 0) return;
    const ids = Array.from(bulkSelected);
    try {
      if (action === 'close') {
        await Promise.all(ids.map(id => conversationApi.resolve(id)));
        toast.success(translateApiMessage(`${ids.length} 聊天已关闭`));
      } else {
        if (!confirm(`删除 ${ids.length} 对话？`)) return;
        await Promise.all(ids.map(id => api.delete('/conversations/' + id)));
        toast.success(translateApiMessage(`${ids.length} 聊天记录已删除`));
      }
      setConversations(prev => action === 'delete' ? prev.filter(c => !bulkSelected.has(c._id)) : prev.map(c => bulkSelected.has(c._id) ? { ...c, status: 'closed' } as Conversation : c));
      setBulkSelected(new Set());
      setBulkMode(false);
    } catch { toast.error(translateApiMessage("批量操作失败")); }
  };

  const handleScheduleSend = async () => {
    if (!messageText.trim() || !selectedConv || !scheduleTime) return;
    try {
      await api.post('/conversations/' + selectedConv._id + '/schedule', { text: messageText, scheduledAt: new Date(scheduleTime).toISOString() });
      toast.success(translateApiMessage("已安排消息"));
      setMessageText('');
      setScheduleMode(false);
      setScheduleTime('');
    } catch { toast.error(translateApiMessage("计划失败")); }
  };

  // Products are sent through the catalogue share endpoint so the customer also gets
  // the catalogue link (and the product image) along with the intro message.

  const togglePin = async (conv: Conversation) => {
    const willPin = !(conv as { pinnedAt?: string }).pinnedAt;
    const newVal = willPin ? new Date().toISOString() : undefined;
    setConversations(prev => prev.map(c => c._id === conv._id ? ({ ...c, pinnedAt: newVal } as Conversation) : c));
    setSearchConvs(prev => prev ? prev.map(c => c._id === conv._id ? ({ ...c, pinnedAt: newVal } as Conversation) : c) : prev);
    try { await conversationApi.pin(conv._id, willPin); } catch { toast.error(translateApiMessage("PIN 码失败")); }
  };

  const convSortTime = (c: Conversation) => new Date((c.lastMessage as unknown as { timestamp?: string })?.timestamp || (c as unknown as { lastMessageAt?: string }).lastMessageAt || c.updatedAt || 0).getTime();
  const filteredConversations = (() => {
    const base = (searchConvs !== null ? searchConvs : reminderConvs !== null ? reminderConvs : conversations).filter((c) => {
      const convChannel = (c as unknown as { channel?: string }).channel || 'whatsapp';
      if (channelFilter !== 'all' && convChannel !== channelFilter) return false;
      if (labelFilter === '__reminder') { if (!hasReminder(c)) return false; }
      else if (labelFilter !== 'all' && !getContactTags(c).some(t => t._id === labelFilter)) return false;
      
      if (!searchQuery || searchConvs !== null) return true;
      const q = searchQuery.toLowerCase();
      return getContactName(c).toLowerCase().includes(q) || getContactPhone(c).includes(q);
    });
    // Same customer's WhatsApp Cloud + QR threads collapse into one row (one
    // customer = one chat). Other channels (email/FB/IG/Telegram) stay separate.
    const byKey = new Map<string, Conversation>();
    for (const c of base) {
      const ch = (c as unknown as { channel?: string }).channel || 'whatsapp';
      const cid = getContactId(c);
      const key = (cid && (ch === 'whatsapp' || ch === 'whatsapp_qr')) ? `wa:${cid}` : `${ch}:${c._id}`;
      const cur = byKey.get(key);
      if (!cur) { byKey.set(key, c); continue; }
      const cp = !!(c as { pinnedAt?: string }).pinnedAt, pp = !!(cur as { pinnedAt?: string }).pinnedAt;
      if ((cp && !pp) || (cp === pp && convSortTime(c) > convSortTime(cur))) byKey.set(key, c);
    }
    return Array.from(byKey.values()).sort((a, b) => {
      const ap = (a as { pinnedAt?: string }).pinnedAt, bp = (b as { pinnedAt?: string }).pinnedAt;
      if (ap && !bp) return -1;
      if (!ap && bp) return 1;
      if (ap && bp) return new Date(bp).getTime() - new Date(ap).getTime();
      const at = convSortTime(a), bt = convSortTime(b);
      if (sortOrder === 'unread') {
        const au = (a.unreadCount || 0) > 0 ? 1 : 0;
        const bu = (b.unreadCount || 0) > 0 ? 1 : 0;
        if (au !== bu) return bu - au;
        return bt - at;
      }
      if (sortOrder === 'oldest') return at - bt;
      return bt - at;
    });
  })();

  // Channel of the currently open conversation. WhatsApp-only features
  // (templates, presets, voice calls, AI toggles, payment links) are hidden
  // for Telegram / Instagram / Facebook / Email chats.
  const selectedChannel = (selectedConv as unknown as { channel?: string } | null)?.channel || 'whatsapp';
  const isWaChat = selectedChannel === 'whatsapp';
  // Official WhatsApp only: free-form replies are allowed for 24h after the last inbound message.
  const [windowTick, setWindowTick] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setWindowTick(Date.now()), 60000); return () => clearInterval(t); }, []);
  const waWindowClosed = (() => {
    if (!isWaChat || !selectedConv || messages.length === 0) return false;
    let lastInbound = 0;
    for (const m of messages) { if (m.direction === 'inbound') { const t = new Date(m.createdAt).getTime(); if (t > lastInbound) lastInbound = t; } }
    if (!lastInbound) return false;
    return lastInbound + 24 * 60 * 60 * 1000 <= windowTick;
  })();
  // Channels where free-form sends work (Pay / Preset / Invoice / Chat AI)
  const isMsgChat = ['whatsapp', 'whatsapp_qr', 'telegram', 'telegram_personal', 'facebook', 'instagram'].includes(selectedChannel);
  // Website chats run the same AI auto-reply, so they get the per-chat AI switch too.
  const canToggleChatAi = isMsgChat;

  const getConversationPreview = (conv: Conversation) => {
    const text = prettyMetaText(conv.lastMessage?.text || '');
    if (text.startsWith('Campaign:')) return text;
    if (conv.lastMessage?.type === 'template') return text.startsWith('Template:') ? text : `Template: ${text}`;
    if (conv.lastMessage?.type === 'image') return 'Image';
    if (conv.lastMessage?.type === 'video') return 'Video';
    if (conv.lastMessage?.type === 'document') return 'Document';
    if (conv.lastMessage?.type === 'audio') return 'Audio';
    if (conv.lastMessage?.type === 'sticker') return 'Sticker';
    return text || getContactSubtitle(conv) || '';
  };

  return (
    <div data-ui-inbox className="flex h-[calc(100svh-4rem)] md:h-[calc(100vh-7rem)] -m-4 md:m-0 bg-white rounded-none md:rounded-xl border-0 md:border border-gray-200 overflow-hidden" data-kkhs-inbox={kkhs ? (selectedConv && ctxOpen ? 'ctx' : 'on') : undefined}>
      {/* Conversation List */}
      <div className={`w-full md:w-80 lg:w-96 border-r border-gray-200 flex flex-col ${selectedConv ? 'hidden md:flex' : 'flex'}`} data-kkhs-list>
        {kkhs ? (
        <div className="kl-h" data-kkhs-lh>
          <div className="kl-srch">
            <Search />
            <input type="text" placeholder={"搜索姓名、号码或消息"} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <button type="button" className="kl-ic" title={"导出所有聊天记录"} onClick={() => setExportMenu(exportMenu === 'all' ? null : 'all')}><Download /></button>
            {channelFilter !== 'facebook' && channelFilter !== 'instagram' && (
              <button type="button" className="kl-ic kl-new" title={channelFilter === 'email' ? "撰写新电子邮件" : "新消息"}
                onClick={() => { if (channelFilter === 'email') { openEmailCompose('new'); } else if (channelFilter === 'whatsapp_qr') { setQrNewMsg(true); } else if (channelFilter === 'telegram' || channelFilter === 'telegram_personal') { setTgNewMsg(true); } else { setShowNewMsg(true); } }}><Plus /></button>
            )}
            {exportMenu === 'all' && (
              <div className="absolute right-2 top-9 z-20 bg-white border rounded-lg shadow-lg py-1 w-28">
                {['csv', 'pdf', 'html'].map(fm => (
                  <button key={fm} onClick={() => handleExportAll(fm)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 uppercase">{fm}</button>
                ))}
              </div>
            )}
          </div>
          <div className="kl-chtabs">
            {KKHS_CH.map(([k, l, c]) => (
              <Link key={k} href={`/client/chat?channel=${k}`} className="kl-chtab" aria-selected={channelFilter === k}>
                <i style={{ background: c }} />{l}{channelFilter === k && <span className="kl-n">{Math.max(convTotal, conversations.length)}</span>}
              </Link>
            ))}
          </div>
          <div className="kl-ftabs">
            {([['all', "全部"], ['active', "启用"], ['resolved', "已解决"], ['unread', "未读"], ['unassigned', "未分配"]] as const).map(([f, l]) => (
              <button key={f} type="button" className="kl-ftab" aria-selected={filter === f && labelFilter !== '__reminder'} onClick={() => { setFilter(f); if (labelFilter === '__reminder') setLabelFilter('all'); }}>{l}</button>
            ))}
            <button type="button" className="kl-ftab" aria-selected={labelFilter === '__reminder'} onClick={() => setLabelFilter(labelFilter === '__reminder' ? 'all' : '__reminder')}><Bell />提醒</button>
            <button type="button" className="kl-ftab" aria-selected={bulkMode} onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); }}><CheckSquare />散装</button>
            
          </div>
          {kkhsFilters && (
            <div className="kl-more">
              <select value={labelFilter} onChange={e => setLabelFilter(e.target.value)}>
                <option value="all">所有标签</option>
                <option value="__reminder">提醒设置</option>
                {allTags.map(t => <option key={t._id} value={t._id}>{translateDisplay(t.name)}</option>)}
              </select>
              
              <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
                <option value="all">所有来源</option>
                {SOURCE_FILTERS.map(([v, l]) => <option key={v} value={v}>{translateDisplay(l)}</option>)}
              </select>
              
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest' | 'unread')}>
                <option value="newest">最新的在前</option><option value="oldest">最旧的在前</option><option value="unread">先读未读</option>
              </select>
            </div>
          )}
          {notConnected && (
            <div className="kl-warn">
              <span><b>{CHANNEL_META[channelFilter]?.label || "这个频道"}</b> 尚未连接。</span>
              <Link href={CHANNEL_META[channelFilter]?.href || '/client/channels'}>连接</Link>
            </div>
          )}
          {bulkMode && bulkSelected.size > 0 && (
            <div className="kl-bulk">
              <span>{bulkSelected.size} 已选择</span>
              <button type="button" onClick={() => handleBulkAction('close')}>全部关闭</button>
              <button type="button" className="kl-danger" onClick={() => handleBulkAction('delete')}>删除</button>
              <button type="button" className="kl-clear" onClick={() => setBulkSelected(new Set())}>清除</button>
            </div>
          )}
          {msgResults.length > 0 && (
            <div className="kl-msgres">
              <p>消息 ({msgResults.length})</p>
              {msgResults.map(m => (
                <button key={m._id} type="button" onClick={() => { const conv = conversations.find(c => c._id === m.conversation); if (conv) { setSearchQuery(''); setMsgResults([]); loadMessages(conv); } }}>
                  <b>{m.contact?.name || m.contact?.phone || "未知"} <span>· {new Date(m.createdAt).toLocaleDateString('en-IN')}</span></b>
                  <small>{m.direction === 'outbound' ? "你：" : ''}{m.text}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        ) : (
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{channelFilter === 'whatsapp' ? 'WhatsApp' : channelFilter === 'whatsapp_qr' ? "WhatsApp 二维码" : channelFilter === 'instagram' ? 'Instagram' : channelFilter === 'facebook' ? 'Facebook' : channelFilter === 'telegram' ? "电报机器人" : channelFilter === 'telegram_personal' ? "个人电报" : channelFilter === 'email' ? "邮箱" : "对话"}</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                {Math.max(convTotal, conversations.length)}
              </span>
              <button onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); }} className={`p-1.5 rounded-lg border text-xs ${bulkMode ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`} title={"批量选择"}>
                <CheckSquare className="w-3.5 h-3.5" />
              </button>
              <div className="relative">
                <button onClick={() => setExportMenu(exportMenu === 'all' ? null : 'all')}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                  title={"导出所有聊天记录（备份）"}>
                  <Download className="w-3.5 h-3.5" />
                </button>
                {exportMenu === 'all' && (
                  <div className="absolute right-0 top-8 z-20 bg-white border rounded-lg shadow-lg py-1 w-28">
                    {['csv', 'pdf', 'html'].map(fm => (
                      <button key={fm} onClick={() => handleExportAll(fm)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 uppercase">{fm}</button>
                    ))}
                  </div>
                )}
              </div>
              {channelFilter !== 'facebook' && channelFilter !== 'instagram' && channelFilter !== 'widget' && (
              <button onClick={() => { if (channelFilter === 'email') { openEmailCompose('new'); } else if (channelFilter === 'whatsapp_qr') { setQrNewMsg(true); } else if (channelFilter === 'telegram' || channelFilter === 'telegram_personal') { setTgNewMsg(true); } else { setShowNewMsg(true); } }}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                title={channelFilter === 'email' ? "撰写新电子邮件" : "发送模板至任意号码（无需保存联系人）"}>
                <Plus className="w-3.5 h-3.5" /> {channelFilter === 'email' ? "新电子邮件" : "新消息"}
              </button>
              )}
            </div>
          </div>
          {notConnected && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-2">
              <p className="text-xs text-amber-800"><b>{CHANNEL_META[channelFilter]?.label || "这个频道"}</b> 尚未连接。</p>
              <Link href={CHANNEL_META[channelFilter]?.href || '/client/channels'} className="shrink-0 px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">连接</Link>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={"搜索会话..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {bulkMode && bulkSelected.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border-b border-emerald-100">
              <span className="text-xs font-medium text-emerald-700">{bulkSelected.size} 已选择</span>
              <button onClick={() => handleBulkAction('close')} className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700">全部关闭</button>
              <button onClick={() => handleBulkAction('delete')} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">删除</button>
              <button onClick={() => setBulkSelected(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-700">清除</button>
            </div>
          )}
          {msgResults.length > 0 && (
            <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
              <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase bg-gray-50">消息 ({msgResults.length})</p>
              {msgResults.map(m => (
                <button key={m._id}
                  onClick={() => {
                    const conv = conversations.find(c => c._id === m.conversation);
                    if (conv) { setSearchQuery(''); setMsgResults([]); loadMessages(conv); }
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50">
                  <p className="text-xs font-medium text-gray-800">{m.contact?.name || m.contact?.phone || "未知"} <span className="text-gray-400 font-normal">· {new Date(m.createdAt).toLocaleDateString('en-IN')}</span></p>
                  <p className="text-xs text-gray-500 truncate">{m.direction === 'outbound' ? "你：" : ''}{m.text}</p>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <TagIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select value={labelFilter} onChange={e => setLabelFilter(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded-lg text-xs text-gray-600 bg-white">
              <option value="all">所有标签</option>
              <option value="__reminder">⏰ 提醒设置</option>
              {allTags.map(t => <option key={t._id} value={t._id}>{translateDisplay(t.name)}</option>)}
            </select>
            
          </div>
          <div className="flex gap-1 mb-1">
            <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} title={"铅来源"}
              className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded-lg text-xs text-gray-600 bg-white">
              <option value="all">所有来源</option>
              {SOURCE_FILTERS.map(([v, l]) => <option key={v} value={v}>{translateDisplay(l)}</option>)}
            </select>
          </div>
          <div data-ui-inbox-tabs className="flex gap-0.5 items-center">
            {['all', 'unread', 'active', 'assigned', 'unassigned', 'resolved'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`px-1.5 py-0.5 text-[10px] rounded-full whitespace-nowrap ${filter === f ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {translateDisplay(f.charAt(0).toUpperCase() + f.slice(1))}
              </button>
            ))}
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest' | 'unread')}
              title={"对对话进行排序"}
              className="ml-auto text-[10px] border border-gray-200 rounded-full px-1.5 py-0.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="newest">最新的在前</option>
              <option value="oldest">最旧的在前</option>
              <option value="unread">先读未读</option>
            </select>
          </div>
          
        </div>
        )}

        <div
          className="flex-1 overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && hasMoreConvs && !convsLoadingMore && !loadingConvs) {
              loadMoreConversations();
            }
          }}
        >
          {loadingConvs ? (
            <div className="p-4 text-center text-gray-400">加载中…</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">{searchingConvs ? "正在搜索..." : searchQuery.trim().length >= 2 ? "未找到记录" : "没有对话"}</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div key={conv._id} className="relative group" data-kkhs-conv aria-selected={selectedConv?._id === conv._id}>
              <button
                onClick={() => { if (bulkMode) { setBulkSelected(prev => { const n = new Set(prev); if (n.has(conv._id)) n.delete(conv._id); else n.add(conv._id); return n; }); } else { loadMessages(conv); } }}
                className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${selectedConv?._id === conv._id ? 'bg-emerald-50' : ''} ${bulkSelected.has(conv._id) ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {bulkMode && (
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-2.5 ${bulkSelected.has(conv._id) ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-300'}`}>
                      {bulkSelected.has(conv._id) && <Check className="w-3 h-3" />}
                    </div>
                  )}
                  <ContactAvatar conv={conv} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-medium truncate ${hasReminder(conv) ? 'text-red-600' : 'text-gray-900'}`}>{hasReminder(conv) && <Bell className="w-3 h-3 inline mr-1 text-red-500" />}{getContactName(conv)}{(conv as { pinnedAt?: string }).pinnedAt && <Pin className="w-3 h-3 inline ml-1 text-emerald-600 align-middle" fill="currentColor" />}{sentimentBadge(conv)}{sourceChip(conv)}{conv.status === 'closed' && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-emerald-600 text-white align-middle font-medium">已解决</span>}{hasReminder(conv) && <span className="ml-1 text-[10px] text-red-500 font-normal">{new Date(reminderContacts[getContactId(conv)]).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}{(conv as { channel?: string }).channel === 'facebook' ? <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 align-middle">FB</span> : null}{(conv as { channel?: string }).channel === 'instagram' ? <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-pink-100 text-pink-700 align-middle">IG</span> : null}{(conv as { channel?: string }).channel === 'whatsapp_qr' ? <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700 align-middle">QR</span> : null}{(conv as { channel?: string }).channel === 'telegram' ? <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-sky-100 text-sky-700 align-middle">TG</span> : null}{(conv as { channel?: string }).channel === 'telegram_personal' ? <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-sky-100 text-sky-700 align-middle">TG-P</span> : null}{(conv as { channel?: string }).channel === 'email' ? <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-orange-100 text-orange-700 align-middle">邮箱</span> : null}</p>
                      <span className="text-xs text-gray-400 shrink-0 ml-1">{fmtListTime(conv.updatedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-gray-500 truncate">{getConversationPreview(conv)}</p>
                      {conv.unreadCount > 0 && (
                        <span className="bg-emerald-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{conv.unreadCount}</span>
                      )}
                    </div>
                    {(getContactTags(conv).length > 0 || getContactBadges(conv).length > 0 || (conv.tags && conv.tags.length > 0)) && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        
                        {getContactTags(conv).slice(0, 3).map((t) => (
                          <span key={t._id} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: (t.color || '#10b981') + '22', color: t.color || '#047857' }}>{t.name}</span>
                        ))}
                        {getContactBadges(conv).slice(0, 3).map((b) => (
                          <span key={'bg'+b._id} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: (b.color || '#10b981') + '22', color: b.color || '#047857' }}>{b.name}</span>
                        ))}
                        {(conv.tags || []).slice(0, 2).map((tag: string, i: number) => (
                          <span key={`ct${i}`} className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>
              {!bulkMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); togglePin(conv); }}
                  title={(conv as { pinnedAt?: string }).pinnedAt ? "取消固定聊天" : "将聊天固定到顶部"}
                  className="absolute top-1/2 -translate-y-1/2 right-2 p-1.5 rounded-full bg-white shadow border border-gray-100 text-gray-500 opacity-0 group-hover:opacity-100 hover:bg-gray-50 transition-opacity"
                >
                  <Pin className="w-3.5 h-3.5" fill={(conv as { pinnedAt?: string }).pinnedAt ? 'currentColor' : 'none'} />
                </button>
              )}
              </div>
            ))
          )}
          {!loadingConvs && (hasMoreConvs || convsLoadingMore) && (
            <div className="text-center py-2 text-xs text-gray-400">
              {convsLoadingMore ? "加载更多..." : "滚动查看更多"}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0" data-kkhs-thread>
          {/* Chat header */}
          <div className="border-b border-gray-200 bg-white">
            {/* Row 1: Contact info + quick utility icons */}
            <div className="px-4 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <button onClick={() => setSelectedConv(null)} className="md:hidden text-gray-500 mr-1">
                  <X className="w-5 h-5" />
                </button>
                <ContactAvatar conv={selectedConv} gradient size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                    <p className="text-sm font-semibold text-gray-900 truncate">{getContactName(selectedConv)}</p>
                    <Badge variant={selectedConv.status === 'active' ? 'success' : selectedConv.status === 'resolved' ? 'info' : 'warning'}>
                      {selectedConv.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 min-w-0" data-kkhs-chsub>
                    <p className="text-xs text-gray-500 truncate max-w-full">{getContactSubtitle(selectedConv)}</p>
                    <WindowTimer messages={messages} channel={(selectedConv as unknown as { channel?: string })?.channel || 'whatsapp'} />
                    {presence && (selectedConv as unknown as { channel?: string })?.channel === 'whatsapp_qr' && (
                      presence.online
                        ? <span className="text-xs text-emerald-600 font-medium">●在线</span>
                        : presence.lastSeen
                          ? <span className="text-xs text-gray-400">最后一次见到 {new Date(presence.lastSeen * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                          : null
                    )}
                  </div>
                </div>
              </div>
              {/* Utility icons row */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide shrink-0 max-w-[42%] sm:max-w-none">
                
                <div className="relative" ref={labelMenuRef}>
                  <button
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setLabelMenuPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
                      setLabelMenu(!labelMenu);
                    }}
                    className={`flex flex-col items-center justify-center px-2 py-1 rounded-lg transition-all ${labelMenu ? 'bg-emerald-50 text-emerald-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    title={"分配标签"}
                  >
                    <TagIcon className="w-4 h-4" />
                    <span className="hidden sm:block text-[9px] mt-0.5 font-medium">标签</span>
                  </button>
                  {labelMenu && (
                    <div className="fixed z-50 bg-white border rounded-xl shadow-lg py-1 w-48 max-h-64 overflow-y-auto" style={{ top: labelMenuPos.top, right: labelMenuPos.right }}>
                      {allTags.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400">还没有标签 - 在“联系人”&gt;“标签”下创建标签</p>
                      ) : allTags.map(t => {
                        const active = getContactTags(selectedConv).some(x => x._id === t._id);
                        return (
                          <button key={t._id} onClick={() => { toggleContactLabel(t._id); setLabelMenu(false); }}
                            className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-gray-50">
                            <span className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color || '#10b981' }} />
                              {t.name}
                            </span>
                            {active && <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button onClick={handleOpenNotes} className="flex flex-col items-center justify-center px-2 py-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all" title={"注释和提醒"}>
                  <StickyNote className="w-4 h-4" />
                  <span className="hidden sm:block text-[9px] mt-0.5 font-medium">注释</span>
                </button>
                {kkhs && (
                  <button onClick={() => setCtxOpen(v => !v)} className={`kx-toggle flex flex-col items-center justify-center px-2 py-1 rounded-lg transition-all ${ctxOpen ? 'bg-emerald-50 text-emerald-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`} title={ctxOpen ? "隐藏客户面板" : "显示客户面板"}>
                    <User className="w-4 h-4" />
                    <span className="hidden sm:block text-[9px] mt-0.5 font-medium">信息</span>
                  </button>
                )}
                <button
                  onClick={() => { setInChatSearch(!inChatSearch); setInChatQuery(''); setMatchIdx(0); }}
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded-lg transition-all ${inChatSearch ? 'bg-emerald-50 text-emerald-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                  title={"在此聊天中搜索"}
                >
                  <Search className="w-4 h-4" />
                  <span className="hidden sm:block text-[9px] mt-0.5 font-medium">搜索</span>
                </button>
                <div className="relative">
                  <button
                    onClick={() => setExportMenu(exportMenu === 'chat' ? null : 'chat')}
                    className="flex flex-col items-center justify-center px-2 py-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all"
                    title={"导出此聊天记录"}
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:block text-[9px] mt-0.5 font-medium">出口</span>
                  </button>
                  {exportMenu === 'chat' && (
                    <div className="absolute right-0 top-full mt-1 z-20 bg-white border rounded-xl shadow-lg py-1 w-28">
                      {['csv', 'pdf', 'html'].map(fm => (
                        <button key={fm} onClick={() => handleExportChat(fm)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 uppercase">{fm}</button>
                      ))}
                    </div>
                  )}
                </div>
                {isWaChat && (
                <>
                <div className="w-px h-6 bg-gray-200 mx-1" />
                <button
                  onClick={() => startCall(getContactPhone(selectedConv), getContactName(selectedConv))}
                  disabled={callActive}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-all disabled:opacity-50"
                  title={"亲自致电此联系人（使用您的麦克风）"}
                >
                  <Phone className="w-4 h-4" />
                  <span className="hidden sm:block text-[9px] mt-0.5 font-medium">致电</span>
                </button>
                <button
                  onClick={handleAiCall}
                  disabled={aiCalling}
                  className="flex flex-col items-center justify-center px-2 py-1 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-all disabled:opacity-50"
                  title={"人工智能致电客户并与他们交谈"}
                >
                  <PhoneCall className="w-4 h-4" />
                  <span className="hidden sm:block text-[9px] mt-0.5 font-medium">人工智能呼叫</span>
                </button>
                </>
                )}
              </div>
            </div>
            {/* Row 2: Action buttons bar */}
            <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {canToggleChatAi && (
              <button
                onClick={() => handleToggleAI('chat')}
                disabled={togglingAI}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap disabled:opacity-50 ${chatAiOn ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                title={chatAiOn ? "聊天 AI 已开启 — 单击可关闭" : "打开聊天人工智能"}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${chatAiOn ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                <Bot className="w-3.5 h-3.5" />
                聊天人工智能
                <span className={`text-[10px] font-bold ${chatAiOn ? 'text-emerald-600' : 'text-gray-400'}`}>{chatAiOn ? 'ON' : 'OFF'}</span>
              </button>
              )}
              {isMsgChat && (
              <>
              {isWaChat && (
              <button
                onClick={() => handleToggleAI('call')}
                disabled={togglingAI}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap disabled:opacity-50 ${selectedConv.aiCallEnabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                title={selectedConv.aiCallEnabled ? "呼叫 AI 已开启 — 单击可关闭" : "开启呼叫人工智能"}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${selectedConv.aiCallEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                <PhoneCall className="w-3.5 h-3.5" />
                呼叫AI
                <span className={`text-[10px] font-bold ${selectedConv.aiCallEnabled ? 'text-emerald-600' : 'text-gray-400'}`}>{selectedConv.aiCallEnabled ? 'ON' : 'OFF'}</span>
              </button>
              )}
              <div className="w-px h-5 bg-gray-200 mx-0.5" />
              {isWaChat && (
              <button
                onClick={() => setShowTemplateModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all whitespace-nowrap"
                title={"发送模板消息"}
              >
                <LayoutTemplate className="w-3.5 h-3.5" />
                模板
              </button>
              )}
              <button
                onClick={() => setShowPresetModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all whitespace-nowrap"
                title={"发送预设消息（免费）"}
              >
                <PiggyBank className="w-3.5 h-3.5" />
                预设
              </button>
              </>
              )}
              <div ref={assignMenuRef}>
                <button
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setAssignMenuPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 240) });
                    setShowAssignMenu(v => !v);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all whitespace-nowrap"
                  title={"分配给代理"}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  分配
                </button>
                {showAssignMenu && assignMenuPos && (
                  <>
                    <div className="fixed inset-0 z-9998" onClick={() => setShowAssignMenu(false)} />
                    <div className="fixed w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-9999 py-1 max-h-64 overflow-y-auto" style={{ top: assignMenuPos.top, left: assignMenuPos.left }}>
                      <p className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase border-b">分配给代理</p>
                      {agents.length === 0 && (
                        <p className="px-3 py-2 text-sm text-gray-400">没有可用的代理</p>
                      )}
                      {agents.map(a => {
                        const assignedId = typeof selectedConv?.assignedAgent === 'string' ? selectedConv.assignedAgent : selectedConv?.assignedAgent?._id;
                        const isAssigned = assignedId === a._id;
                        return (
                          <button
                            key={a._id}
                            onClick={() => handleAssignAgent(a._id)}
                            className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${isAssigned ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700'}`}
                          >
                            <span className="truncate">{a.name}</span>
                            {isAssigned && <CheckIcon className="w-4 h-4 text-emerald-600" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              <div>

              </div>

              <button
                onClick={async () => {
                  if (summarizing) return;
                  setSummarizing(true);
                  try {
                    const r = await conversationApi.aiSummary(selectedConv._id);
                    setAiSummaryText(r.data?.data?.summary || 'No summary');
                  } catch (err: unknown) {
                    const e = err as { response?: { data?: { message?: string } } };
                    setAiSummaryText(e.response?.data?.message || 'Summary failed');
                  }
                  setSummarizing(false);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 transition-all whitespace-nowrap shadow-sm"
                title={"AI对话总结"}
              >
                {summarizing ? '...' : "✨ 摘要"}
              </button>
              {aiSummaryText && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAiSummaryText(null)}>
                  <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-gray-900">✨人工智能总结</h3>
                      <button onClick={() => setAiSummaryText(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-80 overflow-y-auto">{aiSummaryText}</p>
                  </div>
                </div>
              )}
              <div className="ml-auto">
                <button
                  onClick={async () => {
                    try {
                      const r = await conversationApi.resolve(selectedConv._id);
                      const st = r.data?.data?.status || 'closed';
                      const resolved = st === 'closed';
                      setSelectedConv({ ...selectedConv, status: st, isResolved: resolved } as Conversation);
                      setConversations(prev => prev.map(c => c._id === selectedConv._id ? ({ ...c, status: st, isResolved: resolved } as Conversation) : c));
                    } catch { /* empty */ }
                  }}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap shadow-sm ${selectedConv.status === 'closed' ? 'bg-gray-600 text-white hover:bg-gray-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                  title={selectedConv.status === 'closed' ? "重新开启对话" : "解决对话"}
                >
                  {selectedConv.status === 'closed' ? "重新开放" : "解决"}
                </button>
              </div>
            </div>
          </div>

          {inChatSearch && (
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-400" />
              <input autoFocus type="text" value={inChatQuery}
                onChange={(e) => { setInChatQuery(e.target.value); setMatchIdx(0); }}
                onKeyDown={(e) => { if (e.key === 'Enter') jumpToMatch(matchIdx < matchIds.length - 1 ? matchIdx + 1 : 0); }}
                placeholder={"在此聊天中搜索..."}
                className="flex-1 bg-transparent text-sm focus:outline-none" />
              <span className="text-xs text-gray-500">{chatSearching ? "正在搜索..." : matchIds.length ? `${matchIdx + 1}/${matchIds.length}` : inChatQuery.trim().length >= 2 ? "未找到记录" : ''}</span>
              <button onClick={() => jumpToMatch(matchIdx > 0 ? matchIdx - 1 : matchIds.length - 1)} className="p-1 text-gray-500 hover:bg-gray-200 rounded" title={"上一页"}>↑</button>
              <button onClick={() => jumpToMatch(matchIdx < matchIds.length - 1 ? matchIdx + 1 : 0)} className="p-1 text-gray-500 hover:bg-gray-200 rounded" title={"下一步"}>↓</button>
              <button onClick={() => { setInChatSearch(false); setInChatQuery(''); }} className="p-1 text-gray-400 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            onScroll={(e) => {
              if (e.currentTarget.scrollTop < 120 && hasOlder && !olderLoading && !loadingMsgs) {
                loadOlderMessages();
              }
            }}
            data-ui-message-list className="flex-1 overflow-y-auto overflow-x-hidden p-4 bg-[#f0f2f5] space-y-3"
          >
            {!loadingMsgs && (hasOlder || olderLoading) && (
              <div className="text-center py-2 text-xs text-gray-400">
                {olderLoading ? "正在加载旧消息..." : "向上滚动查看较旧的消息"}
              </div>
            )}
            {loadingMsgs ? (
              <div className="text-center py-8 text-gray-400">正在加载消息...</div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">还没有消息</p>
                <p className="text-gray-400 text-xs mt-1">{isWaChat ? "发送模板消息以开始聊天" : "在下面输入一条消息进行回复"}</p>
                {isWaChat && (
                <button onClick={() => setShowTemplateModal(true)} className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
                  <LayoutTemplate className="w-4 h-4 inline mr-1" /> 发送模板
                </button>
                )}
              </div>
            ) : (
              timeline.map((item) => {
                
                const msg = item.msg;
                const isEmailMsg = (msg as { metadata?: { source?: string } }).metadata?.source === 'email'
                  || (selectedConv as unknown as { channel?: string } | null)?.channel === 'email';
                return (
                <div key={msg._id} id={`msg-${msg._id}`} className={`group flex min-w-0 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'} ${matchIds.includes(msg._id) ? (matchIds[matchIdx] === msg._id ? 'rounded-lg ring-2 ring-amber-400' : 'rounded-lg ring-1 ring-amber-200') : ''}`}>
                  <div data-kkhs-msg={msg.direction === 'outbound' ? 'out' : 'in'} className={`${isEmailMsg ? 'max-w-[98%] w-full' : 'max-w-[85%] sm:max-w-[70%]'} min-w-0 wrap-break-word wrap-anywhere rounded-xl px-4 py-2 shadow-sm ${
                    msg.direction === 'outbound' ? 'bg-[#d9fdd3] text-gray-900 rounded-br-sm' : 'bg-white text-gray-900 rounded-bl-sm'
                  }`}>
                    {(() => {
                      const ad = (msg as { metadata?: { referral?: { headline?: string; body?: string; sourceType?: string; sourceUrl?: string; sourceId?: string; thumbnailUrl?: string; mediaType?: string } } }).metadata?.referral;
                      if (!ad || !(ad.headline || ad.body || ad.sourceUrl)) return null;
                      const label = ad.sourceType === 'post' ? "Facebook 帖子" : "点击 WhatsApp 广告";
                      const inner = (
                        <div className="flex gap-2 items-start">
                          {ad.thumbnailUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={ad.thumbnailUrl} alt="" className="w-14 h-14 rounded-md object-cover shrink-0 bg-gray-200" />
                          )}
                          <div className="min-w-0">
                            {ad.headline && <div className="text-[13px] font-semibold text-gray-900 truncate">{ad.headline}</div>}
                            {ad.body && <div className="text-xs text-gray-600 line-clamp-2 whitespace-pre-line">{ad.body}</div>}
                            <div className="mt-0.5 text-[11px] text-emerald-700 flex items-center gap-1">
                              <Megaphone className="w-3 h-3" /> {label}{ad.sourceId ? ` ·身份证 ${ad.sourceId}` : ''}{ad.mediaType === 'video' ? "·视频" : ''}
                            </div>
                          </div>
                        </div>
                      );
                      return (
                        <div className="mb-1.5 border-l-4 border-blue-500 bg-blue-50/70 rounded px-2 py-1.5" title={ad.sourceUrl || undefined}>
                          {ad.sourceUrl ? (
                            <a href={ad.sourceUrl} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90">{inner}</a>
                          ) : inner}
                        </div>
                      );
                    })()}
                    {msg.context?.messageId && (
                      <div className="mb-1 border-l-4 border-emerald-500 bg-black/5 rounded px-2 py-1 text-xs text-gray-600">
                        <span className="font-medium text-emerald-700">{msg.context.from === 'outbound' ? "你" : "客户"}</span>
                        <div className="truncate max-w-[240px]">{msg.context.text || "留言"}</div>
                      </div>
                    )}
                    {msg.direction === 'outbound' && senderName(msg) && (
                      <div className="mb-0.5 text-[11px] font-semibold text-emerald-700">{senderName(msg)}</div>
                    )}
                    {renderMessageContent(msg)}
                    {(() => {
                      // Media bubbles are wide, so their action icons get a bigger hit area.
                      const isMedia = !!msg.media?.url && msg.type !== 'text';
                      const btn = `opacity-0 group-hover:opacity-100 ml-1 hover:text-emerald-600 transition-opacity ${isMedia ? 'p-1' : 'p-0.5'}`;
                      const ic = isMedia ? 'w-[18px] h-[18px]' : 'w-3 h-3';
                      return (
                        <div className={`flex items-center justify-end gap-1 mt-1 text-gray-400`}>
                          <span className="text-[10px]">{new Date(msg.createdAt).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                          {msg.direction === 'outbound' && getStatusIcon(msg.status)}
                          <button onClick={() => setReactPickerId(reactPickerId === msg._id ? null : msg._id)} className={btn} title={"反应"}><Smile className={ic} /></button>
                          <button onClick={() => setReplyTo(msg)} className={btn} title={"回复"}><Reply className={ic} /></button>
                          <button onClick={() => setForwardMsg(msg)} className={btn} title={"转发"}><Share2 className={ic} /></button>
                        </div>
                      );
                    })()}
                    {msg.status === 'failed' && (
                      <div className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
                        <div className="flex items-center gap-1 font-medium"><AlertCircle className="w-3 h-3" /> 未交付</div>
                        <div className="mt-0.5">{msg.errorMessage || "WhatsApp 未发送此消息"}</div>
                        <div className="mt-0.5 opacity-70">
                          已发送 {new Date(msg.createdAt).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {msg.failedAt ? ` ·失败 ${new Date(msg.failedAt).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                        </div>
                      </div>
                    )}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="flex gap-0.5 -mt-0.5">
                        {msg.reactions.map((r, i) => (
                          <span key={i} className="text-xs bg-white rounded-full px-1.5 py-0.5 shadow-sm border border-gray-100">{r.emoji}</span>
                        ))}
                      </div>
                    )}
                    {reactPickerId === msg._id && (
                      <div className="flex gap-1 mt-1 bg-white rounded-full shadow border px-2 py-1 w-fit">
                        {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((e) => (
                          <button key={e} onClick={() => handleReact(msg, e)} className="text-base leading-none hover:scale-125 transition-transform">{e}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                );
              })
            )}
            {typingAgent && (
              <div className="flex justify-start">
                <div className="bg-white rounded-xl px-4 py-2 shadow-sm">
                  <p className="text-xs text-gray-500 italic">{typingAgent} 正在输入...</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input */}
          <div className="p-3 border-t border-gray-200 bg-white" data-kkhs-composer>
            {replyTo && (
              <div className="mb-2 flex items-center gap-2 border-l-4 border-emerald-500 bg-gray-50 rounded px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-emerald-700">回复 {replyTo.direction === 'outbound' ? "你自己" : "顾客"}</div>
                  <div className="text-xs text-gray-600 truncate">{replyTo.text || replyTo.media?.caption || `[${replyTo.type}]`}</div>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
            )}
            {/* Quick Reply Bar */}
            {showQuickReplies && quickReplies.length > 0 && (
              <div className="mb-2 p-2 bg-gray-50 rounded-lg border max-h-40 overflow-y-auto">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-600">快捷回复</span>
                  <button onClick={() => setShowQuickReplies(false)} className="text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>
                </div>
                {quickReplies.map((qr) => (
                  <button key={qr._id} onClick={() => handleQuickReply(qr)} className="w-full text-left px-3 py-2 hover:bg-white rounded text-sm flex items-center gap-2">
                    <Zap className="w-3 h-3 text-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-medium text-gray-900">{qr.title}</span>
                      <span className="text-gray-400 ml-2 text-xs">{qr.shortcut}</span>
                      <p className="text-xs text-gray-500 truncate">{qr.message}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {(() => {
              const assignedId = typeof selectedConv?.assignedAgent === 'string' ? selectedConv.assignedAgent : selectedConv?.assignedAgent?._id;
              if (!assignedId || !user || assignedId === user._id) return null;
              const assignedName = (typeof selectedConv?.assignedAgent === 'object' && selectedConv?.assignedAgent?.name)
                || agents.find(a => a._id === assignedId)?.name || 'another agent';
              return (
                <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-sm text-amber-800 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4" /> 拍摄者 {assignedName} — 只有他们可以回复
                  </span>
                  <button onClick={async () => {
                    try {
                      await conversationApi.assign(selectedConv!._id, user._id);
                      setSelectedConv({ ...selectedConv!, assignedAgent: { _id: user._id, name: user.name } });
                      toast.success(translateApiMessage("聊天已被接管"));
                    } catch { toast.error(translateApiMessage("接管失败")); }
                  }} className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700">
                    接管
                  </button>
                </div>
              );
            })() || (selectedChannel === 'email' ? (
              <div className="flex items-center gap-2">
                <button onClick={() => openEmailCompose('reply')} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700">
                  <Mail className="w-4 h-4" /> 回复
                </button>
                <button onClick={() => openEmailCompose('replyAll')} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50">
                  全部回复
                </button>
                <button onClick={() => openEmailCompose('forward')} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50">
                  <Share2 className="w-4 h-4" /> 转发
                </button>
              </div>
            ) : waWindowClosed ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl" data-kkhs-window-closed>
                <span className="text-sm text-red-700 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> 24 小时窗口关闭 — 只能发送批准的模板
                </span>
                <button onClick={() => setShowTemplateModal(true)} className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 whitespace-nowrap">
                  发送模板
                </button>
              </div>
            ) : (
            <div className="flex items-end gap-1 sm:gap-2" data-kkhs-comp-row>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={fileAccept}
                onChange={handleFileUpload}
              />

              {/* Attachment button with popup */}
              <div className="relative" ref={attachMenuRef}>
                <button
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  disabled={uploading}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  title={"附上"}
                >
                  {uploading ? (
                    <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Paperclip className="w-5 h-5" />
                  )}
                </button>

                {showAttachMenu && (
                  <div className="absolute bottom-12 left-0 bg-white rounded-xl shadow-lg border border-gray-200 py-2 w-52 z-50">
                    <button onClick={() => handleAttachFile('image/*')} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center"><ImageIcon className="w-4 h-4 text-purple-600" /></div>
                      图片
                    </button>
                    <button onClick={() => handleAttachFile('video/*')} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center"><Video className="w-4 h-4 text-red-600" /></div>
                      视频
                    </button>
                    <button onClick={() => handleAttachFile('.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt')} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><FileText className="w-4 h-4 text-blue-600" /></div>
                      文件
                    </button>
                    <button onClick={() => handleAttachFile('audio/*')} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center"><Mic className="w-4 h-4 text-orange-600" /></div>
                      音频
                    </button>
                    <button onClick={() => { stickerModeRef.current = true; handleAttachFile('image/*,.webp,.gif'); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center"><Smile className="w-4 h-4 text-yellow-600" /></div>
                      贴纸
                    </button>
                    {isWaChat && (
                    <button onClick={() => { setScheduleMode(true); setShowAttachMenu(false); }} className="sm:hidden w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><Calendar className="w-4 h-4 text-blue-600" /></div>
                      安排消息
                    </button>
                    )}
                    <div className="border-t border-gray-100 my-1" />
                    <button onClick={() => { setShowQuickReplies(true); setShowAttachMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center"><Zap className="w-4 h-4 text-emerald-600" /></div>
                      快速回复
                    </button>
                    {isWaChat && (
                    <>
                    <button onClick={() => { setShowFormPicker(true); setShowAttachMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center"><ClipboardList className="w-4 h-4 text-pink-600" /></div>
                      表格
                    </button>
                    
                    <button onClick={() => { setShowTemplateModal(true); setShowAttachMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700">
                      <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center"><LayoutTemplate className="w-4 h-4 text-teal-600" /></div>
                      模板
                    </button>
                    </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 relative min-w-0">
                <textarea
                  ref={composerRef}
                  value={messageText}
                  onChange={(e) => {
                    setMessageText(e.target.value);
                    if (selectedConv) emitTyping(selectedConv._id, e.target.value.length > 0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !isTouch && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); }
                  }}
                  placeholder={"输入一条消息..."}
                  rows={1}
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 text-base sm:text-sm leading-5 resize-none min-h-[44px] max-h-40 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div className="relative hidden sm:block">
                {showEmoji && (
                  <div className="absolute bottom-12 right-0 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-2 w-64 max-h-48 overflow-y-auto">
                    <div className="grid grid-cols-8 gap-0.5">
                      {['😀','😁','😂','🤣','😅','😊','😇','😉','😍','😘','😋','😜','🤗','🤔','😎','🤩','🥳','😢','😭','😡','😱','😴','🤒','🤕','👍','👎','👌','✌️','🤝','🙏','💪','👏','🙌','❤️','💕','💔','🔥','⭐','✨','🎉','🎊','🏆','🎁','💰','💸','✅','❌','⚠️','📌','📞','📧','🗓️','⏰','🚀','💡','📊','🛒','🌟','😌','🥰','🙃','🙄','😬','🤑'].map(e => (
                        <button key={e} onClick={() => { setMessageText(t => t + e); }} className="text-xl p-1 hover:bg-gray-100 rounded">{e}</button>
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={() => setShowEmoji(v => !v)} className={`p-2 rounded-lg hover:bg-gray-50 ${showEmoji ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'}`}>
                  <Smile className="w-5 h-5" />
                </button>
              </div>
              <div className="relative hidden sm:block">
                {showStickers && (
                  <div className="absolute bottom-12 right-0 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-2 w-72 max-h-72 overflow-y-auto">
                    <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-gray-100">
                      <span className="text-xs font-medium text-gray-500">贴纸</span>
                      <button
                        onClick={() => { setShowStickers(false); stickerModeRef.current = true; handleAttachFile('image/*,.webp,.gif'); }}
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                      >
                        + 添加新内容
                      </button>
                    </div>
                    {!stickerLibLoaded ? (
                      <div className="py-6 text-center text-xs text-gray-400">加载中…</div>
                    ) : stickerLib.length === 0 ? (
                      <div className="py-6 text-center text-xs text-gray-400">还没有贴纸。点击“+添加新的”发送一个。</div>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5">
                        {stickerLib.map((s) => (
                          <button key={s.url} onClick={() => sendStickerUrl(s.url)} className="aspect-square rounded-lg hover:bg-gray-100 p-1 flex items-center justify-center">
                            <img src={s.url} alt="" className="max-w-full max-h-full object-contain" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={() => { setShowStickers(v => { const nv = !v; if (nv && !stickerLibLoaded) loadStickerLib(); return nv; }); setShowEmoji(false); }}
                  className={`p-2 rounded-lg hover:bg-gray-50 ${showStickers ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'}`}
                  title={"贴纸"}
                >
                  <StickerIcon className="w-5 h-5" />
                </button>
              </div>
              {scheduleMode && (
                <div className="flex items-center gap-1">
                  <input type="datetime-local" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                  <button onClick={handleScheduleSend} disabled={!scheduleTime || !messageText.trim()} className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"><Calendar className="w-4 h-4" /></button>
                  <button onClick={() => setScheduleMode(false)} className="p-2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
              )}
              {isWaChat && (
              <button onClick={() => setScheduleMode(!scheduleMode)} className={`hidden sm:block p-2 rounded-lg hover:bg-gray-50 ${scheduleMode ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`} title={"安排消息"}>
                <Calendar className="w-5 h-5" />
              </button>
              )}
              {recording ? (
                <div className="flex items-center gap-2 px-2">
                  <span className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                    {Math.floor(recordSecs / 60)}:{String(recordSecs % 60).padStart(2, '0')}
                  </span>
                  <button onClick={() => finishRecording(true)} className="p-2 text-gray-400 hover:text-gray-600" title={"取消录制"}>
                    <X className="w-5 h-5" />
                  </button>
                  <button onClick={() => finishRecording(false)} className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700" title={"发送语音消息"}>
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <button onClick={startRecording} disabled={uploading} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-50" title={"录制语音留言"}>
                  <Mic className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={!messageText.trim() || sending}
                className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 hidden md:flex items-center justify-center bg-[#f0f2f5]">
          <div className="text-center">
            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-500">欢迎来到 {brand.name}{brand.tagline ? ` ${brand.tagline}` : ''}</h3>
            <p className="text-sm text-gray-400 mt-1">从侧边栏中选择一个对话以开始聊天或发送新消息</p>
          </div>
        </div>
      )}

      {kkhs && selectedConv && ctxOpen && (
        <KkhsInboxContext
          contactId={getContactId(selectedConv)}
          name={getContactName(selectedConv)}
          subtitle={getContactSubtitle(selectedConv)}
          channel={(selectedConv as unknown as { channel?: string })?.channel || 'whatsapp'}
          avatar={<ContactAvatar conv={selectedConv} gradient size={52} />}
          tags={getContactTags(selectedConv)}
          
          agentName={typeof selectedConv.assignedAgent === 'object' && selectedConv.assignedAgent ? selectedConv.assignedAgent.name : ''}
          onAssign={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setAssignMenuPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 240) });
            setShowAssignMenu(v => !v);
          }}
          onLabels={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setLabelMenuPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
            setLabelMenu(!labelMenu);
          }}
          
          onNotes={handleOpenNotes}

          onAiCall={handleAiCall}
          aiCalling={aiCalling}
          onClose={() => setCtxOpen(false)}
        />
      )}

      {/* In-panel PDF viewer */}
      {docPreview && (
        <div className="fixed inset-0 z-60 bg-black/90 flex flex-col">
          <div className="flex items-center gap-2 p-3">
            <span className="text-sm text-white/80 truncate">{docPreview.name}</span>
            <a href={docPreview.url} download target="_blank" rel="noopener noreferrer" title={"下载"}
              className="ml-auto p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><Download className="w-5 h-5" /></a>
            <button onClick={() => setDocPreview(null)} title={"关闭"} className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><X className="w-5 h-5" /></button>
          </div>
          <iframe src={docPreview.url} title={docPreview.name} className="flex-1 min-h-0 w-full bg-white" />
        </div>
      )}

      {/* Full-screen image preview */}
      {lightbox && (
        <div className="fixed inset-0 z-60 bg-black/90 flex flex-col" onClick={() => setLightbox(null)}>
          <div className="flex items-center justify-end gap-2 p-3" onClick={e => e.stopPropagation()}>
            <a href={lightbox.url} download target="_blank" rel="noopener noreferrer" title={"下载"}
              className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><Download className="w-5 h-5" /></a>
            <button onClick={() => setLightbox(null)} title={"关闭"} className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center px-4 pb-4">
            <img src={lightbox.url} alt="" onClick={e => e.stopPropagation()} className="max-h-full max-w-full object-contain" />
          </div>
          {lightbox.caption && (
            <div className="px-4 pb-5 text-center text-sm text-white/80 whitespace-pre-wrap">{lightbox.caption}</div>
          )}
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardMsg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setForwardMsg(null); setForwardSearch(''); }}>
          <div className="bg-white rounded-xl p-6 w-96 max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">转发消息</h3>
              <button onClick={() => { setForwardMsg(null); setForwardSearch(''); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg mb-3 text-sm text-gray-600 max-h-20 overflow-hidden">{forwardMsg.text || forwardMsg.media?.caption || "[媒体]"}</div>
            <input type="text" placeholder={"搜索联系人..."} value={forwardSearch} onChange={e => setForwardSearch(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <div className="flex-1 overflow-y-auto space-y-1">
              {conversations.filter(c => !forwardSearch || getContactName(c).toLowerCase().includes(forwardSearch.toLowerCase()) || getContactPhone(c).includes(forwardSearch)).map(c => (
                <button key={c._id} onClick={() => handleForwardMessage(c._id)} disabled={!!forwardingTo} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-left disabled:opacity-50 disabled:cursor-not-allowed">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-semibold">{getContactInitial(c)}</div>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-gray-900 truncate">{getContactName(c)}</p><p className="text-xs text-gray-500">{getContactSubtitle(c)}</p></div>
                  {forwardingTo === c._id && <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Catalog/Product Send Modal */}

      {/* Template Modal */}
          {/* Form Picker Modal */}
          {showFormPicker && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowFormPicker(false)}>
              <div className="bg-white rounded-xl p-6 w-96 max-h-96 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">发送表格</h3>
                  <button onClick={() => setShowFormPicker(false)}><X className="w-5 h-5 text-gray-400" /></button>
                </div>
                {forms.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">尚未创建任何表格。从“表单”页面创建一个。</p>
                ) : (
                  <div className="space-y-2">
                    {forms.map((form) => (
                      <button key={form._id} onClick={async () => {
                        if (!selectedConv) return;
                        try {
                          if (form.waFlow?.status === 'published') {
                            await formApi.sendFlow(form._id, selectedConv._id);
                            toast.success(translateApiMessage("原生 WhatsApp 表单已发送"));
                          } else {
                            const formUrl = `${window.location.origin}/form/${form._id}`;
                            const text = `📋 *${form.name}*\n${form.description ? form.description + '\n' : ''}\n👉 ${formUrl}`;
                            await conversationApi.sendMessage(selectedConv._id, { type: 'text', text });
                          }
                          setShowFormPicker(false);
                        } catch (err) {
                          const er = err as { response?: { data?: { message?: string } } };
                          toast.error(translateApiMessage(er.response?.data?.message || "表单发送失败"));
                        }
                      }} className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition">
                        <p className="font-medium text-sm text-gray-900">{form.name}</p>
                        {form.description && <p className="text-xs text-gray-500 mt-0.5">{form.description}</p>}
                        {form.waFlow?.status === 'published'
                          ? <p className="text-xs text-emerald-600 mt-1 font-medium">原生 WhatsApp 表单（在 WhatsApp 内打开）</p>
                          : <p className="text-xs text-gray-400 mt-1">作为链接发送 — 在本机表单的表单页面上发布</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowTemplateModal(false); setTplToSend(null); }}>
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-gray-900">发送模板</h3>
              <button onClick={() => { setShowTemplateModal(false); setTplToSend(null); }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 overflow-y-auto">
              {tplToSend ? (
                <div className="flex flex-col md:flex-row gap-5">
                  <div className="flex-1 space-y-3 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{tplToSend.name}</p>
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{tplToSend.category} · {tplToSend.language || 'en'}</span>
                    </div>
                    {tplVars.length > 0 ? (
                      <>
                        <p className="text-xs text-gray-500">该模板具有 {tplVars.length} 变量 — 填写值（下面的实时预览）：</p>
                        {tplVars.map((v, i) => (
                          <input key={i} value={v} placeholder={`的值{{${i + 1}}}`} onChange={(e) => setTplVars(prev => prev.map((p, idx) => idx === i ? e.target.value : p))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        ))}
                      </>
                    ) : (
                      <p className="text-xs text-gray-500">该模板没有变量 - 直接发送。</p>
                    )}
                    {['image', 'video', 'document'].includes(tplToSend.header?.type || '') && (
                      <div className="border rounded-lg p-3 bg-emerald-50/40 border-emerald-100 space-y-1">
                        <p className="text-xs font-medium text-gray-700">标头 {translateDisplay(tplToSend.header?.type)} {tplToSend.header?.mediaUrl ? "— 已批准的文件将被发送，除非您上传另一个文件" : "— 上传要发送的文件"}</p>
                        <label className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium cursor-pointer hover:text-emerald-700">
                          <Plus className="w-4 h-4" /> {tplMediaUploading ? "正在上传..." : (tplMediaUrl ? "替换文件" : "上传文件")}
                          <input type="file" accept={tplToSend.header?.type === 'image' ? 'image/*' : tplToSend.header?.type === 'video' ? 'video/*' : undefined} className="hidden" onChange={handleTplMediaUpload} />
                        </label>
                        {tplMediaUrl && <button onClick={() => setTplMediaUrl('')} className="block text-[11px] text-gray-400 hover:text-red-500">重置为批准的文件</button>}
                        <p className="text-[11px] text-gray-400">Meta 批准模板文本，而不是媒体 — 不同的文件不需要重新批准。</p>
                      </div>
                    )}
                    {waNumbers.length > 1 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">从号码发送</label>
                        <select value={tplFromNumber} onChange={(e) => setTplFromNumber(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                          <option value="">对话号码（默认）</option>
                          {waNumbers.map(n => <option key={n.id} value={n.id}>{translateDisplay(n.label)}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                      <button onClick={() => setTplToSend(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg">返回</button>
                      <button disabled={tplVars.some(v => !v.trim()) || sending} onClick={() => handleSendTemplate(tplToSend, tplVars)} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg disabled:opacity-50">{sending ? "发送中…" : "发送模板"}</button>
                    </div>
                  </div>
                  <div className="mx-auto shrink-0">
                    <WhatsAppPhonePreview data={tplPreviewData(tplToSend, tplVars)} />
                  </div>
                </div>
              ) : templates.length === 0 ? (
                <p className="text-center text-gray-400 py-8">没有可用的批准模板。转到模板页面以从 Meta 同步。</p>
              ) : (
                templates.map((t) => (
                  <button key={t._id} onClick={() => handlePickTemplate(t)} className="w-full text-left p-3 rounded-lg hover:bg-gray-50 border border-gray-200 mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900">{t.name}</span>
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{t.category} · {t.language || 'en'}</span>
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2">{t.body || "无法预览"}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* New Message Modal — send template to any number */}
      {qrNewMsg && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setQrNewMsg(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900">新的 WhatsApp 二维码消息</h3>
            <p className="text-xs text-gray-500">向任何号码发送自由格式的消息 — 无需模板，也无需按消息付费。计入每日安全限额。</p>
            <input type="tel" placeholder={"带有国家/地区代码的电话，例如919876543210"} value={qrNewPhone} onChange={(e) => setQrNewPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <textarea rows={4} placeholder={"输入您的消息..."} value={qrNewText} onChange={(e) => setQrNewText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setQrNewMsg(false)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">取消</button>
              <button disabled={qrNewSending || !qrNewPhone.trim() || !qrNewText.trim()} onClick={async () => {
                setQrNewSending(true);
                try {
                  await waqrApi.sendNew(qrNewPhone, qrNewText);
                  toast.success(translateApiMessage("消息已发送"));
                  setQrNewMsg(false); setQrNewPhone(''); setQrNewText('');
                  try { const res = await conversationApi.list({ channel: channelFilter !== 'all' ? channelFilter : undefined } as Record<string, string | undefined>); setConversations(res.data.data || []); } catch { /* */ }
                } catch (err) {
                  const e = err as { response?: { data?: { message?: string } } };
                  toast.error(translateApiMessage(e.response?.data?.message || "发送失败"));
                }
                setQrNewSending(false);
              }} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{qrNewSending ? "发送中…" : "发送"}</button>
            </div>
          </div>
        </div>
      )}
      {/* New Telegram Message Modal — plain text to any number */}
      {tgNewMsg && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setTgNewMsg(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900">新电报消息</h3>
            <p className="text-xs text-gray-500">向任何拥有 Telegram 账户的电话号码发送消息。</p>
            <input type="tel" placeholder={"带有国家/地区代码的电话，例如919876543210"} value={tgNewPhone} onChange={(e) => setTgNewPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <textarea rows={4} placeholder={"输入您的消息..."} value={tgNewText} onChange={(e) => setTgNewText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setTgNewMsg(false)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">取消</button>
              <button disabled={tgNewSending || !tgNewPhone.trim() || !tgNewText.trim()} onClick={async () => {
                setTgNewSending(true);
                try {
                  const convRes = await api.post('/conversations/by-phone', { phone: tgNewPhone, channel: channelFilter });
                  const conv = convRes.data.data;
                  const res = await conversationApi.sendMessage(conv._id, { type: 'text', text: tgNewText });
                  if (res.data.data?.status === 'failed') {
                    toast.error(translateApiMessage(res.data.data.errorMessage || "发送失败"));
                  } else {
                    toast.success(translateApiMessage("消息已发送"));
                    setTgNewMsg(false); setTgNewPhone(''); setTgNewText('');
                    setConversations(prev => prev.some(c => c._id === conv._id) ? prev : [conv, ...prev]);
                    loadMessages(conv);
                  }
                } catch (err) {
                  const e = err as { response?: { data?: { message?: string } } };
                  toast.error(translateApiMessage(e.response?.data?.message || "发送失败"));
                }
                setTgNewSending(false);
              }} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{tgNewSending ? "发送中…" : "发送"}</button>
            </div>
          </div>
        </div>
      )}
      {showNewMsg && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewMsg(false)}>
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-gray-900">{channelFilter === 'email' ? (emailMode === 'reply' ? "回复" : emailMode === 'replyAll' ? "全部回复" : emailMode === 'forward' ? "转发" : "新电子邮件") : "新消息"}</h3>
              <button onClick={() => setShowNewMsg(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            {channelFilter === 'email' ? (
              <div className="p-4 overflow-y-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">至 <span className="text-red-500">*</span></label>
                  <div className="flex items-center gap-2">
                    <input type="email" value={newEmail.to} onChange={(e) => setNewEmail(p => ({ ...p, to: e.target.value }))} placeholder="customer@example.com"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    {!showCc && <button type="button" onClick={() => setShowCc(true)} className="text-xs text-emerald-600 hover:underline shrink-0">添加抄送</button>}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">电子邮件从您连接的收件箱发送（在通道页面上配置 SMTP）。</p>
                </div>
                {showCc && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">抄送</label>
                    <input type="text" value={newEmail.cc} onChange={(e) => setNewEmail(p => ({ ...p, cc: e.target.value }))} placeholder={"cc1@example.com、cc2@example.com"}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">主题</label>
                  <input value={newEmail.subject} onChange={(e) => setNewEmail(p => ({ ...p, subject: e.target.value }))} placeholder={"主题行"}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">留言 <span className="text-red-500">*</span></label>
                  <div className="border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500">
                    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 bg-gray-50 text-gray-600">
                      <button type="button" title={"粗体"} onMouseDown={(e) => { e.preventDefault(); execFmt('bold'); }} className="w-7 h-7 rounded hover:bg-gray-200 font-bold text-sm">B</button>
                      <button type="button" title={"斜体"} onMouseDown={(e) => { e.preventDefault(); execFmt('italic'); }} className="w-7 h-7 rounded hover:bg-gray-200 italic text-sm">I</button>
                      <button type="button" title={"下划线"} onMouseDown={(e) => { e.preventDefault(); execFmt('underline'); }} className="w-7 h-7 rounded hover:bg-gray-200 underline text-sm">U</button>
                      <span className="w-px h-4 bg-gray-200 mx-1" />
                      <button type="button" title={"项目符号列表"} onMouseDown={(e) => { e.preventDefault(); execFmt('insertUnorderedList'); }} className="w-7 h-7 rounded hover:bg-gray-200 text-sm">•</button>
                      <button type="button" title={"编号列表"} onMouseDown={(e) => { e.preventDefault(); execFmt('insertOrderedList'); }} className="w-7 h-7 rounded hover:bg-gray-200 text-xs">1.</button>
                      <button type="button" title={"插入链接"} onMouseDown={(e) => { e.preventDefault(); const url = prompt("链接网址："); if (url) execFmt('createLink', url); }} className="w-7 h-7 rounded hover:bg-gray-200 text-xs underline">↗</button>
                    </div>
                    <div ref={emailBodyRef} contentEditable suppressContentEditableWarning
                      onInput={(e) => setNewEmail(p => ({ ...p, body: (e.target as HTMLDivElement).innerText }))}
                      data-placeholder="Write your email..."
                      className="email-compose min-h-[160px] max-h-[300px] overflow-y-auto px-3 py-2 text-sm focus:outline-none [&_a]:text-emerald-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5" />
                  </div>
                  <style jsx>{`.email-compose:empty:before{content:attr(data-placeholder);color:#9ca3af;}`}</style>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <input ref={emailFileRef} type="file" multiple className="hidden" onChange={handleEmailAttach} />
                    <button type="button" onClick={() => emailFileRef.current?.click()} disabled={emailUploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                      <Paperclip className="w-4 h-4" /> {emailUploading ? "正在上传..." : "附加文件"}
                    </button>
                    {emailAttachments.length > 0 && <span className="text-xs text-gray-400">{emailAttachments.length} 附</span>}
                  </div>
                  {emailAttachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {emailAttachments.map((a, i) => (
                        <span key={i} className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg text-xs text-gray-700">
                          <FileText className="w-3.5 h-3.5 text-gray-400" />
                          <span className="max-w-[160px] truncate">{a.filename}</span>
                          <button onClick={() => setEmailAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setShowNewMsg(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg">取消</button>
                  <button disabled={!newEmail.to.trim() || !newEmail.body.trim() || submitting} onClick={handleSendNewEmail}
                    className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg disabled:opacity-50">{submitting ? "发送中…" : "发送电子邮件"}</button>
                </div>
              </div>
            ) : (
            <div className="p-4 overflow-y-auto">
              <div className="flex flex-col md:flex-row gap-5">
                <div className="flex-1 space-y-4 min-w-0">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">电话号码 <span className="text-red-500">*</span></label>
                    <input value={newMsgPhone} onChange={(e) => setNewMsgPhone(e.target.value)} placeholder="9198765XXXXX"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    <p className="text-xs text-gray-400 mt-1">带有国家/地区代码（对于 10 位印度号码，自动添加 91）。无需保存联系人。</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">模板名称</label>
                    <p className="text-xs text-gray-400 mb-1.5">从您的 WhatsApp 批准的模板消息中选择一个</p>
                    <select value={newMsgTpl?._id || ''} onChange={(e) => {
                      const t = templates.find(x => x._id === e.target.value) || null;
                      setNewMsgTpl(t);
                      setNewMsgVars(t ? Array(countTemplateVars(t.body)).fill('') : []);
                    }} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="">请选择</option>
                      {templates.map(t => <option key={t._id} value={t._id}>{translateDisplay(t.name)} ({translateDisplay(t.category)} · {translateDisplay(t.language || 'en')})</option>)}
                    </select>
                  </div>
                  {waNumbers.length > 1 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">发送号码</label>
                      <select value={newMsgFrom} onChange={(e) => setNewMsgFrom(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
                        {waNumbers.map(n => <option key={n.id} value={n.id}>{translateDisplay(n.label)}</option>)}
                      </select>
                    </div>
                  )}
                  {newMsgVars.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">模板变量：</p>
                      {newMsgVars.map((v, i) => (
                        <input key={i} value={v} placeholder={`的值{{${i + 1}}}`} onChange={(e) => setNewMsgVars(prev => prev.map((p, idx) => idx === i ? e.target.value : p))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setShowNewMsg(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg">取消</button>
                    <button disabled={!newMsgTpl || newMsgVars.some(v => !v.trim()) || submitting} onClick={handleSendNewMsg}
                      className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg disabled:opacity-50">{submitting ? "发送中…" : "发送消息"}</button>
                  </div>
                </div>
                <div className="mx-auto shrink-0">
                  <WhatsAppPhonePreview data={newMsgTpl ? tplPreviewData(newMsgTpl, newMsgVars) : { body: '' }} />
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      )}
      {showPresetModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowPresetModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">发送预设（免费）</h3>
              <button onClick={() => setShowPresetModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <p className="text-xs text-gray-500 mb-3">仅面向具有 24 小时开放窗口的客户 — 无模板费用。</p>
              {presets.length === 0 ? (
                <p className="text-center text-gray-400 py-8">没有预设模板。在“省钱”→“预设模板”下创建一个。</p>
              ) : presets.map((p) => (
                <button key={p._id} disabled={sending} onClick={() => handleSendPreset(p._id)} className="w-full text-left p-3 rounded-lg hover:bg-gray-50 border border-gray-200 mb-2 disabled:opacity-50">
                  <span className="font-medium text-gray-900">{p.name}</span>
                  <p className="text-sm text-gray-500 line-clamp-2">{p.body}</p>
                </button>
              ))}
              {respResources.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase mt-4 mb-2">响应资源（插入消息框）</p>
                  {respResources.map((r) => (
                    <button key={r._id} onClick={() => { setMessageText(r.content); setShowPresetModal(false); api.post(`/response-resources/${r._id}/use`).catch(() => {}); }} className="w-full text-left p-3 rounded-lg hover:bg-emerald-50 border border-emerald-100 mb-2">
                      <span className="font-medium text-gray-900">{r.title}</span>
                      {r.shortcut && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{r.shortcut}</span>}
                      <p className="text-sm text-gray-500 line-clamp-2">{r.content}</p>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {notesOpen && selectedConv && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setNotesOpen(false)}>
          <div className="w-full max-w-sm h-full bg-white shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">注释和提醒</p>
                <p className="text-xs text-gray-500">{getContactName(selectedConv)}</p>
              </div>
              <button onClick={() => setNotesOpen(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 border-b space-y-2">
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
                placeholder={"撰写有关该客户的内部说明..."}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-400" />
                <input type="datetime-local" value={noteRemind} onChange={e => setNoteRemind(e.target.value)}
                  className="flex-1 px-2 py-1.5 border rounded-lg text-xs" />
              </div>
              <p className="text-[11px] text-gray-400">可选：设置提醒时间 - 您将收到声音通知。</p>
              <button onClick={handleAddNote} disabled={!noteText.trim()}
                className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">添加注释</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {notes.length === 0 && <p className="text-center text-gray-400 text-sm py-8">还没有注释</p>}
              {notes.map(n => (
                <div key={n._id} className="border rounded-lg p-3 bg-amber-50/50 border-amber-100">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap flex-1">{n.text}</p>
                    <button onClick={() => handleDeleteNote(n._id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
                    <span>{new Date(n.createdAt).toLocaleString('en-IN')}</span>
                    {n.remindAt && (
                      <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${n.contacted ? 'bg-gray-100 text-gray-400' : new Date(n.remindAt) < new Date() ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                        <Bell className="w-3 h-3" /> {new Date(n.remindAt).toLocaleString('en-IN')}{n.contacted ? "（已联系）" : ''}
                      </span>
                    )}
                    {n.remindAt && !n.contacted && contactedFor !== n._id && editingNote !== n._id && (
                      <button onClick={() => { setContactedFor(n._id); setContactedRemark(''); }}
                        className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700">已联系</button>
                    )}
                    {n.remindAt && !n.contacted && contactedFor !== n._id && editingNote !== n._id && (
                      <button onClick={() => { setEditingNote(n._id); setEditRemind(toLocalInput(n.remindAt!)); }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700"><Pencil className="w-3 h-3" /> 编辑</button>
                    )}
                  </div>
                  {contactedFor === n._id && (
                    <div className="mt-2 p-2 bg-white border border-emerald-200 rounded-lg space-y-1.5">
                      <textarea value={contactedRemark} onChange={e => setContactedRemark(e.target.value)} rows={2}
                        autoFocus placeholder={"备注 — 讨论了什么？ （可选）"}
                        className="w-full px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => { setContactedFor(null); setContactedRemark(''); }}
                          className="px-2 py-1 rounded border border-gray-200 text-gray-500 text-[11px]">取消</button>
                        <button onClick={() => handleContacted(n._id)}
                          className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700">保存 — 已联系</button>
                      </div>
                    </div>
                  )}
                  {editingNote === n._id && (
                    <div className="mt-2 p-2 bg-white border border-blue-200 rounded-lg space-y-1.5">
                      <input type="datetime-local" value={editRemind} onChange={e => setEditRemind(e.target.value)}
                        className="w-full px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => { setEditingNote(null); setEditRemind(''); }}
                          className="px-2 py-1 rounded border border-gray-200 text-gray-500 text-[11px]">取消</button>
                        <button onClick={() => handleEditRemind(n._id)}
                          className="px-2.5 py-1 rounded bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700">节省时间</button>
                      </div>
                    </div>
                  )}
                  {n.contacted && n.contactedRemark && (
                    <p className="mt-1 text-[11px] text-gray-500 italic">备注： {n.contactedRemark}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return <React.Suspense fallback={null}><ChatPageInner /></React.Suspense>;
}
