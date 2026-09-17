'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface ImageUploadInputProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  hint?: string;
  folder?: string;
  accept?: string;
}

export default function ImageUploadInput({ label, value, onChange, hint, folder = 'branding', accept = 'image/*,.ico,.svg' }: ImageUploadInputProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', folder);
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success) {
        onChange(res.data.data.url);
        toast.success(translateApiMessage("上传成功"));
      } else {
        toast.error(translateApiMessage(res.data.message || "上传失败"));
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "上传失败"));
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="https://... or upload a file"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
        >
          <Upload className="w-4 h-4" />
          {uploading ? "正在上传..." : "上传"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            title={"清除"}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      {value && (
        <div className="mt-2 inline-flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
          <ImageIcon className="w-4 h-4 text-gray-400" />
          <img src={value} alt={"预览"} className="h-10 max-w-[120px] object-contain rounded" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      )}
    </div>
  );
}
