'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect, useRef } from 'react';
import { Wifi, Settings, CheckCircle, Copy, RefreshCw, Activity, ShieldCheck, AlertTriangle, ExternalLink } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { workspaceApi } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

// Meta-branded signup button. Both Embedded Signup and Coexistence use it so an
// existing WhatsApp Business App number gets the same polished entry point.
const MetaSignupButton = ({ label, hint, onClick, loading, tone = 'facebook' }: {
  label: string; hint?: string; onClick: () => void; loading?: boolean; tone?: 'facebook' | 'whatsapp';
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading}
    className={`group inline-flex w-full max-w-sm items-center gap-3 rounded-xl px-5 py-3.5 text-left text-white shadow-md transition-all hover:shadow-lg active:scale-[0.99] disabled:opacity-60 ${
      tone === 'whatsapp' ? 'bg-[#25D366] hover:bg-[#1FB855]' : 'bg-[#1877F2] hover:bg-[#166FE5]'
    }`}
  >
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20">
      {loading ? (
        <RefreshCw className="h-5 w-5 animate-spin" />
      ) : tone === 'whatsapp' ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" aria-hidden="true">
          <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.12-.41-2.13-1.31-.79-.7-1.32-1.57-1.47-1.87-.15-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.6-.92-2.19-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47 0 1.46 1.06 2.87 1.21 3.07.15.2 2.09 3.19 5.06 4.35 2.97 1.16 2.97.77 3.51.72.54-.05 1.75-.71 2-1.4.25-.69.25-1.28.17-1.4-.07-.12-.27-.2-.57-.35z" />
          <path d="M12.04 2.5C6.79 2.5 2.5 6.79 2.5 12.04c0 1.68.44 3.31 1.28 4.75L2.5 21.5l4.85-1.27a9.5 9.5 0 0 0 4.69 1.22c5.25 0 9.54-4.29 9.54-9.54S17.29 2.5 12.04 2.5zm0 17.13a7.6 7.6 0 0 1-3.87-1.06l-.28-.16-2.87.75.77-2.8-.18-.29a7.59 7.59 0 1 1 6.43 3.56z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" aria-hidden="true">
          <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22C18.34 21.24 22 17.08 22 12.06z" />
        </svg>
      )}
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-semibold leading-tight">{label}</span>
      {hint && <span className="block text-xs text-white/80">{hint}</span>}
    </span>
  </button>
);

// FEAT-02: live number health (Workspace numberHealth, main + extra numbers) and ONE colour mapping for
// every Meta status: bad states (RED, BANNED, FLAGGED, RESTRICTED, DECLINED, EXPIRED, ...) are red.
interface NumberHealth {
  status?: string; qualityRating?: string; messagingLimitTier?: string; messagingLimitScope?: string; nameStatus?: string;
  verifiedName?: string; codeVerificationStatus?: string; healthStatus?: { canSendMessage?: string }; wabaReviewStatus?: string;
  wabaBanState?: string; lastEvent?: { field?: string; event?: string; at?: string }; lastSyncedAt?: string; lastSyncError?: string;
}
type ExtraNumber = { phoneNumberId: string; phoneNumber: string; displayName: string; accessToken?: string; wabaId?: string; numberHealth?: NumberHealth };
const BAD_STATES = ['RED', 'BANNED', 'FLAGGED', 'RESTRICTED', 'DECLINED', 'REJECTED', 'DISABLED', 'DISABLE', 'BLOCKED', 'EXPIRED', 'DISCONNECTED', 'DELETED', 'FAILED'];
const OK_STATES = ['GREEN', 'CONNECTED', 'APPROVED', 'VERIFIED', 'AVAILABLE', 'AVAILABLE_WITHOUT_REVIEW'];
const WARN_STATES = ['YELLOW', 'PENDING', 'PENDING_REVIEW', 'LIMITED', 'NOT_VERIFIED', 'UNVERIFIED', 'MIGRATED', 'IN_APPEAL', 'DEFERRED'];
const statusVariant = (v?: string): 'success' | 'warning' | 'danger' | 'default' => {
  const s = String(v || '').toUpperCase();
  if (!s) return 'default';
  if (BAD_STATES.includes(s)) return 'danger';
  if (OK_STATES.includes(s)) return 'success';
  if (WARN_STATES.includes(s)) return 'warning';
  return 'default';
};
const isRestricted = (h?: NumberHealth) => !!h && ((/DISABLE|BAN/i.test(h.wabaBanState || '') && !/AVAILABLE|LIMITED/i.test(h.healthStatus?.canSendMessage || ''))
  || String(h.status || '').toUpperCase() === 'BANNED' || String(h.healthStatus?.canSendMessage || '').toUpperCase() === 'BLOCKED');

