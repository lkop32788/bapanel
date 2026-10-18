'use client';

import { translateDisplay } from '@/lib/zhDisplay';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { integrationApi } from '@/lib/api';
import { Search, RefreshCw, Users } from 'lucide-react';

interface LeadItem { _id: string; name: string; phone: string; email: string; tags: string[]; source?: string; sourceDetail?: string; createdAt: string }

const SOURCE_LABELS: Record<string, string> = {
  indiamart: 'IndiaMART', justdial: 'Justdial', tradeindia: 'TradeIndia', exportersindia: 'ExportersIndia',
  '99acres': '99acres', magicbricks: 'MagicBricks', housing: 'Housing.com', olx: 'OLX', tagmango: 'TagMango',
  'google-lead-forms': "Google 潜在客户表格", 'wordpress-forms': "WordPress 表单", 'google-forms': "谷歌表单",
  typeform: 'Typeform', jotform: 'Jotform', 'landing-pages': "登陆页面", flexifunnels: 'FlexiFunnels',
  website: 'Website', 'linkedin-ads': 'LinkedIn', 'twitter-ads': "X 广告", leadsquared: 'LeadSquared',
  gohighlevel: 'GoHighLevel', facebook_lead: "Facebook 线索广告", 'facebook-leads': "Facebook 线索广告",
};

export default function AllLeadsPage() {
  const [items, setItems] = useState<LeadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const r = await integrationApi.allLeads({ page: p, limit: 25, search, source });
      setItems(r.data.data.items || []);
      setTotal(r.data.data.total || 0);
      setPage(r.data.data.page || 1);
      setPages(r.data.data.pages || 1);
    } catch { /* keep old data */ }
    setLoading(false);
  }, [search, source]);

  useEffect(() => { load(1); }, [load]);

  const sourceOf = (l: LeadItem) => {
    if (l.sourceDetail) return l.sourceDetail;
    const tags = l.tags || [];
    const t = tags.find(tag => tag !== 'lead' && SOURCE_LABELS[tag]) || tags.find(tag => tag !== 'lead');
    if (t) return SOURCE_LABELS[t] || t;
    return l.source && l.source !== 'manual' ? (SOURCE_LABELS[l.source] || l.source) : '-';
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users className="w-6 h-6 text-emerald-600" /> 所有线索</h1>
          <p className="text-sm text-gray-500">来自每个关联来源的线索 — IndiaMART、Facebook、网站等（{total} 总计）</p>
        </div>
        <button onClick={() => load(page)} className="px-3 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={"搜索姓名、电话、电子邮件..."}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <select value={source} onChange={e => setSource(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="">所有来源</option>
          {Object.entries(SOURCE_LABELS).filter(([k]) => k !== 'facebook-leads').map(([k, v]) => <option key={k} value={k}>{translateDisplay(v)}</option>)}
        </select>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            尚无线索。连接集成，潜在客户将自动出现在此处。
            <div className="mt-3"><Link href="/client/integrations" className="text-emerald-600 hover:underline">转到集成 →</Link></div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">电话</th>
                <th className="px-4 py-3 font-medium">邮箱</th>
                <th className="px-4 py-3 font-medium">来源</th>
                <th className="px-4 py-3 font-medium">已收到</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(l => (
                <tr key={l._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{l.name || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{l.phone}</td>
                  <td className="px-4 py-3 text-gray-500">{l.email || '-'}</td>
                  <td className="px-4 py-3"><span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs">{sourceOf(l)}</span></td>
                  <td className="px-4 py-3 text-gray-500">{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => load(page - 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">上一页</button>
          <span className="text-gray-500">页 {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => load(page + 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">下一步</button>
        </div>
      )}
    </div>
  );
}
