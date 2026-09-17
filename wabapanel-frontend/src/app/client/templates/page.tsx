'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import WaTextarea from '@/components/ui/WaTextarea';
import { Plus, RefreshCw, Search, Eye, Trash2, Clock, CheckCircle, XCircle, Image as ImageIcon, Video, File, Phone, ExternalLink, X, ChevronDown, BookOpen, Flag } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import WhatsAppPhonePreview from '@/components/WhatsAppPhonePreview';
import { templateApi, mediaApi } from "@/lib/api";
import type { Template } from '@/types';

import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

interface LibraryPreset {
  name: string;
  title: string;
  industry: string;
  industryLabel: string;
  category: string;
  language: string;
  header: { type: string; content: string };
  body: string;
  footer: string;
  buttons: { type: string; text: string }[];
  alreadyAdded?: boolean;
}

interface LibraryIndustry { key: string; label: string }

interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'CATALOG';
  text: string;
  url?: string;
  urlType?: 'static' | 'dynamic';
  urlExample?: string;
  phoneNumber?: string;
}

interface CarouselCard {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  body: string;
  buttons: TemplateButton[];
}

const emptyCard = (): CarouselCard => ({ mediaUrl: '', mediaType: 'image', body: '', buttons: [{ type: 'QUICK_REPLY', text: '', url: '', phoneNumber: '' }] });

