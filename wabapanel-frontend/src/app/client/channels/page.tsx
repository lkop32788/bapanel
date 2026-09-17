'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { MessageSquare, Camera, Users as FbIcon, CheckCircle, XCircle, ExternalLink, Send, Mail, QrCode, ShieldAlert, ShieldCheck, Copy, Unplug } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { workspaceApi, waqrApi, tgPersonalApi } from '@/lib/api';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';
import Link from 'next/link';
import ChannelDiagnose, { DiagnosisList } from '@/components/ChannelDiagnose';

type MetaDiagnosis = {
  ok: boolean;
  summary: string;
  checks: { key: string; label: string; ok: boolean; detail: string; fix?: string }[];
  meta?: Record<string, { threads?: number; lastUpdate?: string | null; error?: string }>;
  inbox?: Record<string, number>;
};

export default function ChannelsPage() {
  const { currentWorkspace } = useAuthStore();
  const [waConnected, setWaConnected] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [metaChat, setMetaChat] = useState({ pageId: '', pageAccessToken: '', igAccountId: '', fbEnabled: false, igEnabled: false });
  const [telegram, setTelegram] = useState({ botToken: '', botUsername: '', enabled: false });
  const [emailCh, setEmailCh] = useState({ enabled: false, imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 587, user: '', pass: '', fromName: '' });
  const [webhookCfg, setWebhookCfg] = useState<{ webhookUrl: string; webhookVerifyToken: string }>({ webhookUrl: '', webhookVerifyToken: '' });
  const [disconnecting, setDisconnecting] = useState('');
  const [emailStatus, setEmailStatus] = useState<{ lastPolledAt?: string; lastError?: string }>({});
  const [emailSyncing, setEmailSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState<{ status: string; phone: string; qr: string | null; todayCap?: number; sentToday?: number; warmupDay?: number; warmupTotalDays?: number; customLimit?: number }>({ status: 'disconnected', phone: '', qr: null });
  const [tgp, setTgp] = useState<{ status: string; phone: string; username?: string; error?: string; qr?: string }>({ status: 'disconnected', phone: '' });
  const [tgpPhone, setTgpPhone] = useState('');
  const [tgpMode, setTgpMode] = useState<'qr' | 'phone'>('qr');
  const [tgpCode, setTgpCode] = useState('');
  const [tgpPassword, setTgpPassword] = useState('');
  const [tgpBusy, setTgpBusy] = useState(false);
  const [qrLimitInput, setQrLimitInput] = useState('');
  const [qrLimitSaving, setQrLimitSaving] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
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
    let stop = false;
    const poll = async () => {
      try {
        const res = await waqrApi.status();
        if (!stop) setQr(res.data.data);
      } catch { /* */ }
    };
    poll();
    const t = setInterval(() => {
      if (['qr', 'connecting', 'reconnecting'].includes(qr.status)) poll();
    }, 3000);
    return () => { stop = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace, qr.status]);

  useEffect(() => {
    if (!currentWorkspace) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await tgPersonalApi.status();
        if (!stop) setTgp(res.data.data);
      } catch { /* */ }
    };
    poll();
    const t = setInterval(() => {
      if (['qr', 'connecting', 'verifying', 'awaiting_code', 'awaiting_password'].includes(tgp.status)) poll();
    }, 2500);
    return () => { stop = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace, tgp.status]);

  useEffect(() => {
    if (!currentWorkspace) return;
    api.get('/facebook-connect/config')
      .then(r => setFbCfg(r.data.data))
      .catch(() => {});
    api.get('/facebook-connect/instagram/config')
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
      const opts: Record<string, unknown> = igCfg.configId
        ? { response_type: 'code', override_default_response_type: true, config_id: igCfg.configId }
        : { scope: 'pages_show_list,pages_messaging,pages_manage_metadata,instagram_basic,instagram_manage_messages' };
      (window as FbWindow).FB!.login((resp) => {
        const code = resp?.authResponse?.code;
        const accessToken = resp?.authResponse?.accessToken;
        if (!code && !accessToken) { setIgBusy(false); toast.error(translateApiMessage("Facebook 登录已取消")); return; }
        const redirectUri = window.location.origin + window.location.pathname;
        api.post('/facebook-connect/instagram/one-click', code ? { code, redirectUri } : { accessToken, redirectUri })
          .then(r => {
            const d = r.data.data;
            toast.success(translateApiMessage("Instagram 已连接"));
            if (d?.igAccountId) setMetaChat(m => ({ ...m, igAccountId: String(d.igAccountId), igEnabled: true }));
            api.get('/facebook-connect/instagram/config').then(res => setIgCfg(res.data.data)).catch(() => {});
          })
          .catch(err => toast.error(translateApiMessage(err.response?.data?.message || "连接失败")))
          .finally(() => setIgBusy(false));
      }, opts);
    } catch { setIgBusy(false); toast.error(translateApiMessage("Facebook SDK 加载失败")); }
  };

  const connectTgpQr = async () => {
    setTgpBusy(true);
    try {
      const res = await tgPersonalApi.connectQr();
      setTgp(res.data.data);
      if (res.data.data?.status === 'error') toast.error(translateApiMessage(res.data.data.error || "生成二维码失败"));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "生成二维码失败"));
    }
    setTgpBusy(false);
  };

  const connectTgp = async () => {
    if (!tgpPhone.trim()) { toast.error(translateApiMessage("输入您的电话号码和国家/地区代码")); return; }
    setTgpBusy(true);
    try {
      const res = await tgPersonalApi.connect(tgpPhone.trim());
      setTgp(res.data.data);
      if (res.data.data?.status === 'awaiting_code') toast.success(translateApiMessage("代码已发送 — 检查您的 Telegram 应用"));
      if (res.data.data?.status === 'error') toast.error(translateApiMessage(res.data.data.error || "登录失败"));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "无法开始登录"));
    }
    setTgpBusy(false);
  };

  const connectQr = async () => {
    setQrBusy(true);
    try {
      const res = await waqrApi.connect();
      setQr(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "无法启动 QR 会话"));
    }
    setQrBusy(false);
  };

  const disconnectQr = async () => {
    if (!confirm("断开此 WhatsApp 号码的连接吗？")) return;
    setQrBusy(true);
    try { await waqrApi.disconnect(); setQr({ status: 'disconnected', phone: '', qr: null }); toast.success(translateApiMessage("已断开连接")); } catch { toast.error(translateApiMessage("操作失败")); }
    setQrBusy(false);
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

  const saveChannels = async (patch: { metaChat?: typeof metaChat; telegram?: typeof telegram; emailChannel?: typeof emailCh }) => {
    if (!currentWorkspace) return;
    await workspaceApi.update(currentWorkspace._id, { metaChat, telegram, emailChannel: emailCh, ...patch });
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
      await workspaceApi.update(currentWorkspace._id, { metaChat, telegram, emailChannel: emailCh });
      toast.success(translateApiMessage("通道配置已保存"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "保存失败"));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <div className="page-hero">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">通道配置</h1>
        <p className="text-gray-500 text-sm mt-1">WhatsApp、Facebook Messenger 和 Instagram DM — 所有三个渠道的 API 配置位于一处</p>
        </div>
        </div>
      </div>

      {/* WhatsApp */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center"><MessageSquare className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">WhatsApp 商务</h2>
              <p className="text-xs text-gray-500">{waConnected ? `已连接${waPhone ? ' — ' + waPhone : ''}` : "未连接"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {waConnected ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="w-4 h-4" /> 已连接</span>
              : <span className="flex items-center gap-1 text-xs text-red-500"><XCircle className="w-4 h-4" /> 未连接</span>}
            <Link href="/client/whatsapp" className="text-sm text-emerald-600 hover:underline flex items-center gap-1">配置 <ExternalLink className="w-3 h-3" /></Link>
            {waConnected && <Button size="sm" variant="outline" loading={disconnecting === 'wa'} onClick={disconnectWa}><Unplug className="w-3.5 h-3.5" /> 断开连接</Button>}
          </div>
        </div>
        <ChannelDiagnose channel="whatsapp" />
      </div>

      {/* WhatsApp by QR */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"><QrCode className="w-5 h-5 text-green-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">WhatsApp 二维码</h2>
              <p className="text-xs text-gray-500">{qr.status === 'connected' ? `已连接 — +${qr.phone}` : "通过扫描二维码连接普通 WhatsApp 号码（无需 API）"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {qr.status === 'connected' ? (
              <>
                <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="w-4 h-4" /> 已连接</span>
                <Button size="sm" variant="outline" loading={qrBusy} onClick={async () => { setQrBusy(true); try { await waqrApi.sync(); toast.success(translateApiMessage("正在同步消息...")); } catch { toast.error(translateApiMessage("同步失败")); } setQrBusy(false); }}>同步消息</Button>
                <Button size="sm" variant="outline" onClick={disconnectQr} loading={qrBusy}>断开连接</Button>
              </>
            ) : (
              <Button size="sm" onClick={connectQr} loading={qrBusy}>{qr.status === 'qr' ? "刷新" : "连接"}</Button>
            )}
          </div>
        </div>

        {qr.status === 'qr' && qr.qr && (
          <div className="flex flex-col items-center gap-2 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.qr} alt={"WhatsApp 二维码"} className="w-56 h-56 rounded-lg border" />
            <p className="text-xs text-gray-500 text-center">在手机上打开 WhatsApp → <b>设置 → 链接设备 → 链接设备</b> → 扫描此码</p>
          </div>
        )}
        {['connecting', 'reconnecting'].includes(qr.status) && (
          <p className="text-xs text-gray-400">正在连接...二维码将在几秒钟后出现在此处。</p>
        )}
        {qr.status === 'connected' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> 号码加温器和反禁令保护 — 主动</p>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-600 text-white">热身日 {qr.warmupDay || 1} / {qr.warmupTotalDays || 14}</span>
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-emerald-800 mb-1">
                <span>今日安全发送限额</span>
                <span className="font-semibold">{qr.sentToday || 0} / {qr.todayCap || 25} 消息</span>
              </div>
              <div className="h-2 bg-emerald-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, ((qr.sentToday || 0) / (qr.todayCap || 25)) * 100)}%` }} />
              </div>
            </div>
            <ul className="text-[11px] text-emerald-800 grid grid-cols-2 gap-x-4 gap-y-1">
              <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 逐步涨停预热（14天）</li>
              <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 类人随机延迟（5-15秒）</li>
              <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 每次发送前的键入指示器</li>
              <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 禁止/注销检测时自动暂停</li>
              <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 一旦达到每日上限，发送就会被阻止</li>
              <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 每日计数器在午夜重置</li>
            </ul>
            <p className="text-[11px] text-emerald-700">聊天显示在 <b>WhatsApp 二维码收件箱</b>。随着您的号码变暖，限额每天都会自动增加。</p>
            <div className="border-t border-emerald-200 pt-2 space-y-1.5">
              <p className="text-[11px] font-semibold text-emerald-800">自定义每日限额（风险自负）</p>
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={2000} placeholder={qr.customLimit ? String(qr.customLimit) : "自动（预热）"}
                  value={qrLimitInput} onChange={(e) => setQrLimitInput(e.target.value)}
                  className="w-36 px-2 py-1 text-xs border border-emerald-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <Button size="sm" variant="outline" loading={qrLimitSaving} onClick={async () => {
                  setQrLimitSaving(true);
                  try {
                    const v = parseInt(qrLimitInput, 10) || 0;
                    await waqrApi.settings(v);
                    setQr({ ...qr, customLimit: v, todayCap: v > 0 ? v : qr.todayCap });
                    toast.success(translateApiMessage(v > 0 ? `每日限额设置为 ${v}` : "返回自动预热限制"));
                  } catch { toast.error(translateApiMessage("保存限制失败")); }
                  setQrLimitSaving(false);
                }}>保存</Button>
                {(qr.customLimit || 0) > 0 && (
                  <button className="text-[11px] text-emerald-700 underline" onClick={async () => {
                    try { await waqrApi.settings(0); setQr({ ...qr, customLimit: 0 }); setQrLimitInput(''); toast.success(translateApiMessage("返回自动预热限制")); } catch { toast.error(translateApiMessage("操作失败")); }
                  }}>重置为自动</button>
                )}
              </div>
              <p className="text-[10px] text-emerald-700">覆盖自动预热计划。对新鲜数量设置较高的限制会大大增加禁令风险。设置 0 或重置以返回自动。</p>
            </div>
          </div>
        )}

        <ChannelDiagnose channel="waqr" />
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> 确保安全 — 连接前请阅读</p>
          <ul className="text-xs text-amber-800 space-y-1 list-disc pl-4">
            <li>这使用 WhatsApp Web（不是官方 API）。它违反 WhatsApp 的服务条款并带有 <b>您的号码被禁止的风险</b>。使用辅助号码，而不是您的主要个人/公司号码。</li>
            <li>我们的安全引擎会自动保护您：新号码从每日的小限额开始，并在 2 周内增长（号码预热），消息以类似人类的随机延迟和打字指示器发送。</li>
            <li>仅向认识您或首先联系过您的人发送消息。切勿向未知号码发送批量促销信息 - 这是被禁止的最快方法。</li>
            <li>避免重复发送相同的文本。个性化消息并保持健康的回复率（如果没有人回复，请放慢速度）。</li>
            <li>保持手机连接到互联网。如果该号码被禁止或注销，频道会自动暂停，您将在此处看到它。</li>
            <li>对于批量营销活动、官方模板和绿色勾号验证，请使用官方 <b>WhatsApp 商业 API</b> 通道同上。</li>
          </ul>
        </div>
      </div>

      {/* Facebook */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center"><FbIcon className="w-5 h-5 text-blue-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">Facebook Messenger</h2>
              <p className="text-xs text-gray-500">页面消息直接发送至您的 Facebook 收件箱</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {metaConnected && <Button size="sm" variant="outline" loading={disconnecting === 'fb'} onClick={disconnectFb}><Unplug className="w-3.5 h-3.5" /> 断开连接</Button>}
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={metaChat.fbEnabled} onChange={(e) => setMetaChat({ ...metaChat, fbEnabled: e.target.checked })} className="w-4 h-4 accent-blue-600" />
              启用
            </label>
          </div>
        </div>
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
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-gray-700">如何获得这些（一步一步）：</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>前往 <b>developers.facebook.com</b> → 打开您的应用程序 → <b>添加产品</b> → <b>信使</b> → <b>设置</b>.</li>
            <li>打开 <b>Messenger → 设置</b> → 找到 <b>访问令牌</b> 部分。</li>
            <li>点击 <b>添加或删除页面</b> → 选择您的 Facebook 页面 → 允许所有权限。</li>
            <li>在添加的页面旁边，单击 <b>生成令牌</b>，复制 <code className="bg-white px-1 rounded">EAAB...</code> 令牌并将其粘贴到 <b>页面访问令牌</b> 以上。</li>
            <li>获取你的 <b>页面 ID</b>: 打开你的 Facebook 页面 → <b>关于/设置 → 页面透明度</b> →复制 <b>页面 ID</b> 进入上述字段。</li>
            <li>确保 <code className="bg-white px-1 rounded">pages_messaging</code> 权限已启用（由 Messenger 设置自动添加）。</li>
          </ol>
        </div>
        <MetaWebhookBox object="Page" fields="messages, messaging_postbacks, message_reads, message_reactions, messaging_handovers" />
      </div>

      {/* Instagram */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center"><Camera className="w-5 h-5 text-pink-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">Instagram 私信</h2>
              <p className="text-xs text-gray-500">收件箱中的 Instagram 私信（使用相同的主页令牌）</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(metaChat.igEnabled || metaChat.igAccountId) && <Button size="sm" variant="outline" loading={disconnecting === 'ig'} onClick={disconnectIg}><Unplug className="w-3.5 h-3.5" /> 断开连接</Button>}
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={metaChat.igEnabled} onChange={(e) => setMetaChat({ ...metaChat, igEnabled: e.target.checked })} className="w-4 h-4 accent-pink-600" />
              启用
            </label>
          </div>
        </div>
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
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-gray-700">如何获取 Instagram 账户 ID（逐步）：</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>在 Instagram 应用程序中： <b>设置→账户→切换到专业（商业）</b> 账户。</li>
            <li>将该 Instagram 账户链接到您的 Facebook 页面（页面设置 → 链接账户 → Instagram）。</li>
            <li>打开 <b>developers.facebook.com/tools/explorer</b> （Graph API Explorer）并运行：<br/><code className="bg-white px-1 rounded">GET /&#123;page-id&#125;?fields=instagram_business_account</code></li>
            <li>复制返回的 <code className="bg-white px-1 rounded">id</code> （以 <b>17841...</b>）进入 <b>Instagram 账户 ID</b> 以上。</li>
            <li>不需要单独的令牌——上面的页面访问令牌被重复使用。只需确保 <code className="bg-white px-1 rounded">instagram_manage_messages</code> 权限已启用。</li>
          </ol>
        </div>
        <MetaWebhookBox object="Instagram" fields="messages, messaging_postbacks, messaging_referral, message_reactions, comments, live_comments, mentions" />
      </div>

      {/* Meta troubleshooting: why Messenger / Instagram messages are not arriving */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900">Messenger/Instagram 疑难解答</h2>
          <p className="text-xs text-gray-500">检查 webhook 设置，或导入账户连接之前存在的聊天记录（webhook 仅带来新消息）。</p>
        </div>
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
      </div>

      {/* Telegram */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center"><Send className="w-5 h-5 text-sky-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">Telegram</h2>
              <p className="text-xs text-gray-500">{telegram.botUsername ? `连接为@${telegram.botUsername}` : "在收件箱中接收和回复 Telegram 消息"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {telegram.botToken && <Button size="sm" variant="outline" loading={disconnecting === 'tg'} onClick={disconnectTelegram}><Unplug className="w-3.5 h-3.5" /> 断开连接</Button>}
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={telegram.enabled} onChange={(e) => setTelegram({ ...telegram, enabled: e.target.checked })} className="w-4 h-4 accent-sky-600" />
              启用
            </label>
          </div>
        </div>
        <Input label={"机器人令牌"} type="password" value={telegram.botToken} onChange={(e) => setTelegram({ ...telegram, botToken: e.target.value })} placeholder={"123456789：AAF..."} />
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-gray-700">如何获取机器人令牌（逐步）：</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>打开 Telegram 并搜索 <b>@BotFather</b> → 打开聊天。</li>
            <li>发送 <code className="bg-white px-1 rounded">/newbot</code>.</li>
            <li>输入 <b>姓名</b> 对于你的机器人，然后 <b>用户名</b> （必须以 <code className="bg-white px-1 rounded">_bot</code>).</li>
            <li>BotFather 使用如下令牌回复 <code className="bg-white px-1 rounded">123456789:AAF...</code> — 将其复制到 <b>机器人令牌</b> 以上。</li>
            <li>点击 <b>保存</b>。 Webhook 会自动注册。向您的机器人发送消息的任何人现在都会出现在您的收件箱中。</li>
          </ol>
        </div>
        <ChannelDiagnose channel="telegram" />
      </div>

      {/* Personal Telegram */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center"><Send className="w-5 h-5 text-sky-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">个人电报</h2>
              <p className="text-xs text-gray-500">{tgp.status === 'connected' ? `已连接 — +${tgp.phone}${tgp.username ? ' (@' + tgp.username + ')' : ''}` : "通过二维码扫描连接您自己的 Telegram 账户（如 Telegram Desktop）——官方 Telegram API，无封禁风险"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {tgp.status === 'connected' ? (
              <>
                <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="w-4 h-4" /> 已连接</span>
                <Button size="sm" variant="outline" loading={tgpBusy} onClick={async () => {
                  if (!confirm("断开此 Telegram 账户的连接？")) return;
                  setTgpBusy(true);
                  try { await tgPersonalApi.disconnect(); setTgp({ status: 'disconnected', phone: '' }); toast.success(translateApiMessage("已断开连接")); } catch { toast.error(translateApiMessage("操作失败")); }
                  setTgpBusy(false);
                }}>断开连接</Button>
              </>
            ) : (
              <span className="flex items-center gap-1 text-xs text-red-500"><XCircle className="w-4 h-4" /> 未连接</span>
            )}
          </div>
        </div>

        {tgp.status !== 'connected' && (
          <>
            {!['awaiting_code', 'awaiting_password', 'verifying'].includes(tgp.status) && (
              <div className="space-y-3">
                {tgpMode === 'qr' ? (
                  <>
                    {tgp.status === 'qr' && tgp.qr ? (
                      <div className="flex flex-col items-center gap-3 py-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={tgp.qr} alt={"电报登录二维码"} className="w-56 h-56 border rounded-lg" />
                        <p className="text-xs text-gray-500 text-center">在手机上打开 Telegram → <b>设置 → 设备 → 链接桌面设备</b> → 扫描此二维码。代码会自动刷新。</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <Button size="sm" onClick={connectTgpQr} loading={tgpBusy || tgp.status === 'connecting'}>通过二维码连接</Button>
                        {tgp.status === 'error' && <span className="text-xs text-red-500">{tgp.error || "登录失败"}</span>}
                      </div>
                    )}
                    <button type="button" className="text-xs text-sky-600 underline" onClick={() => setTgpMode('phone')}>使用电话号码+验证码登录</button>
                  </>
                ) : (
                  <>
                    <Input label={"电话号码（带国家/地区代码）"} value={tgpPhone} onChange={(e) => setTgpPhone(e.target.value)} placeholder="+919876543210" />
                    <div className="flex items-center gap-3">
                      <Button size="sm" onClick={connectTgp} loading={tgpBusy || tgp.status === 'connecting'}>发送登录代码</Button>
                      {tgp.status === 'error' && <span className="text-xs text-red-500">{tgp.error || "登录失败"}</span>}
                    </div>
                    <button type="button" className="text-xs text-sky-600 underline" onClick={() => setTgpMode('qr')}>使用二维码扫描登录</button>
                  </>
                )}
              </div>
            )}
            {tgp.status === 'awaiting_code' && (
              <div className="flex items-end gap-3">
                <Input label={"登录代码（发送到您的 Telegram 应用程序）"} value={tgpCode} onChange={(e) => setTgpCode(e.target.value)} placeholder="12345" />
                <Button size="sm" loading={tgpBusy} onClick={async () => {
                  if (!tgpCode.trim()) return;
                  setTgpBusy(true);
                  try { await tgPersonalApi.code(tgpCode.trim()); setTgp({ ...tgp, status: 'verifying' }); setTgpCode(''); }
                  catch (err: unknown) { const e = err as { response?: { data?: { message?: string } } }; toast.error(translateApiMessage(e.response?.data?.message || "操作失败")); }
                  setTgpBusy(false);
                }}>验证码</Button>
              </div>
            )}
            {tgp.status === 'awaiting_password' && (
              <div className="flex items-end gap-3">
                <Input label={"两步验证密码"} type="password" value={tgpPassword} onChange={(e) => setTgpPassword(e.target.value)} />
                <Button size="sm" loading={tgpBusy} onClick={async () => {
                  if (!tgpPassword) return;
                  setTgpBusy(true);
                  try { await tgPersonalApi.password(tgpPassword); setTgp({ ...tgp, status: 'verifying' }); setTgpPassword(''); }
                  catch (err: unknown) { const e = err as { response?: { data?: { message?: string } } }; toast.error(translateApiMessage(e.response?.data?.message || "操作失败")); }
                  setTgpBusy(false);
                }}>验证密码</Button>
              </div>
            )}
            {tgp.status === 'verifying' && <p className="text-xs text-gray-400">正在验证...</p>}
          </>
        )}
        {tgp.status === 'connected' && (
          <p className="text-xs text-gray-500">聊天显示在 <b>个人电报收件箱</b>。您可以向 Telegram 联系人/聊天中的任何人发送消息，并且流程、关键字和 AI 自动回复均在此频道上运行。这使用了 Telegram 的官方 API — 没有被禁止的风险。</p>
        )}
        <ChannelDiagnose channel="tgpersonal" />
      </div>

      {/* Email */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center"><Mail className="w-5 h-5 text-orange-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">电子邮件收件箱</h2>
              <p className="text-xs text-gray-500">发送到您的支持地址的电子邮件将显示在您的收件箱中，并从该地址发送回复</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(emailCh.user || emailCh.imapHost) && <Button size="sm" variant="outline" loading={disconnecting === 'email'} onClick={disconnectEmail}><Unplug className="w-3.5 h-3.5" /> 断开连接</Button>}
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={emailCh.enabled} onChange={(e) => setEmailCh({ ...emailCh, enabled: e.target.checked })} className="w-4 h-4 accent-orange-600" />
              启用
            </label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label={"IMAP 主机（传入）"} value={emailCh.imapHost} onChange={(e) => setEmailCh({ ...emailCh, imapHost: e.target.value })} placeholder="imap.gmail.com" />
          <Input label={"IMAP 端口"} type="number" value={String(emailCh.imapPort)} onChange={(e) => setEmailCh({ ...emailCh, imapPort: parseInt(e.target.value) || 993 })} />
          <Input label={"SMTP 主机（传出）"} value={emailCh.smtpHost} onChange={(e) => setEmailCh({ ...emailCh, smtpHost: e.target.value })} placeholder="smtp.gmail.com" />
          <Input label={"SMTP 端口"} type="number" value={String(emailCh.smtpPort)} onChange={(e) => setEmailCh({ ...emailCh, smtpPort: parseInt(e.target.value) || 587 })} />
          <Input label={"电子邮件地址"} value={emailCh.user} onChange={(e) => setEmailCh({ ...emailCh, user: e.target.value })} placeholder="support@yourbusiness.com" />
          <Input label={"密码/应用程序密码"} type="password" value={emailCh.pass} onChange={(e) => setEmailCh({ ...emailCh, pass: e.target.value })} />
        </div>
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
        <Input label={"发件人姓名（可选）"} value={emailCh.fromName} onChange={(e) => setEmailCh({ ...emailCh, fromName: e.target.value })} placeholder={"您的业务支持"} />
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-gray-700">如何连接 Gmail（逐步）：</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>在您的 Google 账户中 → <b>安全</b>，打开 <b>两步验证</b>.</li>
            <li>前往 <b>Google 账户 → 安全 → 应用程序密码</b> 并创建一个新的应用程序密码（将其命名为“wabapanel”）。您将获得一个 16 个字符的密码。</li>
            <li>填写上面的字段 — IMAP： <code className="bg-white px-1 rounded">imap.gmail.com</code> 端口 <b>993</b>;邮件发送： <code className="bg-white px-1 rounded">smtp.gmail.com</code> 端口 <b>587</b>.</li>
            <li>输入您的 Gmail 地址，然后在 <b>密码/应用程序密码</b> 粘贴 <b>16 个字符的应用程序密码</b> （不是您正常的 Gmail 密码）。</li>
            <li>点击 <b>保存配置</b>。每 2 分钟检查一次新电子邮件并显示在您的收件箱中。</li>
          </ol>
        </div>
        <ChannelDiagnose channel="email" />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        <b>Webhook 设置（一次性，在 Meta App 仪表板中）：</b> 回调网址： <code className="bg-white px-1 rounded">{(typeof window !== 'undefined' ? window.location.origin : '')}/api/webhook/whatsapp</code> — 验证令牌与您的 WhatsApp webhook 相同。订阅页面和 Instagram 产品中的“消息”字段。
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving}>保存配置</Button>
      </div>
    </div>
  );
}
