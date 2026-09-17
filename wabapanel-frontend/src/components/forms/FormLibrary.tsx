'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, Eye, Sparkles, Check, X, LayoutGrid } from 'lucide-react';
import { formApi } from '@/lib/api';
import toast from 'react-hot-toast';

export interface LibraryField {
  id: string;
  label: string;
  type: string;
  required: boolean;
  placeholder: string;
  options?: string[];
  order: number;
}

export interface LibraryTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  keyword: string;
  fields: LibraryField[];
}

interface Props {
  onBack: () => void;
  onCreated: () => void;
  onCustomize: (template: LibraryTemplate) => void;
}

export default function FormLibrary({ onBack, onCreated, onCustomize }: Props) {
  const [templates, setTemplates] = useState<LibraryTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('All');
  const [preview, setPreview] = useState<LibraryTemplate | null>(null);
  const [usingId, setUsingId] = useState<string | null>(null);

  useEffect(() => {
    formApi.library()
      .then(r => {
        setTemplates(r.data.data?.templates || []);
        setCategories(r.data.data?.categories || []);
      })
      .catch(() => toast.error(translateApiMessage("无法加载表单库")))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter(t => {
      if (activeCat !== 'All' && t.category !== activeCat) return false;
      if (!q) return true;
      return `${t.name} ${t.description} ${t.category} ${t.keyword} ${t.tags.join(' ')}`.toLowerCase().includes(q);
    });
  }, [templates, query, activeCat]);

  const countFor = (cat: string) => (cat === 'All' ? templates.length : templates.filter(t => t.category === cat).length);

  const useTemplate = async (t: LibraryTemplate) => {
    if (usingId) return;
    setUsingId(t.id);
    try {
      await formApi.useTemplate(t.id);
      toast.success(translateApiMessage(`"${t.name}“已添加到您的表单中`));
      setPreview(null);
      onCreated();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(err.response?.data?.message || "无法创建表单"));
    } finally {
      setUsingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg" title={"返回我的表格"}><ArrowLeft className="w-5 h-5" /></button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-emerald-600" /> 表格库
            </h1>
            <p className="text-white/90 text-sm mt-1">
              {templates.length} 现成的 WhatsApp 表格 {categories.length} 行业——选择一个，一键变成您自己的形式。
            </p>
          </div>
        </div>
        <div className="relative md:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={"搜索预约、订单、KYC..."}
            className="w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">正在加载库...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
          <aside className="bg-white rounded-xl border p-2 h-fit lg:sticky lg:top-4 max-h-[70vh] overflow-y-auto">
            {['All', ...categories].map(cat => (
              <button key={cat} onClick={() => setActiveCat(cat)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left ${activeCat === cat ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                <span className="truncate">{cat}</span>
                <span className="text-xs text-gray-400">{countFor(cat)}</span>
              </button>
            ))}
          </aside>

          <div>
            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl border p-12 text-center">
                <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-gray-500 font-medium">没有模板匹配“{query}”</h3>
                <p className="text-sm text-gray-400 mt-1">尝试其他关键字，或从头开始创建表单。</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map(t => (
                  <div key={t.id} className="bg-white rounded-xl border p-5 flex flex-col hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-gray-900 leading-snug">{t.name}</h3>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">{t.fields.length} 字段</span>
                    </div>
                    <p className="text-xs text-emerald-700 mt-1">{t.category}</p>
                    <p className="text-sm text-gray-500 mt-2 flex-1">{t.description}</p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {t.tags.map(tag => (
                        <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{tag}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t">
                      <button onClick={() => setPreview(t)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title={"预览字段"}><Eye className="w-4 h-4" /></button>
                      <button onClick={() => onCustomize(t)} className="text-xs px-2.5 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50">定制</button>
                      <button onClick={() => useTemplate(t)} disabled={usingId === t.id}
                        className="ml-auto text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
                        {usingId === t.id ? "添加..." : <><Sparkles className="w-3.5 h-3.5" /> 使用模板</>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-start justify-between sticky top-0 bg-white">
              <div>
                <h3 className="font-semibold text-gray-900">{preview.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{preview.category} · {preview.fields.length} 字段</p>
              </div>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-500">{preview.description}</p>
              {preview.fields.map(f => (
                <div key={f.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium text-gray-700">{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{translateDisplay(f.type)}</span>
                  </div>
                  {f.options && f.options.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {f.options.map(o => <span key={o} className="text-[11px] px-2 py-0.5 rounded bg-gray-50 border text-gray-600">{o}</span>)}
                    </div>
                  ) : (
                    <div className="mt-2 px-2 py-1.5 border rounded text-xs text-gray-400 bg-gray-50">{f.placeholder || f.type}</div>
                  )}
                </div>
              ))}
            </div>
            <div className="p-4 border-t flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => onCustomize(preview)} className="px-4 py-2 text-sm border rounded-lg text-gray-700 hover:bg-gray-50">先定制</button>
              <button onClick={() => useTemplate(preview)} disabled={usingId === preview.id}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                <Check className="w-4 h-4" /> {usingId === preview.id ? "添加..." : "使用此模板"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
