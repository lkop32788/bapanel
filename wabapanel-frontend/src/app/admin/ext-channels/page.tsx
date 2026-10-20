'use client';
// Baileys 转换 API 设置（平台级）。
// 六段凭证（phone/noisePriv/identityPriv/hash）经工厂服务登录校验后转成 Baileys
// creds.json，面板写入 wa_sessions 即当普通扫码号使用。实际服务在 yuncang-proxy
// 的 /api/wa/*；本页只配置地址/开关，商户侧不可见、不可改。
// 存 SystemSettings.waFactory，保存复用 PUT /admin/settings {section:'waFactory'}。
import React, { useEffect, useState } from 'react';
import { Save, ToggleLeft, ToggleRight, Plug, CheckCircle2, XCircle, Loader2, Server } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { adminApi } from '@/lib/api';
import { translateApiMessage } from '@/lib/zhMessages';

const PLATFORMS = [
  { value: '0', label: 'Android（默认）' },
  { value: '1', label: 'iOS' },
  { value: '10', label: 'SMB Android（商业版）' },
  { value: '12', label: 'SMB iOS（商业版）' },
];

type HealthResult = { ok: boolean; httpStatus: number; latencyMs: number; baseUrl?: string; service?: string; error?: string };

export default function AdminWaFactoryPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<HealthResult | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [defaultBaseUrl, setDefaultBaseUrl] = useState('http://127.0.0.1:5090');
  const [defaultPlatform, setDefaultPlatform] = useState('0');
  const [allowProxy, setAllowProxy] = useState(true);
  const [timeoutMs, setTimeoutMs] = useState('35000');

  useEffect(() => {
    adminApi.getSettings().then((r) => {
      const w = r.data.data?.waFactory || {};
      setEnabled(!!w.enabled);
      setBaseUrl(w.baseUrl || '');
      setDefaultBaseUrl(w.defaultBaseUrl || 'http://127.0.0.1:5090');
      setDefaultPlatform(w.defaultPlatform || '0');
      setAllowProxy(w.allowProxy !== false);
      setTimeoutMs(String(w.timeoutMs || 35000));
    }).catch(() => toast.error(translateApiMessage('加载失败'))).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateSettings({
        section: 'waFactory',
        data: {
          enabled,
          baseUrl: baseUrl.trim(),
          defaultPlatform,
          allowProxy,
          timeoutMs: parseInt(timeoutMs, 10) || 35000,
        },
      });
      toast.success(translateApiMessage('已保存'));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(err.response?.data?.message || '保存失败'));
    }
    setSaving(false);
  };

  const test = async () => {
    setTesting(true);
    setHealth(null);
    try {
      const r = await adminApi.testWaFactory();
      const d = r.data.data as HealthResult;
      setHealth(d);
      if (d.ok) toast.success(translateApiMessage('连接正常'));
      else toast.error(translateApiMessage('连接失败'));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(err.response?.data?.message || '连接失败'));
    }
    setTesting(false);
  };

  const effectiveUrl = baseUrl.trim() || defaultBaseUrl;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中…
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Baileys 转换 API</h1>
        <p className="text-sm text-gray-500 mt-1">
          平台级配置：把六段凭证（phone / noisePriv / identityPriv / hash）交给转换工厂登录校验，
          返回 Baileys 会话（creds.json），面板写入即可当普通扫码号使用。实际服务在
          yuncang-proxy 的 <code className="bg-gray-100 px-1 rounded">/api/wa/*</code>，商户侧不可见、不可改。
        </p>
      </div>

      {/* 开关 + 连接测试 */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <button type="button" onClick={() => setEnabled(!enabled)} className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-lg text-left sm:w-96">
            <span>
              <span className="block text-sm font-medium text-gray-900">启用 Baileys 转换</span>
              <span className="block text-xs text-gray-500">关闭时商户侧六段凭证登录入口不可用</span>
            </span>
            {enabled ? <ToggleRight className="w-8 h-8 text-emerald-500 shrink-0" /> : <ToggleLeft className="w-8 h-8 text-gray-400 shrink-0" />}
          </button>

          <div className="flex-1 flex items-center gap-3 sm:justify-end">
            <Button variant="outline" onClick={test} loading={testing}>
              <Plug className="w-4 h-4" /> 测试连接
            </Button>
            {health && (
              <span className={`flex items-center gap-1.5 text-sm ${health.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                {health.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {health.ok ? `正常 · ${health.latencyMs}ms` : (health.error || `HTTP ${health.httpStatus}`)}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* 工厂服务配置 */}
      <Card className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Server className="w-4 h-4 text-gray-400" /> 工厂服务
        </div>

        <div>
          <Input
            label="服务地址（Base URL）"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={defaultBaseUrl}
          />
          <p className="text-xs text-gray-400 mt-1">
            留空则使用默认地址 <code className="bg-gray-100 px-1 rounded">{defaultBaseUrl}</code>（环境变量 YUNCANG_URL）。
            当前生效：<code className="bg-gray-100 px-1 rounded">{effectiveUrl}</code>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">默认设备平台</label>
            <select
              value={defaultPlatform}
              onChange={(e) => setDefaultPlatform(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">商户未指定时用此平台构造设备指纹</p>
          </div>

          <div>
            <Input
              label="登录超时（毫秒）"
              type="number"
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(e.target.value)}
              placeholder="35000"
            />
            <p className="text-xs text-gray-400 mt-1">范围 5000–120000，默认 35000</p>
          </div>
        </div>

        <button type="button" onClick={() => setAllowProxy(!allowProxy)} className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-lg text-left w-full sm:w-96">
          <span>
            <span className="block text-sm font-medium text-gray-900">允许随号附带代理</span>
            <span className="block text-xs text-gray-500">关闭时忽略凭证自带的代理，统一走服务器直连</span>
          </span>
          {allowProxy ? <ToggleRight className="w-8 h-8 text-emerald-500 shrink-0" /> : <ToggleLeft className="w-8 h-8 text-gray-400 shrink-0" />}
        </button>
      </Card>

      {/* 工作原理 */}
      <Card className="!bg-gray-50/60">
        <div className="text-sm font-semibold text-gray-700 mb-2">工作原理</div>
        <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-500">
          <li>商户在渠道页提交六段凭证（或 txt/json 文件）。</li>
          <li>面板后端把凭证转发到工厂服务 <code className="bg-white px-1 rounded border border-gray-200">POST /api/wa/seg6-login</code>。</li>
          <li>工厂用 whatsmeow 实际登录校验，成功后把 whatsmeow 会话转换成 Baileys <code className="bg-white px-1 rounded border border-gray-200">creds.json</code> 返回。</li>
          <li>面板写入 <code className="bg-white px-1 rounded border border-gray-200">wa_sessions/&lt;工作区&gt;/&lt;号位&gt;/</code>，Baileys 恢复连接，和扫码号一样进号池。</li>
        </ol>
        <p className="text-xs text-gray-400 mt-2">
          健康检查 <code className="bg-white px-1 rounded border border-gray-200">GET /api/wa/health</code> ·
          登录 <code className="bg-white px-1 rounded border border-gray-200">POST /api/wa/seg6-login</code> ·
          纯转换 <code className="bg-white px-1 rounded border border-gray-200">POST /api/wa/seg6-convert</code>
        </p>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving}><Save className="w-4 h-4" /> 保存配置</Button>
      </div>
    </div>
  );
}
