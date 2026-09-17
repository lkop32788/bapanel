'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Bot, Plus, Trash2, Edit, RefreshCw, Play, Puzzle, Shield, History, ChevronDown, ChevronRight, Server, Globe } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import api from '@/lib/api';
import toast from 'react-hot-toast';

type Level = 'read' | 'write' | 'danger';
interface ToolDef { name: string; description?: string; level: Level; audience?: 'all' | 'owner' }
interface Policy { enabled: boolean; read: boolean; write: boolean; danger: boolean; confirmWrite: boolean; dailyLimit: number; tools: Record<string, boolean> }
interface App { type: string; label: string; tools: ToolDef[]; connected: boolean; account: string; policy: Policy }
interface Param { name: string; type: 'string' | 'number' | 'boolean'; description: string; required: boolean; in: 'query' | 'body' | 'path' }
interface CustomTool { name: string; description: string; level: Level; enabled: boolean; method?: string; path?: string; params?: Param[] }
interface Custom {
  id?: string; name: string; kind: 'rest' | 'mcp'; url: string;
  authType: 'none' | 'bearer' | 'header' | 'basic'; headerName?: string; authValue?: string; hasAuth?: boolean;
  enabled: boolean; read: boolean; write: boolean; danger: boolean; confirmWrite: boolean; dailyLimit: number;
  tools: CustomTool[]; lastDiscoveredAt?: string;
}
interface LogRow { _id: string; app: string; tool: string; level: string; phone?: string; args?: string; status: string; detail?: string; ms?: number; createdAt: string }
interface BotTool { name: string; description: string }

const LEVEL_BADGE: Record<Level, 'success' | 'warning' | 'danger'> = { read: 'success', write: 'warning', danger: 'danger' };
const LEVEL_HELP: Record<Level, string> = {
  read: 'Look up data only (order status, stock, events, rows)',
  write: 'Create / change data (book event, add row, payment link)',
  danger: 'Cancel / refund / delete — customer confirmation always required',
};
const APP_HELP: Record<string, string> = {
  'google-sheets': 'Bot can search rows and add leads/orders to your sheet.',
  
  shopify: 'Order status, product search and (optional) order cancel — verified by customer phone.',
  woocommerce: 'Order status, product search and (optional) order cancel — verified by customer phone.',
  razorpay: 'Payment-link status and creating payment links for customers.',
};

const blankCustom = (): Custom => ({
  name: '', kind: 'rest', url: '', authType: 'none', headerName: '', authValue: '',
  enabled: true, read: true, write: false, danger: false, confirmWrite: false, dailyLimit: 200, tools: [],
});
const blankTool = (): CustomTool => ({ name: '', description: '', level: 'read', enabled: true, method: 'GET', path: '', params: [] });

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-gray-300'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transform transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

function LevelRows({ p, tools, onChange }: { p: Pick<Policy, 'read' | 'write' | 'danger' | 'confirmWrite' | 'dailyLimit'>; tools: { name: string; level: Level }[]; onChange: (patch: Partial<Policy>) => void }) {
  const count = (lv: Level) => tools.filter(t => t.level === lv).length;
  return (
    <div className="space-y-2">
      {(['read', 'write', 'danger'] as Level[]).map(lv => (
        <div key={lv} className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant={LEVEL_BADGE[lv]}>{lv.toUpperCase()}</Badge>
              <span className="text-sm font-medium text-gray-800">{count(lv)} 工具{count(lv) === 1 ? '' : 's'}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{LEVEL_HELP[lv]}</p>
          </div>
          <Toggle checked={p[lv]} onChange={v => onChange({ [lv]: v } as Partial<Policy>)} />
        </div>
      ))}
      <div className="grid sm:grid-cols-2 gap-3 pt-1">
        <label className="flex items-center justify-between gap-2 text-sm text-gray-700 rounded-lg border border-gray-100 px-3 py-2">
          <span>在每次写入操作之前确认</span>
          <Toggle checked={p.confirmWrite} onChange={v => onChange({ confirmWrite: v })} />
        </label>
        <Input label="" type="number" min={0} value={p.dailyLimit} onChange={e => onChange({ dailyLimit: Number(e.target.value) })}
          placeholder={"每日调用限额"} className="text-sm" />
      </div>
      <p className="text-xs text-gray-400">每日限制 = 此应用程序每天的最大工具调用次数（0 = 无限制）。</p>
    </div>
  );
}

