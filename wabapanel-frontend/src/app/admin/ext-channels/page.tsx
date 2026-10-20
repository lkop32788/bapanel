'use client';
// 外部通道（平台级配置）：按商户接入第三方消息 API。
// 商户侧以「专线通道」名义使用，看不到 endpoint / 密钥等对接配置。
import React, { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import ExtChannelManager from '@/components/admin/ExtChannelManager';
import { translateDisplay } from '@/lib/zhDisplay';

type WorkspaceOpt = { _id: string; name: string; owner?: { name?: string; email?: string } };

export default function AdminExtChannelsPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceOpt[]>([]);
  const [selectedWs, setSelectedWs] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // 商户列表复用 data-cleanup 概览接口返回的 workspaces
        const res = await adminApi.getDataCleanup();
        setWorkspaces(res.data.data?.workspaces || []);
      } catch { /* empty */ }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">外部通道</h1>
        <p className="text-sm text-gray-500 mt-1">
          平台级配置：按商户接入第三方消息 API（endpoint + 密钥 + 入站 webhook）。商户侧以「专线通道」名义收发消息，无需也无法自行配置。
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-700">商户</label>
        <select
          value={selectedWs}
          onChange={e => setSelectedWs(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white max-w-xs"
        >
          <option value="">{loading ? '加载中…' : '选择商户'}</option>
          {workspaces.map(w => (
            <option key={w._id} value={w._id}>{translateDisplay(w.name)}{w.owner?.email ? ` (${w.owner.email})` : ''}</option>
          ))}
        </select>
      </div>

      {selectedWs ? (
        <ExtChannelManager workspaceId={selectedWs} />
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          请先选择一个商户
        </div>
      )}
    </div>
  );
}
