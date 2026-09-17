'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect, useCallback } from 'react';
import { Search, Star, Eye, Download, X, Clock, Layers, MessageSquare, User, Sparkles } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { botFlowApi } from '@/lib/api';
import toast from 'react-hot-toast';

export interface MarketTemplate {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  description: string;
  difficulty: string;
  setupMinutes: number;
  featured: boolean;
  isNew: boolean;
  free: boolean;
  version: string;
  author: string;
  trigger: string;
  steps: number;
}
interface MarketCategory { key: string; label: string; count: number }
interface PreviewStep { name: string; type: string; text: string; actionTag: string }
interface PreviewTemplate extends MarketTemplate { preview: PreviewStep[]; triggerKeywords: string[] }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInstalled: (flowId: string) => void;
}

export default function FlowMarketplace({ isOpen, onClose, onInstalled }: Props) {
  const [templates, setTemplates] = useState<MarketTemplate[]>([]);
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [level, setLevel] = useState('all');
  const [price, setPrice] = useState('all');
  const [preview, setPreview] = useState<PreviewTemplate | null>(null);
  const [installTarget, setInstallTarget] = useState<MarketTemplate | null>(null);
  const [installName, setInstallName] = useState('');
  const [installing, setInstalling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await botFlowApi.marketplace();
      setTemplates(res.data.data.templates || []);
      setCategories(res.data.data.categories || []);
    } catch {
      toast.error(translateApiMessage("无法加载市场"));
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  const clearFilters = () => { setCategory('all'); setSearch(''); setFeaturedOnly(false); setLevel('all'); setPrice('all'); };
  const filtersActive = category !== 'all' || !!search || featuredOnly || level !== 'all' || price !== 'all';

  const visible = templates.filter(t => {
    if (category === 'featured' ? !t.featured : category !== 'all' && t.category !== category) return false;
    if (featuredOnly && !t.featured) return false;
    if (level !== 'all' && t.difficulty !== level) return false;
    if (price === 'free' && !t.free) return false;
    if (price === 'premium' && t.free) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${t.name} ${t.description} ${t.categoryLabel}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const featured = templates.filter(t => t.featured);
  const heading = category === 'all' ? 'All templates' : category === 'featured' ? 'Featured' : (categories.find(c => c.key === category)?.label || 'Templates');

  const openPreview = async (t: MarketTemplate) => {
    try {
      const res = await botFlowApi.marketplaceItem(t.id);
      setPreview(res.data.data);
    } catch {
      toast.error(translateApiMessage("无法加载预览"));
    }
  };

  const install = async () => {
    if (!installTarget || installing) return;
    setInstalling(true);
    try {
      const res = await botFlowApi.marketplaceInstall(installTarget.id, { name: installName || installTarget.name });
      toast.success(translateApiMessage(res.data.message || "作为草稿安装"));
      setInstallTarget(null);
      setPreview(null);
      onClose();
      onInstalled(res.data.data._id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "安装失败"));
    }
    setInstalling(false);
  };

  const card = (t: MarketTemplate) => (
    <div key={t.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col">
      <div className="p-3 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-2 flex-wrap">
        <span className="w-7 h-7 rounded-lg bg-white border border-emerald-200 flex items-center justify-center"><Sparkles className="w-3.5 h-3.5 text-emerald-600" /></span>
        <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 rounded px-1.5 py-0.5">{t.categoryLabel}</span>
        {t.free && <span className="text-[10px] font-semibold text-gray-700 bg-white border border-gray-200 rounded px-1.5 py-0.5">FREE</span>}
        {t.isNew && <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100 rounded px-1.5 py-0.5">NEW</span>}
      </div>
      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <h3 className="font-semibold text-gray-900 text-sm">{t.name}</h3>
        <p className="text-xs text-gray-500 line-clamp-3">{t.description}</p>
        <p className="text-[11px] text-gray-400 flex items-center gap-1"><User className="w-3 h-3" /> {t.author} · v{t.version}</p>
        {t.featured && <p className="text-[11px] text-amber-600 flex items-center gap-1"><Star className="w-3 h-3" /> 精选精选</p>}
        <div className="grid grid-cols-2 gap-1.5 text-[11px] text-gray-600">
          <span className="border border-gray-200 rounded px-1.5 py-1 flex items-center gap-1"><Layers className="w-3 h-3" /> 步骤： {t.steps}</span>
          <span className="border border-gray-200 rounded px-1.5 py-1 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {t.trigger}</span>
          <span className="border border-gray-200 rounded px-1.5 py-1 flex items-center gap-1"><Clock className="w-3 h-3" /> 设置： {t.setupMinutes} min</span>
          <span className="border border-gray-200 rounded px-1.5 py-1 capitalize">{t.difficulty}</span>
        </div>
        <div className="flex gap-2 pt-1 mt-auto">
          <button onClick={() => openPreview(t)} className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-medium border border-gray-200 rounded-lg py-2 hover:bg-gray-50"><Eye className="w-3.5 h-3.5" /> 预览</button>
          <button onClick={() => { setInstallTarget(t); setInstallName(t.name); }} className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold text-white bg-indigo-600 rounded-lg py-2 hover:bg-indigo-700"><Download className="w-3.5 h-3.5" /> 使用模板</button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={"现成的市场"} size="xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100 flex-wrap">
            <div>
              <h2 className="font-semibold text-gray-900">市场</h2>
              <p className="text-xs text-gray-600">浏览模板 → 预览 → 安装为可编辑草稿。在您将流程激活之前，一切都不会生效。</p>
            </div>
            <div className="flex gap-2 text-[11px] font-medium text-gray-700">
              <span className="bg-white border border-gray-200 rounded-full px-2 py-1">{templates.length} 模板</span>
              <span className="bg-white border border-gray-200 rounded-full px-2 py-1">{categories.length} 类别</span>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="w-44 shrink-0 border border-gray-200 rounded-xl overflow-hidden">
              <p className="px-3 py-2 text-[10px] font-semibold text-gray-500 bg-gray-50 border-b border-gray-100">CATEGORIES</p>
              <div className="max-h-[50vh] overflow-y-auto">
                {[{ key: 'all', label: "全部", count: templates.length }, { key: 'featured', label: "精选", count: featured.length }, ...categories].map(c => (
                  <button key={c.key} onClick={() => setCategory(c.key)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs ${category === c.key ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}>
                    <span className="truncate">{c.label}</span>
                    <span className="text-[10px] text-gray-400">{c.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{heading}</p>
                  <p className="text-[11px] text-gray-500">{visible.length} of {templates.length} 模板</p>
                </div>
                <div className="flex-1" />
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={"搜索模板..."}
                    className="text-xs pl-8 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44" />
                </div>
                <button onClick={() => setFeaturedOnly(!featuredOnly)}
                  className={`text-xs px-3 py-2 rounded-lg border ${featuredOnly ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold' : 'border-gray-200 text-gray-600'}`}>精选</button>
                <select value={level} onChange={(e) => setLevel(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200 bg-white">
                  <option value="all">所有级别</option>
                  <option value="easy">简单</option>
                  <option value="medium">中</option>
                </select>
                <select value={price} onChange={(e) => setPrice(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200 bg-white">
                  <option value="all">免费和高级</option>
                  <option value="free">仅限免费</option>
                  <option value="premium">仅限高级版</option>
                </select>
                {filtersActive && (
                  <button onClick={clearFilters} className="text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 inline-flex items-center gap-1"><X className="w-3 h-3" /> 清除</button>
                )}
              </div>

              {category === 'all' && !filtersActive && !!featured.length && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-800 flex items-center gap-1"><Star className="w-4 h-4 text-amber-500" /> 特色模板</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{featured.slice(0, 3).map(card)}</div>
                </div>
              )}

              <div className="max-h-[50vh] overflow-y-auto pr-1">
                {loading && <p className="text-sm text-gray-500">正在加载市场...</p>}
                {!loading && !visible.length && <p className="text-sm text-gray-500">没有模板与这些过滤器匹配。</p>}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map(card)}</div>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!preview} onClose={() => setPreview(null)} title={preview ? `预览 — ${preview.name}` : ''} size="lg">
        {preview && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">{preview.description}</p>
            <p className="text-xs text-gray-500">{preview.author} · v{preview.version} · {preview.steps} 步骤·设置 {preview.setupMinutes} 分钟· {preview.difficulty}</p>
            {!!preview.triggerKeywords.length && (
              <p className="text-xs text-gray-500">从关键字开始： {preview.triggerKeywords.join(', ')}</p>
            )}
            <div className="space-y-2 max-h-[45vh] overflow-y-auto">
              {preview.preview.map((s, i) => (
                <div key={i} className="p-3 rounded-lg border border-gray-200">
                  <p className="text-[11px] font-semibold text-gray-500">{i + 1}. {s.name} · {translateDisplay(s.type)}</p>
                  {!!s.text && <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{s.text}</p>}
                  {!!s.actionTag && <p className="text-xs text-indigo-600 mt-1">添加标签： {s.actionTag}</p>}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreview(null)}>关闭</Button>
              <Button icon={<Download className="w-4 h-4" />} onClick={() => { setInstallTarget(preview); setInstallName(preview.name); }}>使用模板</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!installTarget} onClose={() => !installing && setInstallTarget(null)} title={installTarget ? `安装“${installTarget.name}”` : ''}>
        {installTarget && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">创建一个 <b>无效草稿</b> 在此工作区中流动 — 在您将其设为“活动”之前，不会发送任何内容。</p>
            <p className="text-xs text-gray-500">{installTarget.author} · v{installTarget.version} · {installTarget.steps} 步骤</p>
            <Input label={"流程名称"} value={installName} onChange={(e) => setInstallName(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setInstallTarget(null)}>取消</Button>
              <Button icon={<Download className="w-4 h-4" />} loading={installing} onClick={install}>安装为草稿</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
