"use client";
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from "react";
import { responseResourceApi } from "@/lib/api";
import toast from "react-hot-toast";

interface ResponseResource { _id: string; title: string; category: string; content: string; shortcut: string; usageCount: number; isActive: boolean; }

export default function ResponseResourcesPage() {
  const [resources, setResources] = useState<ResponseResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ResponseResource | null>(null);
  const [form, setForm] = useState({ title: "", category: "custom", content: "", shortcut: "" });
  const [filterCat, setFilterCat] = useState("all");

  const fetchResources = async () => { try { const params = filterCat !== "all" ? { category: filterCat } : {}; const res = await responseResourceApi.list(params); setResources(res.data.data || []); } catch { /* empty */ } finally { setLoading(false); } };
  useEffect(() => { fetchResources(); }, [filterCat]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) { await responseResourceApi.update(editing._id, form); } else { await responseResourceApi.create(form); }
      setShowForm(false); setEditing(null); setForm({ title: "", category: "custom", content: "", shortcut: "" }); fetchResources();
      toast.success(translateApiMessage(editing ? "资源已更新" : "资源已创建"));
    } catch { toast.error(translateApiMessage("保存失败")); }
  };

  const handleDelete = async (id: string) => { if (!confirm("删除该资源？")) return; try { await responseResourceApi.delete(id); fetchResources(); toast.success(translateApiMessage("资源已删除")); } catch { toast.error(translateApiMessage("删除失败")); } };

  const catColors: Record<string, string> = { greeting: "bg-green-100 text-green-800", faq: "bg-blue-100 text-blue-800", closing: "bg-purple-100 text-purple-800", promotion: "bg-orange-100 text-orange-800", support: "bg-red-100 text-red-800", custom: "bg-gray-100 text-gray-800" };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;

  return (
    <div className="p-6">
      <div className="page-hero flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-gray-900">响应资源</h1><p className="text-sm text-gray-500 mt-1">管理响应模板和资源</p></div>
        <div className="flex gap-3">
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="all">所有类别</option><option value="greeting">问候语</option><option value="faq">FAQ</option><option value="closing">结束</option><option value="promotion">促销</option><option value="support">支持</option><option value="custom">定制</option>
          </select>
          <button onClick={() => { setEditing(null); setForm({ title: "", category: "custom", content: "", shortcut: "" }); setShowForm(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            添加资源
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">{editing ? "编辑资源" : "新资源"}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">标题 *</label><input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">类别</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border rounded-lg"><option value="greeting">问候语</option><option value="faq">FAQ</option><option value="closing">结束</option><option value="promotion">促销</option><option value="support">支持</option><option value="custom">定制</option></select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">快捷方式</label><input type="text" value={form.shortcut} onChange={e => setForm({ ...form, shortcut: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder={"例如/小时"} /></div>
            <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">内容*</label><textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} required rows={3} className="w-full px-3 py-2 border rounded-lg" /></div>
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">{editing ? "更新" : "创建"}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg">取消</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {resources.length === 0 ? (
          <div className="md:col-span-3 bg-white rounded-xl shadow-sm border p-8 text-center text-gray-500">尚无响应资源。</div>
        ) : resources.map(r => (
          <div key={r._id} className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-gray-900">{r.title}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${catColors[r.category] || catColors.custom}`}>{r.category}</span>
            </div>
            <p className="text-sm text-gray-600 mb-3 line-clamp-3">{r.content}</p>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {r.shortcut && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{r.shortcut}</span>}
                <span className="text-xs text-gray-400">已使用 {r.usageCount || 0} 次</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditing(r); setForm({ title: r.title, category: r.category, content: r.content, shortcut: r.shortcut }); setShowForm(true); }} className="text-sm text-blue-600 hover:text-blue-800">编辑</button>
                <button onClick={() => handleDelete(r._id)} className="text-sm text-red-600 hover:text-red-800">删除</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
