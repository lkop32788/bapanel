'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Trash2, RefreshCw, Play } from 'lucide-react';
import Button from '@/components/ui/Button';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface CategoryCfg { enabled: boolean; days: number }
interface WorkspaceOpt { _id: string; name: string; owner?: { name?: string; email?: string } }
interface CleanupSettings {
  enabled: boolean;
  runHour: number;
  categories: Record<string, CategoryCfg>;
  lastRun?: string;
  lastRunSummary?: string;
}

export default function DataCleanupPage() {
  const [settings, setSettings] = useState<CleanupSettings>({ enabled: false, runHour: 3, categories: {} });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceOpt[]>([]);
  const [selectedWs, setSelectedWs] = useState('');

  const load = async (ws?: string) => {
    try {
      const res = await adminApi.getDataCleanup(ws ?? selectedWs);
      const d = res.data.data;
      setSettings({
        enabled: !!d.settings.enabled,
        runHour: d.settings.runHour ?? 3,
        categories: d.settings.categories || {},
        lastRun: d.settings.lastRun,
        lastRunSummary: d.settings.lastRunSummary,
      });
      setCounts(d.counts || {});
      setLabels(d.labels || {});
      setWorkspaces(d.workspaces || []);
    } catch { toast.error(translateApiMessage("无法加载清理设置")); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setCat = (key: string, patch: Partial<CategoryCfg>) => {
    setSettings(s => ({
      ...s,
      categories: { ...s.categories, [key]: { ...{ enabled: false, days: 30 }, ...s.categories[key], ...patch } },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateDataCleanup(settings);
      toast.success(translateApiMessage("清理设置已保存"));
      load();
    } catch { toast.error(translateApiMessage("无法保存设置")); }
    setSaving(false);
  };

  const runNow = async () => {
    const scope = selectedWs ? (workspaces.find(w => w._id === selectedWs)?.name || 'this client') : 'ALL clients';
    if (!confirm(`立即运行清理 ${scope}？已启用类别中的旧记录将被永久删除。`)) return;
    setRunning(true);
    try {
      const res = await adminApi.runDataCleanup(selectedWs || undefined);
      toast.success(translateApiMessage(res.data.data.summary || "清理完成"));
      load();
    } catch { toast.error(translateApiMessage("清理失败")); }
    setRunning(false);
  };

  if (loading) return <div className="p-6 text-gray-400">加载中…</div>;

  return (
    <div className="p-6 max-w-3xl">
      <div className="page-hero mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trash2 className="w-6 h-6" /> 数据清理
          </h1>
          <p className="text-sm mt-1">自动删除旧数据以保持服务器轻量。每天在选定的时间运行。</p>
        </div>
        <Button variant="outline" onClick={() => load()}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">启用自动清理</p>
            <p className="text-xs text-gray-500">启用后，每天都会清理以下启用的类别。</p>
          </div>
          <button
            onClick={() => setSettings(s => ({ ...s, enabled: !s.enabled }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
          >
            <span className="inline-block h-5 w-5 rounded-full bg-white transition-transform" style={{ transform: settings.enabled ? 'translateX(22px)' : 'translateX(2px)' }} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-700">每天运行于</label>
          <select
            value={settings.runHour}
            onChange={e => setSettings(s => ({ ...s, runHour: Number(e.target.value) }))}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{translateDisplay(String(h).padStart(2, '0'))}:00</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">服务器时间</span>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-700">客户端</label>
          <select
            value={selectedWs}
            onChange={e => { setSelectedWs(e.target.value); load(e.target.value); }}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white max-w-xs"
          >
            <option value="">所有客户</option>
            {workspaces.map(w => (
              <option key={w._id} value={w._id}>{translateDisplay(w.name)}{translateDisplay(w.owner?.email ? ` (${w.owner.email})` : '')}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">计数并立即运行使用此；每日自动运行始终覆盖所有客户端</span>
        </div>

        <div className="border-t border-gray-100 pt-3 space-y-2">
          {Object.keys(labels).map(key => {
            const cat = settings.categories[key] || { enabled: false, days: 30 };
            return (
              <div key={key} className="flex items-center justify-between px-3 py-2.5 border border-gray-100 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-800">{labels[key]}</p>
                  <p className="text-xs text-gray-400">{(counts[key] ?? 0).toLocaleString()} 当前记录</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">删除早于</span>
                  <input
                    type="number" min={1} value={cat.days}
                    onChange={e => setCat(key, { days: Number(e.target.value) })}
                    className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm"
                  />
                  <span className="text-xs text-gray-500">天</span>
                  <button
                    onClick={() => setCat(key, { enabled: !cat.enabled })}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${cat.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                  >
                    <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: cat.enabled ? 'translateX(18px)' : 'translateX(2px)' }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {settings.lastRun && (
          <p className="text-xs text-gray-500">
            上次运行： {new Date(settings.lastRun).toLocaleString()} — {settings.lastRunSummary}
          </p>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={runNow} disabled={running}>
            <Play className="w-4 h-4 mr-1" /> {running ? "正在运行..." : "立即运行"}
          </Button>
          <Button onClick={save} disabled={saving}>{saving ? "保存中…" : "保存设置"}</Button>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        注意：联系人、活动对话、账单记录和订阅永远不会自动删除。
      </p>
    </div>
  );
}
