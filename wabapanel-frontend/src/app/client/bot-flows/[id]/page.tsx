'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Save, Edit, Trash2, ChevronDown, ChevronRight, EllipsisVertical, ZoomIn, ZoomOut, Maximize, LayoutGrid, Copy, Check, MessageSquare, Image as ImageIcon, MousePointerClick, FileCode, Upload, Zap, Globe, HelpCircle, Clock, GitBranch, Mail, MapPin, Sparkles, Repeat, Table, Search, Tag, UserCheck, Megaphone, StickyNote, Layers, Calendar, Bot, ClipboardList, Video, FileText, AlertTriangle, UserPlus } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { botFlowApi, templateApi, uploadApi, tagApi, teamApi, campaignApi, formApi, presetMessageApi, integrationApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface FlowButton { title: string; next: string }
// A `next` value can hold multiple node ids joined by '.' (node ids never contain dots)
const splitNext = (v: string) => (v || '').split('.').filter(Boolean);
const joinNext = (ids: string[]) => ids.join('.');
const addNext = (v: string, targetId: string) => {
  const ids = splitNext(v);
  return joinNext(ids.includes(targetId) ? ids : [...ids, targetId]);
};
const dropNext = (v: string, targetId: string) => joinNext(splitNext(v).filter(x => x !== targetId));
interface FlowRow { title: string; description: string; next: string }
interface FlowNode {
  id: string; name: string; type: 'text' | 'media' | 'interactive' | 'template' | 'preset' | 'action' | 'webhook' | 'api_call' | 'question' | 'wait_input' | 'delay' | 'condition' | 'email' | 'location' | 'ai_reply' | 'subflow' | 'sheets' | 'gmeet' | 'gdocs' | 'gforms' | 'gcontacts' | 'form' | 'set_variable' | 'wait_until' | 'biz_hours' | 'goto' | 'ab_split' | 'end';
  gwTitle: string; gwStart: string; gwDuration: number; gwTimezone: string;
  gwTemplateId: string; gwReplacements: string; gwFormId: string; gwMessage: string; gwSendLink: boolean; gwLabel: string;
  varName: string; varValue: string; waitDate: string; waitTime: string; waitForOpen: boolean;
  gotoNode: string; splitPercent: number; actionTeam: string; convStatus: string;
  followupText: string; followupInHours: number; priority: string;  
  emailTo: string; emailSubject: string; emailBody: string;
  locLat: string; locLng: string; locName: string; locAddress: string;
  subflowId: string; aiPrompt: string; aiMaxWords: number;
  formId: string; formMode: 'flow' | 'link'; formCta: string;
  fieldName: string; fieldValue: string; campaignId: string;  noteText: string;
  webhookUrl: string; webhookMethod: string; webhookBody: string; webhookHeaders: { key: string; value: string }[];
  apiSaveVars: { path: string; varName: string }[];
  answerVar: string; waitTimeoutHours: number; nextTimeout: string; delaySeconds: number; delayUnit: string;
  condField: string; condVarName: string; condOp: string; condValue: string; nextTrue: string; nextFalse: string;
  
  actionType: string; actionTag: string; actionAgent: string;    

  text: string; mediaType: string; mediaUrl: string; caption: string;
  header: string; headerType: string; headerMediaUrl: string; footer: string; mode: 'buttons' | 'list' | 'cta';
  ctaText: string; ctaUrl: string; ctas: { text: string; url: string }[];
  buttons: FlowButton[]; listButtonText: string; rows: FlowRow[];
  templateName: string; templateLanguage: string; templateVars?: string[]; presetId: string; next: string; x: number; y: number;
}
interface Flow { _id: string; name: string; triggerKeywords: string[]; isActive: boolean; startNode: string; startX: number; startY: number; nodes: FlowNode[] }
interface PortPos { x: number; y: number }
type ConnectFrom = { kind: 'start' } | { kind: 'next' | 'condT' | 'condF'; nodeId: string } | { kind: 'btn' | 'row'; nodeId: string; idx: number };

// Payment card gateways — each needs its Integration connected on the panel.

const NODE_TYPES = [
  { type: 'text', label: "简单的机器人回复", icon: <MessageSquare className="w-4 h-4" /> },
  { type: 'media', label: "媒体机器人回复", icon: <ImageIcon className="w-4 h-4" /> },
  { type: 'interactive', label: "交互式机器人回复", icon: <MousePointerClick className="w-4 h-4" /> },
  { type: 'template', label: "模板机器人回复", icon: <FileCode className="w-4 h-4" /> },
  { type: 'preset', label: "预设消息（已保存回复）", icon: <FileCode className="w-4 h-4" /> },
  { type: 'action', label: "行动（标签/分配/AI）", icon: <Zap className="w-4 h-4" /> },
  
  { type: 'webhook', label: "Webhook（HTTP 请求）", icon: <Globe className="w-4 h-4" /> },
  { type: 'api_call', label: "API 调用（将响应保存在变量中）", icon: <Globe className="w-4 h-4" /> },
  { type: 'question', label: "问题（自由文本回复）", icon: <HelpCircle className="w-4 h-4" /> },
  { type: 'wait_input', label: "等待用户输入", icon: <HelpCircle className="w-4 h-4" /> },
  { type: 'delay', label: "延迟（等待然后继续）", icon: <Clock className="w-4 h-4" /> },
  { type: 'condition', label: "条件（if/else分支）", icon: <GitBranch className="w-4 h-4" /> },
  { type: 'email', label: "发送电子邮件", icon: <Mail className="w-4 h-4" /> },
  { type: 'location', label: "发送位置", icon: <MapPin className="w-4 h-4" /> },
  { type: 'ai_reply', label: "AI回复（自动写入）", icon: <Sparkles className="w-4 h-4" /> },
  { type: 'subflow', label: "运行另一个流程（子流程）", icon: <Repeat className="w-4 h-4" /> },
  { type: 'sheets', label: "Google 表格（添加行）", icon: <Table className="w-4 h-4" /> },
  { type: 'gcontacts', label: "保存到 Google 通讯录", icon: <UserPlus className="w-4 h-4" /> },
  { type: 'form', label: "发送表格（WhatsApp 表格/链接）", icon: <ClipboardList className="w-4 h-4" /> },
  { type: 'set_variable', label: "设置变量", icon: <Edit className="w-4 h-4" /> },
  { type: 'wait_until', label: "等待（日期和时间）", icon: <Clock className="w-4 h-4" /> },
  { type: 'biz_hours', label: "营业时间（分店/等候）", icon: <Clock className="w-4 h-4" /> },
  { type: 'goto', label: "转到（跳转到另一张卡）", icon: <Repeat className="w-4 h-4" /> },
  { type: 'ab_split', label: "A/B 分割", icon: <GitBranch className="w-4 h-4" /> },
  { type: 'end', label: "结束（停止此流程）", icon: <Zap className="w-4 h-4" /> },
] as const;

// Left-panel blocks: drag onto the canvas (or click) to add a card. An `actionType`
// pre-selects the action so common actions are one drag away.
type PaletteItem = { type: FlowNode['type']; label: string; actionType?: string; icon: React.ReactNode };
const PALETTE: { group: string; items: PaletteItem[] }[] = [
  {
    group: 'SEND', items: [
      { type: 'text', label: "发送 WhatsApp", icon: <MessageSquare className="w-3.5 h-3.5" /> },
      { type: 'template', label: "发送模板", icon: <FileCode className="w-3.5 h-3.5" /> },
      { type: 'preset', label: "发送预设", icon: <FileCode className="w-3.5 h-3.5" /> },
      { type: 'media', label: "发送媒体", icon: <ImageIcon className="w-3.5 h-3.5" /> },
      { type: 'interactive', label: "快速回复/列表", icon: <MousePointerClick className="w-3.5 h-3.5" /> },
      { type: 'location', label: "发送位置", icon: <MapPin className="w-3.5 h-3.5" /> },
      { type: 'email', label: "发送电子邮件", icon: <Mail className="w-3.5 h-3.5" /> },
      { type: 'form', label: "发送表格", icon: <ClipboardList className="w-3.5 h-3.5" /> },
    ],
  },
  {
    group: 'LISTEN', items: [
      { type: 'question', label: "问问题", icon: <HelpCircle className="w-3.5 h-3.5" /> },
      { type: 'wait_input', label: "等待用户输入", icon: <HelpCircle className="w-3.5 h-3.5" /> },
    ],
  },
  {
    group: 'LOGIC', items: [
      { type: 'condition', label: "条件（如果/否则）", icon: <GitBranch className="w-3.5 h-3.5" /> },
      { type: 'delay', label: "等待/延迟", icon: <Clock className="w-3.5 h-3.5" /> },
      { type: 'wait_until', label: "等待（日期和时间）", icon: <Clock className="w-3.5 h-3.5" /> },
      { type: 'biz_hours', label: "营业时间", icon: <Clock className="w-3.5 h-3.5" /> },
      { type: 'set_variable', label: "设置变量", icon: <Edit className="w-3.5 h-3.5" /> },
      { type: 'goto', label: "前往", icon: <Repeat className="w-3.5 h-3.5" /> },
      { type: 'ab_split', label: "A/B 分割", icon: <GitBranch className="w-3.5 h-3.5" /> },
      { type: 'webhook', label: "调用 Webhook", icon: <Globe className="w-3.5 h-3.5" /> },
      { type: 'api_call', label: "API调用", icon: <Globe className="w-3.5 h-3.5" /> },
      { type: 'subflow', label: "运行子流程", icon: <Repeat className="w-3.5 h-3.5" /> },
      { type: 'end', label: "结束流程", icon: <Zap className="w-3.5 h-3.5" /> },
    ],
  },
  {
    group: 'AI', items: [
      { type: 'ai_reply', label: "人工智能回复", icon: <Sparkles className="w-3.5 h-3.5" /> },
      { type: 'action', actionType: 'ai_on', label: "人工智能聊天机器人开启", icon: <Bot className="w-3.5 h-3.5" /> },
      { type: 'action', actionType: 'ai_off', label: "人工智能聊天机器人关闭", icon: <Bot className="w-3.5 h-3.5" /> },
    ],
  },
  {
    group: 'CONTACT', items: [
      { type: 'action', actionType: 'add_tag', label: "添加标签", icon: <Tag className="w-3.5 h-3.5" /> },
      { type: 'action', actionType: 'remove_tag', label: "删除标签", icon: <Tag className="w-3.5 h-3.5" /> },
      { type: 'action', actionType: 'update_contact', label: "更新联系方式", icon: <Edit className="w-3.5 h-3.5" /> },
      { type: 'action', actionType: 'assign_agent', label: "指定代理", icon: <UserCheck className="w-3.5 h-3.5" /> },
      { type: 'action', actionType: 'unassign_agent', label: "取消分配代理", icon: <UserCheck className="w-3.5 h-3.5" /> },
      { type: 'action', actionType: 'add_to_campaign', label: "添加到活动", icon: <Megaphone className="w-3.5 h-3.5" /> },
      
      { type: 'action', actionType: 'add_note', label: "添加注释", icon: <StickyNote className="w-3.5 h-3.5" /> },
      { type: 'action', actionType: 'assign_team', label: "分配团队", icon: <UserCheck className="w-3.5 h-3.5" /> },
      { type: 'action', actionType: 'conv_status', label: "聊天状态", icon: <Layers className="w-3.5 h-3.5" /> },
      { type: 'action', actionType: 'set_priority', label: "设置优先级", icon: <Layers className="w-3.5 h-3.5" /> },
      { type: 'action', actionType: 'create_followup', label: "创建后续行动", icon: <Calendar className="w-3.5 h-3.5" /> },

    ],
  },

  {
    group: 'INTEGRATIONS', items: [
      { type: 'sheets', label: "Google 表格行", icon: <Table className="w-3.5 h-3.5" /> },
      { type: 'gmeet', label: 'Google Meet', icon: <Video className="w-3.5 h-3.5" /> },
      { type: 'gdocs', label: "谷歌文档", icon: <FileText className="w-3.5 h-3.5" /> },
      { type: 'gforms', label: "谷歌表单", icon: <ClipboardList className="w-3.5 h-3.5" /> },
      { type: 'gcontacts', label: "谷歌通讯录", icon: <UserPlus className="w-3.5 h-3.5" /> },
    ],
  },
];

// Each palette group has its own colour family so a card's category is readable at a glance.
const GROUP_STYLE: Record<string, { tile: string; icon: string; head: string; chip: string }> = {
  SEND: { tile: 'hover:border-sky-300 hover:bg-sky-50', icon: 'bg-sky-100 text-sky-600', head: 'bg-sky-50 border-sky-100', chip: 'bg-sky-100 text-sky-700' },
  LISTEN: { tile: 'hover:border-teal-300 hover:bg-teal-50', icon: 'bg-teal-100 text-teal-600', head: 'bg-teal-50 border-teal-100', chip: 'bg-teal-100 text-teal-700' },
  LOGIC: { tile: 'hover:border-amber-300 hover:bg-amber-50', icon: 'bg-amber-100 text-amber-600', head: 'bg-amber-50 border-amber-100', chip: 'bg-amber-100 text-amber-700' },
  AI: { tile: 'hover:border-violet-300 hover:bg-violet-50', icon: 'bg-violet-100 text-violet-600', head: 'bg-violet-50 border-violet-100', chip: 'bg-violet-100 text-violet-700' },
  CONTACT: { tile: 'hover:border-indigo-300 hover:bg-indigo-50', icon: 'bg-indigo-100 text-indigo-600', head: 'bg-indigo-50 border-indigo-100', chip: 'bg-indigo-100 text-indigo-700' },
  ENGAGE: { tile: 'hover:border-rose-300 hover:bg-rose-50', icon: 'bg-rose-100 text-rose-600', head: 'bg-rose-50 border-rose-100', chip: 'bg-rose-100 text-rose-700' },
  COMMERCE: { tile: 'hover:border-pink-300 hover:bg-pink-50', icon: 'bg-pink-100 text-pink-600', head: 'bg-pink-50 border-pink-100', chip: 'bg-pink-100 text-pink-700' },
  INTEGRATIONS: { tile: 'hover:border-emerald-300 hover:bg-emerald-50', icon: 'bg-emerald-100 text-emerald-600', head: 'bg-emerald-50 border-emerald-100', chip: 'bg-emerald-100 text-emerald-700' },
  START: { tile: '', icon: 'bg-gray-900 text-white', head: 'bg-gray-100 border-gray-200', chip: 'bg-gray-200 text-gray-700' },
};
const groupStyle = (group: string) => GROUP_STYLE[group] || GROUP_STYLE.SEND;

