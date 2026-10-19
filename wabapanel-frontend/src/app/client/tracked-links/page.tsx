'use client';
import React, { useState } from 'react';
import ShortLinksPage from '@/components/ShortLinks';
import RotationLinks from '@/components/RotationLinks';

// 供应商的「潜在客户来源和二维码」tab 已移除（后端 /api/tracked-links 从不存在，属前端残留死功能）
export default function TrackedLinksPage() {
  const [tab, setTab] = useState<'short' | 'rotation'>('short');

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold text-gray-900">链接生成</h1>
        <p className="text-gray-500 text-sm mt-1">
          短链接用于分享和点击统计；轮询链接把多个 WhatsApp 号聚合成一个入口，自动分流进线客户并标记来源。
        </p>
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {([['short', "短链接"], ['rotation', "轮询链接"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === k ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'short' ? <ShortLinksPage embedded /> : <RotationLinks />}
    </div>
  );
}
