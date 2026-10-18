/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import React, { useState, useEffect, useContext } from 'react';
import { SiteSettingsContext } from '@/components/SiteContentProvider';
import Link from 'next/link';
import { MessageSquare, Search, BookOpen, Menu, X, Copy, Check, Download, Sparkles, ChevronDown } from 'lucide-react';

import { useSiteContent } from '@/lib/siteContent';
import { getGuideSections, buildPlainText, Biz } from '@/lib/aiGuideContent';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

interface Article { _id: string; title: string; slug: string; excerpt: string; category: string; content: string; createdAt: string; }

export default function KnowledgeBasePage() {
  const c = useSiteContent();
  const [articles, setArticles] = useState<Article[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [settings, setSettings] = useState<any>(useContext(SiteSettingsContext));
  const [mobileMenu, setMobileMenu] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);
  const [openG, setOpenG] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`${API}/public/site-settings`).then(r => r.json()).then(d => { if (d.success) setSettings(d.data); }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API}/public/knowledge`).then(r => r.json()).then(d => {
      if (d.success) setArticles(d.data);
    }).catch(() => {});
  }, []);

  const biz: Biz = settings?.business || { name: '' };
  const logo = settings?.branding?.logo;

  const guideSections = getGuideSections(biz);
  const s = search.trim().toLowerCase();
  const guideFiltered = !s
    ? guideSections
    : guideSections
        .map((sec) => ({ ...sec, items: sec.items.filter((it) => it.q.toLowerCase().includes(s) || it.a.some((p) => p.toLowerCase().includes(s)) || sec.title.toLowerCase().includes(s)) }))
        .filter((sec) => sec.items.length > 0);

  const copyAll = () => {
    navigator.clipboard.writeText(buildPlainText(biz));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const downloadPdf = () => {
    const secs = getGuideSections(biz);
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const contact = [biz.email, biz.url, biz.phone, biz.address].filter(Boolean).map((t) => esc(String(t))).join(' &middot; ');
    const body = secs.map((sec) => `<h2>${esc(sec.title)}</h2>` + sec.items.map((it) => `<div class="qa"><p class="q">${esc(it.q)}</p>${it.a.map((p) => `<p class="a">${esc(p)}</p>`).join('')}</div>`).join('')).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(biz.name)} — Complete Guide</title><style>*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:40px;line-height:1.5}h1{font-size:24px;margin:0 0 4px}.sub{color:#666;font-size:13px;margin:0 0 24px}h2{font-size:16px;margin:28px 0 8px;color:#30057a;border-bottom:2px solid #eee;padding-bottom:4px}.qa{margin:0 0 12px}.q{font-weight:700;font-size:13px;margin:0 0 2px}.a{font-size:13px;color:#333;margin:0 0 4px}@media print{body{margin:20px}}</style></head><body><h1>${esc(biz.name)} — Complete Platform Guide</h1><p class="sub">${biz.tagline ? esc(biz.tagline) + '<br>' : ''}${contact}</p>${body}<script>window.onload=function(){window.print();}<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const categories = Array.from(new Set(articles.map(a => a.category).filter(Boolean)));
  const filtered = articles.filter(a => {
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.excerpt?.toLowerCase().includes(search.toLowerCase());
    const matchCat = !category || a.category === category;
    return matchSearch && matchCat;
  });

  const handleCopy = (article: Article) => {
    const text = `${article.title}\n\n${article.content || article.excerpt}`;
    navigator.clipboard.writeText(text);
    setCopiedId(article._id);
    setTimeout(() => setCopiedId(''), 2000);
  };

  return (
    <div className="min-h-screen bg-[#faf9fe] text-gray-900 overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 w-[95%] max-w-6xl bg-white/80 backdrop-blur-2xl border border-gray-200/60 rounded-2xl shadow-lg shadow-purple-100/30 z-50 px-5 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            {logo ? <img src={logo} alt={biz.name} className="h-10 w-auto" /> : (
              <div className="w-9 h-9 bg-linear-to-br from-violet-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg shadow-violet-200">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
            )}
          </Link>
          <div className="hidden lg:flex items-center gap-1">
            {(c.nav.links || []).map((l: any, i: number) => (
              <a key={i} href={l.href} className="px-3 py-1.5 text-sm font-bold text-gray-900 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-all">{l.label}</a>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Link href="/auth/login" className="px-4 py-2 text-sm font-bold text-gray-900 hover:text-violet-700 transition-all">{c.nav.loginText}</Link>
            <Link href="/auth/register" className="px-4 py-2 text-sm font-bold text-white bg-linear-to-r from-violet-600 to-purple-600 rounded-lg shadow-md shadow-violet-200/40 hover:shadow-lg transition-all hover:-translate-y-0.5">{c.nav.registerText}</Link>
          </div>
          <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden p-2 rounded-lg hover:bg-gray-100">
            {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileMenu && (
          <div className="md:hidden pt-4 pb-2 border-t border-gray-100 mt-3 space-y-2">
            {(c.nav.links || []).map((l: any, i: number) => (
              <a key={i} href={l.href} onClick={() => setMobileMenu(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-violet-50">{l.label}</a>
            ))}
            <div className="flex gap-2 pt-2">
              <Link href="/auth/login" className="flex-1 text-center px-4 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl">{c.nav.loginText}</Link>
              <Link href="/auth/register" className="flex-1 text-center px-4 py-2.5 text-sm font-semibold text-white bg-linear-to-r from-violet-600 to-purple-600 rounded-xl">{c.nav.registerText}</Link>
            </div>
          </div>
        )}
      </nav>

      {/* Header */}
      <section className="pt-32 md:pt-40 pb-12 px-4 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 right-1/4 w-[400px] h-[400px] bg-linear-to-br from-violet-200/30 to-purple-100/20 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto">
          <span className="inline-flex items-center px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full mb-4"><BookOpen className="w-3 h-3 mr-1" /> 知识库</span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-4">知识 <span className="bg-linear-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">中心</span></h1>
          <p className="text-lg text-gray-500 max-w-2xl mb-8">关于我们平台您需要了解的一切。用于人工智能培训和文档的复制粘贴就绪内容。</p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder={"搜索文章..."} value={search} onChange={e => setSearch(e.target.value)} autoComplete="off" className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none shadow-sm" />
            </div>
            {categories.length > 0 && (
              <select value={category} onChange={e => setCategory(e.target.value)} className="px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none shadow-sm">
                <option value="">所有类别</option>
                {categories.map(c => <option key={c} value={c}>{translateDisplay(c)}</option>)}
              </select>
            )}
          </div>
        </div>
      </section>

      {/* AI Master Guide */}
      <section className="pb-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-2xl border border-violet-200 bg-linear-to-br from-violet-50 to-white p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
              <div className="flex-1">
                <span className="inline-flex items-center px-2.5 py-1 bg-violet-600 text-white text-xs font-semibold rounded-full mb-2"><Sparkles className="w-3 h-3 mr-1" /> AI大师指南</span>
                <h2 className="text-xl md:text-2xl font-extrabold text-gray-900">关于的一切 {biz.name}，在一处</h2>
                <p className="text-sm text-gray-500 mt-1 max-w-2xl">销售、设置、功能、技术修复和支持 — 全部内容如下。复制整个指南并将其粘贴到任何 AI（ChatGPT 等）中，使其成为以下方面的专家 {biz.name}，或以 PDF 格式下载。</p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button onClick={copyAll} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700">
                  {copiedAll ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copiedAll ? "为 AI 复制！" : "全部复制给AI"}
                </button>
                <button onClick={downloadPdf} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-violet-300 text-violet-700 text-sm font-semibold hover:bg-violet-50">
                  <Download className="w-4 h-4" /> 下载 PDF
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {guideFiltered.map((sec) => (
                <div key={sec.id}>
                  <h3 className="text-base font-bold text-gray-900 mb-2">{sec.title}</h3>
                  <div className="space-y-2">
                    {sec.items.map((it, i) => {
                      const key = `${sec.id}-${i}`;
                      const isOpen = !!openG[key] || !!s;
                      return (
                        <div key={key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                          <button onClick={() => setOpenG((o) => ({ ...o, [key]: !o[key] }))} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
                            <span className="text-sm font-medium text-gray-800">{it.q}</span>
                            <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {isOpen && (
                            <div className="px-4 pb-4 pt-0 space-y-2 border-t border-gray-100">
                              {it.a.map((p, j) => (
                                <p key={j} className="text-sm text-gray-600 leading-relaxed mt-2 first:mt-3">{p}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {guideFiltered.length === 0 && <p className="text-sm text-gray-400 py-4">没有主题匹配“{search}”。</p>}
            </div>
          </div>
        </div>
      </section>

      {/* Articles */}
      {articles.length > 0 && (
      <section className="pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-6">帮助文章</h2>
          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map(article => (
                <div key={article._id} className="group rounded-2xl border border-gray-100 bg-white p-6 hover:shadow-xl hover:border-violet-200 transition-all duration-300 hover:-translate-y-1 flex flex-col">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-10 h-10 bg-linear-to-br from-violet-100 to-purple-50 rounded-xl flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5 text-violet-600" />
                    </div>
                    <button onClick={() => handleCopy(article)} className="p-2 rounded-lg hover:bg-violet-50 transition-colors" title={"复制内容"}>
                      {copiedId === article._id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
                    </button>
                  </div>
                  {article.category && <span className="inline-block px-2 py-0.5 bg-violet-50 text-violet-600 text-xs font-medium rounded-full mb-2 w-fit">{article.category}</span>}
                  <Link href={`/knowledge-base/${article.slug}`}>
                    <h2 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-violet-600 transition-colors line-clamp-2">{article.title}</h2>
                  </Link>
                  <p className="text-sm text-gray-500 line-clamp-3 flex-1">{article.excerpt || article.content?.substring(0, 120)}</p>
                  <Link href={`/knowledge-base/${article.slug}`} className="inline-flex items-center gap-1 text-sm font-medium text-violet-600 mt-4 hover:text-violet-700">阅读更多→</Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <BookOpen className="w-12 h-12 text-violet-200 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">未找到文章。请尽快回来查看！</p>
            </div>
          )}
        </div>
      </section>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-200/60 bg-white py-12 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">&copy; {new Date().getFullYear()} {biz.name}. {c.footer.copyrightText}</p>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <Link href="/privacy" className="hover:text-violet-600">隐私政策</Link>
            <Link href="/terms" className="hover:text-violet-600">服务条款</Link>
            <Link href="/about" className="hover:text-violet-600">关于</Link>
            <Link href="/contact" className="hover:text-violet-600">联系方式</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