// type|actionType → the palette entry it came from (group, label, icon)
type PaletteInfo = { group: string; label: string; icon: React.ReactNode };
const PALETTE_INDEX: Record<string, PaletteInfo> = {};
PALETTE.forEach(g => g.items.forEach(it => { PALETTE_INDEX[`${it.type}|${it.actionType || ''}`] = { group: g.group, label: it.label, icon: it.icon }; }));
const paletteInfo = (type: string, actionType?: string): PaletteInfo =>
  PALETTE_INDEX[`${type}|${actionType || ''}`]
  || PALETTE_INDEX[`${type}|`]
  || { group: 'CONTACT', label: type, icon: <Zap className="w-3.5 h-3.5" /> };

const newNode = (type: FlowNode['type'], x: number, y: number, actionType?: string): FlowNode => ({
  id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  name: '', type, text: '', mediaType: 'image', mediaUrl: '', caption: '',
  header: '', headerType: 'none', headerMediaUrl: '', footer: '', mode: 'buttons',
  ctaText: '', ctaUrl: '', ctas: [], buttons: [{ title: '', next: '' }],
  listButtonText: '', rows: [{ title: '', description: '', next: '' }],
  templateName: '', templateLanguage: 'en', presetId: '', next: '', x, y,
  actionTag: '', actionAgent: '',    
    
  actionType: actionType || 'add_tag',

  webhookUrl: '', webhookMethod: 'POST', webhookBody: '{"phone": "{phone_number}", "name": "{full_name}"}', webhookHeaders: [], apiSaveVars: [],
  answerVar: '', waitTimeoutHours: 0, nextTimeout: '', delaySeconds: 30, delayUnit: 'seconds',
  condField: 'reply', condVarName: '', condOp: 'contains', condValue: '', nextTrue: '', nextFalse: '',
  emailTo: '', emailSubject: '', emailBody: '',
  locLat: '', locLng: '', locName: '', locAddress: '',
  subflowId: '', aiPrompt: '', aiMaxWords: 60,
  formId: '', formMode: 'flow', formCta: 'Fill Form',
  fieldName: '', fieldValue: '', campaignId: '',  noteText: '',
  varName: '', varValue: '', waitDate: '', waitTime: '10:00', waitForOpen: false,
  gotoNode: '', splitPercent: 50, actionTeam: '', convStatus: 'open',
  followupText: '', followupInHours: 24, priority: 'normal',  
  gwTitle: '', gwStart: '', gwDuration: 30, gwTimezone: '', gwTemplateId: '', gwReplacements: '',
  gwFormId: '', gwMessage: '', gwSendLink: true, gwLabel: '',
});

