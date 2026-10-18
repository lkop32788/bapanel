'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, Download, Clock, AlertCircle, Package, Upload, RotateCcw } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import toast from 'react-hot-toast';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api').replace(/\/api$/, '');

const IST_TZ = 'Asia/Kolkata';
// Render update timestamps in IST. The store sends `deployed_at` as a naive
// UTC string ("YYYY-MM-DD HH:MM:SS") which `new Date()` would otherwise parse
// in the browser's local zone; normalize it to UTC before converting to IST.
function toIST(value?: string | null, dateOnly = false): string {
  if (!value) return '';
  let s = value;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) s = s.replace(' ', 'T') + 'Z';
  const d = new Date(s);
  if (isNaN(d.getTime())) return value;
  const opts: Intl.DateTimeFormatOptions = dateOnly
    ? { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }
    : { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
  return new Intl.DateTimeFormat('en-IN', opts).format(d) + (dateOnly ? '' : ' IST');
}

function getToken() {
  if (typeof window !== 'undefined') return localStorage.getItem('token') || '';
  return '';
}

async function apiCall(endpoint: string, method = 'GET', body?: object) {
  const res = await fetch(`${API_BASE}/api/admin/kkhs-license${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

interface PatchInfo {
  id: number;
  version: string;
  filename: string;
  description?: string;
  deployed_at: string;
  download_url: string;
}

export default function UpdatesPage() {
  const [status, setStatus] = useState<{
    isActive: boolean;
    lastHeartbeat: string | null;
    licenseData: { plan?: string };
    lastPatchVersion?: string;
    lastPatchAt?: string;
    panelVersion?: string;
  } | null>(null);
  const [patches, setPatches] = useState<PatchInfo[]>([]);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [patchVersion, setPatchVersion] = useState('');
  const [installedPatches, setInstalledPatches] = useState<{version: string; appliedAt: string; fileCount: number}[]>([]);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await apiCall('/status');
      if (res.success) setStatus(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fetchInstalledPatches = async () => {
    try {
      const res = await apiCall('/installed-patches');
      if (res.success) setInstalledPatches(res.patches || []);
    } catch { /* ignore */ }
  };

  const rollbackPatch = async (version: string) => {
    if (!confirm(`回滚补丁 ${version}？这将恢复以前的文件并重新启动面板。`)) return;
    setRollingBack(version);
    toast.loading(translateApiMessage(`回滚 ${version}...`), { id: 'rollback' });
    try {
      const res = await apiCall('/rollback', 'POST', { version });
      if (res.success) {
        toast.success(translateApiMessage(res.message || "回滚完成！"), { id: 'rollback' });
        setTimeout(() => { fetchStatus(); fetchInstalledPatches(); }, 5000);
      } else {
        toast.error(translateApiMessage(res.message || "回滚失败"), { id: 'rollback' });
      }
    } catch { toast.error(translateApiMessage("回滚期间出现网络错误"), { id: 'rollback' }); }
    setRollingBack(null);
  };

  useEffect(() => { fetchStatus(); fetchInstalledPatches(); }, []);

  const checkForUpdates = async () => {
    setChecking(true);
    toast.loading(translateApiMessage("正在检查更新..."), { id: 'upd' });
    try {
      const res = await apiCall('/check-updates');
      if (res.success && res.data) {
        setPatches(res.data.patches || []);
        setHasUpdate(res.data.hasUpdate || false);
        if (res.data.hasUpdate) {
          toast.success(translateApiMessage(`可用更新： ${res.data.latestVersion}`), { id: 'upd' });
        } else {
          toast.success(translateApiMessage("面板已更新！"), { id: 'upd' });
        }
      } else {
        toast.error(translateApiMessage(res.data?.error || res.message || "检查失败"), { id: 'upd' });
      }
    } catch { toast.error(translateApiMessage("网络错误"), { id: 'upd' }); }
    setChecking(false);
  };

  const installUpdate = async (patchId: number, version: string) => {
    if (!confirm(`安装更新 ${version}？安装后面板将重新启动。`)) return;
    setInstalling(patchId);
    toast.loading(translateApiMessage(`安装 ${version}...`), { id: 'install' });
    try {
      const res = await apiCall('/install-update', 'POST', { patchId });
      if (res.success) {
        toast.success(translateApiMessage(res.message || "更新已安装！面板重新启动..."), { id: 'install' });
        setTimeout(() => { fetchStatus(); checkForUpdates(); }, 5000);
      } else {
        toast.error(translateApiMessage(res.message || "安装失败"), { id: 'install' });
      }
    } catch { toast.error(translateApiMessage("安装期间网络错误"), { id: 'install' }); }
    setInstalling(null);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="page-hero"><h1>系统更新</h1><p>检查更新和补丁</p></div>
        <div className="mt-6 text-center text-gray-500">加载中…</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="page-hero">
        <h1 className="flex items-center gap-2"><Download className="w-6 h-6" /> 系统更新</h1>
        <p>检查新功能、补丁和改进</p>
        <div className="mt-3">
          <Button size="sm" variant="secondary" onClick={checkForUpdates} disabled={checking}>
            <RefreshCw className={`w-4 h-4 mr-1 ${checking ? 'animate-spin' : ''}`} />
            {checking ? "检查..." : "检查更新"}
          </Button>
        </div>
      </div>

      {/* Status Card */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          {hasUpdate ? (
            <>
              <AlertCircle className="w-6 h-6 text-orange-500" />
              <div>
                <h2 className="text-lg font-semibold">可用更新</h2>
                <p className="text-sm text-gray-500">新版本已准备好安装</p>
              </div>
            </>
          ) : (
            <>
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <h2 className="text-lg font-semibold">您的面板已更新</h2>
                <p className="text-sm text-gray-500">版本 {status?.panelVersion || '1.0.0'}</p>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Clock className="w-4 h-4" /> 上次更新检查
            </div>
            <div className="font-medium">
              {status?.lastHeartbeat ? toIST(status.lastHeartbeat) : "从来没有"}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Download className="w-4 h-4" /> 许可证状态
            </div>
            <div className="font-medium">
              {status?.isActive ? (
                <span className="text-green-700">活跃（{status.licenseData?.plan || "标准"})</span>
              ) : (
                <span className="text-orange-600">未激活</span>
              )}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Package className="w-4 h-4" /> 应用了最后一个补丁
            </div>
            <div className="font-medium">
              {status?.lastPatchVersion ? (
                <span>{status.lastPatchVersion} <span className="text-xs text-gray-400">({status.lastPatchAt ? toIST(status.lastPatchAt, true) : ''})</span></span>
              ) : (
                <span className="text-gray-400">无</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Available Patches */}
      {patches.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" /> 可用更新
          </h3>
          <div className="space-y-3">
            {patches.map((patch) => {
              const isApplied = status?.lastPatchVersion === patch.version;
              return (
                <div key={patch.id} className={`flex items-center justify-between p-4 rounded-lg border ${isApplied ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {patch.version}
                      {isApplied && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">已安装</span>}
                    </div>
                    {patch.description && <p className="text-sm text-gray-600 mt-1">{patch.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">发布： {toIST(patch.deployed_at)}</p>
                  </div>
                  {!isApplied && (
                    <Button
                      size="sm"
                      onClick={() => installUpdate(patch.id, patch.version)}
                      disabled={installing === patch.id}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      {installing === patch.id ? "正在安装..." : "安装"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Upload Patch */}
      <Card className="p-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Upload className="w-5 h-5 text-purple-600" /> 上传补丁 (ZIP)
        </h3>
        <p className="text-sm text-gray-500 mb-4">上传补丁 ZIP 文件以手动更新面板。</p>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">版本标签（可选）</label>
            <input type="text" value={patchVersion} onChange={e => setPatchVersion(e.target.value)} placeholder="e.g. 1.0.1" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${uploading ? 'bg-gray-300 text-gray-500' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
            <Upload className="w-4 h-4" />
            {uploading ? "正在上传..." : "选择并上传 ZIP"}
            <input type="file" accept=".zip" className="hidden" disabled={uploading} onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              toast.loading(translateApiMessage("正在上传补丁..."), { id: 'patch' });
              try {
                const form = new FormData();
                form.append('patch', file);
                if (patchVersion) form.append('version', patchVersion);
                const res = await fetch(`${API_BASE}/api/admin/kkhs-license/upload-patch`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${getToken()}` },
                  body: form,
                });
                const data = await res.json();
                if (data.success) {
                  toast.success(translateApiMessage(data.message || "已应用补丁！"), { id: 'patch' });
                  setTimeout(() => fetchStatus(), 5000);
                } else {
                  toast.error(translateApiMessage(data.message || "上传失败"), { id: 'patch' });
                }
              } catch { toast.error(translateApiMessage("上传失败"), { id: 'patch' }); }
              setUploading(false);
              e.target.value = '';
            }} />
          </label>
        </div>
      </Card>

      {/* Installed Patches (Rollback) */}
      {installedPatches.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-orange-600" /> 安装的补丁
          </h3>
          <p className="text-sm text-gray-500 mb-4">先前应用的补丁。您可以回滚以恢复原始文件。</p>
          <div className="space-y-3">
            {installedPatches.map((patch) => (
              <div key={patch.version} className="flex items-center justify-between p-4 rounded-lg border bg-gray-50 border-gray-200">
                <div>
                  <div className="font-medium">{patch.version}</div>
                  <p className="text-xs text-gray-400 mt-1">
                    应用： {toIST(patch.appliedAt)} · {patch.fileCount} 文件
                  </p>
                </div>
                <button
                  onClick={() => rollbackPatch(patch.version)}
                  disabled={rollingBack === patch.version}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    rollingBack === patch.version
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {rollingBack === patch.version ? "回滚..." : "回滚"}
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* How Updates Work */}
      <Card className="p-6">
        <h3 className="font-semibold mb-3">更新如何工作</h3>
        <ul className="text-sm text-gray-600 space-y-2 list-disc list-inside">
          <li>每 12 小时自动检查一次更新</li>
          <li>新功能和错误修复可用时自动应用</li>
          <li>无需重新安装 — 无缝应用补丁</li>
          <li>您可以通过单击上面的按钮手动检查并安装更新</li>
          <li>安装更新后，面板可能会短暂重启</li>
        </ul>
      </Card>
    </div>
  );
}