function CarouselStrip({ cards }: { cards: Array<{ mediaUrl?: string; mediaType?: string; body?: string; buttons?: Array<{ text: string }> }> }) {
  return (
    <div className="w-full max-w-md">
      <p className="text-xs font-semibold text-gray-500 mb-2">轮播卡（刷卡）预览</p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cards.map((c, i) => (
          <div key={i} className="shrink-0 w-44 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {c.mediaUrl ? (
              c.mediaType === 'video'
                ? <video src={c.mediaUrl} className="w-full h-28 object-cover bg-gray-100" muted />
                : /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={c.mediaUrl} alt={"卡" + (i + 1)} className="w-full h-28 object-cover bg-gray-100" />
            ) : (
              <div className="w-full h-28 bg-gray-100 flex items-center justify-center text-xs text-gray-400">没有媒体</div>
            )}
            <div className="p-2">
              <p className="text-xs text-gray-800 whitespace-pre-wrap wrap-break-word">{c.body || <span className="text-gray-300">卡片文字...</span>}</p>
              {(c.buttons || []).filter(b => b.text).map((b, bi) => (
                <div key={bi} className="mt-1.5 text-center text-[11px] font-medium text-sky-600 border-t border-gray-100 pt-1.5">{b.text}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const templateToPreview = (t: Template) => {
  const raw = t as unknown as Record<string, unknown>;
  const header = raw.header as Record<string, string> | undefined;
  const buttons = raw.buttons as Array<{ text: string; type?: string }> | undefined;
  return {
    headerType: header?.type,
    headerText: header?.content,
    headerMediaUrl: header?.mediaUrl,
    body: t.body,
    footer: t.footer,
    buttons: buttons || [],
  };
};

// Meta's "(#100) Need permission..." rejection is a WhatsApp connection problem, not a
// template content problem, so the row tells the user where to fix it.
function permissionHint(reason?: string) {
  if (!reason || !/#100|permission|owner\/shared business/i.test(reason)) return '';
  return 'Fix: in Meta Business Settings give your system user "Full control" on this WhatsApp Business Account, generate a token with whatsapp_business_management, then save it in Channels → WhatsApp and sync again.';
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { currentWorkspace } = useAuthStore();
  // Additional numbers connected from a different WABA keep their own templates.
  const wabas = React.useMemo(() => {
    const wa = currentWorkspace?.whatsapp;
    if (!wa) return [] as { id: string; label: string }[];
    const mainId = wa.wabaId || wa.businessAccountId || '';
    const list = [{ id: '', label: `${wa.displayName || 'Default'} (${wa.phoneNumber || wa.phoneNumberId || ''})` }];
    for (const n of (wa.extraNumbers || [])) {
      if (!n.wabaId || n.wabaId === mainId) continue;
      const seen = list.find((x) => x.id === n.wabaId);
      if (seen) { seen.label += `, ${n.phoneNumber || n.phoneNumberId}`; continue; }
      list.push({ id: n.wabaId, label: `${n.displayName || 'Number'} (${n.phoneNumber || n.phoneNumberId})` });
    }
    return list;
  }, [currentWorkspace]);
  const [wabaId, setWabaId] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<'list' | 'create'>('list');
  const [showPreview, setShowPreview] = useState<Template | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [showBtnMenu, setShowBtnMenu] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libLoading, setLibLoading] = useState(false);
  const [libPresets, setLibPresets] = useState<LibraryPreset[]>([]);
  const [libIndustries, setLibIndustries] = useState<LibraryIndustry[]>([]);
  const [libIndustry, setLibIndustry] = useState('all');
  const [libSearch, setLibSearch] = useState('');
  const [form, setForm] = useState({
    name: '', category: 'MARKETING', language: 'en',
    headerType: 'none' as 'none' | 'text' | 'image' | 'video' | 'document',
    headerText: '', headerMediaUrl: '',
    bodyText: '', footerText: '',
    buttons: [] as TemplateButton[],
    isCarousel: false,
    cards: [] as CarouselCard[],
    authButtonText: 'Copy Code',
    authCodeExpiry: 10,
    authSecurityRec: true,
  });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [flagTpl, setFlagTpl] = useState<Template | null>(null);
  const [flagCategory, setFlagCategory] = useState('');
  const [flagging, setFlagging] = useState(false);
  // Meta blocks a category change on an approved template — the dialog then offers
  // to submit a copy of the same content under the requested category.
  const [flagCopyName, setFlagCopyName] = useState('');

  // Show why an upload failed instead of a bare "Upload failed".
  const uploadErrorMessage = (err: unknown) => {
    const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
    const status = e.response?.status;
    if (status === 413) return 'File too large for the server. Use an image under 5 MB.';
    if (status === 401 || status === 403) return 'Session expired. Please log in again and retry.';
    return e.response?.data?.message || e.message || 'Upload failed';
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "templates");
      const res = await mediaApi.upload(formData);
      const url = res.data?.data?.url || res.data?.url || "";
      setForm(f => ({ ...f, headerMediaUrl: url }));
      toast.success(translateApiMessage("文件已上传！"));
    } catch (err) { toast.error(translateApiMessage(uploadErrorMessage(err))); }
    setUploading(false);
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await templateApi.list({ status: filter === 'all' ? undefined : filter, search, page, limit: pageSize, ...(wabas.length > 1 ? { wabaId } : {}) });
      setTemplates(res.data.data || []);
      setTotal(res.data.pagination?.total ?? (res.data.data || []).length);
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, [filter, search, page, pageSize, wabaId]);
  useEffect(() => { setPage(1); }, [filter, search, pageSize, wabaId]);

  const openLibrary = async () => {
    setShowLibrary(true);
    setLibLoading(true);
    try {
      const res = await templateApi.library();
      setLibPresets(res.data.data.templates || []);
      setLibIndustries(res.data.data.industries || []);
    } catch {
      toast.error(translateApiMessage("无法加载模板库"));
    }
    setLibLoading(false);
  };

  // Library presets open in the normal editor so the text can be changed before
  // it goes to Meta — the preset itself is never submitted as-is.
  const editLibraryPreset = (preset: LibraryPreset) => {
    setForm({
      name: preset.name,
      category: (preset.category || 'marketing').toUpperCase(),
      language: preset.language || 'en',
      headerType: (preset.header?.type === 'text' ? 'text' : 'none'),
      headerText: preset.header?.type === 'text' ? (preset.header.content || '') : '',
      headerMediaUrl: '',
      bodyText: preset.body || '',
      footerText: preset.footer || '',
      buttons: (preset.buttons || []).map((b) => ({
        type: b.type === 'url' ? 'URL' : b.type === 'phone' ? 'PHONE_NUMBER' : b.type === 'catalog' ? 'CATALOG' : 'QUICK_REPLY',
        text: b.text || '',
        url: '',
        phoneNumber: '',
      })) as TemplateButton[],
      isCarousel: false,
      cards: [],
      authButtonText: 'Copy Code',
      authCodeExpiry: 10,
      authSecurityRec: true,
    });
    setShowLibrary(false);
    setView('create');
  };

  const visiblePresets = libPresets.filter((p) => {
    if (libIndustry !== 'all' && p.industry !== libIndustry) return false;
    if (!libSearch.trim()) return true;
    const q = libSearch.trim().toLowerCase();
    return `${p.title} ${p.body} ${p.industryLabel}`.toLowerCase().includes(q);
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      await templateApi.syncFromWhatsApp();
      toast.success(translateApiMessage("从 WhatsApp 同步的模板"));
      fetchTemplates();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "同步失败 - 检查 WhatsApp 连接"));
    }
    setSyncing(false);
  };

  const handleCreate = async () => {
    if (submitting) return;
    if (!form.name || (form.category !== 'AUTHENTICATION' && !form.bodyText)) {
      toast.error(translateApiMessage("模板名称和正文为必填项"));
      return;
    }
    setSubmitting(true);
    try {
      if (form.category === 'AUTHENTICATION') {
        await templateApi.create({
          name: form.name, category: form.category, language: form.language, wabaId,
          components: [{ type: 'BODY', text: '{{1}} is your verification code.' }],
          authentication: {
            otpType: 'COPY_CODE',
            buttonText: form.authButtonText || 'Copy Code',
            codeExpirationMinutes: form.authCodeExpiry || 0,
            addSecurityRecommendation: form.authSecurityRec,
          },
        });
        toast.success(translateApiMessage("模板已提交审批"));
        setView('list'); resetForm(); fetchTemplates(); setSubmitting(false);
        return;
      }
      const components: Array<Record<string, unknown>> = [];
      if (form.isCarousel) {
        // Carousel: no top-level header — cards have their own
      } else if (form.headerType === 'text' && form.headerText) {
        components.push({ type: 'HEADER', format: 'TEXT', text: form.headerText });
      } else if (form.headerType === 'image') {
        components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [form.headerMediaUrl] } });
      } else if (form.headerType === 'video') {
        components.push({ type: 'HEADER', format: 'VIDEO', example: { header_handle: [form.headerMediaUrl] } });
      } else if (form.headerType === 'document') {
        components.push({ type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [form.headerMediaUrl] } });
      }
      components.push({ type: 'BODY', text: form.bodyText });
      if (!form.isCarousel && form.footerText) {
        components.push({ type: 'FOOTER', text: form.footerText });
      }
      if (!form.isCarousel && form.buttons.length > 0) {
        const buttonComponents = form.buttons.map(btn => {
          if (btn.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: btn.text };
          if (btn.type === 'URL') return { type: 'URL', text: btn.text, url: btn.url, ...(btn.urlType === 'dynamic' && btn.urlExample ? { example: [btn.urlExample] } : {}) };
          if (btn.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phoneNumber };
          if (btn.type === 'CATALOG') return { type: 'CATALOG', text: btn.text || 'View catalog' };
          return { type: btn.type, text: btn.text };
        });
        components.push({ type: 'BUTTONS', buttons: buttonComponents });
      }
      if (form.isCarousel) {
        if (form.cards.length < 2) { toast.error(translateApiMessage("轮播需要至少2张卡")); setSubmitting(false); return; }
        if (form.cards.some(c => !c.mediaUrl)) { toast.error(translateApiMessage("每张卡片都需要一个图像/视频 URL")); setSubmitting(false); return; }
        if (form.cards.some(c => c.buttons.length === 0 || c.buttons.some(b => !b.text))) { toast.error(translateApiMessage("每张卡片至少需要 1 个带有文字的按钮")); setSubmitting(false); return; }
      }
      await templateApi.create({
        name: form.name, category: form.category, language: form.language, components, wabaId,
        carousel: form.isCarousel ? { cards: form.cards.map(c => ({
          mediaUrl: c.mediaUrl, mediaType: c.mediaType, body: c.body,
          buttons: c.buttons.map(b => ({ type: b.type === 'QUICK_REPLY' ? 'quick_reply' : b.type === 'PHONE_NUMBER' ? 'phone' : 'url', text: b.text, value: b.url || b.phoneNumber || '' })),
        })) } : undefined,
      });
      toast.success(translateApiMessage("模板已提交审批"));
      setView('list');
      resetForm();
      fetchTemplates();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "创建模板失败"));
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    setForm({ name: '', category: 'MARKETING', language: 'en', headerType: 'none', headerText: '', headerMediaUrl: '', bodyText: '', footerText: '', buttons: [], isCarousel: false, cards: [], authButtonText: 'Copy Code', authCodeExpiry: 10, authSecurityRec: true });
  };

  const addButton = (type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'CATALOG') => {
    if (form.buttons.length >= 3) { toast.error(translateApiMessage("最多允许 3 个按钮")); return; }
    if (type === 'CATALOG' && form.buttons.some(b => b.type === 'CATALOG')) { toast.error(translateApiMessage("只允许使用 1 个目录按钮")); return; }
    setForm({ ...form, buttons: [...form.buttons, { type, text: '', url: '', phoneNumber: '' }] });
    setShowBtnMenu(false);
  };

  const updateButton = (index: number, field: string, value: string) => {
    const updated = [...form.buttons];
    (updated[index] as unknown as Record<string, string>)[field] = value;
    setForm({ ...form, buttons: updated });
  };

  const removeButton = (index: number) => {
    setForm({ ...form, buttons: form.buttons.filter((_, i) => i !== index) });
  };

  const addOptOut = () => {
    setForm(f => {
      const footer = (f.footerText && f.footerText.trim()) ? f.footerText : 'Reply STOP to unsubscribe';
      const hasStop = f.buttons.some(b => b.type === 'QUICK_REPLY' && /stop|unsub/i.test(b.text || ''));
      const buttons = (!hasStop && f.buttons.length < 3)
        ? [...f.buttons, { type: 'QUICK_REPLY' as const, text: "停止促销", url: '', phoneNumber: '' }]
        : f.buttons;
      return { ...f, footerText: footer.slice(0, 60), buttons };
    });
    toast.success(translateApiMessage("添加选择退出（页脚 + 停止按钮）"));
  };

  const updateCard = (i: number, cardPatch: Partial<CarouselCard>) => {
    setForm(f => ({ ...f, cards: f.cards.map((c, j) => j === i ? { ...c, ...cardPatch } : c) }));
  };

  const updateCardButton = (ci: number, bi: number, btnPatch: Partial<TemplateButton>) => {
    setForm(f => ({ ...f, cards: f.cards.map((c, j) => j === ci ? { ...c, buttons: c.buttons.map((b, k) => k === bi ? { ...b, ...btnPatch } : b) } : c) }));
  };

  const handleCardMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, ci: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'templates');
      const res = await mediaApi.upload(formData);
      const url = res.data?.data?.url || res.data?.url || '';
      updateCard(ci, { mediaUrl: url });
      toast.success(translateApiMessage("已上传"));
    } catch (err) { toast.error(translateApiMessage(uploadErrorMessage(err))); }
    setUploading(false);
  };

  // Re-submit a template to Meta for review, optionally under a different category.
  const submitFlagReview = async (createCopy = false) => {
    if (!flagTpl) return;
    setFlagging(true);
    try {
      await templateApi.flagForReview(flagTpl._id, {
        category: flagCategory || undefined,
        createCopy: createCopy || undefined,
        copyName: createCopy ? flagCopyName : undefined,
      });
      toast.success(translateApiMessage(createCopy ? "创建副本并发送至 Meta 进行审核" : "模板发送至 Meta 进行审核"));
      setFlagTpl(null);
      setFlagCopyName('');
      fetchTemplates();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string; code?: string; suggestedName?: string } } };
      const data = error.response?.data;
      if (data?.code === 'category_locked') {
        setFlagCopyName(data.suggestedName || `${flagTpl.name}_${flagCategory}`);
      } else {
        toast.error(translateApiMessage(data?.message || "无法发送以供审核"));
      }
    }
    setFlagging(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("删除此模板？")) return;
    try { await templateApi.delete(id); toast.success(translateApiMessage("已删除")); fetchTemplates(); } catch { toast.error(translateApiMessage("操作失败")); }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1" />已批准</Badge>;
      case 'rejected': return <Badge variant="danger"><XCircle className="w-3 h-3 mr-1" />被拒绝</Badge>;
      default: return <Badge variant="warning"><Clock className="w-3 h-3 mr-1" />审查中</Badge>;
    }
  };

  const columns = [
    { key: 'sr', title: "先生", render: (t: Template) => <span className="text-gray-500">{templates.indexOf(t) + 1}</span> },
    { key: 'channel', title: "渠道", render: () => (
      <span className="inline-flex items-center gap-1.5 text-gray-700"><span className="w-2 h-2 rounded-full bg-emerald-500" />WhatsApp</span>
    )},
    { key: 'createdAt', title: "创建日期", render: (t: Template) => (
      <span className="text-gray-500 text-sm">{(t as unknown as { createdAt?: string }).createdAt ? new Date((t as unknown as { createdAt: string }).createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
    )},
    { key: 'category', title: "类别", render: (t: Template) => <Badge variant="info">{t.category || ((t as unknown as Record<string, string>).waCategory) || ''}</Badge> },
    { key: 'name', title: "模板名称", render: (t: Template) => (
      <span className="font-medium text-gray-900">{t.name}</span>
    ) },
    { key: 'preview', title: "预览", render: (t: Template) => (
      <button onClick={() => setShowPreview(t)} className="p-1.5 hover:bg-emerald-50 rounded-lg" title={"预览"}><Eye className="w-4 h-4 text-emerald-600" /></button>
    )},
    { key: 'language', title: "语言" },
    { key: 'status', title: "状态", render: (t: Template) => (
      <div>
        {getStatusBadge(t.status)}
        {t.status === 'rejected' && (t as unknown as { rejectionReason?: string }).rejectionReason && (
          <>
            <p className="text-xs text-red-500 mt-1 max-w-[220px]" title={(t as unknown as { rejectionReason?: string }).rejectionReason}>{(t as unknown as { rejectionReason?: string }).rejectionReason}</p>
            {permissionHint((t as unknown as { rejectionReason?: string }).rejectionReason) && (
              <p className="text-xs text-gray-500 mt-1 max-w-[220px]">{permissionHint((t as unknown as { rejectionReason?: string }).rejectionReason)}</p>
            )}
          </>
        )}
      </div>
    ) },
    { key: 'actions', title: "行动", render: (t: Template) => (
      <div className="flex items-center gap-1">
        {t.category !== 'authentication' && (
          <button onClick={() => { setFlagTpl(t); setFlagCategory(''); setFlagCopyName(''); }} className="p-1.5 hover:bg-amber-50 rounded-lg" title={"审查标记"}><Flag className="w-4 h-4 text-amber-500" /></button>
        )}
        <button onClick={() => handleDelete(t._id)} className="p-1.5 hover:bg-red-50 rounded-lg" title={"删除"}><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  if (view === 'create') {
    return (
      <div className="space-y-6">
        <div className="page-hero flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">创建模板</h1>
            <p className="text-gray-500 text-sm mt-1">通过实时预览设计您的 WhatsApp 模板</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setView('list'); resetForm(); }}>取消</Button>
            <Button onClick={handleCreate} loading={submitting}>提交</Button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 space-y-5 w-full">
            <div className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label={"模板名称"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="template_name" required />
              <Select label={"类别"} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                options={[{ value: 'MARKETING', label: "营销" }, { value: 'UTILITY', label: "实用程序" }, { value: 'AUTHENTICATION', label: "认证" }]} />
              <Select label={"语言"} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}
                options={[{ value: 'en', label: "英语" }, { value: 'en_US', label: "英语（美国）" }, { value: 'hi', label: "印地语" }, { value: 'mr', label: "马拉地语" }, { value: 'ta', label: "泰米尔语" }, { value: 'te', label: "泰卢固语" }, { value: 'gu', label: "古吉拉特语" }, { value: 'bn', label: "孟加拉语" }]} />
            </div>

            {form.category === 'AUTHENTICATION' ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-800">身份验证（OTP）模板</label>
                <p className="text-xs text-gray-400 mt-1">元自动生成代码消息正文。您只需在下面配置复制代码按钮和到期时间。</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">复制代码按钮文本</label>
                <input value={form.authButtonText} onChange={(e) => setForm({ ...form, authButtonText: e.target.value })} maxLength={25} placeholder={"复制代码"}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">代码到期（分钟，0 = 无）</label>
                <input type="number" min={0} max={90} value={form.authCodeExpiry} onChange={(e) => setForm({ ...form, authCodeExpiry: parseInt(e.target.value || '0', 10) })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.authSecurityRec} onChange={(e) => setForm({ ...form, authSecurityRec: e.target.checked })} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm text-gray-700">添加安全建议（“为了您的安全，请勿共享此代码。”）</span>
              </label>
            </div>
            ) : (<>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <label className="block text-sm font-semibold text-gray-800">标头 <span className="font-normal text-gray-400">（可选）</span></label>
              <p className="text-xs text-gray-400 mb-3">添加标题或选择为此标题使用的媒体类型。</p>
              <div className="flex gap-2 mb-3 flex-wrap">
                {[
                  { value: 'none', label: "无", icon: null },
                  { value: 'text', label: "文本", icon: null },
                  { value: 'image', label: "图片", icon: <ImageIcon className="w-4 h-4" /> },
                  { value: 'video', label: "视频", icon: <Video className="w-4 h-4" /> },
                  { value: 'document', label: "文件", icon: <File className="w-4 h-4" /> },
                ].map((opt) => (
                  <button key={opt.value} onClick={() => setForm({ ...form, headerType: opt.value as typeof form.headerType })}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border font-medium ${form.headerType === opt.value ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100'}`}>
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
              {form.headerType === 'text' && (
                <Input label="" value={form.headerText} onChange={(e) => setForm({ ...form, headerText: e.target.value })} placeholder={"标题文本（最多 60 个字符）"} />
              )}
              {['image', 'video', 'document'].includes(form.headerType) && (
                <div className="mt-2">
                  {form.headerMediaUrl ? (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm text-emerald-700 flex-1 truncate">{form.headerMediaUrl.split('/').pop()}</span>
                      <button onClick={() => setForm({...form, headerMediaUrl: ''})} className="text-red-500 hover:text-red-700"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                      <div className="flex flex-col items-center">
                        {uploading ? (
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                        ) : (
                          <>
                            <Plus className="w-6 h-6 text-gray-400 mb-1" />
                            <span className="text-sm text-gray-500">点击上传 {form.headerType}</span>
                            <span className="text-xs text-gray-400 mt-0.5">{form.headerType === 'image' ? "JPG、PNG（最大 5MB）" : form.headerType === 'video' ? "MP4（最大 16MB）" : "PDF（最大 100MB）"}</span>
                          </>
                        )}
                      </div>
                      <input type="file" className="hidden" accept={form.headerType === 'image' ? 'image/*' : form.headerType === 'video' ? 'video/*' : '.pdf,.doc,.docx'} onChange={handleMediaUpload} disabled={uploading} />
                    </label>
                  )}
                  <input className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.headerMediaUrl} onChange={(e) => setForm({...form, headerMediaUrl: e.target.value})} placeholder={"或直接粘贴网址"} />
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-semibold text-gray-800">身体 <span className="text-red-500">*</span></label>
                <span className="text-xs text-gray-400">{form.bodyText.length} / 1024</span>
              </div>
              <WaTextarea value={form.bodyText} onChange={(v) => setForm({ ...form, bodyText: v })} maxLength={1024}
                placeholder={"消息正文。使用 {{1}}、{{2}} 作为变量"} rows={5}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <p className="text-xs text-gray-400 mt-1">变量： {'{{1}}'} = 客户名称， {'{{2}}'} = 订单 ID 等。</p>
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-gray-800">页脚 <span className="font-normal text-gray-400">（可选）</span></label>
                  <span className="text-xs text-gray-400">{form.footerText.length} / 60</span>
                </div>
                <input value={form.footerText} onChange={(e) => setForm({ ...form, footerText: e.target.value })} maxLength={60}
                  placeholder={"在消息模板的底部添加一小行文本。"}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                {form.category === 'MARKETING' && (
                  <button type="button" onClick={addOptOut}
                    className="mt-2 text-xs font-medium text-emerald-600 hover:underline">
                    + 添加选择退出（页脚“回复停止取消订阅”+“停止促销”按钮）
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isCarousel}
                  onChange={e => setForm({ ...form, isCarousel: e.target.checked, cards: e.target.checked && form.cards.length === 0 ? [emptyCard(), emptyCard()] : form.cards })}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-gray-800">轮播模板 <span className="font-normal text-gray-400">（2-10张刷卡，哈卡我图像+按钮）</span></span>
              </label>
              {form.isCarousel && (
                <div className="mt-3 space-y-4">
                  <p className="text-xs text-amber-600">对于轮播，上面的标题和下面的按钮将被忽略 - 每张卡片都有自己的图像/视频 + 1-2 个按钮。元规则：所有卡片必须具有相同数量和类型的按钮。</p>
                  {form.cards.map((card, ci) => (
                    <div key={ci} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700">卡 {ci + 1}</span>
                        {form.cards.length > 2 && <button onClick={() => setForm({ ...form, cards: form.cards.filter((_, j) => j !== ci) })}><X className="w-4 h-4 text-red-400" /></button>}
                      </div>
                      <div className="flex gap-2">
                        <select value={card.mediaType} onChange={e => updateCard(ci, { mediaType: e.target.value as 'image' | 'video' })} className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
                          <option value="image">图片</option>
                          <option value="video">视频</option>
                        </select>
                        <input value={card.mediaUrl} onChange={e => updateCard(ci, { mediaUrl: e.target.value })} placeholder={"媒体 URL（或单击“上传”）"} className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                        <label className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg cursor-pointer flex items-center">
                          {uploading ? '...' : "上传"}
                          <input type="file" className="hidden" accept={card.mediaType === 'image' ? 'image/*' : 'video/*'} onChange={e => handleCardMediaUpload(e, ci)} disabled={uploading} />
                        </label>
                      </div>
                      <textarea value={card.body} onChange={e => updateCard(ci, { body: e.target.value })} placeholder={"卡片文本（可选，最多 160 个字符）"} maxLength={160} rows={2} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                      {card.buttons.map((b, bi) => (
                        <div key={bi} className="flex gap-2 items-center">
                          <select value={b.type} onChange={e => updateCardButton(ci, bi, { type: e.target.value as TemplateButton['type'] })} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                            <option value="QUICK_REPLY">快速回复</option>
                            <option value="URL">URL</option>
                            <option value="PHONE_NUMBER">致电</option>
                          </select>
                          <input value={b.text} onChange={e => updateCardButton(ci, bi, { text: e.target.value })} placeholder={"按钮文本"} maxLength={25} className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
                          {b.type === 'URL' && <input value={b.url || ''} onChange={e => updateCardButton(ci, bi, { url: e.target.value })} placeholder="https://..." className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />}
                          {b.type === 'PHONE_NUMBER' && <input value={b.phoneNumber || ''} onChange={e => updateCardButton(ci, bi, { phoneNumber: e.target.value })} placeholder="+91 98765 43210" className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />}
                          {card.buttons.length > 1 && <button onClick={() => updateCard(ci, { buttons: card.buttons.filter((_, j) => j !== bi) })}><X className="w-3.5 h-3.5 text-red-400" /></button>}
                        </div>
                      ))}
                      {card.buttons.length < 2 && <button onClick={() => updateCard(ci, { buttons: [...card.buttons, { type: 'QUICK_REPLY', text: '', url: '', phoneNumber: '' }] })} className="text-xs text-emerald-600 hover:underline">+ 按钮</button>}
                    </div>
                  ))}
                  {form.cards.length < 10 && (
                    <button onClick={() => setForm({ ...form, cards: [...form.cards, emptyCard()] })} className="text-sm text-emerald-600 font-medium hover:underline">+ 添加卡</button>
                  )}
                </div>
              )}
            </div>

            {!form.isCarousel && <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <label className="text-sm font-semibold text-gray-800">按钮 <span className="font-normal text-gray-400">（可选）</span></label>
                  <p className="text-xs text-gray-400">创建按钮，让客户回复您的消息或采取行动。</p>
                </div>
                <div className="relative">
                  <button onClick={() => setShowBtnMenu(!showBtnMenu)}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-medium">
                    添加按钮 <ChevronDown className="w-4 h-4" />
                  </button>
                  {showBtnMenu && (
                    <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
                      <button onClick={() => addButton('QUICK_REPLY')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">快速回复</button>
                      <button onClick={() => addButton('URL')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"><ExternalLink className="w-3.5 h-3.5" /> 访问网站</button>
                      <button onClick={() => addButton('PHONE_NUMBER')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> 拨打电话</button>
                      <button onClick={() => addButton('CATALOG')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">🛒 查看目录</button>
                    </div>
                  )}
                </div>
              </div>
              {form.buttons.map((btn, i) => (
                <div key={i} className="flex gap-2 items-start mb-2 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500 w-24">
                        {btn.type === 'QUICK_REPLY' ? "快速回复" : btn.type === 'URL' ? "URL 按钮" : btn.type === 'CATALOG' ? "目录" : "呼叫按钮"}
                      </span>
                      <input value={btn.text} onChange={(e) => updateButton(i, 'text', e.target.value)} placeholder={"按钮文本"} maxLength={25}
                        className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    </div>
                    {btn.type === 'URL' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-500 w-16">网址类型</span>
                          <select value={btn.urlType || 'static'} onChange={(e) => updateButton(i, 'urlType', e.target.value)}
                            className="text-sm px-2 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                            <option value="static">静态</option>
                            <option value="dynamic">动态</option>
                          </select>
                        </div>
                        <input value={btn.url || ''} onChange={(e) => updateButton(i, 'url', e.target.value)}
                          placeholder={btn.urlType === 'dynamic' ? 'https://example.com/{{1}}' : 'https://example.com'}
                          className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                        {btn.urlType === 'dynamic' && (
                          <>
                            <input value={btn.urlExample || ''} onChange={(e) => updateButton(i, 'urlExample', e.target.value)}
                              placeholder={"完整 URL 示例（供审核），例如https://example.com/1234"}
                              className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                            <p className="text-[11px] text-gray-400">动态：URL 必须以变量结尾，例如 <code>{'{{1}}'}</code>。提供一个示例 URL，以便 Meta 可以查看它。</p>
                          </>
                        )}
                      </div>
                    )}
                    {btn.type === 'PHONE_NUMBER' && (
                      <input value={btn.phoneNumber || ''} onChange={(e) => updateButton(i, 'phoneNumber', e.target.value)} placeholder="+919876543210"
                        className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    )}
                    {btn.type === 'CATALOG' && (
                      <p className="text-[11px] text-gray-400">打开您的 WhatsApp 目录 - 目录必须连接到 Meta Commerce Manager 中的 WABA。</p>
                    )}
                  </div>
                  <button onClick={() => removeButton(i)} className="p-1 hover:bg-red-50 rounded"><X className="w-4 h-4 text-red-400" /></button>
                </div>
              ))}
            </div>}
            </>)}
          </div>

          <div className="lg:sticky lg:top-6 mx-auto flex flex-col items-center gap-4">
            <WhatsAppPhonePreview data={{ headerType: form.headerType, headerText: form.headerText, headerMediaUrl: form.headerMediaUrl, body: form.bodyText, footer: form.footerText, buttons: form.buttons }} />
            {form.isCarousel && form.cards.length > 0 && <CarouselStrip cards={form.cards} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-hero flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">模板</h1>
          <p className="text-gray-500 text-sm mt-1">管理 WhatsApp 消息模板</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<BookOpen className="w-4 h-4" />} onClick={openLibrary}>模板库</Button>
          <Button variant="outline" icon={<RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />} onClick={handleSync} loading={syncing}>与 WhatsApp 同步</Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { resetForm(); setView('create'); }}>添加模板消息</Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder={"搜索模板名称..."} value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div className="flex gap-2">
          {wabas.length > 1 && (
            <select value={wabaId} onChange={(e) => setWabaId(e.target.value)} title={"WhatsApp 企业账户"}
              className="px-3 py-1.5 text-sm rounded-lg bg-white border border-gray-200 text-gray-700 max-w-[260px]">
              {wabas.map((w) => <option key={w.id} value={w.id}>{translateDisplay(w.label)}</option>)}
            </select>
          )}
          {['all', 'approved', 'pending', 'rejected'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-lg ${filter === f ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {f === 'pending' ? "审查中" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
            className="px-3 py-1.5 text-sm rounded-lg bg-white border border-gray-200 text-gray-600">
            {[5, 20, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{translateDisplay(n)} /页</option>)}
          </select>
        </div>
      </div>

      <Table columns={columns} data={templates} loading={loading} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => templateApi.delete(id).catch(() => null))); fetchTemplates(); }} />

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            显示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total} 模板
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 disabled:opacity-40">上一页</button>
            <span className="px-2 py-1.5">页 {page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
            <button onClick={() => setPage((p) => (p * pageSize < total ? p + 1 : p))} disabled={page * pageSize >= total}
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 disabled:opacity-40">下一步</button>
          </div>
        </div>
      )}

      {/* Ready-made template library */}
      <Modal isOpen={showLibrary} onClose={() => setShowLibrary(false)} title={"模板库 — 官方截取的模板 参考下就可以了"} size="xl">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder={"搜索模板（报价、订单、费用、预约...）"} value={libSearch} onChange={(e) => setLibSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <select value={libIndustry} onChange={(e) => setLibIndustry(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg bg-white border border-gray-200 text-gray-700 sm:max-w-xs">
              <option value="all">所有行业</option>
              {libIndustries.map((ind) => <option key={ind.key} value={ind.key}>{translateDisplay(ind.label)}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-500">
            选择一个模板，根据需要编辑文本，然后将其提交给 Meta 进行批准。变量如 {'{{1}}'} 发送时填写联系方式或您自己的值。
          </p>
          {libLoading ? (
            <p className="text-sm text-gray-400 py-8 text-center">正在加载模板...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {visiblePresets.map((p) => (
                <div key={p.name} className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{p.title}</p>
                      <p className="text-xs text-gray-400">{p.industryLabel}</p>
                    </div>
                    <Badge variant={p.category === 'marketing' ? 'warning' : p.category === 'authentication' ? 'info' : 'success'}>{p.category}</Badge>
                  </div>
                  {p.header.type === 'text' && p.header.content && (
                    <p className="text-xs font-semibold text-gray-700">{p.header.content}</p>
                  )}
                  <p className="text-xs text-gray-600 whitespace-pre-wrap">{p.body || "OTP 模板 — Meta 生成文本。"}</p>
                  {p.footer && <p className="text-[11px] text-gray-400">{p.footer}</p>}
                  {p.buttons.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.buttons.map((b, i) => (
                        <span key={i} className="text-[11px] px-2 py-0.5 rounded border border-emerald-200 text-emerald-700 bg-emerald-50">{b.text}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto pt-1">
                    {p.alreadyAdded ? (
                      <span className="text-xs text-gray-400">已添加</span>
                    ) : (
                      <Button size="sm" onClick={() => editLibraryPreset(p)}>编辑并提交</Button>
                    )}
                  </div>
                </div>
              ))}
              {!visiblePresets.length && <p className="text-sm text-gray-400 py-6">没有模板与您的搜索匹配。</p>}
            </div>
          )}
        </div>
      </Modal>

      {/* Flag for review */}
      <Modal isOpen={!!flagTpl} onClose={() => { setFlagTpl(null); setFlagCopyName(''); }} title={"供审核的标记模板"} size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">{flagTpl?.name}</span> 将被发送回 Meta 进行审核。             在 Meta 做出决定之前，其状态将变为“审核中”。
          </p>
          <Select label={"类别下的评论"} value={flagCategory}
            onChange={(e) => { setFlagCategory(e.target.value); setFlagCopyName(''); }}
            options={[
              { value: '', label: `保持最新状态（${flagTpl?.category || ''})` },
              { value: 'utility', label: "实用程序" },
              { value: 'marketing', label: "营销" },
            ]} />
          {flagTpl?.status === 'approved' && !!flagCategory && flagCategory !== flagTpl?.category && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
              <p className="text-xs text-amber-800">
                元不允许更改已批准模板的类别。在下面提交相同内容的副本 <span className="font-medium">{flagCategory}</span> 相反 - 批准的模板保持原样。
              </p>
              <Input label={"新模板名称"} value={flagCopyName || `${flagTpl?.name}_${flagCategory}`}
                onChange={(e) => setFlagCopyName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} />
              <Button size="sm" onClick={() => submitFlagReview(true)} loading={flagging}>
                创建 {flagCategory} 复制并提交
              </Button>
            </div>
          )}
          <p className="text-xs text-gray-400">元限制了已批准模板的编辑频率（每月大约 10 次）。</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setFlagTpl(null); setFlagCopyName(''); }}>取消</Button>
            <Button onClick={() => submitFlagReview(false)} loading={flagging}>发送以供审核</Button>
          </div>
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal isOpen={!!showPreview} onClose={() => setShowPreview(null)} title={showPreview?.name || "模板预览"} size="md">
        {showPreview && (
          <div className="flex flex-col items-center gap-4">
            <WhatsAppPhonePreview data={templateToPreview(showPreview)} />
            {(() => { const cc = (showPreview as unknown as { carousel?: { cards?: Array<{ mediaUrl?: string; mediaType?: string; body?: string; buttons?: Array<{ text: string }> }> } }).carousel?.cards; return cc && cc.length > 0 ? <CarouselStrip cards={cc} /> : null; })()}
            <div className="text-sm text-gray-500 flex gap-4">
              <span><strong>状态：</strong> {translateDisplay(showPreview.status)}</span>
              <span><strong>类别：</strong> {showPreview.category}</span>
              <span><strong>语言：</strong> {showPreview.language}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
