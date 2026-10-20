'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { MessageSquare, Camera, Users as FbIcon, CheckCircle, XCircle, ExternalLink, Send, Mail, QrCode, Copy, Unplug, Cloud, ChevronDown, HelpCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Tabs from '@/components/ui/Tabs';
import { workspaceApi } from '@/lib/api';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';
import Link from 'next/link';
import ChannelDiagnose, { DiagnosisList } from '@/components/ChannelDiagnose';
import WaQrSlotsSection from '@/components/channels/WaQrSlotsSection';
import TgPersonalSlotsSection from '@/components/channels/TgPersonalSlotsSection';

type MetaDiagnosis = {
  ok: boolean;
  summary: string;
  checks: { key: string; label: string; ok: boolean; detail: string; fix?: string }[];
  meta?: Record<string, { threads?: number; lastUpdate?: string | null; error?: string }>;
  inbox?: Record<string, number>;
};

// 可折叠渠道卡：头部常显（图标/标题/状态/操作），正文按需展开
const ChannelCard = ({ icon, iconBg, title, subtitle, right, children, defaultOpen = false, collapsible = true }: {
  icon: React.ReactNode; iconBg: string; title: string; subtitle: string;
  right?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; collapsible?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = open || !collapsible;
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4">
        <button
          type="button"
          onClick={() => collapsible && setOpen((o) => !o)}
          className={`flex items-center gap-3 min-w-0 flex-1 text-left ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</div>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 truncate">{title}</h2>
            <p className="text-xs text-gray-500 line-clamp-1">{subtitle}</p>
          </div>
          {collapsible && <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />}
        </button>
        {right && <div className="flex items-center gap-3 shrink-0">{right}</div>}
      </div>
      {expanded && <div className="px-6 pb-6 pt-4 space-y-4 border-t border-gray-100">{children}</div>}
    </div>
  );
};

// 二级折叠：收纳冗长的「逐步教程」，默认收起
const Steps = ({ title = '设置教程（逐步）', children }: { title?: string; children: React.ReactNode }) => {
  const [o, setO] = useState(false);
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
      <button type="button" onClick={() => setO((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
        <span className="flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5 text-gray-400" /> {title}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${o ? 'rotate-180' : ''}`} />
      </button>
      {o && <div className="px-3 pb-3 pt-1 text-xs text-gray-500 space-y-1">{children}</div>}
    </div>
  );
};

// 启用开关 + 断开按钮的头部右侧操作组（统一样式）
const EnableToggle = ({ checked, onChange, accent }: { checked: boolean; onChange: (v: boolean) => void; accent: string }) => (
  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className={`w-4 h-4 ${accent}`} />
    启用
  </label>
);