export default function WhatsAppPage() {
  const { currentWorkspace } = useAuthStore();
  const wa = currentWorkspace?.whatsapp;
  const [method, setMethod] = useState<'embedded' | 'qr' | 'manual'>('manual');
  const [manualForm, setManualForm] = useState({
    wabaId: wa?.wabaId || '', phoneNumberId: wa?.phoneNumberId || '',
    businessAccountId: wa?.businessAccountId || '', accessToken: wa?.accessToken || '',
  });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [extraNumbers, setExtraNumbers] = useState<ExtraNumber[]>((wa?.extraNumbers || []) as ExtraNumber[]);
  const nh = (wa as unknown as { numberHealth?: NumberHealth } | undefined)?.numberHealth;
  const [newNum, setNewNum] = useState({ phoneNumberId: '', phoneNumber: '', displayName: '', accessToken: '', wabaId: '' });
  const [diffWaba, setDiffWaba] = useState(false);
  const [numSaving, setNumSaving] = useState(false);
  const [payCfg, setPayCfg] = useState((wa as unknown as { paymentConfiguration?: string })?.paymentConfiguration || '');
  const [payCfgSaving, setPayCfgSaving] = useState(false);
  const savePayCfg = async () => {
    if (!currentWorkspace?._id) return;
    setPayCfgSaving(true);
    try {
      await workspaceApi.updateWhatsApp(currentWorkspace._id, { paymentConfiguration: payCfg.trim() });
      toast.success(translateApiMessage("WhatsApp Pay 配置已保存"));
    } catch { toast.error(translateApiMessage("保存失败")); }
    setPayCfgSaving(false);
  };
  const [refreshing, setRefreshing] = useState(false);
  interface WaHealth {
    tokenValid: boolean;
    phone: { display_phone_number?: string; verified_name?: string; quality_rating?: string; code_verification_status?: string; platform_type?: string; name_status?: string; new_name_status?: string; effective_name_status?: string; messaging_limit_tier?: string; status?: string; throughput?: { level?: string } } | null;
    waba: { id?: string; name?: string; account_review_status?: string; business_verification_status?: string; country?: string; ownership_type?: string; owner_business_info?: { id?: string; name?: string } } | null;
    fbAccount?: { id?: string; name?: string };
    errors: string[];
  }
  const [health, setHealth] = useState<WaHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  interface WaDiag {
    ok: boolean; issues: string[]; savedWabaId: string; grantedWabaIds: string[];
    tokenValid: boolean | null; tokenAppId: string; scopes: string[]; appSubscribed: boolean | null; catalogues?: string[]; catalogueNote?: string; fixedWabaId: string;
    manageWabaIds?: string[]; templateAccess?: string; messagingAccess?: string; wabaReviewStatus?: string; businessVerificationStatus?: string;
    wabaOwnerBusiness?: string; wabaSharedWithBusiness?: string; wabaTasks?: string[];
  }
  const [diag, setDiag] = useState<WaDiag | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  // Meta answers "(#100) Need permission..." when the saved WABA ID is not one the token
  // was granted, so the fix flag lets the panel correct the ID from the token itself.
  const runDiagnose = async (fix = false) => {
    if (!currentWorkspace?._id) return;
    setDiagLoading(true);
    try {
      const r = await workspaceApi.diagnoseWhatsApp(currentWorkspace._id, fix);
      setDiag(r.data.data);
      if (r.data.data?.fixedWabaId) toast.success(translateApiMessage(`WABA ID 更正为 ${r.data.data.fixedWabaId}`));
      else if (r.data.data?.ok) toast.success(translateApiMessage("连接看起来正确"));
    } catch { toast.error(translateApiMessage("诊断失败")); }
    setDiagLoading(false);
  };

  interface SendingLimits {
    qualityRating: string;
    messagingLimitTier: string;
    dailyUniqueCap: number;
    dailyUniqueCapSource: 'manual' | 'meta';
    used24h: number;
    remaining24h: number;
    throughputLevel: string;
    maxMessagesPerSecond: number;
    metaThroughputMps?: number;
    settings: {
      enabled: boolean; marketingCooldownHours: number; failCooldownHours: number;
      respectTier: boolean; messagesPerSecond: number; dailyUniqueCapOverride: number;
    };
  }
  const [limits, setLimits] = useState<SendingLimits | null>(null);
  const [limitsSaving, setLimitsSaving] = useState(false);

  const loadLimits = async () => {
    if (!currentWorkspace?._id) return;
    try {
      const r = await workspaceApi.getSendingLimits(currentWorkspace._id);
      setLimits(r.data.data);
    } catch { setLimits(null); }
  };

  const saveLimits = async () => {
    if (!currentWorkspace?._id || !limits) return;
    setLimitsSaving(true);
    try {
      await workspaceApi.updateSendingLimits(currentWorkspace._id, limits.settings);
      toast.success(translateApiMessage("交货保护已保存"));
      await loadLimits();
    } catch { toast.error(translateApiMessage("保存失败")); }
    setLimitsSaving(false);
  };

  const setLimitSetting = <K extends keyof SendingLimits['settings']>(key: K, value: SendingLimits['settings'][K]) => {
    setLimits(l => (l ? { ...l, settings: { ...l.settings, [key]: value } } : l));
  };

  const loadHealth = async () => {
    if (!currentWorkspace?._id) return;
    setHealthLoading(true);
    try {
      const r = await workspaceApi.getWhatsAppHealth(currentWorkspace._id);
      setHealth(r.data.data);
    } catch { setHealth(null); }
    setHealthLoading(false);
  };

  useEffect(() => {
    if (wa?.isConnected && currentWorkspace?._id) { loadHealth(); loadLimits(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wa?.isConnected, currentWorkspace?._id]);

  // FEAT-02: keep the additional-number rows in step with the store (live updates below)
  useEffect(() => { setExtraNumbers((wa?.extraNumbers || []) as ExtraNumber[]); }, [wa?.extraNumbers]);

  // FEAT-02: Meta number events and the background refresh emit `wa_number_updated`; reload the workspace (debounced)
  useEffect(() => {
    const s = getSocket();
    const wsId = currentWorkspace?._id;
    if (!s || !wsId) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onUpdate = (p: { workspaceId?: string }) => {
      if (p?.workspaceId && p.workspaceId !== wsId) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        workspaceApi.get(wsId).then(r => { if (r.data?.data) useAuthStore.setState({ currentWorkspace: r.data.data }); }).catch(() => {});
      }, 800);
    };
    s.on('wa_number_updated', onUpdate);
    return () => { s.off('wa_number_updated', onUpdate); if (t) clearTimeout(t); };
  }, [currentWorkspace?._id]);

  const limitLabel = (tier?: string) => {
    if (!tier) return 'Unknown';
    const map: Record<string, string> = {
      TIER_50: '50 / 24hr', TIER_250: '250 / 24hr', TIER_1K: '1,000 / 24hr', TIER_2K: '2,000 / 24hr',
      TIER_10K: '10,000 / 24hr', TIER_100K: '100,000 / 24hr', TIER_UNLIMITED: 'Unlimited',
      TIER_NOT_SET: 'Not set (new number)',
    };
    return map[tier] || tier;
  };

  // A coexistence number keeps living in the WhatsApp Business App, so Meta answers
  // NON_EXISTS for the Cloud API display-name review and NOT_VERIFIED for the Cloud
  // API OTP even though the name and the number work. Show that as normal instead of
  // as a problem.
  const isCoexistence = wa?.connectionMethod === 'coexistence';
  // Meta leaves the legacy name_status at NON_EXISTS on many numbers and reports the real
  // review result in new_name_status, so the live value wins over the stored one.
  const liveNameStatus = health?.phone
    ? health.phone.effective_name_status || health.phone.new_name_status || health.phone.name_status
    : undefined;
  const nameStatus = liveNameStatus || wa?.nameStatus;
  // A number that Meta reports as CONNECTED without a Cloud API OTP can only have been
  // onboarded from the WhatsApp Business App, so numbers connected before the panel
  // stored the method are recognised too.
  const appManaged = (phoneStatus?: string, verify?: string) =>
    isCoexistence || (phoneStatus === 'CONNECTED' && !!verify && verify !== 'VERIFIED');
  const nameBadge = (status?: string, phoneStatus?: string, verify?: string) => {
    if (status === 'APPROVED') return { text: "已批准", variant: 'success' as const, hint: '' };
    if (status === 'AVAILABLE_WITHOUT_REVIEW') {
      return { text: "已批准", variant: 'success' as const, hint: "这个名字不需要元审查" };
    }
    if (status === 'IN_USE') {
      return {
        text: "使用中",
        variant: 'success' as const,
        hint: "Meta 没有待审核的姓名 — 该姓名已在您的号码上设置",
      };
    }
    if (appManaged(phoneStatus, verify) && (!status || status === 'NON_EXISTS')) {
      return {
        text: "正在使用（商业应用程序）",
        variant: 'success' as const,
        hint: "名称来自 WhatsApp Business 应用程序 — 无需云 API 名称审核",
      };
    }
    return { text: status || 'N/A', variant: 'warning' as const, hint: '' };
  };
  const verifyBadge = (verify?: string, phoneStatus?: string) => {
    if (verify === 'VERIFIED') return { text: "已验证", variant: 'success' as const, hint: '' };
    if (appManaged(phoneStatus, verify)) {
      return {
        text: "在 WhatsApp 应用程序中验证",
        variant: 'success' as const,
        hint: "共存编号：已在 WhatsApp Business 应用程序内验证",
      };
    }
    return { text: verify || 'N/A', variant: 'warning' as const, hint: '' };
  };

  const handleRefreshDetails = async () => {
    if (!currentWorkspace?._id) return;
    setRefreshing(true);
    try {
      const res = await workspaceApi.refreshWhatsAppDetails(currentWorkspace._id);
      const updatedWs = res.data.data;
      if (updatedWs) {
        useAuthStore.setState({ currentWorkspace: updatedWs });
        toast.success(translateApiMessage("所有数字均从 Meta 刷新"));
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "刷新失败 — 检查您的访问令牌是否仍然有效"));
    }
    setRefreshing(false);
  };

  // Auto-refresh if display name, phone number or Business Manager id is missing
  useEffect(() => {
    if (wa?.isConnected && (!wa.displayName || !wa.phoneNumber || !wa.businessId || !wa.nameStatus) && currentWorkspace?._id) {
      handleRefreshDetails();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wa?.isConnected, currentWorkspace?._id]);

  const saveExtraNumbers = async (list: { phoneNumberId: string; phoneNumber: string; displayName: string; accessToken?: string; wabaId?: string }[]) => {
    if (!currentWorkspace?._id) return;
    setNumSaving(true);
    try {
      await workspaceApi.updateWhatsApp(currentWorkspace._id, { extraNumbers: list });
      setExtraNumbers(list);
      toast.success(translateApiMessage("数字已更新"));
    } catch { toast.error(translateApiMessage("保存失败")); }
    setNumSaving(false);
  };

  const addExtraNumber = () => {
    if (!newNum.phoneNumberId.trim()) { toast.error(translateApiMessage("需要电话号码 ID")); return; }
    if (diffWaba && (!newNum.accessToken.trim() || !newNum.wabaId.trim())) {
      toast.error(translateApiMessage("对于不同的 WABA，需要访问令牌和 WABA ID")); return;
    }
    const entry = {
      phoneNumberId: newNum.phoneNumberId.trim(),
      phoneNumber: newNum.phoneNumber.trim(),
      displayName: newNum.displayName.trim(),
      accessToken: diffWaba ? newNum.accessToken.trim() : '',
      wabaId: diffWaba ? newNum.wabaId.trim() : '',
    };
    saveExtraNumbers([...extraNumbers, entry]);
    setNewNum({ phoneNumberId: '', phoneNumber: '', displayName: '', accessToken: '', wabaId: '' });
    setDiffWaba(false);
  };

  const [submitting, setSubmitting] = useState(false);
  const [signupConfig, setSignupConfig] = useState<{ enableEmbeddedSignup: boolean; enableManualSignup: boolean; enableCoexistence: boolean; appId: string; configId: string; webhookUrl: string; webhookVerifyToken: string }>({
    enableEmbeddedSignup: false, enableManualSignup: true, enableCoexistence: false, appId: '', configId: '', webhookUrl: '', webhookVerifyToken: '',
  });
  // Captured from Embedded Signup session logging (postMessage) — most reliable WABA/phone IDs
  const sessionInfoRef = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  // Embedded Signup session logging: listen for the WABA/phone IDs Meta posts back
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data?.data) {
          sessionInfoRef.current = { wabaId: data.data.waba_id, phoneNumberId: data.data.phone_number_id };
        }
      } catch { /* non-JSON messages are ignored */ }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!currentWorkspace?._id) return;
    workspaceApi.getWhatsAppSignupConfig(currentWorkspace._id).then(r => {
      const cfg = r.data.data || {};
      setSignupConfig({
        enableEmbeddedSignup: cfg.enableEmbeddedSignup || false,
        enableManualSignup: cfg.enableManualSignup !== false,
        enableCoexistence: cfg.enableCoexistence || false,
        appId: cfg.appId || '',
        configId: cfg.configId || '',
        webhookUrl: cfg.webhookUrl || '',
        webhookVerifyToken: cfg.webhookVerifyToken || '',
      });
      // Auto-select first available method
      if (cfg.enableEmbeddedSignup) setMethod('embedded');
      else if (cfg.enableManualSignup !== false) setMethod('manual');
    }).catch(() => {});
  }, [currentWorkspace?._id]);

  const handleManualConnect = async () => {
    if (submitting) return;
    if (!currentWorkspace?._id) {
      toast.error(translateApiMessage("工作区未加载。请刷新页面并重试。"));
      return;
    }
    setSaving(true);
    setSubmitting(true);
    try {
      const saveRes = await workspaceApi.updateWhatsApp(currentWorkspace._id, {
        ...manualForm, connectionMethod: 'manual', isConnected: true,
      });
      toast.success(translateApiMessage("WhatsApp连接成功！"));
      // Update store with new workspace data
      const updatedWs = saveRes.data.data;
      if (updatedWs) {
        useAuthStore.setState({ currentWorkspace: updatedWs });
      }
      window.location.reload();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    } finally {
      setSubmitting(false);
    }
    setSaving(false);
  };

  const handleDisconnect = async () => {
    if (submitting) return;
    setSubmitting(true);

    if (!currentWorkspace || !confirm("断开 WhatsApp 的连接？")) return;
    try {
      // ADM-21: the disconnect route also unsubscribes the app from the WABA (workspaceApi.disconnectWhatsApp from WS-11)
      await workspaceApi.disconnectWhatsApp(currentWorkspace._id);
      toast.success(translateApiMessage("已断开连接"));
      window.location.reload();
    } catch { toast.error(translateApiMessage("操作失败")); } finally { setSubmitting(false); }
  };

  // Coexistence numbers only receive their WhatsApp Business App contacts and chats
  // after the panel asks Meta for the one-time sync.
  const handleImportAppChats = async () => {
    if (!currentWorkspace) return;
    setImporting(true);
    try {
      const res = await workspaceApi.coexistenceSync(currentWorkspace._id);
      toast.success(translateApiMessage((res.data as { message?: string }).message || "导入开始"), { duration: 8000 });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "无法开始导入"), { duration: 10000 });
    } finally {
      setImporting(false);
    }
  };

  // Launch WhatsApp Embedded Signup. coexistence=true onboards an existing
  // WhatsApp Business App number (usable on both the app and Cloud API).
  const launchSignup = (coexistence: boolean) => {
    if (!signupConfig.appId) { toast.error(translateApiMessage("管理员未配置元应用程序 ID")); return; }
    sessionInfoRef.current = {};
    const launchFBLogin = () => {
      const FB = (window as unknown as { FB?: { login: (cb: (r: { authResponse?: { code?: string } }) => void, opts: object) => void } }).FB;
      if (!FB) { toast.error(translateApiMessage("Facebook SDK 加载失败。请禁用广告拦截器并重试。")); return; }
      FB.login((response) => {
        const code = response.authResponse?.code;
        if (!code) { toast.error(translateApiMessage("Facebook 登录已取消或失败")); return; }
        setSaving(true);
        workspaceApi.embeddedSignup(currentWorkspace!._id, {
          code, coexistence,
          wabaId: sessionInfoRef.current.wabaId,
          phoneNumberId: sessionInfoRef.current.phoneNumberId,
        }).then((res) => {
          const warning = (res.data as { warning?: string }).warning;
          if (warning) toast.error(translateApiMessage(warning), { duration: 12000 });
          else toast.success(translateApiMessage(coexistence ? "WhatsApp Business App 号码已连接！" : "WhatsApp 通过嵌入式注册连接！"));
          const updatedWs = res.data.data;
          if (updatedWs) useAuthStore.setState({ currentWorkspace: { ...currentWorkspace, whatsapp: { ...currentWorkspace?.whatsapp, isConnected: true, connectionMethod: coexistence ? 'coexistence' : 'embedded', ...updatedWs } } as typeof currentWorkspace });
          // FEAT-03: a WABA change drops old-account extras / Pay config; show the notice before reloading
          if (updatedWs?.notice) toast(updatedWs.notice, { duration: 6000 });
          setTimeout(() => window.location.reload(), updatedWs?.notice ? 4000 : 0);
        }).catch((err: unknown) => {
          const error = err as { response?: { data?: { message?: string } } };
          toast.error(translateApiMessage(error.response?.data?.message || "嵌入式注册失败"));
        }).finally(() => setSaving(false));
      }, {
        config_id: signupConfig.configId || undefined,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          // Coexistence requires the business-app onboarding flow. The normal flow sends no
          // featureType, so the client can also create a new WABA + number (only_waba_sharing
          // limits them to sharing an existing WABA). v3 session info returns waba_id and
          // phone_number_id reliably.
          ...(coexistence ? { featureType: 'whatsapp_business_app_onboarding' } : {}),
          sessionInfoVersion: 3,
        },
      });
    };
    if ((window as unknown as { FB?: object }).FB) { launchFBLogin(); return; }
    (window as unknown as { fbAsyncInit?: () => void }).fbAsyncInit = () => {
      const FB = (window as unknown as { FB: { init: (o: object) => void } }).FB;
      FB.init({ appId: signupConfig.appId, cookie: true, xfbml: true, version: 'v21.0' });
      launchFBLogin();
    };
    const s = document.createElement('script'); s.src = 'https://connect.facebook.net/en_US/sdk.js'; s.async = true; document.body.appendChild(s);
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp 连接</h1>
          <p className="text-gray-500 text-sm mt-1">连接您的 WhatsApp Business 账户</p>
        </div>
        {wa?.isConnected && (
          <Button variant="danger" onClick={handleDisconnect}>断开连接</Button>
        )}
      </div>

      {wa?.isConnected ? (
        <>
        <Card>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Wifi className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                已连接 <CheckCircle className="w-5 h-5 text-emerald-500" />
              </h3>
              <p className="text-sm text-gray-500">via {wa.connectionMethod || "手册"}</p>
            </div>
          </div>
          {(!wa.displayName || !wa.phoneNumber) && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
              <p className="text-sm text-amber-700">显示名称/电话号码不可用 - 您的访问令牌可能已过期。更新您的令牌或单击“刷新”。</p>
            </div>
          )}
          {isRestricted(nh) && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <p className="text-sm text-red-700">Meta 已限制或禁止此 WhatsApp 账户{nh?.wabaBanState ? ` (${nh.wabaBanState})` : ''} — 无法发送消息。检查 WhatsApp 管理器/元业务支持。</p>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 mb-3">
            {nh?.lastSyncedAt && <span className="text-[11px] text-gray-400">上次与 Meta 同步 {new Date(nh.lastSyncedAt).toLocaleString()}</span>}
            {wa.connectionMethod === 'coexistence' && (
              <button onClick={handleImportAppChats} disabled={importing}
                title={"要求 WhatsApp 从 WhatsApp Business 应用程序发送联系人和聊天记录"}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors">
                <RefreshCw className={`w-3.5 h-3.5 ${importing ? 'animate-spin' : ''}`} />
                {importing ? "开始导入..." : "导入应用程序聊天和联系人"}
              </button>
            )}
            <button onClick={handleRefreshDetails} disabled={refreshing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? "令人耳目一新..." : "从元刷新"}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">显示名称</p>
              <p className="font-medium flex items-center gap-2">
                {wa.displayName || '-'}
                {(nameStatus || isCoexistence) && (
                  <Badge variant={nameBadge(nameStatus, wa.phoneStatus, wa.codeVerificationStatus).variant}>
                    {nameBadge(nameStatus, wa.phoneStatus, wa.codeVerificationStatus).text}
                  </Badge>
                )}
              </p>
              {nameBadge(nameStatus, wa.phoneStatus, wa.codeVerificationStatus).hint && (
                <p className="text-[10px] text-gray-400 mt-0.5">{nameBadge(nameStatus, wa.phoneStatus, wa.codeVerificationStatus).hint}</p>
              )}
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">电话号码</p>
              <p className="font-medium flex items-center gap-2">
                {wa.phoneNumber || '-'}
                {(wa.codeVerificationStatus || isCoexistence) && (
                  <Badge variant={verifyBadge(wa.codeVerificationStatus, wa.phoneStatus).variant}>
                    {verifyBadge(wa.codeVerificationStatus, wa.phoneStatus).text}
                  </Badge>
                )}
                {wa.phoneStatus === 'CONNECTED' && <Badge variant="success">已连接</Badge>}
              </p>
              {verifyBadge(wa.codeVerificationStatus, wa.phoneStatus).hint && (
                <p className="text-[10px] text-gray-400 mt-0.5">{verifyBadge(wa.codeVerificationStatus, wa.phoneStatus).hint}</p>
              )}
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">WABA ID</p>
              <p className="font-medium font-mono text-sm">{wa.wabaId || '-'}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">质量评级</p>
              <Badge variant={statusVariant(nh?.qualityRating || wa.qualityRating)}>
                {nh?.qualityRating || wa.qualityRating || 'N/A'}
              </Badge>
              {nh?.status && <Badge variant={statusVariant(nh.status)} className="ml-1.5">{nh.status}</Badge>}
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">电话号码 ID</p>
              <div className="flex items-center gap-2">
                <p className="font-medium font-mono text-sm">{wa.phoneNumberId || '-'}</p>
                <button onClick={() => { navigator.clipboard.writeText(wa.phoneNumberId || ''); toast.success(translateApiMessage("已复制")); }}>
                  <Copy className="w-3 h-3 text-gray-400" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">业务经理 ID (BM)</p>
              <div className="flex items-center gap-2">
                <p className="font-medium font-mono text-sm">{wa.businessId || '-'}</p>
                {wa.businessId ? (
                  <button onClick={() => { navigator.clipboard.writeText(wa.businessId || ''); toast.success(translateApiMessage("已复制")); }}>
                    <Copy className="w-3 h-3 text-gray-400" />
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{wa.businessName || (wa.businessId ? '' : "单击“刷新详细信息”以从 Meta 中获取它")}</p>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">WhatsApp Pay（聊天内付款）</h3>
          <p className="text-sm text-gray-500 mb-3">让客户无需离开聊天即可在 WhatsApp (UPI) 内付款。在 WhatsApp Manager 中创建付款配置（链接 Razorpay、PayU 或您的 UPI VPA），然后在此处输入其名称。仅限印度。</p>
          <div className="flex gap-2">
            <Input placeholder={"付款配置名称（来自 WhatsApp Manager）"} value={payCfg} onChange={(e) => setPayCfg(e.target.value)} className="flex-1" />
            <Button onClick={savePayCfg} loading={payCfgSaving}>保存</Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-600" /> API 健康状况与限制</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => runDiagnose(false)} disabled={diagLoading}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
                <Activity className={`w-3.5 h-3.5 ${diagLoading ? 'animate-spin' : ''}`} /> {diagLoading ? "诊断..." : "诊断连接"}
              </button>
              <button onClick={loadHealth} disabled={healthLoading}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
                <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} /> {healthLoading ? "检查..." : "立即检查"}
              </button>
            </div>
          </div>
          {diag && (
            <div className={`p-3 rounded-lg border mb-4 ${diag.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              {diag.ok ? (
                <p className="text-sm text-emerald-700">令牌、权限、WABA ID 和应用程序订阅看起来都正确。</p>
              ) : (
                <>
                  <ul className="text-sm text-amber-800 list-disc pl-5 space-y-1">
                    {diag.issues.map((i, idx) => <li key={idx}>{i}</li>)}
                  </ul>
                  {!!diag.grantedWabaIds?.length && diag.savedWabaId && !diag.grantedWabaIds.includes(diag.savedWabaId) && (
                    <Button className="mt-3" onClick={() => runDiagnose(true)} loading={diagLoading}>自动修复WABA ID</Button>
                  )}
                </>
              )}
              <p className="text-[11px] text-gray-500 mt-2">已保存 WABA： {diag.savedWabaId || '—'} · 代币授予： {diag.grantedWabaIds?.join(', ') || '—'} · 模板管理： {diag.manageWabaIds?.join(', ') || '—'} ·权限： {diag.scopes?.join(', ') || '—'} ·目录： {diag.catalogues?.join(', ') || '—'}</p>
              <p className="text-[11px] text-gray-500 mt-1">模板访问： {diag.templateAccess === 'ok' ? "工作" : (diag.templateAccess || '—')} ·发送： {diag.messagingAccess === 'ok' ? "工作" : (diag.messagingAccess || '—')} ·WABA评论： {diag.wabaReviewStatus || '—'} ·业务验证： {diag.businessVerificationStatus || '—'}{diag.wabaTasks?.length ? ` ·WABA 访问： ${diag.wabaTasks.join(', ')}` : ''}</p>
              {(diag.wabaOwnerBusiness || diag.wabaSharedWithBusiness) && (
                <p className="text-[11px] text-gray-500 mt-1">WABA 拥有者： {diag.wabaOwnerBusiness || '—'} · 分享者： {diag.wabaSharedWithBusiness || '—'}</p>
              )}
              {diag.catalogueNote && <p className="text-[11px] text-amber-700 mt-1">{diag.catalogueNote}</p>}
            </div>
          )}
          {healthLoading && !health ? (
            <p className="text-sm text-gray-400">使用元检查...</p>
          ) : !health ? (
            <p className="text-sm text-gray-400">单击“立即检查”从 Meta 获取实时状态</p>
          ) : (
            <>
              {!health.tokenValid && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <p className="text-sm text-red-700">访问令牌已过期或无效 — 消息将失败。更新您上面的令牌。</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">令牌状态</p>
                  <Badge variant={health.tokenValid ? 'success' : 'danger'}>{health.tokenValid ? "有效" : "无效/过期"}</Badge>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">消息发送限制</p>
                  <p className="font-semibold text-sm">
                    {limits?.dailyUniqueCapSource === 'manual'
                      ? `${limits.dailyUniqueCap.toLocaleString()} / 24 小时`
                      : limitLabel((nh?.messagingLimitScope === 'portfolio' && nh.messagingLimitTier) || health.phone?.messaging_limit_tier)}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {nh?.messagingLimitScope === 'portfolio' ? "整个投资组合，" : ''}独特客户/24小时（营销）
                    {limits?.dailyUniqueCapSource === 'manual'
                      ? ` ——手动设置；云API报告 ${limitLabel(health.phone?.messaging_limit_tier)}`
                      : ''}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">质量评级</p>
                  <Badge variant={statusVariant(health.phone?.quality_rating)}>
                    {health.phone?.quality_rating || 'N/A'}
                  </Badge>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">电话验证</p>
                  <Badge variant={verifyBadge(health.phone?.code_verification_status, health.phone?.status).variant}>
                    {verifyBadge(health.phone?.code_verification_status, health.phone?.status).text}
                  </Badge>
                  {verifyBadge(health.phone?.code_verification_status, health.phone?.status).hint && (
                    <p className="text-[10px] text-gray-400 mt-1">{verifyBadge(health.phone?.code_verification_status, health.phone?.status).hint}</p>
                  )}
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">显示名称状态</p>
                  <Badge variant={nameBadge(liveNameStatus, health.phone?.status, health.phone?.code_verification_status).variant}>
                    {nameBadge(liveNameStatus, health.phone?.status, health.phone?.code_verification_status).text}
                  </Badge>
                  {health.phone?.verified_name && (
                    <p className="text-[10px] text-gray-500 mt-1 truncate">{health.phone.verified_name}</p>
                  )}
                  {nameBadge(liveNameStatus, health.phone?.status, health.phone?.code_verification_status).hint && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{nameBadge(liveNameStatus, health.phone?.status, health.phone?.code_verification_status).hint}</p>
                  )}
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">号码状态</p>
                  <Badge variant={statusVariant(health.phone?.status)}>{health.phone?.status || 'N/A'}</Badge>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">吞吐量</p>
                  <p className="font-semibold text-sm">{health.phone?.throughput?.level || 'N/A'}</p>
                  <p className="text-[10px] text-gray-400">每秒消息容量</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">WABA 审查</p>
                  <Badge variant={statusVariant(health.waba?.account_review_status)}>{health.waba?.account_review_status || 'N/A'}</Badge>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> 业务验证</p>
                  <Badge variant={statusVariant(health.waba?.business_verification_status)}>{health.waba?.business_verification_status || 'N/A'}</Badge>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">连接类型</p>
                  <p className="font-semibold text-sm">
                    {appManaged(health.phone?.status, health.phone?.code_verification_status)
                      ? "WhatsApp Business 应用程序 + 云 API（共存）"
                      : "仅限云 API"}
                  </p>
                  <p className="text-[10px] text-gray-400">平台： {health.phone?.platform_type || 'N/A'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">国家</p>
                  <p className="font-semibold text-sm">{health.waba?.country || 'N/A'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">WABA 名称</p>
                  <p className="font-semibold text-sm truncate">{health.waba?.name || 'N/A'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">业务经理（业主）</p>
                  <p className="font-semibold text-sm truncate">{health.waba?.owner_business_info?.name || 'N/A'}</p>
                  {health.waba?.owner_business_info?.id && (
                    <p className="text-[10px] text-gray-400">BM ID: {health.waba.owner_business_info.id}</p>
                  )}
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">已连接的 Facebook 账户</p>
                  <p className="font-semibold text-sm truncate">{health.fbAccount?.name || 'N/A'}</p>
                  {health.fbAccount?.id && <p className="text-[10px] text-gray-400">FB ID: {health.fbAccount.id}</p>}
                </div>
              </div>
              {/* Direct links into Meta for the things the panel cannot change itself */}
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  { label: "WhatsApp 管理器", href: `https://business.facebook.com/wa/manage/home/?business_id=${health.waba?.owner_business_info?.id || ''}&waba_id=${wa.wabaId || ''}` },
                  { label: "电话号码", href: `https://business.facebook.com/wa/manage/phone-numbers/?business_id=${health.waba?.owner_business_info?.id || ''}&waba_id=${wa.wabaId || ''}` },
                  { label: "消息模板", href: `https://business.facebook.com/wa/manage/message-templates/?business_id=${health.waba?.owner_business_info?.id || ''}&waba_id=${wa.wabaId || ''}` },
                  { label: "计费和付款方式", href: `https://business.facebook.com/billing_hub/payment_settings?business_id=${health.waba?.owner_business_info?.id || ''}` },
                  { label: "WhatsApp 使用和费用", href: `https://business.facebook.com/billing_hub/accounts/details/?asset_id=${wa.wabaId || ''}&business_id=${health.waba?.owner_business_info?.id || ''}` },
                  { label: "商务管理平台设置", href: `https://business.facebook.com/settings/info?business_id=${health.waba?.owner_business_info?.id || ''}` },
                  { label: "业务验证", href: `https://business.facebook.com/settings/security?business_id=${health.waba?.owner_business_info?.id || ''}` },
                ].map(l => (
                  <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                    {l.label} <ExternalLink className="w-3 h-3 text-gray-400" />
                  </a>
                ))}
              </div>
              {health.errors.length > 0 && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  {health.errors.map((e, i) => <p key={i} className="text-xs text-amber-700">{e}</p>)}
                </div>
              )}
            </>
          )}
        </Card>

        {limits && (
          <Card>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-600" /> 传送保护和发送速度</h3>
              <button onClick={loadLimits} className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">刷新</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">WhatsApp limits how many marketing messages one person receives and how many unique people this number may message per day. Staying inside those limits is what keeps the delivery rate high.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">每日独特客户</p>
                <p className="font-semibold text-sm">{limits.dailyUniqueCap < 0 ? "无限" : limits.dailyUniqueCap === 0 ? "未知" : limits.dailyUniqueCap.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400">{limits.dailyUniqueCapSource === 'manual' ? "下面手动设置" : limitLabel(limits.messagingLimitTier)}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">过去 24 小时内使用过</p>
                <p className="font-semibold text-sm">{limits.used24h.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400">
                  {limits.remaining24h < 0
                    ? (limits.dailyUniqueCap < 0 ? "无每日上限" : "Meta 尚未报告每日上限")
                    : `${limits.remaining24h.toLocaleString()} 今天离开`}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">最大速度（元）</p>
                <p className="font-semibold text-sm">{limits.metaThroughputMps || limits.maxMessagesPerSecond} 消息/秒</p>
                <p className="text-[10px] text-gray-400">吞吐量： {limits.throughputLevel || 'STANDARD'}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">质量评级</p>
                <Badge variant={limits.qualityRating === 'GREEN' ? 'success' : limits.qualityRating === 'YELLOW' ? 'warning' : limits.qualityRating === 'RED' ? 'danger' : 'default'}>
                  {limits.qualityRating || 'N/A'}
                </Badge>
                <p className="text-[10px] text-gray-400 mt-1">保持绿色即可升级</p>
              </div>
            </div>
            <div className="space-y-3">
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={limits.settings.enabled}
                  onChange={e => setLimitSetting('enabled', e.target.checked)} />
                <span>
                  保护广播免受 WhatsApp 每用户营销上限的影响
                  <span className="block text-xs text-gray-500">冷却时间内的收件人会被跳过，而不是因错误 131049 而失败。不会删除任何内容 — 它们会在下一次广播中收到消息。</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={limits.settings.respectTier}
                  onChange={e => setLimitSetting('respectTier', e.target.checked)} />
                <span>
                  切勿超过每日唯一客户限制
                  <span className="block text-xs text-gray-500">额外的收件人将在接下来的 24 小时内自动继续，而不是失败。</span>
                </span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input type="number" label={"向一个人发送营销信息之间的差距（小时）"}
                  value={String(limits.settings.marketingCooldownHours)}
                  onChange={e => setLimitSetting('marketingCooldownHours', Number(e.target.value))} />
                <Input type="number" label={"WhatsApp 限制收件人后的冷却时间（小时）"}
                  value={String(limits.settings.failCooldownHours)}
                  onChange={e => setLimitSetting('failCooldownHours', Number(e.target.value))} />
                <Input type="number" label={`发送速度（消息/秒，最大 ${limits.maxMessagesPerSecond})`}
                  value={String(limits.settings.messagesPerSecond)}
                  onChange={e => setLimitSetting('messagesPerSecond', Number(e.target.value))} />
                <Input type="number" label={"每日唯一客户 — 手动设置（0 = 使用元）"}
                  value={String(limits.settings.dailyUniqueCapOverride)}
                  onChange={e => setLimitSetting('dailyUniqueCapOverride', Number(e.target.value))} />
              </div>
              <p className="text-[11px] text-gray-500">
                WhatsApp 管理器 → 账户工具 → 消息传递限制有时显示的限制（例如 2,000）比云 API 报告的相同数量的层更高。将该数字放在上面的字段中，以便广播使用实际限制；保留 0 以遵循 Meta 的报告等级（{limitLabel(limits.messagingLimitTier) || "未知"}).
              </p>
              <Button onClick={saveLimits} loading={limitsSaving}>保存</Button>
            </div>
            <p className="text-[11px] text-gray-500 mt-4">
              提高每日限额：保持质量评级为绿色，并向当前级别内的更多独特客户发送消息 — Meta 升级自动为 250 → 1K/2K → 10K → 100K → 无限制。实用程序模板（订单、预约、服务更新）不受营销上限的影响。
            </p>
          </Card>
        )}

        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-1">附加号码</h3>
          <p className="text-sm text-gray-500 mb-4">添加无限的 WhatsApp 号码 - 来自同一个 WABA，或来自不同的 WABA（勾选该框并提供该号码自己的访问令牌 + WABA ID）。任何号码上的传入聊天都会进入同一个收件箱，并自动从客户发消息的号码进行回复。</p>
          <div className="space-y-2 mb-4">
            {extraNumbers.length === 0 && <p className="text-sm text-gray-400">还没有其他号码</p>}
            {extraNumbers.map((n, i) => (
              <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium">{n.displayName || n.phoneNumber || "号码" + (i + 2)}{n.accessToken ? <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 align-middle">不同的WABA</span> : null}</p>
                  <p className="text-xs text-gray-500 font-mono">{n.phoneNumberId}{n.phoneNumber ? ' · ' + n.phoneNumber : ''}</p>
                  {n.numberHealth && (n.numberHealth.qualityRating || n.numberHealth.status || n.numberHealth.lastSyncError) ? (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {n.numberHealth.verifiedName ? <span className="text-[11px] text-gray-500">{n.numberHealth.verifiedName}</span> : null}
                      {n.numberHealth.qualityRating ? <Badge variant={statusVariant(n.numberHealth.qualityRating)}>{n.numberHealth.qualityRating}</Badge> : null}
                      {n.numberHealth.status ? <Badge variant={statusVariant(n.numberHealth.status)}>{n.numberHealth.status}</Badge> : null}
                      {n.numberHealth.nameStatus && n.numberHealth.nameStatus !== 'APPROVED' ? <Badge variant={statusVariant(n.numberHealth.nameStatus)}>姓名： {n.numberHealth.nameStatus}</Badge> : null}
                      {isRestricted(n.numberHealth) ? <Badge variant="danger">受元限制</Badge> : null}
                      {n.numberHealth.lastSyncError ? <span className="text-[11px] text-amber-600">{n.numberHealth.lastSyncError}</span> : null}
                    </div>
                  ) : null}
                </div>
                <button onClick={() => saveExtraNumbers(extraNumbers.filter((_, j) => j !== i))} disabled={numSaving}
                  className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">删除</button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Input label={"电话号码 ID"} value={newNum.phoneNumberId} onChange={(e) => setNewNum({ ...newNum, phoneNumberId: e.target.value })} placeholder={"来自元仪表板"} />
            <Input label={"电话号码"} value={newNum.phoneNumber} onChange={(e) => setNewNum({ ...newNum, phoneNumber: e.target.value })} placeholder="+91..." />
            <Input label={"标签（可选）"} value={newNum.displayName} onChange={(e) => setNewNum({ ...newNum, displayName: e.target.value })} placeholder={"销售/支持"} />
            <div className="flex items-end"><Button onClick={addExtraNumber} disabled={numSaving}>{numSaving ? "保存中…" : "添加号码"}</Button></div>
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={diffWaba} onChange={(e) => setDiffWaba(e.target.checked)} />
            此号码属于不同的 WhatsApp Business 账户（不同的访问令牌）
          </label>
          {diffWaba && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              <Input label={"（该 WABA 的）访问令牌"} value={newNum.accessToken} onChange={(e) => setNewNum({ ...newNum, accessToken: e.target.value })} placeholder="EAAG..." />
              <Input label={"（该 WABA 的）WABA ID"} value={newNum.wabaId} onChange={(e) => setNewNum({ ...newNum, wabaId: e.target.value })} placeholder={"来自元仪表板"} />
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">相同的 WABA：只需电话号码 ID 就足够了 - webhook 已共享。不同的WABA：勾选该框并提供该号码自己的Access Token + WABA ID；该面板会自动订阅其 webhook，因此其聊天内容也会到达此处。</p>
        </Card>

        {/* Webhook Configuration - vendor needs this to configure in Meta Developer Portal */}
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Webhook 配置</h3>
          <p className="text-gray-500 text-sm mb-4">在您的元开发者门户（应用程序仪表板 → WhatsApp → 配置）中配置这些详细信息以接收传入消息。</p>
          <div className="space-y-4 max-w-2xl">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-600 font-medium mb-1">回调网址</p>
              <div className="flex items-center gap-2">
                <p className="font-medium font-mono text-sm text-gray-900 break-all">{signupConfig.webhookUrl || '-'}</p>
                <button onClick={() => { navigator.clipboard.writeText(signupConfig.webhookUrl || ''); toast.success(translateApiMessage("已复制！")); }}
                  className="shrink-0 p-1.5 bg-blue-100 hover:bg-blue-200 rounded transition-colors">
                  <Copy className="w-3.5 h-3.5 text-blue-600" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-600 font-medium mb-1">验证令牌</p>
              <div className="flex items-center gap-2">
                <p className="font-medium font-mono text-sm text-gray-900">{signupConfig.webhookVerifyToken || '-'}</p>
                <button onClick={() => { navigator.clipboard.writeText(signupConfig.webhookVerifyToken || ''); toast.success(translateApiMessage("已复制！")); }}
                  className="shrink-0 p-1.5 bg-blue-100 hover:bg-blue-200 rounded transition-colors">
                  <Copy className="w-3.5 h-3.5 text-blue-600" />
                </button>
              </div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">订阅 <strong>消息</strong> Meta Developer Portal 中的 webhook 字段，用于接收传入的 WhatsApp 消息。</p>
            </div>
          </div>
        </Card>
        </>
      ) : (
        <div>
          {/* Show available signup methods based on admin configuration */}
          {!signupConfig.enableEmbeddedSignup && !signupConfig.enableManualSignup ? (
            <Card>
              <div className="text-center py-8">
                <Settings className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">没有可用的注册方法</h3>
                <p className="text-gray-500 text-sm">请联系您的管理员以启用 WhatsApp 注册方法。</p>
              </div>
            </Card>
          ) : (
            <>
              <div className="flex gap-3 mb-6">
                {signupConfig.enableEmbeddedSignup && (
                  <button onClick={() => setMethod('embedded')}
                    className={`flex-1 p-4 rounded-xl border-2 transition-all ${method === 'embedded' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-2 mb-1"><Settings className="w-4 h-4" /><span className="font-medium text-sm">嵌入式注册</span></div>
                    <p className="text-xs text-gray-500 mt-1">直接通过 Facebook 连接</p>
                  </button>
                )}
                {signupConfig.enableManualSignup && (
                  <button onClick={() => setMethod('manual')}
                    className={`flex-1 p-4 rounded-xl border-2 transition-all ${method === 'manual' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-2 mb-1"><Wifi className="w-4 h-4" /><span className="font-medium text-sm">手动设置</span></div>
                    <p className="text-xs text-gray-500 mt-1">手动输入 API 凭据</p>
                  </button>
                )}
              </div>

              {method === 'embedded' && signupConfig.enableEmbeddedSignup && (
                <Card>
                  <h3 className="text-lg font-semibold mb-4">嵌入式注册</h3>
                  <p className="text-gray-500 text-sm mb-4">通过 Facebook 连接您的 WhatsApp Business 账户。单击下面的按钮 — 将打开 Facebook 弹出窗口，您可以在其中授权访问。</p>
                  <MetaSignupButton label={"使用 Facebook 登录"} hint={"连接新的 WhatsApp Business 号码"} loading={saving} onClick={() => launchSignup(false)} />
                  <p className="text-xs text-gray-400 mt-3">Facebook 弹出窗口将打开。使用有权访问您要连接的 WhatsApp Business 账户的 Facebook 账户登录。</p>

                  {signupConfig.enableCoexistence && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                        <div className="flex items-start gap-2">
                          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900">已经在使用 WhatsApp Business 应用程序？ <span className="ml-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">共存</span></h4>
                            <p className="mt-1 text-sm text-gray-600">继续使用手机上的号码
同时面板上的 <strong>and</strong> — 聊天保持同步，您不必删除该号码。</p>
                          </div>
                        </div>
                        <div className="mt-4">
                          <MetaSignupButton tone="whatsapp" label={"连接 WhatsApp Business 应用号码"} hint={"通过 Facebook 共存 — 继续使用您的手机"} loading={saving} onClick={() => launchSignup(true)} />
                        </div>
                        <ol className="mt-4 space-y-1 text-xs text-gray-500">
                          <li>1. 在 Facebook 弹出窗口中，选择您的公司以及 WhatsApp Business 应用程序中运行的号码。</li>
                          <li>2. 输入手机上 WhatsApp Business 应用程序内显示的验证码。</li>
                          <li>3. 连接后，您现有的聊天和联系人会同步到面板中。</li>
                        </ol>
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {method === 'manual' && signupConfig.enableManualSignup && (
                <Card>
                  <h3 className="text-lg font-semibold mb-4">手动配置</h3>
                  <p className="text-gray-500 text-sm mb-4">输入您在 Meta Business Suite 中的 WhatsApp Business API 凭据。</p>
                  <div className="space-y-3 max-w-2xl mb-6">
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs text-blue-600 font-medium mb-1">回调网址</p>
                      <div className="flex items-center gap-2">
                        <p className="font-medium font-mono text-sm text-gray-900 break-all">{signupConfig.webhookUrl || '-'}</p>
                        <button onClick={() => { navigator.clipboard.writeText(signupConfig.webhookUrl || ''); toast.success(translateApiMessage("已复制！")); }}
                          className="shrink-0 p-1.5 bg-blue-100 hover:bg-blue-200 rounded transition-colors">
                          <Copy className="w-3.5 h-3.5 text-blue-600" />
                        </button>
                      </div>
                    </div>
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs text-blue-600 font-medium mb-1">验证令牌</p>
                      <div className="flex items-center gap-2">
                        <p className="font-medium font-mono text-sm text-gray-900 break-all">{signupConfig.webhookVerifyToken || '-'}</p>
                        <button onClick={() => { navigator.clipboard.writeText(signupConfig.webhookVerifyToken || ''); toast.success(translateApiMessage("已复制！")); }}
                          className="shrink-0 p-1.5 bg-blue-100 hover:bg-blue-200 rounded transition-colors">
                          <Copy className="w-3.5 h-3.5 text-blue-600" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">您通常不需要在 Meta Developer Portal 中进行设置 - 保存下面的凭据后，面板会自动将此 Webhook 订阅到您的 WABA。仅当您想要验证或手动设置时才将它们放在手边（应用程序仪表板 → WhatsApp → 配置，字段 <strong>消息</strong>).</p>
                  </div>
                  <div className="space-y-4 max-w-lg">
                    <Input label="WABA ID" value={manualForm.wabaId} onChange={(e) => setManualForm({ ...manualForm, wabaId: e.target.value })} placeholder="e.g. 3537291816411935" />
                    <Input label={"电话号码 ID"} value={manualForm.phoneNumberId} onChange={(e) => setManualForm({ ...manualForm, phoneNumberId: e.target.value })} />
                    <Input label={"企业账户 ID"} value={manualForm.businessAccountId} onChange={(e) => setManualForm({ ...manualForm, businessAccountId: e.target.value })} />
                    <Input label={"访问令牌"} type="password" value={manualForm.accessToken} onChange={(e) => setManualForm({ ...manualForm, accessToken: e.target.value })} />
                    <Button onClick={handleManualConnect} loading={saving}>连接 WhatsApp</Button>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
