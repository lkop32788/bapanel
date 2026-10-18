'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect, useCallback } from 'react';

import Link from 'next/link';
import { MessageSquareText, Hand, Clock, Bot, Star, Zap, UserCheck, Snowflake, X, Plus, Trash2, RefreshCw, Cake, PhoneMissed, Repeat, BellRing, Shuffle, ShieldOff, Upload } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import { automationApi, teamApi, templateApi, uploadApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface AutoAssignRule { keyword: string; matchType: string; agent?: { _id: string; name: string } | string | null; tag: string; assignAi?: boolean; }

const MEDIA_ACCEPT: Record<string, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  document: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv',
};

// Optional photo / video / audio / document sent along with an automation reply.
function MediaField({ url, mediaType, onChange }: { url?: string; mediaType?: string; onChange: (url: string, type: string) => void }) {
  const [up, setUp] = useState(false);
  const type = mediaType || 'image';
  const ref = React.useRef<HTMLInputElement>(null);
  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUp(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'automation');
      const res = await uploadApi.uploadFile(fd);
      onChange(res.data.data.url, type);
      toast.success(translateApiMessage("媒体已上传"));
    } catch { toast.error(translateApiMessage("上传失败")); }
    setUp(false);
    if (ref.current) ref.current.value = '';
  };
  return (
    <div className="border-t border-gray-100 pt-3">
      <label className="block text-sm font-medium text-gray-700 mb-1">媒体（可选）——照片、视频、音频或文档</label>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={type} onChange={e => onChange(url || '', e.target.value)}
          options={[{ value: 'image', label: "照片" }, { value: 'video', label: "视频" }, { value: 'audio', label: "音频" }, { value: 'document', label: "文件" }]} />
        <input ref={ref} type="file" className="hidden" accept={MEDIA_ACCEPT[type] || '*/*'} onChange={handle} />
        <Button variant="outline" icon={<Upload className="w-4 h-4" />} loading={up} onClick={() => ref.current?.click()}>上传 {type}</Button>
        {url && (
          <>
            {type === 'image'
              ? <img src={url} alt="" className="w-14 h-14 object-contain border border-gray-200 rounded-lg" />
              : <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline max-w-[180px] truncate">{url.split('/').pop()}</a>}
            <button className="text-xs text-red-500" onClick={() => onChange('', type)}>删除</button>
          </>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1">消息后立即发送。对于纯文本回复，请留空。</p>
    </div>
  );
}
function StickerField({ value, onChange }: { value?: string; onChange: (url: string) => void }) {
  const [up, setUp] = useState(false);
  const ref = React.useRef<HTMLInputElement>(null);
  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUp(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'stickers');
      const res = await uploadApi.uploadFile(fd);
      onChange(res.data.data.url);
      toast.success(translateApiMessage("贴纸已上传"));
    } catch { toast.error(translateApiMessage("上传失败")); }
    setUp(false);
    if (ref.current) ref.current.value = '';
  };
  return (
    <div className="border-t border-gray-100 pt-3">
      <label className="block text-sm font-medium text-gray-700 mb-1">贴纸（可选）</label>
      <input ref={ref} type="file" className="hidden" accept="image/*,.webp,.gif" onChange={handle} />
      <div className="flex items-center gap-2">
        <Button variant="outline" icon={<Upload className="w-4 h-4" />} loading={up} onClick={() => ref.current?.click()}>上传贴纸</Button>
        {value && (
          <>
            <img src={value} alt="" className="w-14 h-14 object-contain border border-gray-200 rounded-lg" />
            <button className="text-xs text-red-500" onClick={() => onChange('')}>删除</button>
          </>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1">与消息一起发送。任何图像都会自动转换为 WhatsApp WebP。</p>
    </div>
  );
}

interface Settings {
  welcome: { enabled: boolean; message: string; stickerUrl?: string; mediaUrl?: string; mediaType?: string };
  outOfOffice: { enabled: boolean; message: string; stickerUrl?: string; mediaUrl?: string; mediaType?: string; startTime: string; endTime: string; days: number[] };
  feedback: { enabled: boolean; message: string; stickerUrl?: string; mediaUrl?: string; mediaType?: string };
  autoAssignRules: AutoAssignRule[];
  icebreakers: string[];
  wishes: { birthdayEnabled: boolean; birthdayMessage: string; birthdayStickerUrl?: string; birthdayMediaUrl?: string; birthdayMediaType?: string; anniversaryEnabled: boolean; anniversaryMessage: string; anniversaryStickerUrl?: string; anniversaryMediaUrl?: string; anniversaryMediaType?: string };
  missedCall: { enabled: boolean; message: string; stickerUrl?: string; mediaUrl?: string; mediaType?: string };
  winback: { enabled: boolean; days: number; amount: number; unit: 'minutes' | 'hours' | 'days'; templateName: string; templateLanguage: string; presetName: string; customMessage: string; sendHour: number; mediaUrl?: string; mediaType?: string; steps: { delayValue: number; delayUnit: 'minutes' | 'hours' | 'days'; message: string; mediaUrl?: string; mediaType?: string; templateName?: string; templateLanguage?: string }[]; aiEnabled: boolean; aiPrompt: string; aiMaxFollowups: number; aiGapValue: number; aiGapUnit: 'minutes' | 'hours' | 'days'; sendWindowMode: '24x7' | 'window' | 'fixed'; sendStart: string; sendEnd: string; sendFixedTimes: string[] };
  
  roundRobin: { enabled: boolean; excludeAgents: string[] };
  dailySummary: { enabled: boolean; hour: number; phone: string };
  ownerAlerts: { enabled: boolean; phone: string;  unansweredMins: number;  } & Record<string, boolean | number | string>;
  optOut: { enabled: boolean; sendConfirmation: boolean; stopKeywords: string[]; startKeywords: string[]; stopReply: string; startReply: string; appendToBroadcasts: boolean; broadcastFooter: string };
}
interface Agent { _id: string; name: string; email?: string; }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const defaultSettings: Settings = {
  welcome: { enabled: false, message: '', stickerUrl: '', mediaUrl: '', mediaType: 'image' },
  outOfOffice: { enabled: false, message: '', stickerUrl: '', mediaUrl: '', mediaType: 'image', startTime: '09:00', endTime: '18:00', days: [1, 2, 3, 4, 5, 6] },
  feedback: { enabled: false, message: '', stickerUrl: '', mediaUrl: '', mediaType: 'image' },
  autoAssignRules: [],
  icebreakers: [],
  wishes: { birthdayEnabled: false, birthdayMessage: '', birthdayStickerUrl: '', birthdayMediaUrl: '', birthdayMediaType: 'image', anniversaryEnabled: false, anniversaryMessage: '', anniversaryStickerUrl: '', anniversaryMediaUrl: '', anniversaryMediaType: 'image' },
  missedCall: { enabled: false, message: '', stickerUrl: '', mediaUrl: '', mediaType: 'image' },
  winback: { enabled: false, days: 15, amount: 15, unit: 'days', templateName: '', templateLanguage: 'en', presetName: '', customMessage: '', sendHour: 11, mediaUrl: '', mediaType: 'image', steps: [], aiEnabled: false, aiPrompt: '', aiMaxFollowups: 3, aiGapValue: 1, aiGapUnit: 'days', sendWindowMode: '24x7', sendStart: '09:00', sendEnd: '18:00', sendFixedTimes: [] },
  
  roundRobin: { enabled: false, excludeAgents: [] },
  dailySummary: { enabled: false, hour: 9, phone: '' },
  optOut: { enabled: true, sendConfirmation: true, stopKeywords: [], startKeywords: [], stopReply: '', startReply: '', appendToBroadcasts: true, broadcastFooter: '' },
  ownerAlerts: { enabled: false, phone: '', onHumanRequest: true,       onComplaint: true,  onMissedCall: true, onDisconnect: true, onUnanswered: false, unansweredMins: 15, onNoReply: true, noReplyHours: 24,  onCallSummary: true, onBadRating: true, onRepeatCustomer: false, onBroadcastDone: true, onMsgFail: true, onLeadSource: false,  onAgentLogin: false, weeklyReport: false,  waCommands: false,    onTagChange: false, onTemplateReject: false, onDailyUnread: false, alertKeywords: '',  onFirstMsg: false, onHourlyPulse: false, onNewDevice: false, onBulkDelete: false, onSentimentScore: false, onAiSuggestion: false, onAiCallFailed: false, onAgentIdle: false, agentIdleMins: 30, onChatReassign: false, onAgentOffline: false, agentOfflineHours: 4, onAfterHours: false, monthlyReport: false, onSlaBreach: false, slaHours: 24,     },
};

const OWNER_ALERT_GROUPS: { title: string; items: { key: string; label: string }[] }[] = [
  { title: "客户和聊天", items: [
    { key: 'onHumanRequest', label: "🙋 顾客要求真人" },
    { key: 'onComplaint', label: "😡 发现愤怒的顾客/投诉" },
    { key: 'onUnanswered', label: "⏳ 聊天 X 分钟无人应答" },
    { key: 'onNoReply', label: "🔔 客户在我们回复后保持沉默（无回复后续）" },
    { key: 'onRepeatCustomer', label: "🔁 30 多天后重复客户退货" },
    { key: 'onLeadSource', label: "🆕 新线索到来（带来源）" },
    
    { key: 'onBadRating', label: "⭐ 收到差评（1-2 星）" },
    
    { key: 'onAfterHours', label: "🌙 办公时间后收到消息" },
    { key: 'onFirstMsg', label: "☀️ 今天的第一条客户留言" },
    { key: 'onTagChange', label: "🏷 联系人标签已更改" },
    
  ]},
  
  { title: "通话和会议", items: [

    { key: 'onMissedCall', label: "📵 收到未接来电" },
    { key: 'onCallSummary', label: "🤖 每次 AI 调用后的摘要" },
    { key: 'onAiCallFailed', label: "❌AI通话失败" },
  ]},
  { title: "系统与团队", items: [
    { key: 'onDisconnect', label: "📵 WhatsApp 断开连接" },
    { key: 'onMsgFail', label: "🚫 消息开始失败" },
    { key: 'onTemplateReject', label: "❌ WhatsApp 模板被拒绝" },
    { key: 'onBroadcastDone', label: "📣 广播完成时报告" },
    { key: 'onAgentLogin', label: "👤 代理登录" },
    { key: 'onAgentIdle', label: "💤 代理空闲（X 分钟）" },
    { key: 'onAgentOffline', label: "📵 代理离线（X 小时）" },
    { key: 'onChatReassign', label: "🔀 代理之间重新分配聊天" },
    { key: 'onNewDevice', label: "🔐 从新设备登录" },
    { key: 'onBulkDelete', label: "⚠️ 检测到批量删除" },
  ]},
  { title: "报告与分析", items: [
    { key: 'weeklyReport', label: "📈 周报（每周日上午9点）" },
    { key: 'monthlyReport', label: "📅 月度报告（每月 1 日上午 9 点）" },
    { key: 'onHourlyPulse', label: "⏰ 每小时活动脉冲" },
    { key: 'onDailyUnread', label: "📨 晚间未读聊天记录计数" },
    { key: 'onSlaBreach', label: "⏰ SLA 违规（聊天开放 X 小时）" },
    { key: 'onSentimentScore', label: "😀 每日情绪得分" },
    { key: 'onAiSuggestion', label: "🧠 AI 建议采取的行动" },
  ]},
];

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-emerald-600' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export default function AutomationsHub() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [modal, setModal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [wbTemplates, setWbTemplates] = useState<{ name: string; language: string }[]>([]);
  const [fbReport, setFbReport] = useState<{ total: number; avg: number; dist: Record<number, number>; recent: { name: string; phone?: string; rating: number; date: string }[] } | null>(null);
  const [showAllFb, setShowAllFb] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await automationApi.getSettings();
      const d = res.data.data;
      if (d) {
        const wb = { ...defaultSettings.winback, ...d.winback };
        // Migrate a legacy single custom message into the first step so it stays visible/editable.
        // Only for configs saved before steps existed — an empty saved steps[] means the user
        // deleted every step, so nothing must be re-created.
        if (d.winback?.steps === undefined && wb.customMessage) {
          wb.steps = [{ delayValue: wb.amount || 1, delayUnit: wb.unit || 'hours', message: wb.customMessage }];
        }
        setSettings({ ...defaultSettings, ...d, welcome: { ...defaultSettings.welcome, ...d.welcome }, outOfOffice: { ...defaultSettings.outOfOffice, ...d.outOfOffice }, feedback: { ...defaultSettings.feedback, ...d.feedback }, wishes: { ...defaultSettings.wishes, ...d.wishes }, missedCall: { ...defaultSettings.missedCall, ...d.missedCall }, winback: wb,  roundRobin: { ...defaultSettings.roundRobin, ...d.roundRobin }, dailySummary: { ...defaultSettings.dailySummary, ...d.dailySummary }, ownerAlerts: { ...defaultSettings.ownerAlerts, ...d.ownerAlerts }, optOut: { ...defaultSettings.optOut, ...d.optOut } });
      }
    } catch { /* empty */ }
    try {
      const res = await teamApi.listAgents();
      setAgents(res.data.data || []);
    } catch { /* empty */ }
  }, []);
  useEffect(() => {
    automationApi.feedbackReport().then(r => setFbReport(r.data.data)).catch(() => {});
    templateApi.list({ limit: 500 }).then(r => setWbTemplates(((r.data.data || []) as { name: string; language: string; status?: string }[]).filter(t => (t.status || '').toLowerCase() === 'approved').map(t => ({ name: t.name, language: t.language })))).catch(() => {});
    load(); }, [load]);

  const save = async (partial: Partial<Settings>, closeModal = true) => {
    setSaving(true);
    try {
      const payload = { ...partial } as Record<string, unknown>;
      if (payload.autoAssignRules) {
        payload.autoAssignRules = (payload.autoAssignRules as AutoAssignRule[]).map(r => ({
          ...r,
          assignAi: !!r.assignAi,
          agent: r.assignAi ? null : (typeof r.agent === 'object' && r.agent ? r.agent._id : r.agent || null),
        }));
      }
      const res = await automationApi.updateSettings(payload);
      const d = res.data.data;
      setSettings(s => ({ ...s, ...d }));
      toast.success(translateApiMessage("已保存"));
      if (closeModal) setModal(null);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "保存失败"));
    }
    setSaving(false);
  };

  const syncIce = async () => {
    setSyncing(true);
    try {
      await automationApi.updateSettings({ icebreakers: settings.icebreakers });
      await automationApi.syncIcebreakers();
      toast.success(translateApiMessage("破冰活动已同步至 WhatsApp"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "同步失败"));
    }
    setSyncing(false);
  };

  const cards = [
    { key: 'keyword', icon: <MessageSquareText className="w-8 h-8 text-blue-500" />, title: "关键字自动回复", href: '/client/keywords',
      desc: "自动回复包含特定关键字的客户消息。对常见问题的快速且相关的答复。" },
    { key: 'welcome', icon: <Hand className="w-8 h-8 text-amber-500" />, title: "欢迎辞", badge: settings.welcome.enabled,
      desc: "新客户首次向您的企业发送消息时自动发送的个性化消息。" },
    { key: 'ooo', icon: <Clock className="w-8 h-8 text-purple-500" />, title: "外出消息", badge: settings.outOfOffice.enabled,
      desc: "自动回复工作时间之外与您联系的人，告诉他们您何时回来。" },
    { key: 'bots', icon: <Bot className="w-8 h-8 text-cyan-500" />, title: "机器人", href: '/client/automations/flows',
      desc: "使用可视化流程构建器构建带有触发器、条件、消息、按钮等的自动化聊天机器人流程。" },
    { key: 'botflows', icon: <Zap className="w-8 h-8 text-indigo-500" />, title: "机器人流程设计器", href: '/client/bot-flows',
      desc: "具有关键字触发器、分支按钮、媒体、模板和操作的可视化拖放聊天机器人构建器。" },
    { key: 'feedback', icon: <Star className="w-8 h-8 text-yellow-500" />, title: "反馈", badge: settings.feedback.enabled,
      desc: "对话解决后自动请求客户提供反馈，以改进您的产品和服务。" },
    { key: 'quickreply', icon: <Zap className="w-8 h-8 text-emerald-500" />, title: "快速回复", href: '/client/quick-replies',
      desc: "为常见问题制作预先写好的回复，以便您的团队能够快速、一致和专业地回复。" },
    { key: 'autoassign', icon: <UserCheck className="w-8 h-8 text-rose-500" />, title: "自动分配", badge: settings.autoAssignRules.length > 0,
      desc: "设置关键词规则，根据消息内容自动添加标签，并将对话分配给指定客服或 AI 客服。" },
    { key: 'icebreaker', icon: <Snowflake className="w-8 h-8 text-sky-500" />, title: "破冰船", badge: settings.icebreakers.filter(Boolean).length > 0,
      desc: "当客户开始对话时出现的预先编写的可选提示，帮助他们轻松开始。" },
    { key: 'wishes', icon: <Cake className="w-8 h-8 text-pink-500" />, title: "生日和周年纪念日祝福", badge: settings.wishes.birthdayEnabled || settings.wishes.anniversaryEnabled,
      desc: "在联系人的特殊日子（在通讯录中设置日期）自动向联系人发送生日和周年纪念祝福。" },
    { key: 'missedcall', icon: <PhoneMissed className="w-8 h-8 text-red-500" />, title: "未接来电自动回复", badge: settings.missedCall.enabled,
      desc: "当您错过客户 WhatsApp 通话时，系统会自动发送一条消息，因此线索永远不会丢失。" },
    { key: 'winback', icon: <Repeat className="w-8 h-8 text-cyan-600" />, title: "赢回安静的客户自动跟进", badge: settings.winback.enabled,
      desc: "在 24 小时窗口内通过多步骤跟进（自定义消息或人工智能）自动重新吸引安静的客户；关闭窗口时将使用批准的模板。" },
    { key: 'roundrobin', icon: <Shuffle className="w-8 h-8 text-violet-500" />, title: "循环聊天路由", badge: settings.roundRobin.enabled,
      desc: "自动在代理之间平均分配传入的聊天 — 代理 A → B → C → A → B → ... 没有人会超载。" },
    
    { key: 'owneralerts', icon: <BellRing className="w-8 h-8 text-rose-500" />, title: "所有者警报", badge: settings.ownerAlerts.enabled,
      desc: "客户请求人工客服、消息发送失败或渠道断开时，及时接收 WhatsApp 通知。" },
    { key: 'optout', icon: <ShieldOff className="w-8 h-8 text-slate-500" />, title: "选择退出/取消订阅", badge: settings.optOut.enabled,
      desc: "当客户回复“停止/取消订阅”时，他们会自动取消订阅并排除在所有广播之外，因此您的号码不会被屏蔽。回复“开始”即可重新订阅。" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="page-hero">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">自动化</h1>
        <p className="text-gray-500 text-sm mt-1">自动消息传递功能可简化客户参与。</p>
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => {
          const inner = (
            <div className="bg-white rounded-xl border border-gray-200 p-5 h-full hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer relative">
              {'badge' in c && (
                <span className={`absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.badge ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {c.badge ? 'ON' : 'OFF'}
                </span>
              )}
              <div className="mb-3">{c.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1.5">{c.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{c.desc}</p>
            </div>
          );
          return c.href
            ? <Link key={c.key} href={c.href}>{inner}</Link>
            : <div key={c.key} onClick={() => setModal(c.key)}>{inner}</div>;
        })}
      </div>

      {/* Welcome Message */}
      <Modal isOpen={modal === 'welcome'} onClose={() => setModal(null)} title={"欢迎辞"} size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">启用欢迎消息</span>
            <Toggle on={settings.welcome.enabled} onChange={v => setSettings(s => ({ ...s, welcome: { ...s.welcome, enabled: v } }))} />
          </div>
          <Textarea label={"留言"} rows={4} value={settings.welcome.message}
            onChange={e => setSettings(s => ({ ...s, welcome: { ...s.welcome, message: e.target.value } }))}
            placeholder={"您好！欢迎来到我们的企业。今天我们能为您提供什么帮助？"} />
          <p className="text-xs text-gray-400">当新客户第一次向您发送消息时自动发送。</p>
          <StickerField value={settings.welcome.stickerUrl} onChange={url => setSettings(s => ({ ...s, welcome: { ...s.welcome, stickerUrl: url } }))} />
          <MediaField url={settings.welcome.mediaUrl} mediaType={settings.welcome.mediaType} onChange={(mediaUrl, mediaType) => setSettings(s => ({ ...s, welcome: { ...s.welcome, mediaUrl, mediaType } }))} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>取消</Button>
            <Button loading={saving} onClick={() => save({ welcome: settings.welcome })}>保存</Button>
          </div>
        </div>
      </Modal>

      {/* Opt-out / Unsubscribe */}
      <Modal isOpen={modal === 'optout'} onClose={() => setModal(null)} title={"选择退出/取消订阅"} size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">启用选择退出处理</span>
              <p className="text-xs text-gray-400 mt-0.5">自动取消订阅回复“停止”的客户；在每次广播中跳过它们。</p>
            </div>
            <Toggle on={settings.optOut.enabled} onChange={v => setSettings(s => ({ ...s, optOut: { ...s.optOut, enabled: v } }))} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">发送确认回复</span>
            <Toggle on={settings.optOut.sendConfirmation} onChange={v => setSettings(s => ({ ...s, optOut: { ...s.optOut, sendConfirmation: v } }))} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">在广播中添加选择退出行</span>
              <p className="text-xs text-gray-400 mt-0.5">在自由文本营销活动消息中添加一个简短的“如何取消订阅”行（未批准的模板）。</p>
            </div>
            <Toggle on={settings.optOut.appendToBroadcasts} onChange={v => setSettings(s => ({ ...s, optOut: { ...s.optOut, appendToBroadcasts: v } }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">广播选择退出线</label>
            <Input value={settings.optOut.broadcastFooter}
              onChange={e => setSettings(s => ({ ...s, optOut: { ...s.optOut, broadcastFooter: e.target.value } }))}
              placeholder={"回复 STOP 取消订阅（空白=默认）"} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">停止关键字</label>
            <Input value={settings.optOut.stopKeywords.join(', ')}
              onChange={e => setSettings(s => ({ ...s, optOut: { ...s.optOut, stopKeywords: e.target.value.split(',').map(x => x.trim()).filter(Boolean) } }))}
              placeholder={"停止、取消订阅、band karo（空白 = 内置默认值）"} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">起始关键词（重新订阅）</label>
            <Input value={settings.optOut.startKeywords.join(', ')}
              onChange={e => setSettings(s => ({ ...s, optOut: { ...s.optOut, startKeywords: e.target.value.split(',').map(x => x.trim()).filter(Boolean) } }))}
              placeholder={"开始、订阅、chalu karo（空白 = 内置默认值）"} />
          </div>
          <Textarea label={"取消订阅确认回复"} rows={2} value={settings.optOut.stopReply}
            onChange={e => setSettings(s => ({ ...s, optOut: { ...s.optOut, stopReply: e.target.value } }))}
            placeholder={"您已取消订阅。随时回复“开始”即可重新订阅。 （空白=默认）"} />
          <Textarea label={"重新订阅确认回复"} rows={2} value={settings.optOut.startReply}
            onChange={e => setSettings(s => ({ ...s, optOut: { ...s.optOut, startReply: e.target.value } }))}
            placeholder={"您已重新订阅。随时回复“停止”即可取消订阅。 （空白=默认）"} />
          <p className="text-xs text-gray-400">以逗号分隔。匹配不区分大小写，并且也适用于第一个单词，因此“请停止”也会取消订阅。正常的一对一聊天永远不会被阻止——只有广播和活动。</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>取消</Button>
            <Button loading={saving} onClick={() => save({ optOut: settings.optOut })}>保存</Button>
          </div>
        </div>
      </Modal>

      {/* Out of Office */}
      <Modal isOpen={modal === 'ooo'} onClose={() => setModal(null)} title={"外出消息"} size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">启用外出回复</span>
            <Toggle on={settings.outOfOffice.enabled} onChange={v => setSettings(s => ({ ...s, outOfOffice: { ...s.outOfOffice, enabled: v } }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">工作日</label>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((d, i) => (
                <button key={d} onClick={() => setSettings(s => ({ ...s, outOfOffice: { ...s.outOfOffice, days: s.outOfOffice.days.includes(i) ? s.outOfOffice.days.filter(x => x !== i) : [...s.outOfOffice.days, i] } }))}
                  className={`px-3 py-1.5 text-xs rounded-lg border font-medium ${settings.outOfOffice.days.includes(i) ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-200 text-gray-500'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">工作时间开始</label>
              <input type="time" value={settings.outOfOffice.startTime} onChange={e => setSettings(s => ({ ...s, outOfOffice: { ...s.outOfOffice, startTime: e.target.value } }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">工作时间结束</label>
              <input type="time" value={settings.outOfOffice.endTime} onChange={e => setSettings(s => ({ ...s, outOfOffice: { ...s.outOfOffice, endTime: e.target.value } }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
          </div>
          <Textarea label={"留言"} rows={3} value={settings.outOfOffice.message}
            onChange={e => setSettings(s => ({ ...s, outOfOffice: { ...s.outOfOffice, message: e.target.value } }))}
            placeholder={"我们目前不在。我们将在工作时间（周一至周六，上午 9 点至下午 6 点）回复。"} />
          <p className="text-xs text-gray-400">当客户在工作时间 (IST) 之外向您发送消息时发送。每次聊天每 6 小时最多一次。</p>
          <StickerField value={settings.outOfOffice.stickerUrl} onChange={url => setSettings(s => ({ ...s, outOfOffice: { ...s.outOfOffice, stickerUrl: url } }))} />
          <MediaField url={settings.outOfOffice.mediaUrl} mediaType={settings.outOfOffice.mediaType} onChange={(mediaUrl, mediaType) => setSettings(s => ({ ...s, outOfOffice: { ...s.outOfOffice, mediaUrl, mediaType } }))} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>取消</Button>
            <Button loading={saving} onClick={() => save({ outOfOffice: settings.outOfOffice })}>保存</Button>
          </div>
        </div>
      </Modal>

      {/* Feedback */}
      <Modal isOpen={modal === 'feedback'} onClose={() => setModal(null)} title={"反馈/评级（⭐ 星）"} size="md">
        <div className="space-y-4">
          {fbReport && fbReport.total > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-1">
              <p className="text-sm font-semibold text-gray-800">⭐ {fbReport.avg} 平均 — {fbReport.total} 收视率</p>
              <div className="flex gap-2 text-[11px] text-gray-600">
                {[5, 4, 3, 2, 1].map(r => <span key={r}>{r}★: {fbReport.dist[r] || 0}</span>)}
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-yellow-100 mt-1">
                {fbReport.recent.slice(0, 5).map((f, i) => (
                  <div key={i} className="flex items-center justify-between py-1 text-[11px]">
                    <span className="text-gray-700">{'⭐'.repeat(f.rating)} <span className="font-medium">{f.name}</span>{f.phone ? <span className="text-gray-400"> · {f.phone}</span> : null}</span>
                    <span className="text-gray-400">{new Date(f.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowAllFb(true)} className="text-xs font-medium text-emerald-700 hover:text-emerald-800 underline">查看所有反馈（{fbReport.total})</button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">启用反馈消息</span>
            <Toggle on={settings.feedback.enabled} onChange={v => setSettings(s => ({ ...s, feedback: { ...s.feedback, enabled: v } }))} />
          </div>
          <Textarea label={"留言"} rows={4} value={settings.feedback.message}
            onChange={e => setSettings(s => ({ ...s, feedback: { ...s.feedback, message: e.target.value } }))}
            placeholder={"您的体验如何？请给我们评分 1-5。您的反馈有助于我们改进！"} />
          <p className="text-xs text-gray-400">一旦聊天得到解决，这条消息加上 ⭐1-5 评级列表就会发送给客户；当他们点击评级时，该评级就会出现在此处的报告中。</p>
          <StickerField value={settings.feedback.stickerUrl} onChange={url => setSettings(s => ({ ...s, feedback: { ...s.feedback, stickerUrl: url } }))} />
          <MediaField url={settings.feedback.mediaUrl} mediaType={settings.feedback.mediaType} onChange={(mediaUrl, mediaType) => setSettings(s => ({ ...s, feedback: { ...s.feedback, mediaUrl, mediaType } }))} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>取消</Button>
            <Button loading={saving} onClick={() => save({ feedback: settings.feedback })}>保存</Button>
          </div>
        </div>
      </Modal>

      {/* All feedback list */}
      <Modal isOpen={showAllFb} onClose={() => setShowAllFb(false)} title={`所有反馈（${fbReport?.total || 0})`} size="lg">
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
          {(fbReport?.recent || []).map((f, i) => (
            <div key={i} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-700">{'⭐'.repeat(f.rating)} <span className="font-medium">{f.name}</span>{f.phone ? <span className="text-gray-400"> · {f.phone}</span> : null}</span>
              <span className="text-xs text-gray-400">{new Date(f.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
            </div>
          ))}
          {!fbReport?.recent?.length && <p className="text-sm text-gray-400 py-4 text-center">尚未反馈</p>}
        </div>
      </Modal>

      {/* Wishes */}
      <Modal isOpen={modal === 'wishes'} onClose={() => setModal(null)} title={"生日和周年纪念日祝福"} size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">生日祝福</span>
            <Toggle on={settings.wishes.birthdayEnabled} onChange={v => setSettings(s => ({ ...s, wishes: { ...s.wishes, birthdayEnabled: v } }))} />
          </div>
          <Textarea label={"生日留言"} rows={3} value={settings.wishes.birthdayMessage}
            onChange={e => setSettings(s => ({ ...s, wishes: { ...s.wishes, birthdayMessage: e.target.value } }))}
            placeholder={"{first_name} 生日快乐！ 🎂🎉祝你有美好的一天。"} />
          <StickerField value={settings.wishes.birthdayStickerUrl} onChange={url => setSettings(s => ({ ...s, wishes: { ...s.wishes, birthdayStickerUrl: url } }))} />
          <MediaField url={settings.wishes.birthdayMediaUrl} mediaType={settings.wishes.birthdayMediaType} onChange={(birthdayMediaUrl, birthdayMediaType) => setSettings(s => ({ ...s, wishes: { ...s.wishes, birthdayMediaUrl, birthdayMediaType } }))} />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">周年纪念祝福</span>
            <Toggle on={settings.wishes.anniversaryEnabled} onChange={v => setSettings(s => ({ ...s, wishes: { ...s.wishes, anniversaryEnabled: v } }))} />
          </div>
          <Textarea label={"周年纪念留言"} rows={3} value={settings.wishes.anniversaryMessage}
            onChange={e => setSettings(s => ({ ...s, wishes: { ...s.wishes, anniversaryMessage: e.target.value } }))}
            placeholder={"{first_name} 周年纪念日快乐！ 💐"} />
          <StickerField value={settings.wishes.anniversaryStickerUrl} onChange={url => setSettings(s => ({ ...s, wishes: { ...s.wishes, anniversaryStickerUrl: url } }))} />
          <MediaField url={settings.wishes.anniversaryMediaUrl} mediaType={settings.wishes.anniversaryMediaType} onChange={(anniversaryMediaUrl, anniversaryMediaType) => setSettings(s => ({ ...s, wishes: { ...s.wishes, anniversaryMediaUrl, anniversaryMediaType } }))} />
          <p className="text-xs text-gray-400">在通讯录中设置生日/周年纪念日 — 当天上午 9 点后会自动发送祝福。变量： {"{名字}"} {"{全名}"}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>取消</Button>
            <Button loading={saving} onClick={() => save({ wishes: settings.wishes })}>保存</Button>
          </div>
        </div>
      </Modal>

      {/* Cart Recovery */}

      {/* Owner Alerts */}
      <Modal isOpen={modal === 'owneralerts'} onClose={() => setModal(null)} title={"所有者警报"} size="lg">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">启用所有者警报</span>
            <Toggle on={settings.ownerAlerts.enabled as boolean} onChange={v => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, enabled: v } }))} />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="text-xs font-medium px-3 py-1 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100" onClick={() => setSettings(s => { const na = { ...s.ownerAlerts }; OWNER_ALERT_GROUPS.forEach(g => g.items.forEach(t => { na[t.key] = true; })); return { ...s, ownerAlerts: na }; })}>全选</button>
            <button type="button" className="text-xs font-medium px-3 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200" onClick={() => setSettings(s => { const na = { ...s.ownerAlerts }; OWNER_ALERT_GROUPS.forEach(g => g.items.forEach(t => { na[t.key] = false; })); return { ...s, ownerAlerts: na }; })}>取消选择全部</button>
          </div>
          {OWNER_ALERT_GROUPS.map(g => (
            <div key={g.title} className="space-y-2 rounded-lg border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase">{g.title}</p>
              {g.items.map(t => (
                <div key={t.key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{t.label}</span>
                  <Toggle on={!!settings.ownerAlerts[t.key]} onChange={v => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, [t.key]: v } }))} />
                </div>
              ))}
            </div>
          ))}
          <div className="space-y-2 rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">📊 每日 WhatsApp 摘要（kal ka 报告）</span>
              <Toggle on={settings.dailySummary.enabled} onChange={v => setSettings(s => ({ ...s, dailySummary: { ...s.dailySummary, enabled: v } }))} />
            </div>
            <Select label={"发送时间（每日，IST）"} value={String(settings.dailySummary.hour)}
              onChange={e => setSettings(s => ({ ...s, dailySummary: { ...s.dailySummary, hour: Number(e.target.value) } }))}
              options={Array.from({ length: 16 }, (_, i) => i + 6).map(h => ({ value: String(h), label: `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}` }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            
            <Input label={"无人应答的聊天（分钟）"} type="number" value={String(settings.ownerAlerts.unansweredMins ?? 15)}
              onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, unansweredMins: Number(e.target.value) || 15 } }))} />
            <Input label={"无回复跟进（小时）"} type="number" value={String(settings.ownerAlerts.noReplyHours ?? 24)}
              onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, noReplyHours: Number(e.target.value) || 24 } }))} />

            <Input label={"代理空闲警报（分钟）"} type="number" value={String(settings.ownerAlerts.agentIdleMins ?? 30)}
              onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, agentIdleMins: Number(e.target.value) || 30 } }))} />
            <Input label={"代理离线警报（小时）"} type="number" value={String(settings.ownerAlerts.agentOfflineHours ?? 4)}
              onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, agentOfflineHours: Number(e.target.value) || 4 } }))} />
            <Input label={"SLA 违规（小时）"} type="number" value={String(settings.ownerAlerts.slaHours ?? 24)}
              onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, slaHours: Number(e.target.value) || 24 } }))} />
            
          </div>
          <Input label={"警报关键字（以逗号分隔）"} value={String(settings.ownerAlerts.alertKeywords ?? '')}
            onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, alertKeywords: e.target.value } }))}
            placeholder={"取消、退款、紧急、欺诈"} />
          <p className="text-xs text-gray-400">每当客户提到任何这些关键字时，您都会收到即时警报。</p>
          <div className="space-y-2 rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">📲 WhatsApp 命令（从所有者号码发送）</span>
              <Toggle on={!!settings.ownerAlerts.waCommands} onChange={v => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, waCommands: v } }))} />
            </div>
            <p className="text-xs text-gray-400">命令：“报告”= aaj ka 摘要，“ai 开/关”= AI 呼叫开/关，“确定”= 最后人工请求聊天 khud ko 分配，“帮助”= 列表</p>
          </div>
          <Input label={"所有者 WhatsApp 号码（带国家/地区代码）"} value={settings.ownerAlerts.phone as string}
            onChange={e => setSettings(s => ({ ...s, ownerAlerts: { ...s.ownerAlerts, phone: e.target.value } }))}
            placeholder="919876543210" />
          <p className="text-xs text-gray-400">选定的提醒将发送至此 WhatsApp 号码。留空以使用企业主号码。</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>取消</Button>
            <Button loading={saving} onClick={() => save({ ownerAlerts: settings.ownerAlerts, dailySummary: { ...settings.dailySummary, phone: settings.dailySummary.phone || settings.ownerAlerts.phone as string } })}>保存</Button>
          </div>
        </div>
      </Modal>

      {/* Winback */}
      <Modal isOpen={modal === 'winback'} onClose={() => setModal(null)} title={"赢回安静的客户自动跟进"} size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">启用自动跟踪</span>
            <Toggle on={settings.winback.enabled} onChange={v => setSettings(s => ({ ...s, winback: { ...s.winback, enabled: v } }))} />
          </div>

          {/* Timing */}
          <Select label={"何时发送后续信息"} value={settings.winback.sendWindowMode}
            onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, sendWindowMode: e.target.value as '24x7' | 'window' | 'fixed', sendFixedTimes: e.target.value === 'fixed' && !(s.winback.sendFixedTimes || []).length ? ['11:00'] : s.winback.sendFixedTimes } }))}
            options={[{ value: '24x7', label: "任何时间(24×7)" }, { value: 'window', label: "仅在官方时间内" }, { value: 'fixed', label: "每天固定时间" }]} />
          {settings.winback.sendWindowMode === 'fixed' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">仅在这些时间 (IST) 发送后续信息。一个步骤仍然首先等待其延迟，然后在下一个固定时间出去 - 例如设置 11:00，到期的所有内容将在上午 11 点发送。</p>
              {(settings.winback.sendFixedTimes || []).map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input type="time" value={t}
                    onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, sendFixedTimes: (s.winback.sendFixedTimes || []).map((x, j) => j === i ? e.target.value : x) } }))} />
                  <button type="button" className="text-xs text-red-500 hover:underline"
                    onClick={() => setSettings(s => ({ ...s, winback: { ...s.winback, sendFixedTimes: (s.winback.sendFixedTimes || []).filter((_, j) => j !== i) } }))}>删除</button>
                </div>
              ))}
              {(settings.winback.sendFixedTimes || []).length < 5 && (
                <button type="button" className="text-sm text-primary-600 hover:underline"
                  onClick={() => setSettings(s => ({ ...s, winback: { ...s.winback, sendFixedTimes: [...(s.winback.sendFixedTimes || []), '11:00'] } }))}>+ 添加时间</button>
              )}
            </div>
          )}
          {settings.winback.sendWindowMode === 'window' && (
            <div className="grid grid-cols-2 gap-3">
              <Input label={"来自"} type="time" value={settings.winback.sendStart}
                onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, sendStart: e.target.value } }))} />
              <Input label={"至"} type="time" value={settings.winback.sendEnd}
                onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, sendEnd: e.target.value } }))} />
            </div>
          )}

          {/* Manual multi-step follow-ups */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">后续步骤（最多 5 个）</p>
            <p className="text-xs text-gray-400 mb-2">每个步骤在延迟后发送其消息。第 1 步的延迟从客户的最后一次活动开始计算；后面的步骤从之前的后续步骤开始计算。如果客户回复，序列将自动停止。</p>
            <div className="space-y-3">
              {settings.winback.steps.map((step, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">后续 {i + 1} — 之后 {i === 0 ? "不活动" : "上一条消息"}</span>
                    <button type="button" className="text-xs text-red-500 hover:underline"
                      onClick={() => setSettings(s => ({ ...s, winback: { ...s.winback, steps: s.winback.steps.filter((_, j) => j !== i) } }))}>删除</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" value={String(step.delayValue)}
                      onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, steps: s.winback.steps.map((x, j) => j === i ? { ...x, delayValue: Number(e.target.value) || 1 } : x) } }))} />
                    <Select value={step.delayUnit}
                      onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, steps: s.winback.steps.map((x, j) => j === i ? { ...x, delayUnit: e.target.value as 'minutes' | 'hours' | 'days' } : x) } }))}
                      options={[{ value: 'minutes', label: "分钟" }, { value: 'hours', label: "小时" }, { value: 'days', label: "天" }]} />
                  </div>
                  <Textarea rows={2} value={step.message}
                    onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, steps: s.winback.steps.map((x, j) => j === i ? { ...x, message: e.target.value } : x) } }))}
                    placeholder={"嗨，{first_name}，正在跟进..."} />
                  <MediaField url={step.mediaUrl} mediaType={step.mediaType}
                    onChange={(mediaUrl, mediaType) => setSettings(s => ({ ...s, winback: { ...s.winback, steps: s.winback.steps.map((x, j) => j === i ? { ...x, mediaUrl, mediaType } : x) } }))} />
                  <Select label={`批准的后续模板 ${i + 1} （24小时窗口关闭时使用）`}
                    value={step.templateName || ''}
                    onChange={e => {
                      const t = wbTemplates.find(x => x.name === e.target.value);
                      setSettings(s => ({ ...s, winback: { ...s.winback, steps: s.winback.steps.map((x, j) => j === i ? { ...x, templateName: e.target.value, templateLanguage: t?.language || 'en' } : x) } }));
                    }}
                    options={[{ value: '', label: settings.winback.templateName ? `Default — ${settings.winback.templateName}` : 'None — skip when window is closed' }, ...wbTemplates.map(t => ({ value: t.name, label: `${t.name} (${t.language})` }))]} />
                </div>
              ))}
            </div>
            {settings.winback.steps.length < 5 && (
              <button type="button" className="mt-2 text-sm text-primary-600 hover:underline"
                onClick={() => setSettings(s => ({ ...s, winback: { ...s.winback, steps: [...s.winback.steps, { delayValue: s.winback.steps.length ? 1 : (s.winback.amount || 2), delayUnit: (s.winback.steps.length ? 'days' : s.winback.unit) as 'minutes' | 'hours' | 'days', message: '', mediaUrl: '', mediaType: 'image', templateName: '', templateLanguage: 'en' }] } }))}>+ 添加后续步骤</button>
            )}
            <MediaField url={settings.winback.mediaUrl} mediaType={settings.winback.mediaType}
              onChange={(mediaUrl, mediaType) => setSettings(s => ({ ...s, winback: { ...s.winback, mediaUrl, mediaType } }))} />
            <p className="text-xs text-gray-400 mt-1">此媒体用于任何没有自己的媒体的后续步骤（仅限自由文本消息 - 批准的模板带有自己的标头）。</p>
          </div>

          {/* AI follow-up */}
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">人工智能跟进</p>
                <p className="text-xs text-gray-400">完成手动步骤后，AI 会读取聊天内容并根据您的提示自行跟进。</p>
              </div>
              <Toggle on={settings.winback.aiEnabled} onChange={v => setSettings(s => ({ ...s, winback: { ...s.winback, aiEnabled: v } }))} />
            </div>
            {settings.winback.aiEnabled && (
              <div className="space-y-2 mt-2">
                <Textarea label={"AI指令（提示）"} rows={3} value={settings.winback.aiPrompt}
                  onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, aiPrompt: e.target.value } }))}
                  placeholder={"例如如果客户尚未分享他们的电子邮件/地址，请礼貌地仅询问缺少的详细信息，以便我们可以完成他们的订单。"} />
                <div className="grid grid-cols-3 gap-2">
                  <Input label={"最大后续次数"} type="number" value={String(settings.winback.aiMaxFollowups)}
                    onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, aiMaxFollowups: Number(e.target.value) || 0 } }))} />
                  <Input label={"差距（空白 = AI 决定）"} type="number" placeholder={"人工智能决定"}
                    value={settings.winback.aiGapValue ? String(settings.winback.aiGapValue) : ''}
                    onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, aiGapValue: Number(e.target.value) || 0 } }))} />
                  <Select label={"单位"} value={settings.winback.aiGapUnit}
                    onChange={e => setSettings(s => ({ ...s, winback: { ...s.winback, aiGapUnit: e.target.value as 'minutes' | 'hours' | 'days' } }))}
                    options={[{ value: 'minutes', label: "分钟" }, { value: 'hours', label: "小时" }, { value: 'days', label: "天" }]} />
                </div>
                <p className="text-xs text-gray-400">将间隙留空，AI 会根据您的提示自行选择等待时间。使用您在 AI 设置中启用的任何 AI 提供程序。 AI 消息是自由文本，因此仅在 24 小时内发送。</p>
              </div>
            )}
          </div>

          <Select label={"默认批准的模板（由任何没有自己的后续模板使用）"} value={settings.winback.templateName}
            onChange={e => {
              const t = wbTemplates.find(x => x.name === e.target.value);
              setSettings(s => ({ ...s, winback: { ...s.winback, templateName: e.target.value, templateLanguage: t?.language || 'en' } }));
            }}
            options={[{ value: '', label: "None — 窗口关闭时跳过" }, ...wbTemplates.map(t => ({ value: t.name, label: `${t.name} (${t.language})` }))]} />

          <p className="text-xs text-gray-400">在 24 小时窗口内发送您的步骤/AI 消息（免费文本，节省成本）。在窗口外部发送批准的模板 - 每个后续模板都可以使用自己的模板，否则将使用默认模板。如果两者均未选择，则该步骤将等待客户回复。 {wbTemplates.length} 批准的模板{wbTemplates.length === 1 ? '' : 's'} 可用。</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>取消</Button>
            <Button loading={saving} onClick={() => save({ winback: { ...settings.winback, customMessage: settings.winback.steps.length ? settings.winback.customMessage : '' } })}>保存</Button>
          </div>
        </div>
      </Modal>

      {/* Missed Call */}
      <Modal isOpen={modal === 'missedcall'} onClose={() => setModal(null)} title={"未接来电自动回复"} size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">启用未接来电自动回复</span>
            <Toggle on={settings.missedCall.enabled} onChange={v => setSettings(s => ({ ...s, missedCall: { ...s.missedCall, enabled: v } }))} />
          </div>
          <Textarea label={"留言"} rows={3} value={settings.missedCall.message}
            onChange={e => setSettings(s => ({ ...s, missedCall: { ...s.missedCall, message: e.target.value } }))}
            placeholder={"抱歉，我们错过了您的电话。请在这里给我们留言，我们会立即回复🙏"} />
          <p className="text-xs text-gray-400">当客户的 WhatsApp 呼叫无人接听（您或 AI）时，会立即发送此消息。变量： {"{名字}"} {"{全名}"}</p>
          <StickerField value={settings.missedCall.stickerUrl} onChange={url => setSettings(s => ({ ...s, missedCall: { ...s.missedCall, stickerUrl: url } }))} />
          <MediaField url={settings.missedCall.mediaUrl} mediaType={settings.missedCall.mediaType} onChange={(mediaUrl, mediaType) => setSettings(s => ({ ...s, missedCall: { ...s.missedCall, mediaUrl, mediaType } }))} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>取消</Button>
            <Button loading={saving} onClick={() => save({ missedCall: settings.missedCall })}>保存</Button>
          </div>
        </div>
      </Modal>

      {/* Round-Robin Chat Routing */}
      <Modal isOpen={modal === 'roundrobin'} onClose={() => setModal(null)} title={"循环聊天路由"} size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">启用循环法</p>
              <p className="text-xs text-gray-400">新聊天在客服人员之间均匀分布</p>
            </div>
            <Toggle on={settings.roundRobin.enabled} onChange={v => setSettings(s => ({ ...s, roundRobin: { ...s.roundRobin, enabled: v } }))} />
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
            <p className="font-medium mb-1">工作原理：</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>当有新客户留言时，系统会轮流自动分配下一个客服人员</li>
              <li>特工A→特工B→特工C→特工A→特工B→...</li>
              <li>没有单个代理会过载</li>
              <li>关键字自动分配规则不会被覆盖 - 关键字规则首先匹配，然后应用循环法</li>
            </ul>
          </div>
          {agents.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">轮换特工：</p>
              <div className="space-y-2">
                {agents.map(a => {
                  const excluded = settings.roundRobin.excludeAgents.includes(a._id);
                  return (
                    <label key={a._id} className={`flex items-center gap-2 p-2 rounded-lg border text-sm cursor-pointer ${excluded ? 'bg-gray-50 border-gray-200 text-gray-400' : 'bg-emerald-50 border-emerald-200 text-gray-700'}`}>
                      <input type="checkbox" checked={!excluded}
                        onChange={() => setSettings(s => ({
                          ...s,
                          roundRobin: {
                            ...s.roundRobin,
                            excludeAgents: excluded
                              ? s.roundRobin.excludeAgents.filter(id => id !== a._id)
                              : [...s.roundRobin.excludeAgents, a._id]
                          }
                        }))}
                        className="rounded" />
                      <span>{a.name}</span>
                      {a.email && <span className="text-xs text-gray-400">({a.email})</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {agents.length === 0 && <p className="text-sm text-gray-400">未找到代理 - 首先在“设置”→“代理”下添加代理。</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>取消</Button>
            <Button loading={saving} onClick={() => save({ roundRobin: settings.roundRobin })}>保存</Button>
          </div>
        </div>
      </Modal>

      {/* Auto Assign */}
      <Modal isOpen={modal === 'autoassign'} onClose={() => setModal(null)} title={"自动分配规则"} size="lg">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">收到匹配关键词的消息时，对话会自动分配给选定客服或自动回复的 AI 客服，并为联系人添加标签。</p>
          {settings.autoAssignRules.map((r, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_1fr_1fr_36px] gap-2 items-end p-3 bg-gray-50 rounded-lg">
              <Input label={"关键字"} value={r.keyword} onChange={e => setSettings(s => ({ ...s, autoAssignRules: s.autoAssignRules.map((x, j) => j === i ? { ...x, keyword: e.target.value } : x) }))} placeholder={"例如定价"} />
              <Select label={"比赛"} value={r.matchType || 'contains'} onChange={e => setSettings(s => ({ ...s, autoAssignRules: s.autoAssignRules.map((x, j) => j === i ? { ...x, matchType: e.target.value } : x) }))}
                options={[{ value: 'contains', label: "包含" }, { value: 'exact', label: "准确" }, { value: 'starts_with', label: "开头为" }]} />
              <Select label={"分配给"} value={r.assignAi ? 'ai' : (typeof r.agent === 'object' && r.agent ? r.agent._id : (r.agent as string) || '')}
                onChange={e => setSettings(s => ({ ...s, autoAssignRules: s.autoAssignRules.map((x, j) => j === i
                  ? { ...x, assignAi: e.target.value === 'ai', agent: e.target.value === 'ai' ? '' : e.target.value }
                  : x) }))}
                options={[{ value: '', label: "— 无 —" }, { value: 'ai', label: "🤖 AI 代理（AI 回复）" }, ...agents.map(a => ({ value: a._id, label: a.name }))]} />
              <Input label={"标签/标签"} value={r.tag} onChange={e => setSettings(s => ({ ...s, autoAssignRules: s.autoAssignRules.map((x, j) => j === i ? { ...x, tag: e.target.value } : x) }))} placeholder={"例如销售"} />
              <button onClick={() => setSettings(s => ({ ...s, autoAssignRules: s.autoAssignRules.filter((_, j) => j !== i) }))}
                className="p-2 hover:bg-red-50 rounded-lg mb-0.5"><Trash2 className="w-4 h-4 text-red-400" /></button>
            </div>
          ))}
          <button onClick={() => setSettings(s => ({ ...s, autoAssignRules: [...s.autoAssignRules, { keyword: '', matchType: 'contains', agent: '', tag: '', assignAi: false }] }))}
            className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium hover:text-emerald-700"><Plus className="w-4 h-4" /> 添加规则</button>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>取消</Button>
            <Button loading={saving} onClick={() => save({ autoAssignRules: settings.autoAssignRules.filter(r => r.keyword.trim()) })}>保存</Button>
          </div>
        </div>
      </Modal>

      {/* Icebreaker */}
      <Modal isOpen={modal === 'icebreaker'} onClose={() => setModal(null)} title={"破冰船"} size="md">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">当客户第一次与您打开聊天 (WhatsApp) 时，最多会向他们显示 4 个可点击的提示。保存后，单击“同步”将它们推送到 WhatsApp。</p>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex gap-2 items-center">
              <input value={settings.icebreakers[i] || ''} maxLength={80}
                onChange={e => setSettings(s => { const arr = [...s.icebreakers]; arr[i] = e.target.value; return { ...s, icebreakers: arr }; })}
                placeholder={`提示 ${i + 1} （最多 80 个字符）——例如“你们提供什么服务？”`}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              {settings.icebreakers[i] && (
                <button onClick={() => setSettings(s => { const arr = [...s.icebreakers]; arr[i] = ''; return { ...s, icebreakers: arr }; })}
                  className="p-1.5 hover:bg-red-50 rounded"><X className="w-4 h-4 text-red-400" /></button>
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>取消</Button>
            <Button variant="outline" loading={syncing} icon={<RefreshCw className="w-4 h-4" />} onClick={syncIce}>保存 + 同步到 WhatsApp</Button>
            <Button loading={saving} onClick={() => save({ icebreakers: settings.icebreakers })}>保存</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