export default function ChannelsPage() {
  const { currentWorkspace } = useAuthStore();
  const [waConnected, setWaConnected] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [metaChat, setMetaChat] = useState({ pageId: '', pageAccessToken: '', igAccountId: '', fbEnabled: false, igEnabled: false });
  const [telegram, setTelegram] = useState({ botToken: '', botUsername: '', enabled: false });
  const [emailCh, setEmailCh] = useState({ enabled: false, imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 587, user: '', pass: '', fromName: '' });
  const [chatApp, setChatApp] = useState({ enabled: false, isConnected: false, accessKeyId: '', accessKeySecret: '', endpoint: 'cams.ap-southeast-1.aliyuncs.com', custSpaceId: '', phoneNumber: '', lastError: '' });
  const [webhookCfg, setWebhookCfg] = useState<{ webhookUrl: string; webhookVerifyToken: string }>({ webhookUrl: '', webhookVerifyToken: '' });
  const [disconnecting, setDisconnecting] = useState('');
  const [emailStatus, setEmailStatus] = useState<{ lastPolledAt?: string; lastError?: string }>({});
  const [emailSyncing, setEmailSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  // 网页版 WhatsApp / 个人 Telegram 的号码连接统一由 WaQrSlotsSection /
  // TgPersonalSlotsSection 组件管理（多号平等、自动号池），本页不再持有单号状态。
  const [fbCfg, setFbCfg] = useState<{ appId?: string; configId?: string; oneClick?: boolean; connected?: boolean; pageName?: string } | null>(null);
  const [fbBusy, setFbBusy] = useState(false);
  const [fbPages, setFbPages] = useState<{ id: string; name: string }[]>([]);
  const [fbCode, setFbCode] = useState<{ code?: string; accessToken?: string }>({});
  const [igCfg, setIgCfg] = useState<{ appId?: string; configId?: string; oneClick?: boolean; needsAppId?: boolean; connected?: boolean; igAccountId?: string; profile?: { username?: string } | null } | null>(null);
  const [igBusy, setIgBusy] = useState(false);
  const [metaDiag, setMetaDiag] = useState<MetaDiagnosis | null>(null);
  const [metaDiagBusy, setMetaDiagBusy] = useState(false);
  const [metaSyncBusy, setMetaSyncBusy] = useState(false);

  useEffect(() => {
    if (!currentWorkspace) return;
    api.get('/facebook-connect/config')
      .then(r => setFbCfg(r.data.data))
      .catch(() => {});
    api.get('/instagram-auto-dm/connect/config')
      .then(r => setIgCfg(r.data.data))
      .catch(() => {});
    workspaceApi.getWhatsAppSignupConfig(currentWorkspace._id)
      .then(r => setWebhookCfg({ webhookUrl: r.data.data?.webhookUrl || '', webhookVerifyToken: r.data.data?.webhookVerifyToken || '' }))
      .catch(() => {});
  }, [currentWorkspace]);

  type FbWindow = Window & {
    FB?: { init: (o: Record<string, unknown>) => void; login: (cb: (r: { authResponse?: { code?: string; accessToken?: string } }) => void, o: Record<string, unknown>) => void };
    fbAsyncInit?: () => void;
  };

  const loadFbSdk = (appId: string) => new Promise<void>((resolve) => {
    const w = window as FbWindow;
    if (w.FB) return resolve();
    w.fbAsyncInit = () => { w.FB!.init({ appId, cookie: true, xfbml: false, version: 'v21.0' }); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true; s.defer = true; document.body.appendChild(s);
  });

  const submitFbCode = (auth: { code?: string; accessToken?: string }, pageId?: string) => {
    setFbBusy(true);
    const redirectUri = window.location.origin + window.location.pathname;
    api.post('/facebook-connect/one-click', { ...auth, redirectUri, ...(pageId ? { pageId } : {}) })
      .then(r => {
        const d = r.data.data;
        if (d?.needsPageChoice) { setFbPages(d.pages || []); setFbCode(auth); toast('Select the Page you want to connect'); return; }
        setFbPages([]); setFbCode({});
        toast.success(translateApiMessage("Facebook 页面已连接"));
        api.get('/facebook-connect/config').then(res => setFbCfg(res.data.data)).catch(() => {});
        if (d?.pageId) setMetaChat(m => ({ ...m, pageId: String(d.pageId), fbEnabled: true }));
      })
      .catch(err => toast.error(translateApiMessage(err.response?.data?.message || "连接失败")))
      .finally(() => setFbBusy(false));
  };

  const chooseFbPage = (pageId: string) => submitFbCode(fbCode, pageId);

  const runMetaDiagnose = async () => {
    setMetaDiagBusy(true);
    try {
      const r = await api.get('/facebook-connect/diagnose');
      setMetaDiag(r.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "诊断失败"));
    }
    setMetaDiagBusy(false);
  };

  const fixMetaSubscription = async () => {
    setMetaDiagBusy(true);
    try {
      const r = await api.post('/facebook-connect/resubscribe');
      if (r.data.success) toast.success(translateApiMessage(r.data.message || "Webhook 订阅已刷新"));
      else toast.error(translateApiMessage(r.data.message || "Meta 未接受订阅"));
      const d = await api.get('/facebook-connect/diagnose');
      setMetaDiag(d.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "操作失败"));
    }
    setMetaDiagBusy(false);
  };

  const syncMetaChats = async () => {
    setMetaSyncBusy(true);
    try {
      const r = await api.post('/facebook-connect/sync-chats', {});
      toast.success(translateApiMessage(r.data.message || "聊天已同步"));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "同步失败"));
    }
    setMetaSyncBusy(false);
  };

  const connectFbOneClick = async () => {
    if (!fbCfg?.appId) { toast.error(translateApiMessage("Facebook 应用程序不是由管理员配置的。")); return; }
    setFbBusy(true);
    try {
      await loadFbSdk(fbCfg.appId);
      // code flow needs a Facebook Login for Business config_id; without one use the token flow
      const opts: Record<string, unknown> = fbCfg.configId
        ? { response_type: 'code', override_default_response_type: true, config_id: fbCfg.configId }
        : { scope: 'pages_show_list,pages_messaging,pages_manage_metadata,pages_read_engagement' };
      (window as FbWindow).FB!.login((resp) => {
        const code = resp?.authResponse?.code;
        const accessToken = resp?.authResponse?.accessToken;
        if (!code && !accessToken) { setFbBusy(false); toast.error(translateApiMessage("Facebook 登录已取消")); return; }
        submitFbCode(code ? { code } : { accessToken });
      }, opts);
    } catch { setFbBusy(false); toast.error(translateApiMessage("Facebook SDK 加载失败")); }
  };

  const connectIgOneClick = async () => {
    if (!igCfg?.appId) { toast.error(translateApiMessage("Facebook 应用程序不是由管理员配置的。")); return; }
    setIgBusy(true);
    try {
      await loadFbSdk(igCfg.appId);
      // 后端 /instagram-auto-dm/connect/one-click 只接受授权 code（不支持 accessToken），
      // 所以无 configId 的 scope 登录也强制要求返回 code。
      const opts: Record<string, unknown> = igCfg.configId
        ? { response_type: 'code', override_default_response_type: true, config_id: igCfg.configId }
        : { response_type: 'code', override_default_response_type: true, scope: 'pages_show_list,pages_messaging,pages_manage_metadata,instagram_basic,instagram_manage_messages' };
      (window as FbWindow).FB!.login((resp) => {
        const code = resp?.authResponse?.code;
        if (!code) { setIgBusy(false); toast.error(translateApiMessage("Facebook 登录已取消")); return; }
        const redirectUri = window.location.origin + window.location.pathname;
        api.post('/instagram-auto-dm/connect/one-click', { code, redirectUri })
          .then(r => {
            const d = r.data.data;
            toast.success(translateApiMessage("Instagram 已连接"));
            if (d?.igAccountId) setMetaChat(m => ({ ...m, igAccountId: String(d.igAccountId), igEnabled: true }));
            api.get('/instagram-auto-dm/connect/config').then(res => setIgCfg(res.data.data)).catch(() => {});
          })
          .catch(err => toast.error(translateApiMessage(err.response?.data?.message || "连接失败")))
          .finally(() => setIgBusy(false));
      }, opts);
    } catch { setIgBusy(false); toast.error(translateApiMessage("Facebook SDK 加载失败")); }
  };

  useEffect(() => {
    if (!currentWorkspace) return;
    workspaceApi.get(currentWorkspace._id).then(res => {
      const w = res.data.data;
      setWaConnected(!!w?.whatsapp?.isConnected);
      setWaPhone(w?.whatsapp?.phoneNumber || w?.whatsapp?.displayPhoneNumber || '');
      const mc = w?.metaChat;
      if (mc) setMetaChat({ pageId: mc.pageId || '', pageAccessToken: mc.pageAccessToken || '', igAccountId: mc.igAccountId || '', fbEnabled: !!mc.fbEnabled, igEnabled: !!mc.igEnabled });
      const tg = w?.telegram;
      if (tg) setTelegram({ botToken: tg.botToken || '', botUsername: tg.botUsername || '', enabled: !!tg.enabled });
      const ec = w?.emailChannel;
      if (ec) {
        setEmailCh({ enabled: !!ec.enabled, imapHost: ec.imapHost || '', imapPort: ec.imapPort || 993, smtpHost: ec.smtpHost || '', smtpPort: ec.smtpPort || 587, user: ec.user || '', pass: ec.pass || '', fromName: ec.fromName || '' });
        setEmailStatus({ lastPolledAt: ec.lastPolledAt, lastError: ec.lastError });
      }
      const ca = w?.chatApp;
      if (ca) setChatApp({ enabled: !!ca.enabled, isConnected: !!ca.isConnected, accessKeyId: ca.accessKeyId || '', accessKeySecret: ca.accessKeySecret || '', endpoint: ca.endpoint || 'cams.ap-southeast-1.aliyuncs.com', custSpaceId: ca.custSpaceId || '', phoneNumber: ca.phoneNumber || '', lastError: ca.lastError || '' });
    }).catch(() => {});
  }, [currentWorkspace]);

  const handleEmailSync = async () => {
    if (!currentWorkspace) return;
    setEmailSyncing(true);
    try {
      const res = await api.post(`/workspaces/${currentWorkspace._id}/email/sync`);
      setEmailStatus({ lastPolledAt: res.data?.data?.lastPolledAt, lastError: '' });
      toast.success(translateApiMessage("电子邮件收件箱已同步"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      const message = error.response?.data?.message || "电子邮件同步失败";
      setEmailStatus((s) => ({ ...s, lastError: message }));
      toast.error(translateApiMessage(message));
    }
    setEmailSyncing(false);
  };

  const copyText = (v: string) => { navigator.clipboard.writeText(v); toast.success(translateApiMessage("已复制！")); };

  const saveChannels = async (patch: { metaChat?: typeof metaChat; telegram?: typeof telegram; emailChannel?: typeof emailCh; chatApp?: typeof chatApp }) => {
    if (!currentWorkspace) return;
    await workspaceApi.update(currentWorkspace._id, { metaChat, telegram, emailChannel: emailCh, chatApp, ...patch });
  };

  const disconnectWa = async () => {
    if (!currentWorkspace || !confirm("断开 WhatsApp Business API 与此工作区的连接？")) return;
    setDisconnecting('wa');
    try { await workspaceApi.updateWhatsApp(currentWorkspace._id, { isConnected: false, connectionMethod: '' }); setWaConnected(false); setWaPhone(''); toast.success(translateApiMessage("WhatsApp 已断开连接")); } catch { toast.error(translateApiMessage("操作失败")); }
    setDisconnecting('');
  };

  const disconnectFb = async () => {
    if (!confirm("断开 Facebook Messenger 的连接？页面 ID 和令牌将被删除。 Instagram DM 使用相同的令牌，因此也会断开连接。")) return;
    setDisconnecting('fb');
    const next = { pageId: '', pageAccessToken: '', igAccountId: '', fbEnabled: false, igEnabled: false };
    try {
      await saveChannels({ metaChat: next });
      setMetaChat(next);
      setFbCfg(c => (c ? { ...c, connected: false, pageName: '' } : c));
      setIgCfg(c => (c ? { ...c, connected: false, igAccountId: '', profile: null } : c));
      toast.success(translateApiMessage("Facebook Messenger 已断开连接"));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "操作失败"));
    }
    setDisconnecting('');
  };

  const disconnectIg = async () => {
    if (!confirm("断开 Instagram DM 与此工作区的连接？")) return;
    setDisconnecting('ig');
    const next = { ...metaChat, igAccountId: '', igEnabled: false };
    try {
      await saveChannels({ metaChat: next });
      setMetaChat(next);
      setIgCfg(c => (c ? { ...c, connected: false, igAccountId: '', profile: null } : c));
      toast.success(translateApiMessage("Instagram 已断开连接"));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "操作失败"));
    }
    setDisconnecting('');
  };

  const disconnectTelegram = async () => {
    if (!confirm("断开此 Telegram 机器人的连接？机器人令牌将被删除。")) return;
    setDisconnecting('tg');
    const next = { botToken: '', botUsername: '', enabled: false };
    try { await saveChannels({ telegram: next }); setTelegram(next); toast.success(translateApiMessage("Telegram 机器人已断开连接")); } catch { toast.error(translateApiMessage("操作失败")); }
    setDisconnecting('');
  };

  const disconnectEmail = async () => {
    if (!confirm("断开电子邮件收件箱的连接？ IMAP/SMTP 凭据将被删除。")) return;
    setDisconnecting('email');
    const next = { enabled: false, imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 587, user: '', pass: '', fromName: '' };
    try { await saveChannels({ emailChannel: next }); setEmailCh(next); setEmailStatus({}); toast.success(translateApiMessage("电子邮件收件箱已断开连接")); } catch { toast.error(translateApiMessage("操作失败")); }
    setDisconnecting('');
  };

  const disconnectChatApp = async () => {
    if (!confirm("断开 Aliyun Chat App 的连接？AccessKey 凭据将被删除。")) return;
    setDisconnecting('chatapp');
    const next = { enabled: false, isConnected: false, accessKeyId: '', accessKeySecret: '', endpoint: 'cams.ap-southeast-1.aliyuncs.com', custSpaceId: '', phoneNumber: '', lastError: '' };
    try { await saveChannels({ chatApp: next }); setChatApp(next); toast.success(translateApiMessage("Aliyun Chat App 已断开连接")); } catch { toast.error(translateApiMessage("操作失败")); }
    setDisconnecting('');
  };

  const metaConnected = !!(metaChat.pageId && metaChat.pageAccessToken);

  const MetaWebhookBox = ({ object, fields }: { object: string; fields: string }) => (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
      <p className="text-xs font-semibold text-indigo-900">用于手动设置的 Webhook（元应用程序仪表板 → Webhooks → {object})</p>
      <p className="text-[11px] text-indigo-800">仅当您连接自己的元应用程序时才需要。在此处保存后，面板会自动为您的主页订阅这些字段 - 无需手动单击“订阅”。</p>
      <div className="p-2.5 bg-white border border-indigo-200 rounded-lg">
        <p className="text-[11px] text-indigo-600 font-medium mb-0.5">回调网址</p>
        <div className="flex items-center gap-2">
          <p className="font-mono text-xs text-gray-900 break-all">{webhookCfg.webhookUrl || '-'}</p>
          <button type="button" onClick={() => copyText(webhookCfg.webhookUrl)} className="shrink-0 p-1.5 bg-indigo-100 hover:bg-indigo-200 rounded transition-colors" aria-label={"复制回调 URL"}><Copy className="w-3.5 h-3.5 text-indigo-600" /></button>
        </div>
      </div>
      <div className="p-2.5 bg-white border border-indigo-200 rounded-lg">
        <p className="text-[11px] text-indigo-600 font-medium mb-0.5">验证令牌</p>
        <div className="flex items-center gap-2">
          <p className="font-mono text-xs text-gray-900 break-all">{webhookCfg.webhookVerifyToken || '-'}</p>
          <button type="button" onClick={() => copyText(webhookCfg.webhookVerifyToken)} className="shrink-0 p-1.5 bg-indigo-100 hover:bg-indigo-200 rounded transition-colors" aria-label={"复制验证令牌"}><Copy className="w-3.5 h-3.5 text-indigo-600" /></button>
        </div>
      </div>
      <div className="p-2.5 bg-white border border-indigo-200 rounded-lg">
        <p className="text-[11px] text-indigo-600 font-medium mb-0.5">字段（保存时自动订阅）</p>
        <div className="flex items-center gap-2">
          <p className="font-mono text-xs text-gray-900 break-all">{fields}</p>
          <button type="button" onClick={() => copyText(fields)} className="shrink-0 p-1.5 bg-indigo-100 hover:bg-indigo-200 rounded transition-colors" aria-label={"复制字段"}><Copy className="w-3.5 h-3.5 text-indigo-600" /></button>
        </div>
      </div>
    </div>
  );

  const handleSave = async () => {
    if (!currentWorkspace) return;
    setSaving(true);
    try {
      await workspaceApi.update(currentWorkspace._id, { metaChat, telegram, emailChannel: emailCh, chatApp });
      toast.success(translateApiMessage("通道配置已保存"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "保存失败"));
    }
    setSaving(false);
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  // tab 图标 + 右上角连接状态圆点（绿=已连 / 灰=未连）
  const tabDot = (icon: React.ReactNode, connected: boolean) => (
    <span className="relative inline-flex">
      {icon}
      <span className={`absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full ring-1 ring-white ${connected ? 'bg-emerald-500' : 'bg-gray-300'}`} />
    </span>
  );

  return (
    <div className="max-w-4xl">
      <div className="page-hero">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">通道配置</h1>
          <p className="text-gray-500 text-sm mt-1">在一处管理所有客服渠道 — WhatsApp、Facebook、Instagram、Telegram、邮件。已连接的渠道会自动收起，点击卡片即可展开配置。</p>
        </div>
      </div>

      {/* 渠道按家族分 tab，一次只看一个，减少堆叠 */}
      <div className="mt-6">
        <Tabs defaultTab="wa" tabs={[
          { key: 'wa', label: 'WhatsApp', icon: tabDot(<MessageSquare className="w-4 h-4" />, waConnected || chatApp.isConnected), content: (
            <div className="space-y-4">
        {/* WhatsApp 商务 API */}
        <ChannelCard
          icon={<MessageSquare className="w-5 h-5 text-emerald-600" />} iconBg="bg-emerald-100"
          title="WhatsApp 商务 API" subtitle={waConnected ? `已连接${waPhone ? ' — ' + waPhone : ''}` : '官方云 API — 支持群发、模板与绿标认证'}
          defaultOpen={!waConnected}
          right={
            <>
              {waConnected
                ? <span className="hidden sm:flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="w-4 h-4" /> 已连接</span>
                : <span className="hidden sm:flex items-center gap-1 text-xs text-red-500"><XCircle className="w-4 h-4" /> 未连接</span>}
              <Link href="/client/whatsapp" className="text-sm text-emerald-600 hover:underline flex items-center gap-1">配置 <ExternalLink className="w-3 h-3" /></Link>
              {waConnected && <Button size="sm" variant="outline" loading={disconnecting === 'wa'} onClick={disconnectWa}><Unplug className="w-3.5 h-3.5" /> 断开连接</Button>}
            </>
          }
        >
          <ChannelDiagnose channel="whatsapp" />
        </ChannelCard>

        {/* WhatsApp 二维码 */}
        <ChannelCard
          icon={<QrCode className="w-5 h-5 text-green-600" />} iconBg="bg-green-100"
          title="WhatsApp 二维码" subtitle="扫码连接普通号码（无需 API）。多号自动轮流、老客户固定接待、自动预热防封。"
          collapsible={false}
        >
          <ChannelDiagnose channel="waqr" />
          <WaQrSlotsSection />
          <Steps title="⚠ 确保安全 — 连接前请阅读">
            <ul className="text-xs text-amber-800 space-y-1 list-disc pl-4">
              <li>这使用 WhatsApp Web（不是官方 API）。它违反 WhatsApp 的服务条款并带有 <b>您的号码被禁止的风险</b>。使用辅助号码，而不是您的主要个人/公司号码。</li>
              <li>我们的安全引擎会自动保护您：新号码从每日的小限额开始，并在 2 周内增长（号码预热），消息以类似人类的随机延迟和打字指示器发送。</li>
              <li>仅向认识您或首先联系过您的人发送消息。切勿向未知号码发送批量促销信息 - 这是被禁止的最快方法。</li>
              <li>避免重复发送相同的文本。个性化消息并保持健康的回复率（如果没有人回复，请放慢速度）。</li>
              <li>保持手机连接到互联网。如果该号码被禁止或注销，频道会自动暂停，您将在此处看到它。</li>
              <li>对于批量营销活动、官方模板和绿色勾号验证，请使用官方 <b>WhatsApp 商业 API</b> 通道同上。</li>
            </ul>
          </Steps>
        </ChannelCard>

        {/* Aliyun Chat App */}
        <ChannelCard
          icon={<Cloud className="w-5 h-5 text-orange-600" />} iconBg="bg-orange-100"
          title="Aliyun Chat App" subtitle={chatApp.isConnected ? `已连接${chatApp.phoneNumber ? ' — ' + chatApp.phoneNumber : ''}` : '通过阿里云 Chat App 消息服务（Meta 官方 BSP）收发 WhatsApp'}
          defaultOpen={!chatApp.isConnected && !!chatApp.enabled}
          right={
            <>
              {chatApp.isConnected
                ? <span className="hidden sm:flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="w-4 h-4" /> 已连接</span>
                : <span className="hidden sm:flex items-center gap-1 text-xs text-red-500"><XCircle className="w-4 h-4" /> 未连接</span>}
              {chatApp.accessKeyId && <Button size="sm" variant="outline" loading={disconnecting === 'chatapp'} onClick={disconnectChatApp}><Unplug className="w-3.5 h-3.5" /> 断开连接</Button>}
              <EnableToggle checked={chatApp.enabled} onChange={(v) => setChatApp({ ...chatApp, enabled: v })} accent="accent-orange-600" />
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Input label={"AccessKey ID"} value={chatApp.accessKeyId} onChange={(e) => setChatApp({ ...chatApp, accessKeyId: e.target.value })} placeholder="LTAI5t..." />
            <Input label={"AccessKey Secret"} type="password" value={chatApp.accessKeySecret} onChange={(e) => setChatApp({ ...chatApp, accessKeySecret: e.target.value })} />
            <Input label={"Endpoint"} value={chatApp.endpoint} onChange={(e) => setChatApp({ ...chatApp, endpoint: e.target.value })} placeholder="cams.ap-southeast-1.aliyuncs.com" />
            <Input label={"CustSpaceId"} value={chatApp.custSpaceId} onChange={(e) => setChatApp({ ...chatApp, custSpaceId: e.target.value })} />
            <Input label={"发送方号码（From）"} value={chatApp.phoneNumber} onChange={(e) => setChatApp({ ...chatApp, phoneNumber: e.target.value })} placeholder="+65xxxxxxxx" />
          </div>
          {chatApp.lastError && <p className="text-xs text-red-600">最近一次发送失败：{chatApp.lastError}</p>}
          <div className="p-2.5 bg-white border border-orange-200 rounded-lg">
            <p className="text-[11px] text-orange-600 font-medium mb-0.5">Webhook 回调地址（粘贴到阿里云 Chat App 控制台）</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs text-gray-900 break-all">{origin}/api/webhook/chatapp</p>
              <button type="button" onClick={() => copyText(`${origin}/api/webhook/chatapp`)} className="shrink-0 p-1.5 bg-orange-100 hover:bg-orange-200 rounded transition-colors" aria-label={"复制回调 URL"}><Copy className="w-3.5 h-3.5 text-orange-600" /></button>
            </div>
          </div>
          <Steps>
            <ol className="list-decimal pl-4 space-y-1">
              <li>在阿里云控制台开通 <b>Chat App 消息服务</b> 并完成 WhatsApp Business 账号（WABA）注册。</li>
              <li>在 <b>RAM 访问控制</b> 中创建一个具有 Chat App 权限的 AccessKey，填入上面的 <b>AccessKey ID / Secret</b>。</li>
              <li>从 Chat App 控制台复制 <b>CustSpaceId</b> 和已绑定的 WhatsApp <b>发送方号码</b>，填入上面对应字段。</li>
              <li>把上方的 <b>Webhook 回调地址</b> 粘贴到 Chat App 控制台的回调配置中，用于接收消息。</li>
              <li>勾选 <b>启用</b> 并点击下方 <b>保存配置</b>。</li>
            </ol>
          </Steps>
        </ChannelCard>
            </div>
          ) },
          { key: 'meta', label: 'Facebook · Instagram', icon: tabDot(<FbIcon className="w-4 h-4" />, metaConnected || !!metaChat.igAccountId), content: (
            <div className="space-y-4">
        {/* Facebook */}
        <ChannelCard
          icon={<FbIcon className="w-5 h-5 text-blue-600" />} iconBg="bg-blue-100"
          title="Facebook Messenger" subtitle="页面消息直接发送至您的收件箱"
          defaultOpen={!metaConnected}
          right={
            <>
              {metaConnected && <Button size="sm" variant="outline" loading={disconnecting === 'fb'} onClick={disconnectFb}><Unplug className="w-3.5 h-3.5" /> 断开连接</Button>}
              <EnableToggle checked={metaChat.fbEnabled} onChange={(v) => setMetaChat({ ...metaChat, fbEnabled: v })} accent="accent-blue-600" />
            </>
          }
        >
          {fbCfg?.oneClick && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
              {fbCfg.connected ? (
                <p className="text-sm text-blue-900">已连接{fbCfg.pageName ? `: ${fbCfg.pageName}` : ''} — 此主页的消息到达您的收件箱。</p>
              ) : (
                <p className="text-sm text-blue-900">一键连接您的 Facebook 页面 — 无需页面 ID 或令牌。</p>
              )}
              <Button onClick={connectFbOneClick} loading={fbBusy}>
                {fbCfg.connected ? "重新连接 Facebook" : "与 Facebook 联系"}
              </Button>
              {fbPages.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-600">选择要连接的主页：</p>
                  {fbPages.map((p) => (
                    <button key={p.id} onClick={() => chooseFbPage(p.id)} className="block w-full text-left text-sm rounded border border-blue-200 bg-white px-3 py-2 hover:bg-blue-100">
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Input label={"Facebook 页面 ID"} value={metaChat.pageId} onChange={(e) => setMetaChat({ ...metaChat, pageId: e.target.value })} placeholder="e.g. 1234567890" />
          <Input label={"页面访问令牌"} type="password" value={metaChat.pageAccessToken} onChange={(e) => setMetaChat({ ...metaChat, pageAccessToken: e.target.value })} placeholder="EAAB..." />
          <MetaWebhookBox object="Page" fields="messages, messaging_postbacks, message_reads, message_reactions, messaging_handovers" />
          <Steps>
            <ol className="list-decimal pl-4 space-y-1">
              <li>前往 <b>developers.facebook.com</b> → 打开您的应用程序 → <b>添加产品</b> → <b>信使</b> → <b>设置</b>.</li>
              <li>打开 <b>Messenger → 设置</b> → 找到 <b>访问令牌</b> 部分。</li>
              <li>点击 <b>添加或删除页面</b> → 选择您的 Facebook 页面 → 允许所有权限。</li>
              <li>在添加的页面旁边，单击 <b>生成令牌</b>，复制 <code className="bg-white px-1 rounded">EAAB...</code> 令牌并将其粘贴到 <b>页面访问令牌</b> 以上。</li>
              <li>获取你的 <b>页面 ID</b>: 打开你的 Facebook 页面 → <b>关于/设置 → 页面透明度</b> →复制 <b>页面 ID</b> 进入上述字段。</li>
              <li>确保 <code className="bg-white px-1 rounded">pages_messaging</code> 权限已启用（由 Messenger 设置自动添加）。</li>
            </ol>
          </Steps>
        </ChannelCard>

        {/* Instagram */}
        <ChannelCard
          icon={<Camera className="w-5 h-5 text-pink-600" />} iconBg="bg-pink-100"
          title="Instagram 私信" subtitle="收件箱中的 Instagram 私信（使用相同的主页令牌）"
          defaultOpen={!(metaChat.igEnabled || metaChat.igAccountId)}
          right={
            <>
              {(metaChat.igEnabled || metaChat.igAccountId) && <Button size="sm" variant="outline" loading={disconnecting === 'ig'} onClick={disconnectIg}><Unplug className="w-3.5 h-3.5" /> 断开连接</Button>}
              <EnableToggle checked={metaChat.igEnabled} onChange={(v) => setMetaChat({ ...metaChat, igEnabled: v })} accent="accent-pink-600" />
            </>
          }
        >
          {igCfg?.oneClick && (
            <div className="rounded-lg border border-pink-200 bg-pink-50 p-3 space-y-2">
              {igCfg.connected ? (
                <p className="text-sm text-pink-900">已连接{igCfg.profile?.username ? `: @${igCfg.profile.username}` : ''} — Instagram 私信到达您的收件箱。</p>
              ) : (
                <p className="text-sm text-pink-900">将您的 Instagram Professional 账户与 Facebook Login 连接 - 无需 ID 或令牌。</p>
              )}
              <Button onClick={connectIgOneClick} loading={igBusy}>
                {igCfg.connected ? "重新连接 Facebook" : "继续使用 Facebook"}
              </Button>
            </div>
          )}
          {igCfg?.needsAppId && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Instagram 一键登录已启用，但 Facebook 应用程序 ID/密码丢失。面板管理员必须在管理 → 1-Click 注册中添加它们。
            </p>
          )}
          <Input label={"Instagram 账户 ID"} value={metaChat.igAccountId} onChange={(e) => setMetaChat({ ...metaChat, igAccountId: e.target.value })} placeholder="e.g. 17841400000000000" />
          <MetaWebhookBox object="Instagram" fields="messages, messaging_postbacks, messaging_referral, message_reactions, comments, live_comments, mentions" />
          <Steps>
            <ol className="list-decimal pl-4 space-y-1">
              <li>在 Instagram 应用程序中： <b>设置→账户→切换到专业（商业）</b> 账户。</li>
              <li>将该 Instagram 账户链接到您的 Facebook 页面（页面设置 → 链接账户 → Instagram）。</li>
              <li>打开 <b>developers.facebook.com/tools/explorer</b> （Graph API Explorer）并运行：<br/><code className="bg-white px-1 rounded">GET /&#123;page-id&#125;?fields=instagram_business_account</code></li>
              <li>复制返回的 <code className="bg-white px-1 rounded">id</code> （以 <b>17841...</b>）进入 <b>Instagram 账户 ID</b> 以上。</li>
              <li>不需要单独的令牌——上面的页面访问令牌被重复使用。只需确保 <code className="bg-white px-1 rounded">instagram_manage_messages</code> 权限已启用。</li>
            </ol>
          </Steps>
        </ChannelCard>

        {/* Meta 疑难解答 */}
        <ChannelCard
          icon={<HelpCircle className="w-5 h-5 text-slate-600" />} iconBg="bg-slate-100"
          title="Messenger / Instagram 疑难解答" subtitle="检查 webhook，或导入连接之前的历史聊天（webhook 只带来新消息）"
          defaultOpen={false}
        >
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={metaDiagBusy} onClick={runMetaDiagnose}>检查连接</Button>
            <Button size="sm" variant="outline" loading={metaDiagBusy} onClick={fixMetaSubscription}>修复 webhook 订阅</Button>
            <Button size="sm" variant="outline" loading={metaSyncBusy} onClick={syncMetaChats}>同步过去的聊天记录</Button>
          </div>
          {metaDiag && (
            <div className="space-y-2">
              <DiagnosisList diag={metaDiag} />
              <p className="text-xs text-gray-500">
                Meta 上的线程 — Messenger： {metaDiag.meta?.facebook?.threads ?? '-'}，Instagram： {metaDiag.meta?.instagram?.threads ?? '-'} · 在您的收件箱 — Messenger 中： {metaDiag.inbox?.facebook ?? '-'}，Instagram： {metaDiag.inbox?.instagram ?? '-'}
              </p>
            </div>
          )}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <b>Webhook 设置（一次性，在 Meta App 仪表板中）：</b> 回调网址： <code className="bg-white px-1 rounded">{origin}/api/webhook/whatsapp</code> — 验证令牌与您的 WhatsApp webhook 相同。订阅页面和 Instagram 产品中的“消息”字段。
          </div>
        </ChannelCard>
            </div>
          ) },
          { key: 'tg', label: 'Telegram', icon: tabDot(<Send className="w-4 h-4" />, !!telegram.botToken), content: (
            <div className="space-y-4">
        {/* Telegram Bot */}
        <ChannelCard
          icon={<Send className="w-5 h-5 text-sky-600" />} iconBg="bg-sky-100"
          title="Telegram 机器人" subtitle={telegram.botUsername ? `连接为 @${telegram.botUsername}` : '在收件箱中接收和回复 Telegram 消息'}
          defaultOpen={!telegram.botToken}
          right={
            <>
              {telegram.botToken && <Button size="sm" variant="outline" loading={disconnecting === 'tg'} onClick={disconnectTelegram}><Unplug className="w-3.5 h-3.5" /> 断开连接</Button>}
              <EnableToggle checked={telegram.enabled} onChange={(v) => setTelegram({ ...telegram, enabled: v })} accent="accent-sky-600" />
            </>
          }
        >
          <Input label={"机器人令牌"} type="password" value={telegram.botToken} onChange={(e) => setTelegram({ ...telegram, botToken: e.target.value })} placeholder={"123456789：AAF..."} />
          <Steps>
            <ol className="list-decimal pl-4 space-y-1">
              <li>打开 Telegram 并搜索 <b>@BotFather</b> → 打开聊天。</li>
              <li>发送 <code className="bg-white px-1 rounded">/newbot</code>.</li>
              <li>输入 <b>姓名</b> 对于你的机器人，然后 <b>用户名</b> （必须以 <code className="bg-white px-1 rounded">_bot</code>).</li>
              <li>BotFather 使用如下令牌回复 <code className="bg-white px-1 rounded">123456789:AAF...</code> — 将其复制到 <b>机器人令牌</b> 以上。</li>
              <li>点击 <b>保存</b>。 Webhook 会自动注册。向您的机器人发送消息的任何人现在都会出现在您的收件箱中。</li>
            </ol>
          </Steps>
          <ChannelDiagnose channel="telegram" />
        </ChannelCard>

        {/* Personal Telegram */}
        <ChannelCard
          icon={<Send className="w-5 h-5 text-sky-600" />} iconBg="bg-sky-100"
          title="个人 Telegram" subtitle="连接您自己的 Telegram 账户（官方 API，无封禁风险）。多账户自动轮流、老客户固定接待。"
          collapsible={false}
        >
          <ChannelDiagnose channel="tgpersonal" />
          <TgPersonalSlotsSection />
        </ChannelCard>
            </div>
          ) },
          { key: 'email', label: '电子邮件', icon: tabDot(<Mail className="w-4 h-4" />, !!(emailCh.user || emailCh.imapHost)), content: (
            <div className="space-y-4">
        <ChannelCard
          icon={<Mail className="w-5 h-5 text-orange-600" />} iconBg="bg-orange-100"
          title="电子邮件收件箱" subtitle={emailCh.user ? `已连接 — ${emailCh.user}` : '发到支持邮箱的邮件进入收件箱，回复也从该地址发出'}
          defaultOpen={!(emailCh.user || emailCh.imapHost)}
          right={
            <>
              {(emailCh.user || emailCh.imapHost) && <Button size="sm" variant="outline" loading={disconnecting === 'email'} onClick={disconnectEmail}><Unplug className="w-3.5 h-3.5" /> 断开连接</Button>}
              <EnableToggle checked={emailCh.enabled} onChange={(v) => setEmailCh({ ...emailCh, enabled: v })} accent="accent-orange-600" />
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Input label={"IMAP 主机（传入）"} value={emailCh.imapHost} onChange={(e) => setEmailCh({ ...emailCh, imapHost: e.target.value })} placeholder="imap.gmail.com" />
            <Input label={"IMAP 端口"} type="number" value={String(emailCh.imapPort)} onChange={(e) => setEmailCh({ ...emailCh, imapPort: parseInt(e.target.value) || 993 })} />
            <Input label={"SMTP 主机（传出）"} value={emailCh.smtpHost} onChange={(e) => setEmailCh({ ...emailCh, smtpHost: e.target.value })} placeholder="smtp.gmail.com" />
            <Input label={"SMTP 端口"} type="number" value={String(emailCh.smtpPort)} onChange={(e) => setEmailCh({ ...emailCh, smtpPort: parseInt(e.target.value) || 587 })} />
            <Input label={"电子邮件地址"} value={emailCh.user} onChange={(e) => setEmailCh({ ...emailCh, user: e.target.value })} placeholder="support@yourbusiness.com" />
            <Input label={"密码/应用程序密码"} type="password" value={emailCh.pass} onChange={(e) => setEmailCh({ ...emailCh, pass: e.target.value })} />
          </div>
          <Input label={"发件人姓名（可选）"} value={emailCh.fromName} onChange={(e) => setEmailCh({ ...emailCh, fromName: e.target.value })} placeholder={"您的业务支持"} />
          <div className="flex items-center gap-3">
            <Button variant="secondary" loading={emailSyncing} onClick={handleEmailSync}>立即同步</Button>
            {emailStatus.lastError ? (
              <span className="text-xs text-red-600">上次同步失败： {emailStatus.lastError}</span>
            ) : emailStatus.lastPolledAt ? (
              <span className="text-xs text-emerald-600">上次同步 {new Date(emailStatus.lastPolledAt).toLocaleString()}</span>
            ) : (
              <span className="text-xs text-gray-500">尚未同步</span>
            )}
          </div>
          <Steps title="如何连接 Gmail（逐步）">
            <ol className="list-decimal pl-4 space-y-1">
              <li>在您的 Google 账户中 → <b>安全</b>，打开 <b>两步验证</b>.</li>
              <li>前往 <b>Google 账户 → 安全 → 应用程序密码</b> 并创建一个新的应用程序密码（将其命名为“wabapanel”）。您将获得一个 16 个字符的密码。</li>
              <li>填写上面的字段 — IMAP： <code className="bg-white px-1 rounded">imap.gmail.com</code> 端口 <b>993</b>;邮件发送： <code className="bg-white px-1 rounded">smtp.gmail.com</code> 端口 <b>587</b>.</li>
              <li>输入您的 Gmail 地址，然后在 <b>密码/应用程序密码</b> 粘贴 <b>16 个字符的应用程序密码</b> （不是您正常的 Gmail 密码）。</li>
              <li>点击 <b>保存配置</b>。每 2 分钟检查一次新电子邮件并显示在您的收件箱中。</li>
            </ol>
          </Steps>
          <ChannelDiagnose channel="email" />
        </ChannelCard>
            </div>
          ) },
        ]} />
      </div>

      {/* 底部吸附保存栏（sticky，随 main 滚动容器贴底，自动对齐内容宽度） */}
      <div className="sticky bottom-0 z-20 mt-6 -mx-4 lg:-mx-6 -mb-4 lg:-mb-6 border-t border-gray-200 bg-white/90 backdrop-blur px-4 lg:px-6 py-3">
        <div className="max-w-4xl flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 hidden sm:block">修改表单字段后记得保存；一键连接 / 断开已即时生效。</p>
          <Button onClick={handleSave} loading={saving}>保存配置</Button>
        </div>
      </div>
    </div>
  );
}