export default function AIAssistantPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [custom, setCustom] = useState<Custom[]>([]);
  const [botTools, setBotTools] = useState<BotTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState('');
  const [tab, setTab] = useState<'apps' | 'custom' | 'activity'>('apps');

  const [editing, setEditing] = useState<Custom | null>(null);
  const [editTool, setEditTool] = useState<{ idx: number; tool: CustomTool } | null>(null);
  const [testing, setTesting] = useState<{ tool: string; args: string; result?: string; running?: boolean } | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);

  const [ownerPhones, setOwnerPhones] = useState('');
  const [savingOwners, setSavingOwners] = useState(false);
  const apply = (d: { apps: App[]; custom: Custom[]; ownerPhones?: string[] }) => { setApps(d.apps || []); setCustom(d.custom || []); setOwnerPhones((d.ownerPhones || []).join(', ')); };
  const saveOwners = async () => {
    setSavingOwners(true);
    try {
      const r = await api.put('/ai-tools/owners', { phones: ownerPhones.split(/[,\n;]+/).map(x => x.trim()).filter(Boolean) });
      apply(r.data.data); toast.success(translateApiMessage("业主/员工号码已保存"));
    } catch (e: unknown) { toast.error(translateApiMessage((e as { response?: { data?: { message?: string } } }).response?.data?.message || "保存失败")); }
    finally { setSavingOwners(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, t] = await Promise.all([api.get('/ai-tools'), api.get('/ai-tools/tools')]);
      apply(r.data.data); setBotTools(t.data.data || []); setBlocked('');
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { message?: string } } };
      setBlocked(err.response?.data?.message || 'AI Assistant is not available');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const refreshBot = async () => { try { const t = await api.get('/ai-tools/tools'); setBotTools(t.data.data || []); } catch { /* ignore */ } };
  const loadLogs = async () => { try { const r = await api.get('/ai-tools/logs', { params: { limit: 50 } }); setLogs(r.data.data || []); setLogsTotal(r.data.total || 0); } catch { /* ignore */ } };
  useEffect(() => { if (tab === 'activity') loadLogs(); }, [tab]);

  const saveApp = async (type: string, patch: Partial<Policy>) => {
    setSaving(type);
    try { const r = await api.put(`/ai-tools/apps/${type}`, patch); apply(r.data.data); refreshBot(); }
    catch (e: unknown) { toast.error(translateApiMessage((e as { response?: { data?: { message?: string } } }).response?.data?.message || "保存失败")); }
    finally { setSaving(''); }
  };

  const saveCustom = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return toast.error(translateApiMessage("姓名必填"));
    if (!/^https?:\/\//i.test(editing.url)) return toast.error(translateApiMessage("需要有效的 http(s) URL"));
    if (editing.kind === 'rest' && editing.tools.length === 0) return toast.error(translateApiMessage("添加至少一个工具（端点）"));
    setSaving('custom');
    try {
      const body = { ...editing }; if (!body.authValue) delete body.authValue;
      const r = editing.id ? await api.put(`/ai-tools/custom/${editing.id}`, body) : await api.post('/ai-tools/custom', body);
      apply(r.data.data); setEditing(null); refreshBot(); toast.success(translateApiMessage("已保存"));
    } catch (e: unknown) { toast.error(translateApiMessage((e as { response?: { data?: { message?: string } } }).response?.data?.message || "保存失败")); }
    finally { setSaving(''); }
  };
  const patchCustom = async (c: Custom, patch: Partial<Custom>) => {
    setSaving(c.id || '');
    try { const r = await api.put(`/ai-tools/custom/${c.id}`, patch); apply(r.data.data); refreshBot(); }
    catch (e: unknown) { toast.error(translateApiMessage((e as { response?: { data?: { message?: string } } }).response?.data?.message || "保存失败")); }
    finally { setSaving(''); }
  };
  const discover = async (c: Custom) => {
    setSaving(c.id || '');
    try { const r = await api.post(`/ai-tools/custom/${c.id}/discover`); apply(r.data.data); toast.success(translateApiMessage("工具已刷新")); }
    catch (e: unknown) { toast.error(translateApiMessage((e as { response?: { data?: { message?: string } } }).response?.data?.message || "发现失败")); }
    finally { setSaving(''); }
  };
  const removeCustom = async (c: Custom) => {
    if (!confirm(`删除“${c.name}“？该机器人将无法再使用其工具。`)) return;
    try { const r = await api.delete(`/ai-tools/custom/${c.id}`); apply(r.data.data); refreshBot(); toast.success(translateApiMessage("已删除")); }
    catch { toast.error(translateApiMessage("删除失败")); }
  };
  const runTest = async () => {
    if (!testing) return;
    let args: Record<string, unknown> = {};
    try { args = testing.args.trim() ? JSON.parse(testing.args) : {}; } catch { return toast.error(translateApiMessage("参数必须是有效的 JSON")); }
    setTesting({ ...testing, running: true, result: undefined });
    try { const r = await api.post('/ai-tools/test', { tool: testing.tool, args }); setTesting(t => t && { ...t, running: false, result: JSON.stringify(r.data.data, null, 2) }); }
    catch (e: unknown) { setTesting(t => t && { ...t, running: false, result: 'Error: ' + ((e as { response?: { data?: { message?: string } } }).response?.data?.message || 'failed') }); }
  };

  const statusBadge = (s: string) => s === 'ok' ? <Badge variant="success">ok</Badge> : s === 'denied' ? <Badge variant="warning">被拒绝</Badge> : s === 'confirm' ? <Badge variant="info">确认</Badge> : <Badge variant="danger">错误</Badge>;

  if (loading) return <div className="p-8 text-gray-500">加载中…</div>;
  if (blocked) return (
    <div className="p-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 flex gap-4">
        <Shield className="w-8 h-8 text-amber-600 shrink-0" />
        <div>
          <h2 className="font-semibold text-amber-900">AI Assistant 插件未激活</h2>
          <p className="text-sm text-amber-800 mt-1">{blocked}。请联系您的面板管理员，为您的账户启用 AI Assistant 插件。</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Bot className="w-6 h-6 text-emerald-600" /> AI 助手 — 工具和应用程序</h1>
          <p className="text-sm text-gray-500 mt-1">让您的 AI 聊天机器人为客户做真正的工作：查找订单、预约、向表格添加潜在客户、创建付款链接 - 您可以控制每个应用程序的权限。</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm">
          <span className="text-gray-500">机器人当前可以使用</span> <span className="font-semibold text-gray-900">{botTools.length}</span> <span className="text-gray-500">工具{botTools.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {([['apps', "应用程序", <Puzzle key="a" className="w-4 h-4" />], ['custom', "自定义API/MCP", <Server key="c" className="w-4 h-4" />], ['activity', "活动", <History key="h" className="w-4 h-4" />]] as [typeof tab, string, React.ReactNode][]).map(([k, label, icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{icon}{label}</button>
        ))}
      </div>

      {tab === 'apps' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
          <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-amber-600" /><h3 className="font-semibold text-gray-900 text-sm">访问级别：所有者/员工号码</h3></div>
          <p className="text-xs text-gray-600">客户只能看到与其自己的 WhatsApp 号码相关联的数据。此处列出的数字被视为 <b>业主/员工</b>：机器人可以向他们展示所有内容（所有订单、所有付款、列表、总计）并解锁 <Badge variant="warning">所有者</Badge> 下面的工具。以逗号分隔，带有国家/地区代码。</p>
          <div className="flex gap-2">
            <Input value={ownerPhones} onChange={e => setOwnerPhones(e.target.value)} placeholder="+919876543210, +919812345678" className="flex-1" />
            <Button size="sm" onClick={saveOwners} disabled={savingOwners}>{savingOwners ? "正在保存..." : "保存"}</Button>
          </div>
        </div>
      )}
      {tab === 'apps' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {apps.map(a => {
            const p = a.policy; const isOpen = !!open[a.type];
            return (
              <div key={a.type} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{a.label}</h3>
                      {a.connected ? <Badge variant="success">已连接</Badge> : <Badge>未连接</Badge>}
                      {a.connected && p.enabled && <Badge variant="info">机器人开启</Badge>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{APP_HELP[a.type]}</p>
                    {a.account && <p className="text-xs text-gray-400 mt-0.5 truncate">账户： {a.account}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500">机器人的使用</span>
                    <Toggle checked={p.enabled} disabled={!a.connected || saving === a.type} onChange={v => saveApp(a.type, { enabled: v })} />
                  </div>
                </div>
                {!a.connected && (
                  <div className="rounded-lg bg-gray-50 border border-dashed border-gray-200 p-3 text-sm text-gray-600 flex items-center justify-between gap-2">
                    <span>连接 {a.label} 首先是集成。</span>
                    <Link href="/client/integrations"><Button size="sm" variant="outline">连接</Button></Link>
                  </div>
                )}
                {a.connected && (
                  <>
                    <LevelRows p={p} tools={a.tools} onChange={patch => saveApp(a.type, patch)} />
                    <button onClick={() => setOpen(o => ({ ...o, [a.type]: !isOpen }))} className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} 高级：逐个工具
                    </button>
                    {isOpen && (
                      <div className="space-y-1.5">
                        {a.tools.map(t => {
                          const on = p.tools?.[t.name] !== false; const levelOn = p[t.level];
                          return (
                            <div key={t.name} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${levelOn ? 'bg-gray-50' : 'bg-gray-50/50 opacity-60'}`}>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2"><code className="text-xs font-semibold text-gray-800">{t.name}</code><Badge variant={LEVEL_BADGE[t.level]}>{t.level}</Badge>{t.audience === 'owner' && <Badge variant="warning">所有者</Badge>}</div>
                                <p className="text-xs text-gray-500 truncate">{t.description}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {levelOn && on && p.enabled && <button title={"测试这个工具"} onClick={() => setTesting({ tool: `${a.type.replace(/[^a-zA-Z0-9_]/g, '_')}__${t.name}`, args: '{}' })} className="text-gray-400 hover:text-emerald-600"><Play className="w-4 h-4" /></button>}
                                <Toggle checked={on} disabled={!levelOn} onChange={v => saveApp(a.type, { tools: { ...(p.tools || {}), [t.name]: v } })} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'custom' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-500">通过 REST API 或 MCP 服务器连接您自己的系统（ERP、CRM、预订软件）。最多 10 个。</p>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setEditing(blankCustom())} disabled={custom.length >= 10}>添加自定义API/MCP</Button>
          </div>
          {custom.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
              <Server className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              尚无自定义应用程序。添加 REST API（您定义端点）或 MCP 服务器（自动发现工具）。
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {custom.map(c => {
              const isOpen = !!open[c.id || ''];
              return (
                <div key={c.id} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{c.name}</h3>
                        <Badge variant="info">{c.kind.toUpperCase()}</Badge>
                        {c.hasAuth && <Badge>授权设置</Badge>}
                        {c.enabled && <Badge variant="success">机器人开启</Badge>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate flex items-center gap-1"><Globe className="w-3 h-3" />{c.url}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Toggle checked={c.enabled} disabled={saving === c.id} onChange={v => patchCustom(c, { enabled: v })} />
                      {c.kind === 'mcp' && <button title={"重新发现工具"} onClick={() => discover(c)} className="p-1.5 text-gray-400 hover:text-emerald-600"><RefreshCw className={`w-4 h-4 ${saving === c.id ? 'animate-spin' : ''}`} /></button>}
                      <button title={"编辑"} onClick={() => setEditing({ ...c, authValue: '' })} className="p-1.5 text-gray-400 hover:text-blue-600"><Edit className="w-4 h-4" /></button>
                      <button title={"删除"} onClick={() => removeCustom(c)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <LevelRows p={c} tools={c.tools} onChange={patch => patchCustom(c, patch as Partial<Custom>)} />
                  <button onClick={() => setOpen(o => ({ ...o, [c.id || '']: !isOpen }))} className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} 工具({c.tools.length})
                  </button>
                  {isOpen && (
                    <div className="space-y-1.5">
                      {c.tools.length === 0 && <p className="text-xs text-gray-400">没有工具。 {c.kind === 'mcp' ? "单击刷新即可发现。" : "编辑以添加端点。"}</p>}
                      {c.tools.map((t, i) => {
                        const levelOn = c[t.level];
                        return (
                          <div key={t.name} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-gray-50 ${levelOn ? '' : 'opacity-60'}`}>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2"><code className="text-xs font-semibold text-gray-800">{t.name}</code>
                                <select value={t.level} onChange={e => patchCustom(c, { tools: c.tools.map((x, j) => j === i ? { ...x, level: e.target.value as Level } : x) })}
                                  className={`text-[11px] rounded-full px-2 py-0.5 border-0 font-medium ${t.level === 'read' ? 'bg-emerald-50 text-emerald-700' : t.level === 'write' ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
                                  <option value="read">读</option><option value="write">写</option><option value="danger">危险</option>
                                </select>
                                {t.method && c.kind === 'rest' && <span className="text-[11px] text-gray-400">{t.method} {t.path}</span>}
                              </div>
                              <p className="text-xs text-gray-500 truncate">{t.description}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {levelOn && t.enabled && c.enabled && <button title={"测试"} onClick={() => setTesting({ tool: `custom_${c.id}__${t.name}`, args: '{}' })} className="text-gray-400 hover:text-emerald-600"><Play className="w-4 h-4" /></button>}
                              <Toggle checked={t.enabled} disabled={!levelOn} onChange={v => patchCustom(c, { tools: c.tools.map((x, j) => j === i ? { ...x, enabled: v } : x) })} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm text-gray-600">最后 {logs.length} of {logsTotal} 工具调用（保留 90 天；秘密从不存储）</p>
            <Button size="sm" variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={loadLogs}>刷新</Button>
          </div>
          {logs.length === 0 ? <p className="p-8 text-center text-gray-400 text-sm">尚无活动。一旦机器人在聊天中使用某个工具，它就会显示在此处。</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th className="px-4 py-2 text-left">时间</th><th className="px-4 py-2 text-left">应用程序/工具</th><th className="px-4 py-2 text-left">等级</th><th className="px-4 py-2 text-left">客户</th><th className="px-4 py-2 text-left">状态</th><th className="px-4 py-2 text-left">详细信息</th><th className="px-4 py-2 text-right">ms</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map(l => (
                    <tr key={l._id}>
                      <td className="px-4 py-2 whitespace-nowrap text-gray-500">{new Date(l.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2"><div className="font-medium text-gray-800">{l.app}</div><code className="text-xs text-gray-500">{l.tool}</code></td>
                      <td className="px-4 py-2"><Badge variant={LEVEL_BADGE[(l.level as Level) || 'read'] || 'default'}>{l.level}</Badge></td>
                      <td className="px-4 py-2 text-gray-600">{l.phone || '—'}</td>
                      <td className="px-4 py-2">{statusBadge(l.status)}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 max-w-xs truncate" title={`${l.args || ''}\n${l.detail || ''}`}>{l.detail || l.args || ''}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{l.ms || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Custom app editor */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "编辑自定义应用程序" : "添加自定义API/MCP"} size="lg">
        {editing && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input label={"名称"} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder={"我的 ERP"} />
              <Select label={"类型"} value={editing.kind} disabled={!!editing.id} onChange={e => setEditing({ ...editing, kind: e.target.value as 'rest' | 'mcp', tools: [] })}
                options={[{ value: 'rest', label: "REST API（我定义端点）" }, { value: 'mcp', label: "MCP 服务器（自动发现工具）" }]} />
            </div>
            <Input label={editing.kind === 'mcp' ? "MCP 服务器 URL" : "基本 URL"} value={editing.url} onChange={e => setEditing({ ...editing, url: e.target.value })} placeholder={editing.kind === 'mcp' ? 'https://mcp.example.com/mcp' : 'https://api.example.com/v1'} />
            <div className="grid sm:grid-cols-3 gap-3">
              <Select label={"授权"} value={editing.authType} onChange={e => setEditing({ ...editing, authType: e.target.value as Custom['authType'] })}
                options={[{ value: 'none', label: "无" }, { value: 'bearer', label: "不记名令牌" }, { value: 'header', label: "自定义标头" }, { value: 'basic', label: "基本（用户：pass）" }]} />
              {editing.authType === 'header' && <Input label={"标头名称"} value={editing.headerName || ''} onChange={e => setEditing({ ...editing, headerName: e.target.value })} placeholder={"X-API-密钥\n每个请求的"} />}
              {editing.authType !== 'none' && <Input label={editing.authType === 'basic' ? "用户：密码" : "代币/价值"} type="password" value={editing.authValue || ''} onChange={e => setEditing({ ...editing, authValue: e.target.value })} placeholder={editing.hasAuth ? "••••••（不变）" : ''} />}
            </div>
            <p className="text-xs text-gray-400">凭据加密存储，不会再次显示或发送给 AI 模型。</p>
            {editing.kind === 'rest' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between"><h4 className="text-sm font-semibold text-gray-800">工具（端点）</h4><Button size="sm" variant="outline" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setEditTool({ idx: -1, tool: blankTool() })}>添加工具</Button></div>
                {editing.tools.length === 0 && <p className="text-xs text-gray-400">每个工具 = 机器人可以调用的一个端点，例如 <code>GET /orders/{'{order_id}'}</code>.</p>}
                {editing.tools.map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
                    <div className="min-w-0"><code className="text-xs font-semibold">{t.name}</code> <Badge variant={LEVEL_BADGE[t.level]}>{t.level}</Badge><p className="text-xs text-gray-500 truncate">{t.method} {t.path} — {t.description}</p></div>
                    <div className="flex gap-1 shrink-0"><button onClick={() => setEditTool({ idx: i, tool: { ...t, params: t.params || [] } })} className="p-1 text-gray-400 hover:text-blue-600"><Edit className="w-4 h-4" /></button><button onClick={() => setEditing({ ...editing, tools: editing.tools.filter((_, j) => j !== i) })} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></div>
                  </div>
                ))}
              </div>
            )}
            {editing.kind === 'mcp' && <p className="text-xs text-gray-500 rounded-lg bg-blue-50 border border-blue-100 p-3">保存时我们调用 <code>tools/list</code> 在您的 MCP 服务器上并对工具进行分类（名称包含删除/取消/退款/支付 → 危险；创建/更新/添加/发送 → 写入；休息 → 读取）。之后您可以更改每个工具的级别。</p>}
            <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setEditing(null)}>取消</Button><Button loading={saving === 'custom'} onClick={saveCustom}>{editing.id ? "保存" : "添加"}</Button></div>
          </div>
        )}
      </Modal>

      {/* REST tool editor */}
      <Modal isOpen={!!editTool} onClose={() => setEditTool(null)} title={editTool && editTool.idx >= 0 ? "编辑工具" : "添加工具"} size="lg">
        {editTool && editing && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input label={"工具名称（a-z、0-9、_）"} value={editTool.tool.name} onChange={e => setEditTool({ ...editTool, tool: { ...editTool.tool, name: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_') } })} placeholder="get_order" />
              <Select label={"权限级别"} value={editTool.tool.level} onChange={e => setEditTool({ ...editTool, tool: { ...editTool.tool, level: e.target.value as Level } })} options={[{ value: 'read', label: "读" }, { value: 'write', label: "写" }, { value: 'danger', label: "危险" }]} />
            </div>
            <Textarea label={"描述（告诉AI何时使用它）"} rows={2} value={editTool.tool.description} onChange={e => setEditTool({ ...editTool, tool: { ...editTool.tool, description: e.target.value } })} placeholder={"通过订单id获取订单状态"} />
            <div className="grid sm:grid-cols-4 gap-3">
              <Select label={"方法"} value={editTool.tool.method || 'GET'} onChange={e => setEditTool({ ...editTool, tool: { ...editTool.tool, method: e.target.value } })} options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({ value: m, label: m }))} />
              <div className="sm:col-span-3"><Input label={"路径（使用 {param} 作为路径参数）"} value={editTool.tool.path || ''} onChange={e => setEditTool({ ...editTool, tool: { ...editTool.tool, path: e.target.value } })} placeholder="/orders/{order_id}" /></div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><h4 className="text-sm font-semibold text-gray-800">参数</h4><Button size="sm" variant="outline" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setEditTool({ ...editTool, tool: { ...editTool.tool, params: [...(editTool.tool.params || []), { name: '', type: 'string', description: '', required: true, in: 'query' }] } })}>添加参数</Button></div>
              {(editTool.tool.params || []).map((p, i) => {
                const set = (patch: Partial<Param>) => setEditTool({ ...editTool, tool: { ...editTool.tool, params: (editTool.tool.params || []).map((x, j) => j === i ? { ...x, ...patch } : x) } });
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3"><Input label="" value={p.name} onChange={e => set({ name: e.target.value })} placeholder="order_id" /></div>
                    <div className="col-span-2"><Select label="" value={p.type} onChange={e => set({ type: e.target.value as Param['type'] })} options={[{ value: 'string', label: "字符串" }, { value: 'number', label: "号码" }, { value: 'boolean', label: "布尔值" }]} /></div>
                    <div className="col-span-2"><Select label="" value={p.in} onChange={e => set({ in: e.target.value as Param['in'] })} options={[{ value: 'query', label: "查询" }, { value: 'path', label: "路径" }, { value: 'body', label: "身体" }]} /></div>
                    <div className="col-span-3"><Input label="" value={p.description} onChange={e => set({ description: e.target.value })} placeholder={"描述"} /></div>
                    <label className="col-span-1 flex items-center gap-1 text-xs text-gray-600 pb-2"><input type="checkbox" checked={p.required} onChange={e => set({ required: e.target.checked })} />req</label>
                    <button onClick={() => setEditTool({ ...editTool, tool: { ...editTool.tool, params: (editTool.tool.params || []).filter((_, j) => j !== i) } })} className="col-span-1 p-1 text-gray-400 hover:text-red-600 pb-2"><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setEditTool(null)}>取消</Button>
              <Button onClick={() => {
                if (!editTool.tool.name) return toast.error(translateApiMessage("需要工具名称"));
                const tools = editTool.idx >= 0 ? editing.tools.map((t, j) => j === editTool.idx ? editTool.tool : t) : [...editing.tools, editTool.tool];
                setEditing({ ...editing, tools }); setEditTool(null);
              }}>完成</Button></div>
          </div>
        )}
      </Modal>

      {/* Tool test */}
      <Modal isOpen={!!testing} onClose={() => setTesting(null)} title={"测试工具"} size="lg">
        {testing && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">运行 <code className="font-semibold">{testing.tool}</code> 现在是您（您的账户电话用于客户验证工具；自动接受确认）。写入/危险工具将真正执行。</p>
            <Textarea label={"参数 (JSON)"} rows={4} value={testing.args} onChange={e => setTesting({ ...testing, args: e.target.value })} placeholder='{"order_id": "1001"}' />
            {testing.result !== undefined && <pre className="text-xs bg-gray-900 text-gray-100 rounded-lg p-3 max-h-64 overflow-auto whitespace-pre-wrap">{testing.result}</pre>}
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setTesting(null)}>关闭</Button><Button loading={!!testing.running} icon={<Play className="w-4 h-4" />} onClick={runTest}>运行</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