export default function BotFlowBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [startNode, setStartNode] = useState('');
  const [startPos, setStartPos] = useState({ x: 40, y: 60 });
  const [isActive, setIsActive] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const [editing, setEditing] = useState<FlowNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<{ _id: string; name: string; language?: string; body?: string }[]>([]);
  const templateVarCount = (name: string) => {
    const m = (templates.find(t => t.name === name)?.body || '').match(/\{\{(\d+)\}\}/g) || [];
    return m.length ? Math.max(...m.map(x => parseInt(x.replace(/\D/g, ''), 10))) : 0;
  };
  const [presets, setPresets] = useState<{ _id: string; name: string }[]>([]);
  const [tags, setTags] = useState<{ _id: string; name: string }[]>([]);
  const [gwConnected, setGwConnected] = useState(true);
  const [agents, setAgents] = useState<{ _id: string; name: string }[]>([]);
  const [teams, setTeams] = useState<{ _id: string; name: string }[]>([]);
  
  const [campaigns, setCampaigns] = useState<{ _id: string; name: string }[]>([]);
  
  const [otherFlows, setOtherFlows] = useState<{ _id: string; name: string }[]>([]);
  const [forms, setForms] = useState<{ _id: string; name: string; waFlow?: { status?: string } }[]>([]);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [cardMenu, setCardMenu] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [hits, setHits] = useState<Record<string, number>>({});
  const [runs, setRuns] = useState(0);
  const [connectFrom, setConnectFrom] = useState<ConnectFrom | null>(null);
  // true while an output port was armed by pressing the mouse down (drag-to-connect)
  const dragArmRef = useRef(false);
  const [mousePos, setMousePos] = useState<PortPos | null>(null);
  const [ports, setPorts] = useState<Record<string, PortPos>>({});
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const headerFileRef = useRef<HTMLInputElement>(null);
  const VARIABLES = ['{first_name}', '{last_name}', '{full_name}', '{phone_number}'];
  const dragRef = useRef<{ target: string; offX: number; offY: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const loadedRef = useRef(false);
  // SEC-15 webhook trigger: the keyed URL is only ever returned once (create / generate)
  const [triggerUrl, setTriggerUrl] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [genKey, setGenKey] = useState(false);

  useEffect(() => {
    if (!loadedRef.current) return;
    setDirty(true);
  }, [nodes, startNode, startPos, isActive]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const [leavePrompt, setLeavePrompt] = useState<'page' | 'modal' | null>(null);
  const editSnapRef = useRef<string>('');

  const goBack = () => {
    if (dirty) { setLeavePrompt('page'); return; }
    router.push('/client/bot-flows');
  };

  const requestCloseModal = () => {
    if (editing && JSON.stringify(editing) !== editSnapRef.current) { setLeavePrompt('modal'); return; }
    setEditing(null);
  };

  useEffect(() => {
    botFlowApi.get(id).then(r => {
      const f: Flow = r.data.data;
      setFlow(f);
      setNodes((f.nodes || []).map((n, i) => ({ ...n, x: n.x || 320 + (i % 3) * 300, y: n.y || 60 + Math.floor(i / 3) * 260 })));
      setStartNode(f.startNode || '');
      setStartPos({ x: f.startX || 40, y: f.startY || 60 });
      setIsActive(!!f.isActive);
      setHits((f as unknown as { nodeHits?: Record<string, number> }).nodeHits || {});
      setRuns((f as unknown as { runs?: number }).runs || 0);
      setHasKey(!!(f as unknown as { hasWebhookKey?: boolean }).hasWebhookKey);
      try { const k = `bfTriggerUrl:${id}`; const u = sessionStorage.getItem(k); if (u) { setTriggerUrl(u); sessionStorage.removeItem(k); } } catch { /* ignore */ }
      setTimeout(() => { loadedRef.current = true; }, 300);
    }).catch(() => { toast.error(translateApiMessage("未找到流")); router.push('/client/bot-flows'); });
    templateApi.list({ limit: 500 }).then(r => setTemplates(((r.data.data || []) as { _id: string; name: string; language?: string; body?: string; status?: string }[]).filter(t => (t.status || '').toLowerCase() === 'approved'))).catch(() => {});
    presetMessageApi.list().then(r => setPresets(((r.data.data || []) as { _id: string; name: string }[]))).catch(() => {});
    tagApi.list().then(r => setTags(r.data.data || [])).catch(() => {});
    teamApi.listAgents().then(r => setAgents(r.data.data || [])).catch(() => {});
    teamApi.list().then(r => setTeams(((r.data.data || []) as { _id: string; name: string }[]))).catch(() => {});
    
    campaignApi.list({ limit: 200 }).then(r => setCampaigns(((r.data.data || []) as { _id: string; name: string }[]))).catch(() => {});
    
    botFlowApi.list().then(r => setOtherFlows(((r.data.data || []) as { _id: string; name: string }[]).filter(f => f._id !== id))).catch(() => {});
    formApi.list().then(r => setForms(((r.data.data || []) as { _id: string; name: string; waFlow?: { status?: string } }[]))).catch(() => {});
    integrationApi.list().then(r => setGwConnected(((r.data.data || []) as { type: string; connected?: boolean }[])
      .some(i => i.type === 'google-workspace' && i.connected))).catch(() => {});
  }, [id, router]);

  // Measure port positions relative to canvas
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cRect = canvas.getBoundingClientRect();
    const next: Record<string, PortPos> = {};
    canvas.querySelectorAll<HTMLElement>('[data-port]').forEach(el => {
      const r = el.getBoundingClientRect();
      next[el.dataset.port as string] = {
        x: (r.left - cRect.left + r.width / 2 + canvas.scrollLeft) / zoom,
        y: (r.top - cRect.top + r.height / 2 + canvas.scrollTop) / zoom,
      };
    });
    setPorts(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
  }, [nodes, startPos, startNode, flow, zoom]);

  // Dragging
  const onDragStart = (e: React.MouseEvent, target: string) => {
    e.preventDefault();
    // While a connection is armed a press on a card picks it as the target instead of moving it.
    if (connectFrom && (connectFrom.kind === 'start' || connectFrom.nodeId !== target)) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cRect = canvas.getBoundingClientRect();
    const cur = target === 'start' ? startPos : nodes.find(n => n.id === target);
    if (!cur) return;
    dragRef.current = {
      target,
      offX: (e.clientX - cRect.left + canvas.scrollLeft) / zoom - cur.x,
      offY: (e.clientY - cRect.top + canvas.scrollTop) / zoom - cur.y,
    };
    const move = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const x = Math.max(0, (ev.clientX - cRect.left + canvas.scrollLeft) / zoom - d.offX);
      const y = Math.max(0, (ev.clientY - cRect.top + canvas.scrollTop) / zoom - d.offY);
      if (d.target === 'start') setStartPos({ x, y });
      else setNodes(prev => prev.map(n => n.id === d.target ? { ...n, x, y } : n));
    };
    const up = () => { dragRef.current = null; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // First spot in the visible area that no card already occupies (scans right, then down).
  const freeSpot = () => {
    const c = canvasRef.current;
    const x0 = (c?.scrollLeft || 0) / zoom + 340, y0 = (c?.scrollTop || 0) / zoom + 80;
    const cols = Math.max(1, Math.floor(((c?.clientWidth || 900) / zoom - 340) / 300));
    for (let i = 0; i < 400; i++) {
      const x = x0 + (i % cols) * 300, y = y0 + Math.floor(i / cols) * 240;
      const taken = nodes.some(n => Math.abs(n.x - x) < 270 && Math.abs(n.y - y) < 200) || (Math.abs(startPos.x - x) < 270 && Math.abs(startPos.y - y) < 200);
      if (!taken) return { x, y };
    }
    return { x: x0, y: y0 };
  };

  // Palette: click adds a card in a free spot, drag-and-drop adds it where it is dropped.
  const addNode = (type: FlowNode['type'], actionType?: string, at?: { x: number; y: number }) => {
    const pos = at || freeSpot();
    setEditing(newNode(type, Math.max(0, pos.x), Math.max(0, pos.y), actionType));
  };

  // Auto arrange: columns by distance from Trigger, rows by measured card height.
  const autoArrange = () => {
    const heights: Record<string, number> = {};
    canvasRef.current?.querySelectorAll<HTMLElement>('[data-node]').forEach(el => { heights[el.dataset.node as string] = el.offsetHeight / zoom; });
    const outs = (n: FlowNode) => [n.next, n.nextTrue || '', n.nextFalse || '', ...n.buttons.map(b => b.next), ...n.rows.map(r => r.next)].flatMap(splitNext);
    const depth: Record<string, number> = {};
    const queue: string[] = splitNext(startNode);
    queue.forEach(id => { depth[id] = 1; });
    while (queue.length) {
      const id = queue.shift() as string;
      const n = nodes.find(x => x.id === id);
      if (!n) continue;
      outs(n).forEach(t => { if (depth[t] === undefined && nodes.some(x => x.id === t)) { depth[t] = depth[id] + 1; queue.push(t); } });
    }
    const unreachedDepth = 1 + Math.max(0, ...Object.values(depth));
    nodes.forEach(n => { if (depth[n.id] === undefined) depth[n.id] = unreachedDepth; });
    // Each depth becomes a column group; a column wraps to a new column once it gets taller than MAX_COL_H.
    const MAX_COL_H = 2400;
    const groups: Record<number, FlowNode[]> = {};
    nodes.forEach(n => { (groups[depth[n.id]] ||= []).push(n); });
    const pos: Record<string, { x: number; y: number }> = {};
    let x = 360;
    Object.keys(groups).map(Number).sort((a, b) => a - b).forEach(d => {
      let y = 60;
      groups[d].forEach(n => {
        const h = (heights[n.id] || 160) + 40;
        if (y > 60 && y + h > MAX_COL_H) { y = 60; x += 320; }
        pos[n.id] = { x, y };
        y += h;
      });
      x += 320;
    });
    const placed = nodes.map(n => ({ ...n, ...pos[n.id] }));
    setStartPos({ x: 40, y: 60 });
    setNodes(placed);
    toast.success(translateApiMessage("流程已整理"));
  };

  const onCanvasDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw.startsWith('bfnode:')) return;
    e.preventDefault();
    const [type, actionType] = raw.slice(7).split('|');
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    addNode(type as FlowNode['type'], actionType || undefined, {
      x: (e.clientX - r.left + c.scrollLeft) / zoom - 120,
      y: (e.clientY - r.top + c.scrollTop) / zoom - 16,
    });
  };

  const handleSave = useCallback(async (active?: boolean, opts?: { silent?: boolean }) => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { nodes, startNode, startX: startPos.x, startY: startPos.y };
      if (active !== undefined) payload.isActive = active;
      const res = await botFlowApi.update(id, payload);
      const saved = res?.data?.data as Flow | undefined;
      if (saved && typeof saved.isActive === 'boolean') setIsActive(saved.isActive);
      if (!opts?.silent) toast.success(translateApiMessage("流程已保存"));
      setDirty(false);
      setAutoSaved(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      if (!opts?.silent) toast.error(translateApiMessage(e.response?.data?.message || "保存失败"));
    }
    setSaving(false);
  }, [id, nodes, startNode, startPos]);

  // Auto-save: debounce ~1.5s after any change so work is never lost
  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);
  useEffect(() => {
    if (!loadedRef.current || !dirty) return;
    const t = setTimeout(() => { handleSaveRef.current(undefined, { silent: true }); }, 1500);
    return () => clearTimeout(t);
  }, [nodes, startNode, startPos, isActive, dirty]);

  // Cancel an armed connection with Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConnectFrom(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const targetsOf = (c: ConnectFrom, list: FlowNode[] = nodes): string[] => {
    if (c.kind === 'start') return splitNext(startNode);
    const n = list.find(x => x.id === c.nodeId);
    if (!n) return [];
    if (c.kind === 'next') return splitNext(n.next);
    if (c.kind === 'condT') return splitNext(n.nextTrue || '');
    if (c.kind === 'condF') return splitNext(n.nextFalse || '');
    if (c.kind === 'btn') return splitNext(n.buttons[c.idx]?.next || '');
    if (c.kind === 'row') return splitNext(n.rows[c.idx]?.next || '');
    return [];
  };

  // Rewrite one output's target list on the node it belongs to.
  const setTargets = (c: ConnectFrom, fn: (v: string) => string) => {
    if (c.kind === 'start') { setStartNode(v => fn(v)); return; }
    setNodes(prev => prev.map(n => {
      if (n.id !== c.nodeId) return n;
      if (c.kind === 'next') return { ...n, next: fn(n.next) };
      if (c.kind === 'condT') return { ...n, nextTrue: fn(n.nextTrue || '') };
      if (c.kind === 'condF') return { ...n, nextFalse: fn(n.nextFalse || '') };
      if (c.kind === 'btn') return { ...n, buttons: n.buttons.map((b, i) => i === c.idx ? { ...b, next: fn(b.next) } : b) };
      if (c.kind === 'row') return { ...n, rows: n.rows.map((r, i) => i === c.idx ? { ...r, next: fn(r.next) } : r) };
      return n;
    }));
  };

  // Connect: click (or drag from) an output port, then click anywhere on the target card.
  // Connecting is add-only; a line is removed by clicking the line itself.
  const applyConnection = (targetId: string) => {
    dragArmRef.current = false;
    if (!connectFrom) return;
    const from = connectFrom;
    setConnectFrom(null);
    if (from.kind !== 'start' && targetId === from.nodeId) { toast.error(translateApiMessage("卡无法连接到自身")); return; }
    if (targetsOf(from).includes(targetId)) { toast('Already connected — click the line to remove it', { icon: 'ℹ️' }); return; }
    if (from.kind === 'start') setStartNode(targetId);
    else setTargets(from, v => addNext(v, targetId));
    toast.success(translateApiMessage("已连接"));
  };

  const removeConnection = (from: ConnectFrom, targetId: string) => {
    if (from.kind === 'start') setStartNode('');
    else setTargets(from, v => dropNext(v, targetId));
    toast.success(translateApiMessage("连接已删除"));
  };

  const outPortKey = (c: ConnectFrom) =>
    c.kind === 'start' ? 'out:start'
      : c.kind === 'btn' || c.kind === 'row' ? `out:${c.nodeId}:${c.kind}:${c.idx}`
      : `out:${c.nodeId}:${c.kind}`;
  const isConnecting = (c: ConnectFrom) => connectFrom && outPortKey(connectFrom) === outPortKey(c);

  const deleteNode = (nodeId: string) => {
    if (!confirm("删除这一步？")) return;
    const drop = (v: string) => joinNext(splitNext(v).filter(x => x !== nodeId));
    setNodes(prev => prev.filter(n => n.id !== nodeId).map(n => ({
      ...n,
      next: drop(n.next),
      nextTrue: drop(n.nextTrue || ''),
      nextFalse: drop(n.nextFalse || ''),
      buttons: n.buttons.map(b => ({ ...b, next: drop(b.next) })),
      rows: n.rows.map(r => ({ ...r, next: drop(r.next) })),
    })));
    if (startNode === nodeId) setStartNode('');
    setCardMenu(null);
  };

  // Duplicate: same settings, new id, offset a little so it does not sit on top of the original.
  // Outgoing connections are cleared so the copy can be wired up on its own.
  const duplicateNode = (n: FlowNode) => {
    const copy: FlowNode = JSON.parse(JSON.stringify(n));
    copy.id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    copy.name = (n.name || 'Card') + ' copy';
    copy.x = n.x + 40; copy.y = n.y + 40;
    copy.next = ''; copy.nextTrue = ''; copy.nextFalse = ''; copy.nextTimeout = '';
    copy.buttons = (copy.buttons || []).map(b => ({ ...b, next: '' }));
    copy.rows = (copy.rows || []).map(r => ({ ...r, next: '' }));
    setNodes(prev => [...prev, copy]);
    setCardMenu(null);
    toast.success(translateApiMessage("卡重复"));
  };

  useEffect(() => {
    if (editing) editSnapRef.current = editSnapRef.current || JSON.stringify(editing);
    else editSnapRef.current = '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!editing]);

  const saveNode = () => {
    if (!editing) return;
    if (editing.type === 'text' && !editing.text) { toast.error(translateApiMessage("需要回复文字")); return; }
    if (editing.type === 'media' && !editing.mediaUrl) { toast.error(translateApiMessage("上传或粘贴媒体 URL")); return; }
    if (editing.type === 'template' && !editing.templateName) { toast.error(translateApiMessage("选择模板")); return; }
    if (editing.type === 'preset' && !editing.presetId) { toast.error(translateApiMessage("选择预设消息")); return; }
    
    if (editing.type === 'action' && editing.actionType === 'add_tag' && !editing.actionTag) { toast.error(translateApiMessage("选择一个标签")); return; }

    if (editing.type === 'action' && editing.actionType === 'assign_agent' && !editing.actionAgent) { toast.error(translateApiMessage("选择代理")); return; }
    if (editing.type === 'action' && editing.actionType === 'remove_tag' && !editing.actionTag) { toast.error(translateApiMessage("选择要删除的标签")); return; }
    if (editing.type === 'action' && editing.actionType === 'update_contact' && !editing.fieldName) { toast.error(translateApiMessage("输入要更新的字段")); return; }
    if (editing.type === 'action' && editing.actionType === 'add_to_campaign' && !editing.campaignId) { toast.error(translateApiMessage("选择一个活动")); return; }
    
    if (editing.type === 'action' && editing.actionType === 'add_note' && !editing.noteText) { toast.error(translateApiMessage("输入注释文本")); return; }
    if (editing.type === 'email' && !editing.emailBody) { toast.error(translateApiMessage("电子邮件正文为必填项")); return; }
    if (editing.type === 'location' && (!editing.locLat || !editing.locLng)) { toast.error(translateApiMessage("输入纬度和经度")); return; }
    if (editing.type === 'subflow' && !editing.subflowId) { toast.error(translateApiMessage("选择要运行的流程")); return; }
    if (editing.type === 'form' && !editing.formId) { toast.error(translateApiMessage("选择要发送的表格")); return; }
    if (editing.type === 'webhook' && !editing.webhookUrl) { toast.error(translateApiMessage("Webhook URL 是必需的")); return; }
    if (editing.type === 'api_call' && !editing.webhookUrl) { toast.error(translateApiMessage("API URL 为必填项")); return; }
    if (editing.type === 'question' && !editing.text) { toast.error(translateApiMessage("问题文字为必填项")); return; }
    if (editing.type === 'delay' && !(editing.delaySeconds > 0)) { toast.error(translateApiMessage("输入延迟秒数")); return; }
    if (editing.type === 'condition' && (editing.condOp !== 'exists' || editing.condField === 'tag') && !editing.condValue) { toast.error(translateApiMessage("输入要检查的值")); return; }
    
    if (editing.type === 'condition' && editing.condField === 'variable' && !editing.condVarName) { toast.error(translateApiMessage("输入变量名称")); return; }
    if (editing.type === 'condition' && editing.condField === 'field' && !editing.fieldName) { toast.error(translateApiMessage("输入字段名称")); return; }
    if (editing.type === 'set_variable' && !editing.varName) { toast.error(translateApiMessage("输入变量名称")); return; }
    if (editing.type === 'wait_until' && !editing.waitDate) { toast.error(translateApiMessage("选择要等待的日期")); return; }
    if (editing.type === 'goto' && !editing.gotoNode) { toast.error(translateApiMessage("选择要跳转到的卡")); return; }
    if (editing.type === 'action' && editing.actionType === 'assign_team' && !editing.actionTeam) { toast.error(translateApiMessage("选择一个团队")); return; }
    if (editing.type === 'action' && editing.actionType === 'create_followup' && !editing.followupText) { toast.error(translateApiMessage("输入提醒文字")); return; }
    if (editing.type === 'interactive') {
      if (!editing.text) { toast.error(translateApiMessage("正文为必填项")); return; }
      if (editing.mode === 'buttons' && !editing.buttons.some(b => b.title)) { toast.error(translateApiMessage("添加至少一个按钮")); return; }
      if (editing.mode === 'list' && !editing.rows.some(r => r.title)) { toast.error(translateApiMessage("添加至少一个列表项")); return; }
      if (editing.mode === 'cta' && !editing.ctas.some(c => c.url)) { toast.error(translateApiMessage("需要 CTA URL")); return; }
    }
    const isNew = !nodes.some(n => n.id === editing.id);
    setNodes(prev => isNew ? [...prev, editing] : prev.map(n => n.id === editing.id ? editing : n));
    if (isNew && !nodes.length && !startNode) setStartNode(editing.id);
    setEditing(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'mediaUrl' | 'headerMediaUrl' = 'mediaUrl') => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', editing.mediaType === 'sticker' ? 'stickers' : 'bot-flows');
      const res = await uploadApi.uploadFile(fd);
      setEditing({ ...editing, [field]: res.data.data.url });
      toast.success(translateApiMessage("已上传"));
    } catch { toast.error(translateApiMessage("上传失败")); }
    setUploading(false);
  };

  const VarChips = ({ onInsert }: { onInsert: (v: string) => void }) => (
    <div className="-mt-2 space-y-1">
      <div className="flex flex-wrap gap-1">
        {VARIABLES.map(v => (
          <button key={v} type="button" onClick={() => onInsert(v)}
            className="text-[11px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full hover:bg-emerald-100">{v}</button>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">🌐 多语言：将文本写为 <span className="font-mono">[hi] 印地语消息 [en] 英语消息</span> — 自动检测客户的语言并发送匹配的版本。</p>
    </div>
  );

  const openEdit = (n: FlowNode) => {
    const c: FlowNode = JSON.parse(JSON.stringify(n));
    if (!c.ctas) c.ctas = [];
    if (c.ctaUrl && !c.ctas.length) { c.ctas = [{ text: c.ctaText || '', url: c.ctaUrl }]; c.ctaText = ''; c.ctaUrl = ''; }
    setEditing(c);
  };

  const nodeLabel = (n: FlowNode) => n.name || (n.type === 'template' ? n.templateName : n.type === 'preset' ? (presets.find(p => p._id === n.presetId)?.name || 'Preset') : (n.text || n.caption || 'Untitled').slice(0, 28)) || 'Untitled';

  // Multi-target picker: shows connected replies as removable chips + a select to add more
  const MultiNextPicker = ({ value, onChange, excludeId, className }: { value: string; onChange: (v: string) => void; excludeId?: string; className?: string }) => {
    const ids = splitNext(value);
    const available = nodes.filter(n => n.id !== excludeId && !ids.includes(n.id));
    return (
      <div className={`space-y-1 ${className || ''}`}>
        {ids.map(idv => {
          const n = nodes.find(x => x.id === idv);
          return (
            <span key={idv} className="flex items-center justify-between gap-1 text-xs px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg">
              <span className="truncate">{n ? nodeLabel(n) : idv}</span>
              <button type="button" onClick={() => onChange(joinNext(ids.filter(x => x !== idv)))} className="text-emerald-400 hover:text-red-500 font-bold shrink-0">×</button>
            </span>
          );
        })}
        <select value="" onChange={e => { if (e.target.value) onChange(joinNext([...ids, e.target.value])); }}
          className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-500">
          <option value="">{translateDisplay(ids.length ? "+同时发送..." : "— 无 —")}</option>
          {available.map(n => <option key={n.id} value={n.id}>{translateDisplay(nodeLabel(n))}</option>)}
        </select>
      </div>
    );
  };

  // Build edges (each output can connect to multiple targets)
  const edges: { from: string; to: string; src: ConnectFrom; target: string }[] = [];
  const pushEdges = (src: ConnectFrom, next: string) => splitNext(next).forEach(t => edges.push({ from: outPortKey(src), to: `in:${t}`, src, target: t }));
  if (startNode) pushEdges({ kind: 'start' }, startNode);
  nodes.forEach(n => {
    pushEdges({ kind: 'next', nodeId: n.id }, n.next);
    if (n.type === 'condition' || n.type === 'biz_hours' || n.type === 'ab_split' || n.type === 'api_call') { pushEdges({ kind: 'condT', nodeId: n.id }, n.nextTrue || ''); pushEdges({ kind: 'condF', nodeId: n.id }, n.nextFalse || ''); }
    if (n.type === 'interactive') {
      if (n.mode === 'buttons') n.buttons.forEach((b, i) => { if (b.title) pushEdges({ kind: 'btn', nodeId: n.id, idx: i }, b.next); });
      else if (n.mode === 'list') n.rows.forEach((r, i) => { if (r.title) pushEdges({ kind: 'row', nodeId: n.id, idx: i }, r.next); });
    }
    if (n.type === 'template') n.buttons.forEach((b, i) => { if (b.title) pushEdges({ kind: 'btn', nodeId: n.id, idx: i }, b.next); });
  });

  // Canvas grows with the flow — there is no cap on how many cards fit.
  const canvasW = Math.max(3000, startPos.x + 700, ...nodes.map(n => n.x + 700));
  const canvasH = Math.max(2000, startPos.y + 700, ...nodes.map(n => n.y + 700));
  const armedTargets = connectFrom ? targetsOf(connectFrom) : [];
  const canTarget = (nodeId: string) => !!connectFrom && (connectFrom.kind === 'start' || connectFrom.nodeId !== nodeId);

  const outCount = (c: ConnectFrom) => {
    if (c.kind === 'start') return startNode ? 1 : 0;
    const n = nodes.find(x => x.id === c.nodeId);
    if (!n) return 0;
    if (c.kind === 'next') return splitNext(n.next).length;
    if (c.kind === 'condT') return splitNext(n.nextTrue || '').length;
    if (c.kind === 'condF') return splitNext(n.nextFalse || '').length;
    if (c.kind === 'btn') return splitNext(n.buttons[c.idx]?.next || '').length;
    if (c.kind === 'row') return splitNext(n.rows[c.idx]?.next || '').length;
    return 0;
  };

  const OutPort = ({ c }: { c: ConnectFrom }) => {
    const count = outCount(c);
    return (
      <span className="relative inline-flex shrink-0">
        <button
          data-port={outPortKey(c)}
          onMouseDown={(e) => {
            e.stopPropagation();
            // Armed and pressing a port on another card: that card is the target.
            if (connectFrom && c.kind !== 'start' && canTarget(c.nodeId)) { applyConnection(c.nodeId); return; }
            if (!isConnecting(c)) { dragArmRef.current = true; setConnectFrom(c); }
          }}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (dragArmRef.current) { dragArmRef.current = false; return; }
            setConnectFrom(isConnecting(c) ? null : c);
          }}
          title={"单击此处，然后单击您要连接的卡（或将线拖到其上）。一键可连接多张卡。单击一条线将其删除。"}
          className={`w-4 h-4 rounded-full border-2 shrink-0 transition ${isConnecting(c) ? 'bg-amber-400 border-amber-500 animate-pulse' : 'bg-emerald-500 border-emerald-600 hover:scale-125'}`}
        />
        {count > 1 && <span className="absolute -top-2 -right-2 min-w-[14px] h-[14px] px-0.5 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center pointer-events-none">{count}</span>}
      </span>
    );
  };

  const InPort = ({ nodeId }: { nodeId: string }) => (
    <button
      data-port={`in:${nodeId}`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={`absolute -left-2 top-4 w-4 h-4 rounded-full border-2 ${canTarget(nodeId) ? 'bg-amber-300 border-amber-500 animate-pulse cursor-pointer scale-125' : 'bg-gray-300 border-gray-400'}`}
      title={canTarget(nodeId) ? "点击此处连接" : "输入"}
    />
  );

  const generateWebhookKey = async () => {
    if (hasKey && !confirm("生成新密钥？旧的触发器 URL 立即停止工作。")) return;
    setGenKey(true);
    try {
      const r = await botFlowApi.update(id, { generateWebhookKey: true });
      setTriggerUrl(r.data.webhookTriggerUrl || null);
      setHasKey(true);
      toast.success(translateApiMessage("已生成新的 webhook 密钥 — 立即复制 URL"));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "无法生成密钥"));
    }
    setGenKey(false);
  };
  const copyTriggerUrl = async () => {
    if (!triggerUrl) return;
    try { await navigator.clipboard.writeText(triggerUrl); toast.success(translateApiMessage("已复制")); } catch { toast.error(translateApiMessage("复制失败 — 选择 URL 并手动复制")); }
  };

  if (!flow) return <div className="p-8 text-center text-gray-400">加载中…</div>;

  return (
    <div className="space-y-3">
      {/* Editor toolbar: flow name + status on the left, save / activate on the right */}
      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-3 flex-wrap">
        <button onClick={goBack} title={"返回机器人流程"} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-4 h-4" /></button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-gray-900 truncate max-w-[260px]">{flow.name}</h1>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{isActive ? "启用" : "草稿"}</span>
            {runs > 0 && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{runs} 运行</span>}
          </div>
          <p className="text-[11px] text-gray-400">{connectFrom ? "现在单击您要连接的卡（Esc 取消）" : <>{nodes.length} 步骤{nodes.length === 1 ? '' : 's'} • {edges.length} 连接{edges.length === 1 ? '' : 's'} • 单击绿色的●，然后单击目标卡</>}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-gray-400 min-w-[84px] text-right flex items-center justify-end gap-1">
            {saving ? "正在保存..." : dirty ? "未保存的更改" : autoSaved ? <><Check className="w-3 h-3 text-emerald-500" /> 已保存</> : ''}
          </span>
          <div className="relative">
            <Button variant="outline" onClick={() => setAddMenu(!addMenu)} icon={<Plus className="w-4 h-4" />}>添加步骤 <ChevronDown className="w-3.5 h-3.5 ml-1" /></Button>
            {addMenu && (
              <div className="absolute right-0 top-11 z-30 bg-white border rounded-lg shadow-lg py-1 w-64 max-h-[60vh] overflow-y-auto">
                {NODE_TYPES.map(t => (
                  <button key={t.type} onClick={() => { addNode(t.type); setAddMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left">{t.icon} {t.label}</button>
                ))}
              </div>
            )}
          </div>
          <Button variant="outline" onClick={() => handleSave()} loading={saving} icon={<Save className="w-4 h-4" />}>保存草稿</Button>
          <Button variant={isActive ? 'secondary' : 'primary'} onClick={() => { setIsActive(!isActive); handleSave(!isActive); }}>{isActive ? "停用" : "启用"}</Button>
        </div>
      </div>

      {!isActive && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[12px] text-amber-800">
          <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p>这个流程是 <span className="font-semibold">草稿</span> — 在您按之前客户不会收到它 <span className="font-semibold">启用</span>。编辑时，更改会自动保存。</p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm flex flex-wrap items-center gap-3">
        <span className="font-medium text-gray-700">Webhook 触发器</span>
        {triggerUrl ? (
          <>
            <code className="flex-1 min-w-0 truncate bg-gray-50 border rounded px-2 py-1 text-xs select-all">{triggerUrl}</code>
            <Button type="button" size="sm" variant="outline" onClick={copyTriggerUrl}>复制</Button>
          </>
        ) : (
          <span className="flex-1 min-w-0 text-xs text-gray-500">
            {hasKey
              ? "用钥匙保护（隐藏）。呼叫者使用 ?key=... 发送 {\"phone\":\"91XXXXXXXXXX\"} 到触发 URL；如果您丢失了密钥，请生成一个新密钥。"
              : "无钥匙（旧版）— 生成密钥以确保其安全。"}
          </span>
        )}
        <Button type="button" size="sm" variant="outline" loading={genKey} onClick={generateWebhookKey}>生成新密钥</Button>
        {triggerUrl && <span className="w-full text-xs text-amber-600">立即复制 — 显示一次；再次生成替换旧密钥。</span>}
      </div>

      <div className="flex gap-3 items-start">
        <aside className="w-64 shrink-0 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 210px)' }}>
          <div className="px-3 pt-3 pb-2 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-800 mb-2">组件</p>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-2.5 pointer-events-none" />
              <input value={paletteQuery} onChange={e => setPaletteQuery(e.target.value)} placeholder={"搜索组件..."}
                className="w-full text-xs pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">拖到画布上 — 或单击进行添加。</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {PALETTE.map(g => {
              const q = paletteQuery.trim().toLowerCase();
              const items = g.items.filter(it => !q || it.label.toLowerCase().includes(q) || g.group.toLowerCase().includes(q));
              if (!items.length) return null;
              const st = groupStyle(g.group);
              const open = q ? true : !collapsedGroups[g.group];
              return (
                <div key={g.group} className="border border-gray-100 rounded-lg overflow-hidden">
                  <button type="button" onClick={() => setCollapsedGroups(p => ({ ...p, [g.group]: !!open }))}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 bg-gray-50 hover:bg-gray-100">
                    {open ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                    <span className="text-[10px] font-bold text-gray-500 tracking-wider">{g.group}</span>
                    <span className={`ml-auto text-[9px] font-bold px-1.5 rounded-full ${st.chip}`}>{items.length}</span>
                  </button>
                  {open && (
                    <div className="grid grid-cols-2 gap-1.5 p-1.5">
                      {items.map(it => (
                        <button key={`${g.group}-${it.label}`} type="button" draggable
                          onDragStart={e => { e.dataTransfer.setData('text/plain', `bfnode:${it.type}|${it.actionType || ''}`); e.dataTransfer.effectAllowed = 'copy'; }}
                          onClick={() => addNode(it.type, it.actionType)}
                          title={it.label}
                          className={`flex flex-col items-center gap-1 px-1.5 py-2 border border-gray-200 rounded-lg bg-white cursor-grab active:cursor-grabbing transition ${st.tile}`}>
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${st.icon}`}>{it.icon}</span>
                          <span className="text-[10px] leading-tight text-center text-gray-600 line-clamp-2">{it.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {!PALETTE.some(g => g.items.some(it => it.label.toLowerCase().includes(paletteQuery.trim().toLowerCase()) || g.group.toLowerCase().includes(paletteQuery.trim().toLowerCase()))) && (
              <p className="text-[11px] text-gray-400 px-1">没有组件匹配“{paletteQuery}”.</p>
            )}
          </div>
        </aside>

      <div className="relative flex-1 min-w-0">
      <div ref={canvasRef}
        onClick={() => {
          // A drag from a port that ended on empty canvas keeps the port armed; a plain click cancels.
          if (dragArmRef.current) { dragArmRef.current = false; return; }
          setConnectFrom(null); setCardMenu(null);
        }}
        onMouseMove={e => {
          if (!connectFrom) return;
          const c = canvasRef.current; if (!c) return;
          const r = c.getBoundingClientRect();
          setMousePos({ x: (e.clientX - r.left + c.scrollLeft) / zoom, y: (e.clientY - r.top + c.scrollTop) / zoom });
        }}
        onDragOver={e => { if (e.dataTransfer.types.includes('text/plain')) e.preventDefault(); }}
        onDrop={onCanvasDrop}
        className="relative w-full bg-white border border-gray-200 rounded-xl overflow-auto"
        style={{ height: 'calc(100vh - 210px)' }}>
        <div className="relative origin-top-left" style={{ width: canvasW, height: canvasH, transform: `scale(${zoom})`,
          backgroundImage: showGrid ? 'radial-gradient(#e5e7eb 1px, transparent 1px)' : undefined, backgroundSize: '20px 20px' }}>
          <svg className="absolute inset-0 pointer-events-none" width={canvasW} height={canvasH}>
            {edges.map((e, i) => {
              const a = ports[e.from]; const b = ports[e.to];
              if (!a || !b) return null;
              const dx = Math.max(50, Math.abs(b.x - a.x) / 2);
              const d = `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
              const lit = !!connectFrom && e.from === outPortKey(connectFrom);
              return (
                <g key={i} className="group">
                  <path d={d} stroke={lit ? '#f59e0b' : '#15803d'} strokeWidth={lit ? 3.5 : 2.5} fill="none" className="group-hover:stroke-red-500 group-hover:[stroke-width:4]" />
                  <path d={d} stroke="transparent" strokeWidth="14" fill="none" style={{ pointerEvents: connectFrom ? 'none' : 'stroke', cursor: 'pointer' }}
                    onMouseDown={ev => ev.stopPropagation()}
                    onClick={ev => { ev.stopPropagation(); removeConnection(e.src, e.target); }}>
                    <title>单击以删除此连接</title>
                  </path>
                </g>
              );
            })}
            {connectFrom && mousePos && ports[outPortKey(connectFrom)] && (() => {
              const a = ports[outPortKey(connectFrom)];
              const dx = Math.max(50, Math.abs(mousePos.x - a.x) / 2);
              return <path d={`M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${mousePos.x - dx} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`} stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="6 5" fill="none" />;
            })()}
          </svg>

          {/* Start node */}
          <div className="absolute bg-white border border-gray-300 rounded-xl shadow-sm hover:shadow-md w-64 select-none transition" style={{ left: startPos.x, top: startPos.y }}>
            <div onMouseDown={(e) => onDragStart(e, 'start')} className="bg-gray-100 border-b border-gray-200 px-3 py-2 rounded-t-xl cursor-move flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0"><Zap className="w-3.5 h-3.5" /></span>
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-gray-800 leading-tight">触发器</p>
                <p className="text-[9px] font-bold text-gray-400 tracking-wider uppercase">流程开始</p>
              </div>
            </div>
            <div className="px-3 py-3 flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500 text-right flex-1">{(flow.triggerKeywords || []).join(', ') || "触发关键词"}</p>
              <OutPort c={{ kind: 'start' }} />
            </div>
          </div>

          {/* Reply nodes */}
          {nodes.map(n => {
            const info = paletteInfo(n.type, n.type === 'action' ? n.actionType : undefined);
            const st = groupStyle(info.group);
            return (
            <div key={n.id} data-node={n.id}
              onMouseUp={(e) => { if (canTarget(n.id)) { e.stopPropagation(); applyConnection(n.id); } }}
              className={`absolute bg-white rounded-xl shadow-sm hover:shadow-md w-64 select-none transition border ${canTarget(n.id) ? (armedTargets.includes(n.id) ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-amber-400 ring-2 ring-amber-200 cursor-pointer hover:ring-4') : 'border-gray-300'}`}
              style={{ left: n.x, top: n.y }}>
              <InPort nodeId={n.id} />
              <div onMouseDown={(e) => onDragStart(e, n.id)} onDoubleClick={() => openEdit(n)}
                className={`border-b px-2.5 py-2 rounded-t-xl cursor-move flex items-center gap-2 ${st.head}`}>
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${st.icon}`}>{info.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-gray-800 truncate leading-tight">{nodeLabel(n)}</p>
                  <p className="text-[9px] font-bold text-gray-400 tracking-wider uppercase truncate">{info.group} • {info.label}</p>
                </div>
                {hits[n.id] ? <span className="text-[9px] font-bold text-indigo-600 shrink-0" title={"这张卡运行了多少次"}>👆{hits[n.id]}</span> : null}
                <div className="relative shrink-0">
                  <button onClick={e => { e.stopPropagation(); setCardMenu(cardMenu === n.id ? null : n.id); }}
                    onMouseDown={e => e.stopPropagation()} title={"更多行动"}
                    className="p-1 rounded hover:bg-white/70 text-gray-500"><EllipsisVertical className="w-3.5 h-3.5" /></button>
                  {cardMenu === n.id && (
                    <div className="absolute right-0 top-7 z-30 w-36 bg-white border border-gray-200 rounded-lg shadow-lg py-1" onMouseDown={e => e.stopPropagation()}>
                      <button onClick={e => { e.stopPropagation(); setCardMenu(null); openEdit(n); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 text-left text-gray-700"><Edit className="w-3.5 h-3.5" /> 编辑</button>
                      <button onClick={e => { e.stopPropagation(); duplicateNode(n); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 text-left text-gray-700"><Copy className="w-3.5 h-3.5" /> 重复</button>
                      <button onClick={e => { e.stopPropagation(); deleteNode(n.id); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-red-50 text-left text-red-600"><Trash2 className="w-3.5 h-3.5" /> 删除</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-3 py-2.5 space-y-1.5">
                {n.type === 'media' && <p className="text-[11px] text-gray-400 truncate">{n.mediaType}: {n.mediaUrl}</p>}
                {n.type === 'template' && <p className="text-[11px] text-gray-400 truncate">模板： {n.templateName}</p>}
                {n.type === 'preset' && <p className="text-[11px] text-gray-400 truncate">预设： {presets.find(p => p._id === n.presetId)?.name || '—'}</p>}
                
                {n.type === 'action' && (
                  <p className="text-[11px] text-indigo-500 font-medium">
                    ⚡ {n.actionType === 'add_tag' ? `添加标签： ${tags.find(t => t._id === n.actionTag)?.name || ''}`
                      : n.actionType === 'assign_agent' ? `分配： ${agents.find(a => a._id === n.actionAgent)?.name || ''}`
                      : n.actionType === 'unassign_agent' ? "取消分配代理（返回未分配）"
                      : n.actionType === 'remove_tag' ? `删除标签： ${tags.find(t => t._id === n.actionTag)?.name || ''}`
                      : n.actionType === 'update_contact' ? `更新联系方式： ${n.fieldName} = ${n.fieldValue}`
                      : n.actionType === 'add_to_campaign' ? `添加到活动： ${campaigns.find(c => c._id === n.campaignId)?.name || ''}`
                      : n.actionType === 'add_note' ? `📝 注意： ${(n.noteText || '').slice(0, 30)}`
                      : n.actionType === 'assign_team' ? `分配团队： ${teams.find(t => t._id === n.actionTeam)?.name || ''}`
                      : n.actionType === 'conv_status' ? `聊天状态： ${n.convStatus || 'open'}`
                      : n.actionType === 'set_priority' ? `优先级： ${n.priority || 'normal'}`
                      : n.actionType === 'create_followup' ? `⏰ 后续行动 ${n.followupInHours ?? 24}h`
                      : n.actionType === 'ai_on' ? "打开AI" : "关闭AI"}
                  </p>
                )}
                {n.type === 'webhook' && <p className="text-[11px] text-cyan-600 font-medium truncate">🌐 {n.webhookMethod || 'POST'} {n.webhookUrl}</p>}
                {n.type === 'api_call' && <p className="text-[11px] text-cyan-600 font-medium truncate">🔌 {n.webhookMethod || 'POST'} {n.webhookUrl}{(n.apiSaveVars || []).filter(v => v.varName).length ? ` → ${(n.apiSaveVars || []).filter(v => v.varName).map(v => '{' + v.varName + '}').join(', ')}` : ''}</p>}
                {n.type === 'wait_input' && <p className="text-[11px] text-teal-600 font-medium truncate">⏳ 等待客户回复{n.answerVar ? ` → {${n.answerVar}}` : ''}</p>}
                {n.type === 'email' && <p className="text-[11px] text-blue-600 font-medium truncate">✉️ {n.emailSubject || "邮箱"} → {n.emailTo || "联系人的电子邮件"}</p>}
                {n.type === 'location' && <p className="text-[11px] text-teal-600 font-medium truncate">📍 {n.locName || `${n.locLat}, ${n.locLng}`}</p>}
                {n.type === 'ai_reply' && <p className="text-[11px] text-violet-600 font-medium line-clamp-2">✨ AI 撰写回复{n.aiPrompt ? `: ${n.aiPrompt.slice(0, 40)}` : ''}</p>}
                {n.type === 'subflow' && <p className="text-[11px] text-amber-600 font-medium truncate">🔁 运行流程： {otherFlows.find(f => f._id === n.subflowId)?.name || '—'}</p>}
                {n.type === 'sheets' && <p className="text-[11px] text-green-600 font-medium truncate">📊 将此联系人添加为 Google 表格行</p>}
                {n.type === 'gmeet' && <p className="text-[11px] text-blue-600 font-medium truncate">📹 Google Meet 链接{n.gwTitle ? ` — ${n.gwTitle}` : ''}</p>}
                {n.type === 'gdocs' && <p className="text-[11px] text-blue-600 font-medium truncate">📄 谷歌文档{n.gwTitle ? ` — ${n.gwTitle}` : "来自模板"}</p>}
                {n.type === 'gforms' && <p className="text-[11px] text-violet-600 font-medium truncate">📝 发送 Google 表单链接</p>}
                {n.type === 'gcontacts' && <p className="text-[11px] text-emerald-600 font-medium truncate">👤 在 Google 通讯录中保存此潜在客户{n.gwLabel ? ` — ${n.gwLabel}` : ''}</p>}
                {n.type === 'form' && <p className="text-[11px] text-indigo-600 font-medium truncate">📋形式： {forms.find(f => f._id === n.formId)?.name || '—'}{n.formMode === 'link' ? "（链接）" : ''}</p>}
                {n.type === 'question' && <p className="text-[11px] text-purple-600 font-medium line-clamp-2 whitespace-pre-wrap">❓ {n.text}{n.answerVar ? ` → {${n.answerVar}}` : ''}</p>}
                {n.type === 'delay' && <p className="text-[11px] text-orange-500 font-medium">⏱ 等等 {n.delaySeconds || 0} {n.delayUnit || "秒"}，然后继续</p>}
                {n.type === 'set_variable' && <p className="text-[11px] text-gray-500 font-medium truncate">🔤 {`{${n.varName}}`} = {n.varValue}</p>}
                {n.type === 'wait_until' && <p className="text-[11px] text-orange-500 font-medium">📅等到 {n.waitDate} {n.waitTime}</p>}
                {n.type === 'goto' && <p className="text-[11px] text-amber-600 font-medium truncate">↩ 转到： {nodes.find(x => x.id === n.gotoNode)?.name || n.gotoNode || '—'}</p>}
                {n.type === 'end' && <p className="text-[11px] text-gray-500 font-medium">⏹ 流程结束</p>}
                {(n.type === 'condition' || n.type === 'biz_hours' || n.type === 'ab_split' || n.type === 'api_call') && (
                  <>
                    {n.type === 'biz_hours' && <p className="text-[11px] text-rose-600 font-medium">🕒 我们现在营业吗？{n.waitForOpen ? "（否则等到开放）" : ''}</p>}
                    {n.type === 'ab_split' && <p className="text-[11px] text-rose-600 font-medium">🔀 A/B 分割 — {n.splitPercent ?? 50}A 的%</p>}
                    {n.type === 'condition' && <p className="text-[11px] text-rose-600 font-medium">🔀如果 {n.condField === 'tag' ? `有标签“${n.condValue}"` : `${n.condField === 'variable' ? `{${n.condVarName}}` : n.condField === 'field' ? n.fieldName : 'last reply'} ${n.condOp} ${n.condOp === 'exists' ? '' : `"${n.condValue}"`}`}</p>}
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-emerald-700 text-right">{n.type === 'ab_split' ? 'A' : n.type === 'biz_hours' ? "✔ 打开" : n.type === 'api_call' ? "✔ 成功" : "✔ 是/正确"}</span>
                      <OutPort c={{ kind: 'condT', nodeId: n.id }} />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-red-600 text-right">{n.type === 'ab_split' ? 'B' : n.type === 'biz_hours' ? "✖ 已关闭" : n.type === 'api_call' ? "✖ 失败" : "✖ 否/错误"}</span>
                      <OutPort c={{ kind: 'condF', nodeId: n.id }} />
                    </div>
                  </>
                )}
                {(n.type === 'text' || n.type === 'interactive') && <p className="text-[11px] text-gray-400 line-clamp-2 whitespace-pre-wrap">{n.text}</p>}
                {n.type === 'interactive' && [...(n.ctaUrl ? [{ text: n.ctaText, url: n.ctaUrl }] : []), ...(n.ctas || []).filter(c => c.url)].map((c, i) => (
                  <div key={`cta${i}`} className="flex justify-end">
                    <span className="inline-flex items-center gap-1 text-[11px] px-3 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-full font-medium" title={c.url}>🔗 {c.text || "打开"}</span>
                  </div>
                ))}
                {n.type === 'interactive' && n.mode !== 'cta' && (n.mode === 'buttons' ? n.buttons : n.rows).map((opt, i) => (
                  (opt as FlowButton | FlowRow).title ? (
                    <div key={i} className="flex items-center justify-end gap-2">
                      <span className="text-xs text-gray-700 text-right">{(opt as FlowButton).title}</span>
                      <OutPort c={{ kind: n.mode === 'buttons' ? 'btn' : 'row', nodeId: n.id, idx: i }} />
                    </div>
                  ) : null
                ))}
                {n.type === 'template' && n.buttons.map((b, i) => (
                  b.title ? (
                    <div key={i} className="flex items-center justify-end gap-2">
                      <span className="text-xs text-gray-700 text-right">{b.title}</span>
                      <OutPort c={{ kind: 'btn', nodeId: n.id, idx: i }} />
                    </div>
                  ) : null
                ))}
                {n.type !== 'condition' && (
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-dashed border-gray-100">
                    <span className="text-[10px] text-gray-400">{n.type === 'question' || n.type === 'wait_input' ? "回答后 →" : n.type === 'delay' ? "延迟后→" : "然后发送→"}</span>
                    <OutPort c={{ kind: 'next', nodeId: n.id }} />
                  </div>
                )}
              </div>
            </div>
            );
          })}

          {nodes.length === 0 && (
            <div className="absolute left-[360px] top-[90px] w-[340px] bg-white border-2 border-dashed border-gray-200 rounded-2xl p-5 text-center">
              <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto"><Plus className="w-5 h-5" /></span>
              <p className="text-sm font-semibold text-gray-800 mt-3">开始构建你的流程</p>
              <p className="text-xs text-gray-500 mt-1">从左侧面板中选择一个组件，或使用顶部栏上的“添加步骤”。</p>
            </div>
          )}
        </div>
      </div>

      {connectFrom && (
        <div className="absolute left-1/2 -translate-x-1/2 top-3 z-20 flex items-center gap-2 bg-amber-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow pointer-events-none">
          <MousePointerClick className="w-3.5 h-3.5" /> 现在点击卡连接·Esc取消
        </div>
      )}

      {/* Canvas tools */}
      <div className="absolute left-3 bottom-4 z-20 flex flex-col bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <button type="button" title={"放大"} onClick={() => setZoom(z => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))} className="p-1.5 hover:bg-gray-50 text-gray-500"><ZoomIn className="w-4 h-4" /></button>
        <button type="button" title={"缩小"} onClick={() => setZoom(z => Math.max(0.2, Math.round((z - 0.1) * 10) / 10))} className="p-1.5 hover:bg-gray-50 text-gray-500 border-t border-gray-100"><ZoomOut className="w-4 h-4" /></button>
        <button type="button" title={"重置变焦"} onClick={() => setZoom(1)} className="p-1.5 hover:bg-gray-50 text-gray-500 border-t border-gray-100"><Maximize className="w-4 h-4" /></button>
        <button type="button" title={"自动排列卡片"} onClick={autoArrange} className="p-1.5 hover:bg-gray-50 text-gray-500 border-t border-gray-100"><GitBranch className="w-4 h-4" /></button>
        <button type="button" title={showGrid ? "隐藏网格" : "显示网格"} onClick={() => setShowGrid(g => !g)} className={`p-1.5 hover:bg-gray-50 border-t border-gray-100 ${showGrid ? 'text-emerald-600' : 'text-gray-400'}`}><LayoutGrid className="w-4 h-4" /></button>
        <span className="px-1 py-1 text-[9px] font-bold text-gray-400 text-center border-t border-gray-100">{Math.round(zoom * 100)}%</span>
      </div>
      </div>
      </div>

      <Modal isOpen={!!editing} onClose={requestCloseModal} guard={false} title={editing && nodes.some(n => n.id === editing.id) ? "编辑步骤" : "添加步骤"} size="lg">
        {editing && (
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {(() => {
              const info = paletteInfo(editing.type, editing.type === 'action' ? editing.actionType : undefined);
              const st = groupStyle(info.group);
              return (
                <div className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${st.head}`}>
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${st.icon}`}>{info.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold text-gray-400 tracking-wider uppercase">{info.group}</p>
                    <p className="text-sm font-bold text-gray-800 truncate">{info.label}</p>
                  </div>
                </div>
              );
            })()}
            <Input label={"步骤名称"} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder={"例如欢迎留言"} />

            {editing.type === 'text' && (
              <>
                <Textarea label={"回复文字"} rows={4} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} placeholder={"您的留言..."} />
                <VarChips onInsert={v => setEditing({ ...editing, text: (editing.text || '') + v })} />
              </>
            )}

            {editing.type === 'media' && (
              <>
                <Select label={"媒体类型"} value={editing.mediaType} onChange={e => setEditing({ ...editing, mediaType: e.target.value })}
                  options={[{ value: 'image', label: "图片" }, { value: 'video', label: "视频" }, { value: 'document', label: "文件" }, { value: 'audio', label: "音频" }, { value: 'sticker', label: "贴纸 (WebP)" }]} />
                <div className="flex items-end gap-2">
                  <div className="flex-1"><Input label={"媒体网址"} value={editing.mediaUrl} onChange={e => setEditing({ ...editing, mediaUrl: e.target.value })} placeholder="https://..." /></div>
                  <input ref={fileRef} type="file" className="hidden" onChange={e => handleUpload(e, 'mediaUrl')} />
                  <Button variant="outline" onClick={() => fileRef.current?.click()} loading={uploading} icon={<Upload className="w-4 h-4" />}>上传</Button>
                </div>
                <Textarea label={"标题（可选）"} rows={2} value={editing.caption} onChange={e => setEditing({ ...editing, caption: e.target.value })} />
              </>
            )}

            {editing.type === 'action' && (
              <>
                <Select label={"行动"} value={editing.actionType} onChange={e => setEditing({ ...editing, actionType: e.target.value })}
                  options={[
                    
                    { value: 'add_tag', label: "添加标签/标签以联系" },
                    { value: 'remove_tag', label: "从联系人中删除标记/标签" },
                    { value: 'update_contact', label: "更新联系人字段/变量" },
                    { value: 'assign_agent', label: "将聊天分配给客服人员" },
                    { value: 'unassign_agent', label: "从此聊天中取消指定客服人员" },
                    { value: 'add_to_campaign', label: "将联系人添加到营销活动" },
                    
                    { value: 'add_note', label: "为联系人添加备注" },
                    { value: 'ai_on', label: "为此聊天打开 AI" },
                    { value: 'ai_off', label: "关闭此聊天的人工智能" },
                    
                    { value: 'assign_team', label: "将聊天分配给团队" },
                    { value: 'conv_status', label: "更改聊天状态（开放/待处理/已解决）" },
                    { value: 'set_priority', label: "设置引导优先级" },
                    { value: 'create_followup', label: "创建后续提醒" },

                  ]} />
                
                {(editing.actionType === 'add_tag' || editing.actionType === 'remove_tag') && (
                  <Select label={editing.actionType === 'remove_tag' ? "要删除的标记/标签" : "标签/标签"} value={editing.actionTag} onChange={e => setEditing({ ...editing, actionTag: e.target.value })}
                    options={[{ value: '', label: "选择标签" }, ...tags.map(t => ({ value: t._id, label: t.name }))]} />
                )}
                {editing.actionType === 'update_contact' && (
                  <>
                    <Input label={"字段/变量名称"} value={editing.fieldName} onChange={e => setEditing({ ...editing, fieldName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })} placeholder={"姓名、电子邮件或任何自定义字段，例如城市"} />
                    <Input label={"值"} value={editing.fieldValue} onChange={e => setEditing({ ...editing, fieldValue: e.target.value })} placeholder={"例如{最后回复}"} />
                    <p className="text-xs text-gray-500">使用 <span className="font-mono">姓名</span> / <span className="font-mono">电子邮件</span> 更新联系人本身；其他任何内容都保存为可用作的自定义字段 <span className="font-mono">{"{字段}"}</span> 在以后的消息中。变量如 <span className="font-mono">{'{last_reply}'}</span> 在保存前被替换。</p>
                  </>
                )}
                {editing.actionType === 'add_to_campaign' && (
                  <Select label={"营销活动"} value={editing.campaignId} onChange={e => setEditing({ ...editing, campaignId: e.target.value })}
                    options={[{ value: '', label: "选择活动" }, ...campaigns.map(c => ({ value: c._id, label: c.name }))]} />
                )}
                
                {editing.actionType === 'add_note' && (
                  <Textarea label={"注意"} rows={2} value={editing.noteText} onChange={e => setEditing({ ...editing, noteText: e.target.value })} placeholder={"例如询问定价 - 跟进"} />
                )}
                
                {editing.actionType === 'assign_agent' && (
                  <Select label={"客服"} value={editing.actionAgent} onChange={e => setEditing({ ...editing, actionAgent: e.target.value })}
                    options={[{ value: '', label: "选择代理" }, ...agents.map(a => ({ value: a._id, label: a.name }))]} />
                )}
                {editing.actionType === 'assign_team' && (
                  <Select label={"团队"} value={editing.actionTeam} onChange={e => setEditing({ ...editing, actionTeam: e.target.value })}
                    options={[{ value: '', label: teams.length ? 'Select team' : 'No team created yet' }, ...teams.map(t => ({ value: t._id, label: t.name }))]} />
                )}
                {editing.actionType === 'conv_status' && (
                  <Select label={"聊天状态"} value={editing.convStatus || 'open'} onChange={e => setEditing({ ...editing, convStatus: e.target.value })}
                    options={[{ value: 'open', label: "打开" }, { value: 'pending', label: "待定" }, { value: 'resolved', label: "已解决/已关闭" }]} />
                )}
                {editing.actionType === 'set_priority' && (
                  <Select label={"优先"} value={editing.priority || 'normal'} onChange={e => setEditing({ ...editing, priority: e.target.value })}
                    options={[{ value: 'low', label: "低" }, { value: 'normal', label: "正常" }, { value: 'high', label: "高" }]} />
                )}
                {editing.actionType === 'create_followup' && (
                  <>
                    <Input label={"提醒文字"} value={editing.followupText} onChange={e => setEditing({ ...editing, followupText: e.target.value })} placeholder={"例如回电询问价格"} />
                    <Input label={"（小时）后提醒"} type="number" value={String(editing.followupInHours ?? 24)} onChange={e => setEditing({ ...editing, followupInHours: Number(e.target.value) || 0 })} />
                    <p className="text-xs text-gray-500">提醒显示在聊天备注中，并在到期时通知客服人员。</p>
                  </>
                )}
                
                <Textarea label={"确认消息（可选）"} rows={2} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} placeholder={"例如操作已完成 ✅"} />
                <VarChips onInsert={v => setEditing({ ...editing, text: (editing.text || '') + v })} />
                
              </>
            )}

            {editing.type === 'email' && (
              <>
                <Input label={"收件人（留空以使用联系人的电子邮件）"} value={editing.emailTo} onChange={e => setEditing({ ...editing, emailTo: e.target.value })} placeholder="team@company.com" />
                <Input label={"主题"} value={editing.emailSubject} onChange={e => setEditing({ ...editing, emailSubject: e.target.value })} placeholder={"例如来自 {full_name} 的新询问"} />
                <Textarea label={"电子邮件正文"} rows={5} value={editing.emailBody} onChange={e => setEditing({ ...editing, emailBody: e.target.value })} placeholder={"嗨{名字}，..."} />
                <VarChips onInsert={v => setEditing({ ...editing, emailBody: (editing.emailBody || '') + v })} />
                <p className="text-xs text-gray-500">通过您的 SMTP 设置发送（管理 → 设置 → 电子邮件）。此卡不会发出任何 WhatsApp 消息 — 流程继续“然后发送 →”。</p>
              </>
            )}

            {editing.type === 'location' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input label={"纬度"} value={editing.locLat} onChange={e => setEditing({ ...editing, locLat: e.target.value })} placeholder="17.385044" />
                  <Input label={"经度"} value={editing.locLng} onChange={e => setEditing({ ...editing, locLng: e.target.value })} placeholder="78.486671" />
                </div>
                <Input label={"地名"} value={editing.locName} onChange={e => setEditing({ ...editing, locName: e.target.value })} placeholder={"例如诊所 — 库卡特帕里"} />
                <Input label={"地址"} value={editing.locAddress} onChange={e => setEditing({ ...editing, locAddress: e.target.value })} placeholder={"地图下方显示完整地址"} />
                <p className="text-xs text-gray-500">发送 WhatsApp 地图图钉。从 Google 地图复制坐标（右键单击该地点 → 第一行是纬度、经度值）。受 WhatsApp Cloud API 号码支持。</p>
              </>
            )}

            {editing.type === 'ai_reply' && (
              <>
                <Textarea label={"AI指令（可选）"} rows={4} value={editing.aiPrompt} onChange={e => setEditing({ ...editing, aiPrompt: e.target.value })} placeholder={"例如回答客户关于我们课程的问题。简短而友好，并在最后询问他们所在的城市。"} />
                <Input label={"回复中的最大字数"} type="number" value={String(editing.aiMaxWords || 60)} onChange={e => setEditing({ ...editing, aiMaxWords: Math.max(10, Number(e.target.value) || 60) })} />
                <p className="text-xs text-gray-500">AI 使用聊天的最后 10 条消息和您的知识库自行编写回复。将说明留空以使用 AI 设置提示。需要 AI 设置中的 AI 提供者密钥。</p>
              </>
            )}

            {editing.type === 'subflow' && (
              <>
                <Select label={"运行流程"} value={editing.subflowId} onChange={e => setEditing({ ...editing, subflowId: e.target.value })}
                  options={[{ value: '', label: "选择流程" }, ...otherFlows.map(f => ({ value: f._id, label: f.name }))]} />
                <p className="text-xs text-gray-500">为该客户从其起始卡运行所选流程，然后在此处继续“然后发送→”。保持子流简短——限制嵌套以避免循环。</p>
              </>
            )}

            {editing.type === 'form' && (
              <>
                <Select label={"发送表格"} value={editing.formId} onChange={e => setEditing({ ...editing, formId: e.target.value })}
                  options={[{ value: '', label: "选择表格" }, ...forms.map(f => ({ value: f._id, label: f.name + (f.waFlow?.status === 'published' ? ' (WhatsApp form ready)' : '') }))]} />
                <Select label={"如何发送"} value={editing.formMode || 'flow'} onChange={e => setEditing({ ...editing, formMode: e.target.value as 'flow' | 'link' })}
                  options={[{ value: 'flow', label: "原生 WhatsApp 表单（在 WhatsApp 内打开）" }, { value: 'link', label: "表格的网络链接" }]} />
                {(editing.formMode || 'flow') === 'flow' && (
                  <Input label={"按钮文本"} value={editing.formCta || ''} onChange={e => setEditing({ ...editing, formCta: e.target.value })} placeholder={"填写表格"} />
                )}
                <Textarea label={"消息文本（可选）"} rows={3} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} placeholder={"请填写此简短表格，以便我们更快地为您提供帮助。"} />
                <p className="text-xs text-gray-500">从自动化 → 表单发送表单。本机模式需要将该表单发布为 WhatsApp Flow（表单页面 → 发布为 WhatsApp 表单）；如果未发布，或在 Telegram/QR 聊天中，则会发送表单的网络链接。</p>
              </>
            )}

            {editing.type === 'sheets' && (
              <p className="text-xs text-gray-500">将此联系人（姓名、电话、标签、阶段）添加为集成页面上连接的 Google 表格中的新行。此卡不会发出任何 WhatsApp 消息 — 流程继续“然后发送 →”。</p>
            )}

            {editing.type === 'gcontacts' && (
              <>
                {!gwConnected && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-xs text-amber-800">
                      Google Workspace 未连接。添加到下面 <strong>集成 → Google Workspace</strong> 使用这张卡。
                    </p>
                  </div>
                )}
                <Input label={"联系人组/标签（可选）"} value={editing.gwLabel || ''} onChange={e => setEditing({ ...editing, gwLabel: e.target.value })} placeholder={"WhatsApp 领先"} />
                <Textarea label={"与联系人一起保存的注释（可选）"} rows={2} value={editing.gwMessage || ''} onChange={e => setEditing({ ...editing, gwMessage: e.target.value })}
                  placeholder={"WhatsApp 机器人流程的线索 — {full_name}"} />
                <p className="text-xs text-gray-500">将此潜在客户的姓名、电话和电子邮件保存在集成 → Google Workspace 下设置的委托用户的 Google 通讯录中（服务帐号需要 <strong>联系人</strong> 域范围授权的范围）。具有相同电话号码的联系人不会被添加两次。此卡不会发出任何 WhatsApp 消息 — 流程继续“然后发送 →”。</p>
              </>
            )}

            {(editing.type === 'gmeet' || editing.type === 'gdocs' || editing.type === 'gforms') && (
              <>
                {!gwConnected && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-xs text-amber-800">
                      Google Workspace 未连接。添加到下面 <strong>集成 → Google Workspace</strong> 使用这张卡。
                    </p>
                  </div>
                )}

                {editing.type === 'gmeet' && (
                  <>
                    <Input label={"会议标题"} value={editing.gwTitle || ''} onChange={e => setEditing({ ...editing, gwTitle: e.target.value })} placeholder={"与 {full_name} 会面"} />
                    <Input label={"开始日期和时间"} value={editing.gwStart || ''} onChange={e => setEditing({ ...editing, gwStart: e.target.value })} placeholder={"2026-09-01 14:00（空白=从现在开始1小时）"} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input label={"持续时间（分钟）"} type="number" value={String(editing.gwDuration ?? 30)} onChange={e => setEditing({ ...editing, gwDuration: Number(e.target.value) || 30 })} placeholder="30" />
                      <Input label={"时区（可选）"} value={editing.gwTimezone || ''} onChange={e => setEditing({ ...editing, gwTimezone: e.target.value })} placeholder={"亚洲/加尔各答"} />
                    </div>
                  </>
                )}

                {editing.type === 'gdocs' && (
                  <>
                    <Input label={"模板文档 ID"} value={editing.gwTemplateId || ''} onChange={e => setEditing({ ...editing, gwTemplateId: e.target.value })} placeholder={"1AbC...xyz（来自文档 URL）"} />
                    <Input label={"新文档标题"} value={editing.gwTitle || ''} onChange={e => setEditing({ ...editing, gwTitle: e.target.value })} placeholder={"{full_name} 的合同"} />
                    <Textarea label={"替换件（可选）"} rows={3} value={editing.gwReplacements || ''} onChange={e => setEditing({ ...editing, gwReplacements: e.target.value })}
                      placeholder={"每行一个： key=value name={full_name} amount=4999"} />
                  </>
                )}

                {editing.type === 'gforms' && (
                  <Input label={"表格 ID"} value={editing.gwFormId || ''} onChange={e => setEditing({ ...editing, gwFormId: e.target.value })} placeholder={"1AbC...xyz（来自表单 URL）"} />
                )}

                <Textarea label={"带有链接的消息（可选）"} rows={2} value={editing.gwMessage || ''} onChange={e => setEditing({ ...editing, gwMessage: e.target.value })}
                  placeholder={editing.type === 'gmeet' ? "Aapki 会议链接：" : editing.type === 'gdocs' ? "Aapka 文档 taiyar hai：" : "请填写我们的表格："} />
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={editing.gwSendLink !== false} onChange={e => setEditing({ ...editing, gwSendLink: e.target.checked })} className="rounded" />
                  将链接发送给 WhatsApp 上的联系人
                </label>
                <p className="text-xs text-gray-500">
                  使用集成 → Google Workspace 中的服务帐号。代币如 {"{全名}"}, {"{phone_number}\n在之前填写"} and {'{{contact.name}}'} are filled in before the {editing.type === 'gmeet' ? "会议已创建" : editing.type === 'gdocs' ? "文档已创建" : "消息已发送"}。如果无法创建链接，流程仍会继续“然后发送→”。
                </p>
              </>
            )}

            {editing.type === 'webhook' && (
              <>
                <Input label="Webhook URL" value={editing.webhookUrl} onChange={e => setEditing({ ...editing, webhookUrl: e.target.value })} placeholder="https://example.com/api/webhook" />
                <Select label={"HTTP方法"} value={editing.webhookMethod || 'POST'} onChange={e => setEditing({ ...editing, webhookMethod: e.target.value })}
                  options={[{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }, { value: 'PUT', label: 'PUT' }, { value: 'DELETE', label: 'DELETE' }]} />
                {(editing.webhookMethod || 'POST') !== 'GET' && (editing.webhookMethod || 'POST') !== 'DELETE' && (
                  <Textarea label={"请求正文 (JSON)"} rows={4} value={editing.webhookBody} onChange={e => setEditing({ ...editing, webhookBody: e.target.value })} placeholder='{"phone": "{phone_number}", "name": "{full_name}"}' />
                )}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">自定义标头（可选）</label>
                  {(editing.webhookHeaders || []).map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={h.key} onChange={e => setEditing({ ...editing, webhookHeaders: editing.webhookHeaders.map((x, xi) => xi === i ? { ...x, key: e.target.value } : x) })}
                        placeholder={"标头名称"} className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                      <input value={h.value} onChange={e => setEditing({ ...editing, webhookHeaders: editing.webhookHeaders.map((x, xi) => xi === i ? { ...x, value: e.target.value } : x) })}
                        placeholder={"值"} className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                      <button onClick={() => setEditing({ ...editing, webhookHeaders: editing.webhookHeaders.filter((_, xi) => xi !== i) })}><Trash2 className="w-4 h-4 text-red-400" /></button>
                    </div>
                  ))}
                  <button onClick={() => setEditing({ ...editing, webhookHeaders: [...(editing.webhookHeaders || []), { key: '', value: '' }] })} className="text-xs text-emerald-600 font-medium">+ 添加标题</button>
                </div>
                <VarChips onInsert={v => setEditing({ ...editing, webhookBody: (editing.webhookBody || '') + v })} />
                <Textarea label={"确认消息（可选）"} rows={2} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} placeholder={"使用 {webhook_response} 包含 API 响应"} />
                <p className="text-xs text-gray-500">留空以静默运行 webhook（不发送 WhatsApp 消息）。使用 {'{webhook_response}'} 包括响应正文。</p>
              </>
            )}

            {editing.type === 'api_call' && (
              <>
                <Input label="API URL" value={editing.webhookUrl} onChange={e => setEditing({ ...editing, webhookUrl: e.target.value })} placeholder="https://api.example.com/v1/orders/{order_id}" />
                <Select label={"HTTP方法"} value={editing.webhookMethod || 'POST'} onChange={e => setEditing({ ...editing, webhookMethod: e.target.value })}
                  options={[{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }, { value: 'PUT', label: 'PUT' }, { value: 'PATCH', label: 'PATCH' }, { value: 'DELETE', label: 'DELETE' }]} />
                {(editing.webhookMethod || 'POST') !== 'GET' && (editing.webhookMethod || 'POST') !== 'DELETE' && (
                  <Textarea label={"请求正文 (JSON)"} rows={4} value={editing.webhookBody} onChange={e => setEditing({ ...editing, webhookBody: e.target.value })} placeholder='{"phone": "{phone_number}", "name": "{full_name}"}' />
                )}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">标头（可选）</label>
                  {(editing.webhookHeaders || []).map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={h.key} onChange={e => setEditing({ ...editing, webhookHeaders: editing.webhookHeaders.map((x, xi) => xi === i ? { ...x, key: e.target.value } : x) })}
                        placeholder={"标头名称（例如授权）"} className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                      <input value={h.value} onChange={e => setEditing({ ...editing, webhookHeaders: editing.webhookHeaders.map((x, xi) => xi === i ? { ...x, value: e.target.value } : x) })}
                        placeholder={"值"} className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                      <button onClick={() => setEditing({ ...editing, webhookHeaders: editing.webhookHeaders.filter((_, xi) => xi !== i) })}><Trash2 className="w-4 h-4 text-red-400" /></button>
                    </div>
                  ))}
                  <button onClick={() => setEditing({ ...editing, webhookHeaders: [...(editing.webhookHeaders || []), { key: '', value: '' }] })} className="text-xs text-emerald-600 font-medium">+ 添加标题</button>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">将响应值保存为变量</label>
                  {(editing.apiSaveVars || []).map((m, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={m.path} onChange={e => setEditing({ ...editing, apiSaveVars: (editing.apiSaveVars || []).map((x, xi) => xi === i ? { ...x, path: e.target.value } : x) })}
                        placeholder={"响应路径（例如data.order.status）"} className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg font-mono" />
                      <input value={m.varName} onChange={e => setEditing({ ...editing, apiSaveVars: (editing.apiSaveVars || []).map((x, xi) => xi === i ? { ...x, varName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') } : x) })}
                        placeholder={"变量名称"} className="w-40 text-sm px-3 py-1.5 border border-gray-200 rounded-lg font-mono" />
                      <button onClick={() => setEditing({ ...editing, apiSaveVars: (editing.apiSaveVars || []).filter((_, xi) => xi !== i) })}><Trash2 className="w-4 h-4 text-red-400" /></button>
                    </div>
                  ))}
                  <button onClick={() => setEditing({ ...editing, apiSaveVars: [...(editing.apiSaveVars || []), { path: '', varName: '' }] })} className="text-xs text-emerald-600 font-medium">+ 添加变量</button>
                  <p className="text-xs text-gray-500">将路径留空以保存整个响应。保存的变量可以用作 <span className="font-mono">{"{变量名}"}</span> 在后面的牌和条件中。</p>
                </div>
                <VarChips onInsert={v => setEditing({ ...editing, webhookBody: (editing.webhookBody || '') + v })} />
                <Textarea label={"通话后消息（可选）"} rows={2} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} placeholder={"您的订单状态：{order_status}"} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-emerald-700 mb-1">✔ 成功 → 发送</label>
                    <MultiNextPicker excludeId={editing.id} value={editing.nextTrue || ''} onChange={v => setEditing({ ...editing, nextTrue: v })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-red-600 mb-1">✖ 失败 → 发送</label>
                    <MultiNextPicker excludeId={editing.id} value={editing.nextFalse || ''} onChange={v => setEditing({ ...editing, nextFalse: v })} />
                  </div>
                </div>
                <p className="text-xs text-gray-500">调用 API 时有 15 秒超时。任何错误或非 2xx 状态都会进入失败分支。如果两个分支都为空，则流程继续“然后发送→”。使用 <span className="font-mono">{'{api_response}'}</span> 在消息中包括原始响应。</p>
              </>
            )}

            {editing.type === 'wait_input' && (
              <>
                <Input label={"将答案保存为变量（可选）"} value={editing.answerVar} onChange={e => setEditing({ ...editing, answerVar: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })} placeholder={"例如城市"} />
                <Textarea label={"等待前的消息（可选）"} rows={2} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} placeholder={"留空静静等待"} />
                <Input label={"无回复超时（小时，0 = 24 小时）"} type="number" value={String(editing.waitTimeoutHours || '')} onChange={e => setEditing({ ...editing, waitTimeoutHours: Math.max(0, Number(e.target.value) || 0) })} placeholder="e.g. 24" />
                <Select label={"如果超时没有回复，请转到 →"} value={editing.nextTimeout || ''} onChange={e => setEditing({ ...editing, nextTimeout: e.target.value })}
                  options={[{ value: '', label: "什么都没有（停在这里）" }, ...nodes.filter(n => n.id !== editing.id).map(n => ({ value: n.id, label: n.name || n.type }))]} />
                <p className="text-xs text-gray-500">流程在此暂停，直到客户发送下一条消息 - 除非您填写上面的消息，否则不会提出任何问题。回复可作为 <span className="font-mono">{'{last_reply}'}</span>{editing.answerVar ? <> and <span className="font-mono">{'{' + editing.answerVar + '}'}</span></> : null} 在下一张牌中。</p>
              </>
            )}

            {editing.type === 'question' && (
              <>
                <Textarea label={"问题文本"} rows={3} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} placeholder={"例如Aapki 位置 kya hai？"} />
                <VarChips onInsert={v => setEditing({ ...editing, text: (editing.text || '') + v })} />
                <Input label={"将答案保存为变量（可选）"} value={editing.answerVar} onChange={e => setEditing({ ...editing, answerVar: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })} placeholder={"例如地点"} />
                <p className="text-xs text-gray-500">流程在此暂停并等待客户键入的回复（无按钮）。答案已保存至联系人{editing.answerVar ? <> as <span className="font-mono">{'{' + editing.answerVar + '}'}</span>，可在以后的消息中使用</> : null}，然后流程继续“然后发送→”。您还可以使用 <span className="font-mono">{'{last_reply}'}</span> 在下一条消息中。</p>
                <Input label={"无回复超时（小时，0 = 无限期等待）"} type="number" value={String(editing.waitTimeoutHours || '')} onChange={e => setEditing({ ...editing, waitTimeoutHours: Math.max(0, Number(e.target.value) || 0) })} placeholder="e.g. 24" />
                <Select label={"如果超时没有回复，请转到 →"} value={editing.nextTimeout || ''} onChange={e => setEditing({ ...editing, nextTimeout: e.target.value })}
                  options={[{ value: '', label: "— 停止（无后续） —" }, ...nodes.filter(n => n.id !== editing.id).map(n => ({ value: n.id, label: n.name || (n.text || '').slice(0, 30) || n.type }))]} />
                <p className="text-xs text-gray-500">如果客户在超时时间内没有回复，流程将跳转到所选卡片（用于后续/临时提醒）。设置 0 小时以永不超时。</p>
              </>
            )}

            {editing.type === 'delay' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Input label={"等待"} type="number" value={String(editing.delaySeconds || '')} onChange={e => setEditing({ ...editing, delaySeconds: Math.max(0, Number(e.target.value) || 0) })} placeholder="30" />
                  <Select label={"单位"} value={editing.delayUnit || 'seconds'} onChange={e => setEditing({ ...editing, delayUnit: e.target.value })}
                    options={[{ value: 'seconds', label: "秒" }, { value: 'minutes', label: "分钟" }, { value: 'hours', label: "小时" }, { value: 'days', label: "天" }]} />
                </div>
                <p className="text-xs text-gray-500">流程在发送下一张卡之前等待这么长时间。即使重新启动，超过 1 小时的延迟也会被可靠地保存和恢复（用于每日提醒）。</p>
              </>
            )}

            {editing.type === 'condition' && (
              <>
                <Select label={"检查什么？"} value={editing.condField || 'reply'} onChange={e => setEditing({ ...editing, condField: e.target.value })}
                  options={[
                    { value: 'reply', label: "客户的最后回复文本" },
                    { value: 'variable', label: "保存的变量（来自问题卡）" },
                    { value: 'tag', label: "联系人有标签" },
                    
                    { value: 'field', label: "联系人字段（姓名/电子邮件/电话/自定义）" },
                  ]} />
                {editing.condField === 'field' && (
                  <Input label={"字段名称"} value={editing.fieldName} onChange={e => setEditing({ ...editing, fieldName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })} placeholder={"姓名、电子邮件、电话或任何自定义字段"} />
                )}
                
                {editing.condField === 'variable' && (
                  <Input label={"变量名称"} value={editing.condVarName} onChange={e => setEditing({ ...editing, condVarName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })} placeholder={"例如地点"} />
                )}
                {editing.condField !== 'tag' && (
                  <Select label={"匹配类型"} value={editing.condOp || 'contains'} onChange={e => setEditing({ ...editing, condOp: e.target.value })}
                    options={[
                      { value: 'contains', label: "包含" },
                      { value: 'equals', label: "完全等于" },
                      { value: 'exists', label: "不为空（任何值）" },
                    ]} />
                )}
                {editing.condField !== 'stage' && (editing.condField === 'tag' || editing.condOp !== 'exists') && (
                  editing.condField === 'tag'
                    ? <Select label={"标签"} value={editing.condValue} onChange={e => setEditing({ ...editing, condValue: e.target.value })}
                        options={[{ value: '', label: "选择标签" }, ...tags.map(t => ({ value: t.name, label: t.name }))]} />
                    : <Input label={"要检查的值"} value={editing.condValue} onChange={e => setEditing({ ...editing, condValue: e.target.value })} placeholder={"例如是的"} />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-emerald-700 mb-1">✔ 如果是/真 → 发送</label>
                    <MultiNextPicker excludeId={editing.id} value={editing.nextTrue || ''} onChange={v => setEditing({ ...editing, nextTrue: v })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-red-600 mb-1">✖ 如果否/假 → 发送</label>
                    <MultiNextPicker excludeId={editing.id} value={editing.nextFalse || ''} onChange={v => setEditing({ ...editing, nextFalse: v })} />
                  </div>
                </div>
              </>
            )}

            {editing.type === 'set_variable' && (
              <>
                <Input label={"变量名称"} value={editing.varName} onChange={e => setEditing({ ...editing, varName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })} placeholder={"例如城市"} />
                <Input label={"值"} value={editing.varValue} onChange={e => setEditing({ ...editing, varValue: e.target.value })} placeholder={"例如{最后回复}"} />
                <VarChips onInsert={v => setEditing({ ...editing, varValue: (editing.varValue || '') + v })} />
                <p className="text-xs text-gray-500">作为自定义字段保存在联系人上，以便稍后用作 <span className="font-mono">{"{城市}"}</span> 或在条件卡中检查。</p>
              </>
            )}

            {editing.type === 'wait_until' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input label={"日期"} type="date" value={editing.waitDate} onChange={e => setEditing({ ...editing, waitDate: e.target.value })} />
                  <Input label={"时间（IST）"} type="time" value={editing.waitTime || '10:00'} onChange={e => setEditing({ ...editing, waitTime: e.target.value })} />
                </div>
                <p className="text-xs text-gray-500">流程暂停并在此确切的日期和时间继续。在 24 小时窗口之外，只能交付经过批准的模板卡。</p>
              </>
            )}

            {editing.type === 'biz_hours' && (
              <>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={!!editing.waitForOpen} onChange={e => setEditing({ ...editing, waitForOpen: e.target.checked })} />
                  营业时间以外，请等到我们开门（而不是选择 No 分行）
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-emerald-700 mb-1">✔ 立即打开 → 发送</label>
                    <MultiNextPicker excludeId={editing.id} value={editing.nextTrue || ''} onChange={v => setEditing({ ...editing, nextTrue: v })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-red-600 mb-1">✖ 现已关闭 → 发送</label>
                    <MultiNextPicker excludeId={editing.id} value={editing.nextFalse || ''} onChange={v => setEditing({ ...editing, nextFalse: v })} />
                  </div>
                </div>
                <p className="text-xs text-gray-500">使用自动化 → 外出 (IST) 中设置的工作时间。</p>
              </>
            )}

            {editing.type === 'goto' && (
              <>
                <Select label={"跳转至卡片"} value={editing.gotoNode} onChange={e => setEditing({ ...editing, gotoNode: e.target.value })}
                  options={[{ value: '', label: "选择卡" }, ...nodes.filter(n => n.id !== editing.id).map(n => ({ value: n.id, label: n.name || n.type }))]} />
                <p className="text-xs text-gray-500">继续选定卡的流程 — 对于循环回菜单很有用。</p>
              </>
            )}

            {editing.type === 'ab_split' && (
              <>
                <Input label={"分支机构 A 的客户百分比"} type="number" value={String(editing.splitPercent ?? 50)} onChange={e => setEditing({ ...editing, splitPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-emerald-700 mb-1">A → 发送</label>
                    <MultiNextPicker excludeId={editing.id} value={editing.nextTrue || ''} onChange={v => setEditing({ ...editing, nextTrue: v })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-indigo-600 mb-1">B → 发送</label>
                    <MultiNextPicker excludeId={editing.id} value={editing.nextFalse || ''} onChange={v => setEditing({ ...editing, nextFalse: v })} />
                  </div>
                </div>
              </>
            )}

            {editing.type === 'end' && (
              <p className="text-xs text-gray-500">为客户停止此流程并清除任何挂起的等待，因此不再发送卡。</p>
            )}

            {editing.type === 'preset' && (
              <>
                <Select label={"预设消息（已保存回复）"} value={editing.presetId}
                  onChange={e => setEditing({ ...editing, presetId: e.target.value })}
                  options={[{ value: '', label: presets.length ? 'Select preset message' : 'No preset saved yet' }, ...presets.map(p => ({ value: p._id, label: p.name }))]} />
                <p className="text-xs text-gray-500 -mt-1">发送保存在聊天 → 预设消息中的预设（文本、媒体、按钮、列表或轮播）——24 小时内免费，无模板费用。</p>
              </>
            )}

            {editing.type === 'template' && (
              <Select label={"WhatsApp 模板（付费）"} value={editing.templateName}
                onChange={e => {
                  const t = templates.find(x => x.name === e.target.value);
                  setEditing({ ...editing, templateName: e.target.value, templateLanguage: t?.language || 'en' });
                }}
                options={[{ value: '', label: "选择批准的模板" }, ...templates.map(t => ({ value: t.name, label: t.name }))]} />
            )}

            {editing.type === 'template' && editing.templateName && templateVarCount(editing.templateName) > 0 && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">模板变量</label>
                <p className="text-xs text-gray-500 -mt-1">每个的价值 {'{{n}}'}。使用代币： {'{name}'}, {'{phone}'}，或任何带 _ 的小写 Google Sheet/webhook 列（例如“费用金额”→ {'{fee_amount}'}）。空白 = 由模板的变量名称从联系人字段填充。</p>
                {Array.from({ length: templateVarCount(editing.templateName) }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-500 w-12">{`{{${i + 1}}}`}</span>
                    <input value={editing.templateVars?.[i] || ''} placeholder={i === 0 ? "{学生姓名}" : i === 1 ? '{fee_amount}' : i === 2 ? '{due_date}' : "{状态}"}
                      onChange={e => {
                        const vars = Array.from({ length: templateVarCount(editing.templateName) }, (_, k) => editing.templateVars?.[k] || '');
                        vars[i] = e.target.value;
                        setEditing({ ...editing, templateVars: vars });
                      }}
                      className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg font-mono" />
                  </div>
                ))}
              </div>
            )}

            {editing.type === 'template' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">模板按钮分支（可选）</label>
                <p className="text-xs text-gray-500 -mt-1">准确输入模板的按钮文本，然后选择当客户点击它时要发送的回复。</p>
                {editing.buttons.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={b.title} onChange={e => setEditing({ ...editing, buttons: editing.buttons.map((x, xi) => xi === i ? { ...x, title: e.target.value } : x) })}
                      placeholder={`模板按钮 ${i + 1} 文本`} maxLength={25}
                      className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                    <span className="text-xs text-gray-400">→</span>
                    <MultiNextPicker className="w-44" excludeId={editing.id} value={b.next}
                      onChange={v => setEditing({ ...editing, buttons: editing.buttons.map((x, xi) => xi === i ? { ...x, next: v } : x) })} />
                    {editing.buttons.length > 1 && <button onClick={() => setEditing({ ...editing, buttons: editing.buttons.filter((_, xi) => xi !== i) })}><Trash2 className="w-4 h-4 text-red-400" /></button>}
                  </div>
                ))}
                {editing.buttons.length < 3 && <button onClick={() => setEditing({ ...editing, buttons: [...editing.buttons, { title: '', next: '' }] })} className="text-xs text-emerald-600 font-medium">+ 添加按钮分支</button>}
              </div>
            )}

            {editing.type === 'interactive' && (
              <>
                <Textarea label={"正文"} rows={3} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} placeholder={"主要消息文本"} />
                <VarChips onInsert={v => setEditing({ ...editing, text: (editing.text || '') + v })} />
                <div className="grid grid-cols-2 gap-3">
                  <Select label={"标头类型（可选）"} value={editing.headerType || 'none'} onChange={e => setEditing({ ...editing, headerType: e.target.value })}
                    options={[{ value: 'none', label: "无" }, { value: 'text', label: "文本" }, { value: 'image', label: "图片" }, { value: 'video', label: "视频" }, { value: 'document', label: "文件" }]} />
                  <Input label={"页脚（可选）"} value={editing.footer} onChange={e => setEditing({ ...editing, footer: e.target.value })} />
                </div>
                {editing.headerType === 'text' && (
                  <Input label={"标题文本"} value={editing.header} onChange={e => setEditing({ ...editing, header: e.target.value })} maxLength={60} />
                )}
                {['image', 'video', 'document'].includes(editing.headerType) && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1"><Input label={`标头 ${editing.headerType} 网址`} value={editing.headerMediaUrl} onChange={e => setEditing({ ...editing, headerMediaUrl: e.target.value })} placeholder="https://..." /></div>
                    <input ref={headerFileRef} type="file" className="hidden" onChange={e => handleUpload(e, 'headerMediaUrl')} />
                    <Button variant="outline" onClick={() => headerFileRef.current?.click()} loading={uploading} icon={<Upload className="w-4 h-4" />}>上传</Button>
                  </div>
                )}
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <label className="flex items-center gap-1.5"><input type="radio" checked={editing.mode === 'buttons'} onChange={() => setEditing({ ...editing, mode: 'buttons' })} /> 回复按钮（最多 3 个）</label>
                  <label className="flex items-center gap-1.5"><input type="radio" checked={editing.mode === 'list'} onChange={() => setEditing({ ...editing, mode: 'list' })} /> 列表消息（最多 10 条）</label>
                  <label className="flex items-center gap-1.5"><input type="radio" checked={editing.mode === 'cta'} onChange={() => setEditing({ ...editing, mode: 'cta' })} /> CTA URL 按钮</label>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">{editing.mode === 'cta' ? "URL 按钮" : "URL 按钮（可选，与菜单一起发送）"}</label>
                  {editing.ctas.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={c.text} onChange={e => setEditing({ ...editing, ctas: editing.ctas.map((x, xi) => xi === i ? { ...x, text: e.target.value } : x) })}
                        placeholder={"按钮文本"} maxLength={20} className="w-44 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                      <input value={c.url} onChange={e => setEditing({ ...editing, ctas: editing.ctas.map((x, xi) => xi === i ? { ...x, url: e.target.value } : x) })}
                        placeholder="https://..." className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                      <button onClick={() => setEditing({ ...editing, ctas: editing.ctas.filter((_, xi) => xi !== i) })}><Trash2 className="w-4 h-4 text-red-400" /></button>
                    </div>
                  ))}
                  <button onClick={() => setEditing({ ...editing, ctas: [...editing.ctas, { text: '', url: '' }] })} className="text-xs text-emerald-600 font-medium">+ 添加 URL 按钮</button>
                  {editing.mode !== 'cta' && editing.ctas.length > 0 && <p className="text-xs text-gray-500">每个 URL 都会在菜单之后作为其自己的 URL 按钮消息发出（WhatsApp 只允许每条消息有一个 URL 按钮）。</p>}
                </div>
                {editing.mode === 'buttons' && (
                  <div className="space-y-2">
                    {editing.buttons.map((b, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={b.title} onChange={e => setEditing({ ...editing, buttons: editing.buttons.map((x, xi) => xi === i ? { ...x, title: e.target.value } : x) })}
                          placeholder={`按钮 ${i + 1} 文本（最多 20 个字符）`} maxLength={20}
                          className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                        <span className="text-xs text-gray-400">→</span>
                        <MultiNextPicker className="w-44" excludeId={editing.id} value={b.next}
                          onChange={v => setEditing({ ...editing, buttons: editing.buttons.map((x, xi) => xi === i ? { ...x, next: v } : x) })} />
                        {editing.buttons.length > 1 && <button onClick={() => setEditing({ ...editing, buttons: editing.buttons.filter((_, xi) => xi !== i) })}><Trash2 className="w-4 h-4 text-red-400" /></button>}
                      </div>
                    ))}
                    {editing.buttons.length < 3 && <button onClick={() => setEditing({ ...editing, buttons: [...editing.buttons, { title: '', next: '' }] })} className="text-xs text-emerald-600 font-medium">+ 添加按钮</button>}
                  </div>
                )}
                {editing.mode === 'list' && (
                  <div className="space-y-2">
                    <Input label={"列表按钮文本"} value={editing.listButtonText} onChange={e => setEditing({ ...editing, listButtonText: e.target.value })} placeholder={"选择"} />
                    {editing.rows.map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={r.title} onChange={e => setEditing({ ...editing, rows: editing.rows.map((x, xi) => xi === i ? { ...x, title: e.target.value } : x) })}
                          placeholder={`项目 ${i + 1} 标题`} maxLength={24} className="w-36 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                        <input value={r.description} onChange={e => setEditing({ ...editing, rows: editing.rows.map((x, xi) => xi === i ? { ...x, description: e.target.value } : x) })}
                          placeholder={"描述（可选）"} maxLength={72} className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                        <span className="text-xs text-gray-400">→</span>
                        <MultiNextPicker className="w-40" excludeId={editing.id} value={r.next}
                          onChange={v => setEditing({ ...editing, rows: editing.rows.map((x, xi) => xi === i ? { ...x, next: v } : x) })} />
                        {editing.rows.length > 1 && <button onClick={() => setEditing({ ...editing, rows: editing.rows.filter((_, xi) => xi !== i) })}><Trash2 className="w-4 h-4 text-red-400" /></button>}
                      </div>
                    ))}
                    {editing.rows.length < 10 && <button onClick={() => setEditing({ ...editing, rows: [...editing.rows, { title: '', description: '', next: '' }] })} className="text-xs text-emerald-600 font-medium">+ 添加列表项</button>}
                  </div>
                )}
              </>
            )}

            {editing.type !== 'condition' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{editing.type === 'question' ? "客户回答后，发送（可选 — 允许多个）" : editing.type === 'delay' ? "延迟后，发送（可选 — 允许多次）" : "发送后，还发送（可选 - 允许多次）"}</label>
                <MultiNextPicker excludeId={editing.id} value={editing.next} onChange={v => setEditing({ ...editing, next: v })} />
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              {nodes.some(n => n.id === editing.id) && (
                <>
                  <button type="button" title={"重复此步骤"} onClick={() => { const e2 = editing; setEditing(null); duplicateNode(e2); }}
                    className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><Copy className="w-4 h-4" /></button>
                  <button type="button" title={"删除这一步"} onClick={() => { const nid = editing.id; setEditing(null); deleteNode(nid); }}
                    className="p-2 rounded-lg border border-gray-200 text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                </>
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="secondary" onClick={requestCloseModal}>取消</Button>
                <Button onClick={saveNode}>保存配置</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {leavePrompt && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40" onClick={() => setLeavePrompt(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-[380px] max-w-[92vw]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900">未保存的更改</h3>
            <p className="text-sm text-gray-500 mt-1">您的更改尚未保存。你想做什么？</p>
            <div className="flex flex-col gap-2 mt-4">
              <Button onClick={async () => {
                if (leavePrompt === 'modal') { setLeavePrompt(null); saveNode(); }
                else { setLeavePrompt(null); await handleSave(); router.push('/client/bot-flows'); }
              }}>保存{leavePrompt === 'page' ? "& 退出" : ''}</Button>
              <Button variant="secondary" onClick={() => {
                setLeavePrompt(null);
                if (leavePrompt === 'modal') setEditing(null);
                else { setDirty(false); router.push('/client/bot-flows'); }
              }}>放弃更改{leavePrompt === 'page' ? "& 退出" : ''}</Button>
              <Button variant="secondary" onClick={() => setLeavePrompt(null)}>取消 — 留在这里</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
