"use client";
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import toast from 'react-hot-toast';
import React, { useState, useEffect, useRef } from "react";
import { mediaApi } from "@/lib/api";

interface MediaFile { _id: string; name: string; originalName: string; url: string; type: string; mimeType: string; size: number; folder: string; createdAt: string; }

export default function MediaLibraryPage() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => { try { const params = filter !== "all" ? { type: filter } : {}; const res = await mediaApi.list(params); setFiles(res.data.data || []); } catch { /* empty */ } finally { setLoading(false); } };
  useEffect(() => { fetchFiles(); }, [filter]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (submitting) return;
    const file = e.target.files?.[0]; if (!file) return;
    setSubmitting(true);
    setUploading(true);
    const formData = new FormData(); formData.append("file", file); formData.append("name", file.name);
    try { await mediaApi.upload(formData); fetchFiles(); } catch { alert("上传失败"); } finally { setUploading(false); setSubmitting(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleDelete = async (id: string) => { if (!confirm("删除该文件？")) return; await mediaApi.delete(id); fetchFiles(); };


  const formatSize = (bytes: number) => { if (bytes < 1024) return bytes + " B"; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"; return (bytes / 1048576).toFixed(1) + " MB"; };

  const thumbUrl = (f: MediaFile) => {
    const m = f.url.match(/^(.*?)(?:\/api)?\/uploads\/([^/?#]+)$/);
    if (!m) return f.url.startsWith("http") ? f.url : `${(process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/api$/, '')}${f.url}`;
    const origin = m[1] || (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/api$/, '');
    return `${origin}/api/uploads/thumb/${m[2]}`;
  };
  const fullUrl = (f: MediaFile) => {
    if (f.url.startsWith("http")) return f.url;
    const base = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/api$/, '');
    if (base.startsWith('http')) return `${base}${f.url}`;
    return `${typeof window !== 'undefined' ? window.location.origin : ''}${f.url}`;
  };

  const copyLink = async (f: MediaFile) => {
    const link = fullUrl(f);
    try { await navigator.clipboard.writeText(link); toast.success(translateApiMessage("链接已复制")); }
    catch { toast.error(translateApiMessage("复制失败")); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const allSelected = files.length > 0 && selectedIds.length === files.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : files.map(f => f._id));

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm("删除" + selectedIds.length + "选择的项目？")) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => mediaApi.delete(id)));
      toast.success(translateApiMessage(selectedIds.length + "项目已删除"));
      setSelectedIds([]);
      fetchFiles();
    } catch { toast.error(translateApiMessage("删除某些项目失败")); } finally { setSubmitting(false); }
  };

  return (
    <div className="p-6">
      <div className="page-hero flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-gray-900">媒体库</h1><p className="text-sm text-gray-500 mt-1">上传和管理您的媒体文件</p></div>
        <div className="flex gap-3">
          <select value={filter} onChange={e => setFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="all">所有文件</option><option value="image">图像</option><option value="video">视频</option><option value="document">文件</option><option value="audio">音频</option>
          </select>
          <input type="file" ref={fileRef} onChange={handleUpload} className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
            {uploading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>}
            上传
          </button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="flex items-center justify-between mb-4 bg-white rounded-lg border px-4 py-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-emerald-600" />
            选择全部（{files.length})
          </label>
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{selectedIds.length} 已选择</span>
              <button onClick={() => setSelectedIds([])} className="text-sm text-gray-500 hover:text-gray-700">清除</button>
              <button onClick={handleBulkDelete} disabled={submitting} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 disabled:opacity-50">删除所选内容</button>
            </div>
          )}
        </div>
      )}

      {files.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <svg className="w-20 h-20 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">没有文件</h3>
          <p className="text-gray-500">上传图像、视频、文档以在您的营销活动中使用。</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {files.map(f => (
            <div key={f._id} className={`bg-white rounded-xl shadow-sm border overflow-hidden group hover:shadow-md ${selectedIds.includes(f._id) ? 'ring-2 ring-emerald-500' : ''}`}>
              <div className="aspect-square bg-gray-100 flex items-center justify-center relative">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(f._id)}
                  onChange={() => toggleSelect(f._id)}
                  className="absolute top-2 left-2 z-10 w-4 h-4 accent-emerald-600"
                />
                {f.type === "image" ? (
                  <img src={thumbUrl(f)} alt={f.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-4">
                    <svg className="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span className="text-xs text-gray-500 uppercase">{translateDisplay(f.type)}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <button onClick={() => copyLink(f)} className="bg-white text-gray-800 px-3 py-1 rounded-lg text-sm hover:bg-gray-100">复制链接</button>
                  <button onClick={() => handleDelete(f._id)} className="bg-red-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-red-600">删除</button>
                </div>
              </div>
              <div className="p-3">
                <p className="text-sm font-medium text-gray-900 truncate">{f.name}</p>
                <p className="text-xs text-gray-500">{formatSize(f.size)} · {new Date(f.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
