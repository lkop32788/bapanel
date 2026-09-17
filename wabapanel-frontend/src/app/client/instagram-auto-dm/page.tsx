'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit, Link as LinkIcon, RefreshCw, MessageSquare, ListChecks } from 'lucide-react';
import { FaInstagram } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import api, { uploadApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Media { id: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; }
interface Btn { title: string; url: string; }
interface ConnectConfig { connected?: boolean; appId?: string; configId?: string; oneClick?: boolean; manual?: boolean; igAccountId?: string; profile?: { id?: string; username?: string; name?: string; picture?: string } | null; }
interface LogRow { _id: string; username?: string; igUserId?: string; commentText?: string; stage: string; trigger?: string; error?: string; createdAt?: string; }
interface Check { key: string; label: string; ok: boolean; detail?: string }
interface Tag { _id: string; name: string }

interface Auto {
  _id?: string; name: string; active: boolean;
  scope: 'any' | 'specific'; mediaId?: string; mediaPermalink?: string; mediaCaption?: string;
  keywordMode: 'any' | 'contains' | 'exact'; keywords: string[];
  publicReplies: string[];
  trigger: 'comment' | 'mention' | 'story_reply' | 'dm_keyword';
  askFollow?: boolean; followText?: string; followButtonText?: string;
  delayMinSec?: number; delayMaxSec?: number; hourlyCap?: number;
  createContact?: boolean; tags?: string[]; 
  openingText: string; buttonText: string;
  payload: { text: string; mediaType: '' | 'image' | 'video'; mediaUrl: string; buttons: Btn[] };
  stats?: { comments: number; dmsSent: number; clicks: number };
}

const blankAuto = (): Auto => ({
  name: '', active: true, scope: 'any', mediaId: '', trigger: 'comment',
  keywordMode: 'contains', keywords: [], publicReplies: [],
  askFollow: false, followText: '', followButtonText: "I'm following",
  delayMinSec: 5, delayMaxSec: 25, hourlyCap: 60,
  createContact: false, tags: [], 
  openingText: 'Thanks for your comment! 🙌 Check your DM 📩', buttonText: '',
  payload: { text: '', mediaType: '', mediaUrl: '', buttons: [] },
});


const TRIGGER_LABELS: Record<string, string> = {
  comment: "对帖子/卷轴发表评论",
  mention: "提及（故事/帖子标签）",
  story_reply: "故事回复",
  dm_keyword: "DM关键字",
};

export default function InstagramAutoDmPage() {
  const [tab, setTab] = useState<'automations' | 'connect' | 'logs'>('automations');
  const [config, setConfig] = useState<ConnectConfig | null>(null);
  const [autos, setAutos] = useState<Auto[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Auto>(blankAuto());
  const [saving, setSaving] = useState(false);
  const [manual, setManual] = useState({ pageId: '', pageAccessToken: '' });
  const [connecting, setConnecting] = useState(false);
  const [logFilter, setLogFilter] = useState({ q: '', stage: '', trigger: '', from: '', to: '' });
  const [tags, setTags] = useState<Tag[]>([]);
  
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchAutos = useCallback(() => {
    api.get('/instagram-auto-dm').then(r => setAutos(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  const fetchConfig = useCallback(() => {
    api.get('/instagram-auto-dm/connect/config').then(r => setConfig(r.data.data)).catch(() => {});
  }, []);

  useEffect(() => { fetchConfig(); fetchAutos(); }, [fetchConfig, fetchAutos]);

  const loadMedia = () => {
    api.get('/instagram-auto-dm/media')
      .then(r => setMedia(r.data.data || []))
      .catch(e => toast.error(translateApiMessage(e.response?.data?.message || "无法加载帖子")));
  };
  const loadLogs = useCallback(() => {
    api.get('/instagram-auto-dm/logs', { params: { ...logFilter, limit: 200 } })
      .then(r => setLogs(r.data.data || [])).catch(() => {});
  }, [logFilter]);

  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab, loadLogs]);

  useEffect(() => {
    api.get('/tags').then(r => setTags(r.data.data || [])).catch(() => {});
    
  }, []);

  const exportLogs = () => {
    api.get('/instagram-auto-dm/logs/export', { params: logFilter, responseType: 'blob' })
      .then(r => {
        const url = URL.createObjectURL(new Blob([r.data]));
        const a = document.createElement('a');
        a.href = url; a.download = 'instagram-auto-dm-logs.csv'; a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => toast.error(translateApiMessage("导出失败")));
  };

  // ---- Connect (Facebook Login redirect flow) ----
  const IG_SCOPE = 'instagram_basic,instagram_manage_comments,instagram_manage_messages,pages_show_list,pages_manage_metadata,pages_read_engagement';
  const redirectUri = () => `${window.location.origin}/client/instagram-auto-dm`;

  const connectOneClick = () => {
    if (!config?.appId) return toast.error(translateApiMessage("Instagram 应用程序未由管理员配置。"));
    const params = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      state: 'ig',
      ...(config.configId ? { config_id: config.configId } : { scope: IG_SCOPE }),
    });
    window.location.href = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  };

  // Handle the code Facebook sends back to this page.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get('code');
    if (!code || q.get('state') !== 'ig') return;
    window.history.replaceState({}, '', window.location.pathname);
    setConnecting(true);
    api.post('/instagram-auto-dm/connect/one-click', { code, redirectUri: redirectUri() })
      .then(() => { toast.success(translateApiMessage("Instagram 已连接")); fetchConfig(); })
      .catch(e => toast.error(translateApiMessage(e.response?.data?.message || "连接失败")))
      .finally(() => setConnecting(false));
  }, [fetchConfig]);

  const connectManual = () => {
    if (!manual.pageId || !manual.pageAccessToken) return toast.error(translateApiMessage("输入页面 ID 和页面访问令牌"));
    setConnecting(true);
    api.post('/instagram-auto-dm/connect/manual', manual)
      .then(() => { toast.success(translateApiMessage("Instagram 已连接")); fetchConfig(); })
      .catch(e => toast.error(translateApiMessage(e.response?.data?.message || "连接失败")))
      .finally(() => setConnecting(false));
  };
  const runDiagnose = useCallback(() => {
    setChecking(true);
    api.get('/instagram-auto-dm/connect/diagnose')
      .then(r => setChecks(r.data.data?.checks || []))
      .catch(e => toast.error(translateApiMessage(e.response?.data?.message || "检查失败")))
      .finally(() => setChecking(false));
  }, []);

  const syncChats = () => {
    setSyncing(true);
    api.post('/instagram-auto-dm/connect/sync-chats')
      .then(r => toast.success(translateApiMessage(r.data.message || "聊天已同步")))
      .catch(e => toast.error(translateApiMessage(e.response?.data?.message || "同步失败")))
      .finally(() => setSyncing(false));
  };

  const resubscribe = () => {
    setChecking(true);
    api.post('/instagram-auto-dm/connect/resubscribe')
      .then(r => { toast.success(translateApiMessage(r.data.message || "Webhook 订阅已刷新")); runDiagnose(); })
      .catch(e => { toast.error(translateApiMessage(e.response?.data?.message || "无法刷新订阅")); setChecking(false); });
  };

  useEffect(() => { if (tab === 'connect') runDiagnose(); }, [tab, runDiagnose]);

  const disconnect = () => {
    api.post('/instagram-auto-dm/disconnect').then(() => { toast.success(translateApiMessage("已断开连接")); fetchConfig(); }).catch(() => {});
  };

  // ---- Automation CRUD ----
  const openNew = () => { setForm(blankAuto()); setShowModal(true); };
  const openEdit = (a: Auto) => { setForm({ ...blankAuto(), ...a, payload: { ...blankAuto().payload, ...(a.payload || {}) } }); setShowModal(true); if (a.scope === 'specific' && !media.length) loadMedia(); };
  type PayloadMedia = '' | 'image' | 'video';

  const save = async () => {
    if (!form.openingText.trim()) return toast.error(translateApiMessage("需要打开 DM 消息"));
    setSaving(true);
    try {
      if (form._id) await api.put(`/instagram-auto-dm/${form._id}`, form);
      else await api.post('/instagram-auto-dm', form);
      toast.success(translateApiMessage("已保存")); setShowModal(false); fetchAutos();
    } catch (e) { const err = e as { response?: { data?: { message?: string } } }; toast.error(translateApiMessage(err.response?.data?.message || "保存失败")); }
    finally { setSaving(false); }
  };
  const toggleActive = (a: Auto) => api.put(`/instagram-auto-dm/${a._id}`, { active: !a.active }).then(fetchAutos);
  const del = (a: Auto) => { if (!confirm("删除此自动化操作？")) return; api.delete(`/instagram-auto-dm/${a._id}`).then(fetchAutos); };

  const uploadMedia = async (file: File, kind: 'image' | 'video') => {
    const fd = new FormData(); fd.append('file', file);
    const res = await uploadApi.uploadFile(fd);
    const url = res.data?.url || res.data?.data?.url || res.data?.data?.fileUrl || '';
    setForm(f => ({ ...f, payload: { ...f.payload, mediaType: kind, mediaUrl: url } }));
  };

  const connected = config?.connected;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <FaInstagram className="w-7 h-7 text-pink-600" />
        <div>
          <h1 className="text-xl font-semibold">Instagram 自动DM</h1>
          <p className="text-sm text-gray-500">使用自动 DM（链接、PDF、媒体）回复您的帖子/卷轴上的评论。</p>
        </div>
      </div>

      <div className="flex gap-2 border-b mb-4">
        {[['automations', "评论→DM"], ['connect', "连接/设置"], ['logs', "日志"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as 'automations' | 'connect' | 'logs')}
            className={`px-3 py-2 text-sm border-b-2 ${tab === k ? 'border-pink-600 text-pink-600 font-medium' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
      </div>

      {!connected && tab === 'automations' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-3 mb-4 text-sm">
          Instagram 尚未连接。前往 <button className="underline font-medium" onClick={() => setTab('connect')}>连接/设置</button> 首先。
        </div>
      )}

      {tab === 'automations' && (
        <div>
          <div className="flex justify-end mb-3"><Button onClick={openNew}><Plus className="w-4 h-4 mr-1" />新的自动化</Button></div>
          {loading ? <p className="text-gray-400 text-sm">加载中…</p> : autos.length === 0 ? (
            <p className="text-gray-400 text-sm">还没有自动化。</p>
          ) : (
            <div className="space-y-2">
              {autos.map(a => (
                <div key={a._id} className="border rounded p-3 flex items-center justify-between bg-white">
                  <div>
                    <div className="font-medium flex items-center gap-2">{a.name || "（无标题）"}
                      <Badge variant={a.active ? 'success' : 'default'}>{a.active ? "启用" : "已暂停"}</Badge></div>
                    <div className="text-xs text-gray-500 mt-1">
                      {TRIGGER_LABELS[a.trigger || 'comment']} · {a.trigger === 'comment' || a.trigger === 'mention' ? (a.scope === 'specific' ? "具体帖子" : "任何帖子") : 'DM'} · {a.keywordMode === 'any' ? "任何文本" : `${a.keywordMode}: ${a.keywords.join(', ')}`}
                      {a.stats ? ` · ${a.stats.dmsSent} 已发送私信` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => toggleActive(a)}>{a.active ? "暂停" : "简历"}</Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(a)}><Edit className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => del(a)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'connect' && (
        <div className="max-w-xl space-y-4">
          <div className="border rounded p-4 bg-white">
            <div className="flex items-center justify-between">
              <div className="font-medium">状态</div>
              <Badge variant={connected ? 'success' : 'default'}>{connected ? "已连接" : "未连接"}</Badge>
            </div>
            {connected && (
              <div className="flex items-center gap-2 mt-1">
                {config?.profile?.picture && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={config.profile.picture} alt="" className="w-8 h-8 rounded-full" />
                )}
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {config?.profile?.username ? `@${config.profile.username}` : "Instagram 账户"}
                    {config?.profile?.name ? ` — ${config.profile.name}` : ''}
                  </p>
                  <p className="text-xs text-gray-500">IG账户ID： {config?.igAccountId}</p>
                </div>
              </div>
            )}
            {connected && <Button variant="outline" size="sm" className="mt-3" onClick={disconnect}>断开连接</Button>}
          </div>

          {!connected && config?.oneClick && (
            <div className="border rounded p-4 bg-white">
              <div className="font-medium mb-1">一键连接</div>
              <p className="text-xs text-gray-500 mb-3">使用 Facebook 登录并授权您的 Instagram Professional 账户。无需 API 密钥。</p>
              <Button onClick={connectOneClick} disabled={connecting}><FaInstagram className="w-4 h-4 mr-1" />{connecting ? "正在连接..." : "连接 Instagram"}</Button>
            </div>
          )}

          {!connected && config?.manual && (
            <div className="border rounded p-4 bg-white">
              <div className="font-medium mb-1">手动连接</div>
              <p className="text-xs text-gray-500 mb-3">粘贴您的 Facebook 页面 ID 和页面访问令牌（链接到您的 Instagram 的页面）。</p>
              <Input placeholder={"页面 ID"} value={manual.pageId} onChange={e => setManual(m => ({ ...m, pageId: e.target.value }))} className="mb-2" />
              <Input placeholder={"页面访问令牌"} value={manual.pageAccessToken} onChange={e => setManual(m => ({ ...m, pageAccessToken: e.target.value }))} className="mb-3" />
              <Button onClick={connectManual} disabled={connecting}><LinkIcon className="w-4 h-4 mr-1" />连接</Button>
            </div>
          )}
          <div className="border rounded p-4 bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">连接检查</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={runDiagnose} disabled={checking}><RefreshCw className="w-4 h-4 mr-1" />重新检查</Button>
                <Button variant="outline" size="sm" onClick={resubscribe} disabled={checking || !connected}>修复网络钩子</Button>
                <Button variant="outline" size="sm" onClick={syncChats} disabled={syncing || !connected}>{syncing ? "正在同步..." : "同步聊天"}</Button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">只有当下面的每个项目都是绿色时，评论和私信才会到达此面板。</p>
            {checks === null ? <p className="text-sm text-gray-400">检查...</p> : (
              <div className="space-y-1">
                {checks.map(c => (
                  <div key={c.key} className="text-sm flex items-start gap-2">
                    <span className={c.ok ? 'text-green-600' : 'text-red-600'}>{c.ok ? '✓' : '✗'}</span>
                    <span className="flex-1">
                      {c.label}
                      {c.detail && <span className="block text-xs text-gray-500 break-all">{c.detail}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!connected && !config?.oneClick && !config?.manual && (
            <p className="text-sm text-gray-500">连接选项已被管理员禁用。</p>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-2">
            <Input placeholder={"搜索用户/评论/错误"} value={logFilter.q} onChange={e => setLogFilter(f => ({ ...f, q: e.target.value }))} className="md:col-span-2" />
            <Select value={logFilter.stage} onChange={e => setLogFilter(f => ({ ...f, stage: e.target.value }))}
              options={[{ value: '', label: "所有状态" }, { value: 'queued', label: "已排队" }, { value: 'retry', label: "重试" },
                { value: 'dm_sent', label: "DM 已发送" }, { value: 'payload_sent', label: "有效负载已发送" }, { value: 'failed', label: "操作失败" }]} />
            <Select value={logFilter.trigger} onChange={e => setLogFilter(f => ({ ...f, trigger: e.target.value }))}
              options={[{ value: '', label: "所有触发器" }, ...Object.entries(TRIGGER_LABELS).map(([v, l]) => ({ value: v, label: l }))]} />
            <Input type="date" value={logFilter.from} onChange={e => setLogFilter(f => ({ ...f, from: e.target.value }))} />
            <Input type="date" value={logFilter.to} onChange={e => setLogFilter(f => ({ ...f, to: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 mb-2">
            <Button variant="outline" size="sm" onClick={exportLogs}>导出 CSV</Button>
            <Button variant="outline" size="sm" onClick={loadLogs}><RefreshCw className="w-4 h-4 mr-1" />刷新</Button>
          </div>
          {logs.length === 0 ? <p className="text-gray-400 text-sm">尚无活动。</p> : (
            <div className="space-y-1">
              {logs.map(l => (
                <div key={l._id} className="border rounded p-2 text-sm bg-white flex justify-between gap-2">
                  <span className="truncate">
                    @{l.username || l.igUserId} ·"{l.commentText}“
                    {l.error && <span className="text-red-600"> · {l.error}</span>}
                  </span>
                  <Badge variant={l.stage === 'failed' ? 'danger' : l.stage === 'payload_sent' ? 'success' : 'info'}>{l.stage}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={form._id ? "编辑自动化" : "新的自动化"} size="lg">
        <div className="space-y-3">
          <Input label={"名称"} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={"例如卷盘价格DM"} />

          <div>
            <label className="text-sm font-medium">是什么开始了这种自动化？</label>
            <Select value={form.trigger} onChange={e => setForm(f => ({ ...f, trigger: e.target.value as Auto['trigger'] }))}
              options={[
                { value: 'comment', label: "有人对帖子/卷轴发表评论" },
                { value: 'mention', label: "有人提到/标记了你" },
                { value: 'story_reply', label: "有人回复你的故事" },
                { value: 'dm_keyword', label: "有人在 DM 中发送关键字" },
              ]} />
          </div>

          {(form.trigger === 'comment' || form.trigger === 'mention') && (
          <div>
            <label className="text-sm font-medium">哪个帖子/卷轴？</label>
            <Select value={form.scope} onChange={e => { const scope = e.target.value as 'any' | 'specific'; setForm(f => ({ ...f, scope })); if (scope === 'specific' && !media.length) loadMedia(); }}
              options={[{ value: 'any', label: "任何帖子/卷轴" }, { value: 'specific', label: "特定的帖子/卷轴" }]} />
          </div>
          )}
          {(form.trigger === 'comment' || form.trigger === 'mention') && form.scope === 'specific' && (
            <div className="border rounded p-2 max-h-56 overflow-auto grid grid-cols-3 gap-2">
              {media.length === 0 && <p className="col-span-3 text-xs text-gray-400">没有加载帖子。 <button className="underline" onClick={loadMedia}>加载帖子</button></p>}
              {media.map(m => (
                <button key={m.id} type="button" onClick={() => setForm(f => ({ ...f, mediaId: m.id, mediaPermalink: m.permalink, mediaCaption: m.caption }))}
                  className={`border rounded overflow-hidden text-left ${form.mediaId === m.id ? 'ring-2 ring-pink-600' : ''}`}>
                  {(m.thumbnail_url || m.media_url) && <img src={m.thumbnail_url || m.media_url} alt="" className="w-full h-20 object-cover" />}
                  <div className="text-[10px] p-1 truncate">{m.caption || m.media_type}</div>
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium">关键字匹配</label>
              <Select value={form.keywordMode} onChange={e => setForm(f => ({ ...f, keywordMode: e.target.value as 'any' | 'contains' | 'exact' }))}
                options={[{ value: 'any', label: "任何消息" }, { value: 'contains', label: "包含关键字" }, { value: 'exact', label: "正是" }]} />
            </div>
            {form.keywordMode !== 'any' && (
              <Input label={"关键字（逗号分隔）"} value={form.keywords.join(', ')}
                onChange={e => setForm(f => ({ ...f, keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} placeholder={"价格，链接"} />
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Input label={"DM 之前的延迟 — 分钟（秒）"} type="number" value={String(form.delayMinSec ?? 5)}
              onChange={e => setForm(f => ({ ...f, delayMinSec: Number(e.target.value) }))} />
            <Input label={"最大（秒）"} type="number" value={String(form.delayMaxSec ?? 25)}
              onChange={e => setForm(f => ({ ...f, delayMaxSec: Number(e.target.value) }))} />
            <Input label={"每小时最大 DM 数"} type="number" value={String(form.hourlyCap ?? 60)}
              onChange={e => setForm(f => ({ ...f, hourlyCap: Number(e.target.value) }))} />
          </div>
          <p className="text-[11px] text-gray-400 -mt-2">随机延迟和每小时上限使 Instagram 无法在帖子疯传时标记该账户。失败的 DM 最多可重试 3 次。</p>

          <div className="border rounded p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={!!form.askFollow} onChange={e => setForm(f => ({ ...f, askFollow: e.target.checked }))} />
              请用户先关注
            </label>
            <p className="text-[11px] text-gray-400">Instagram 不会告诉我们谁关注了您，因此用户需要通过按钮进行关注和确认。仅在该点击之后才发送有效负载。</p>
            {form.askFollow && (<>
              <Textarea label={"关注请求消息"} rows={2} value={form.followText || ''}
                onChange={e => setForm(f => ({ ...f, followText: e.target.value }))}
                placeholder={"先关注我们，然后点击下面的按钮👇"} />
              <Input label={"确认按钮文本"} value={form.followButtonText || ''}
                onChange={e => setForm(f => ({ ...f, followButtonText: e.target.value }))} placeholder={"我正在关注"} />
            </>)}
          </div>

          <div className="border rounded p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={!!form.createContact} onChange={e => setForm(f => ({ ...f, createContact: e.target.checked }))} />
              将这些人保存为联系人
            </label>
            {form.createContact && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium">标签</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tags.length === 0 && <span className="text-xs text-gray-400">还没有标签</span>}
                    {tags.map(t => (
                      <button key={t._id} type="button"
                        onClick={() => setForm(f => ({ ...f, tags: (f.tags || []).includes(t._id) ? (f.tags || []).filter(x => x !== t._id) : [...(f.tags || []), t._id] }))}
                        className={`text-xs border rounded px-2 py-1 ${(form.tags || []).includes(t._id) ? 'bg-pink-600 text-white border-pink-600' : ''}`}>{t.name}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">舞台</label>
                  
                </div>
              </div>
            )}
          </div>

          {(form.trigger === 'comment' || form.trigger === 'mention') && (
          <Textarea label={"评论下的公开回复 — 可选，每行一个（轮换）"}
            value={form.publicReplies.join('\n')}
            onChange={e => setForm(f => ({ ...f, publicReplies: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }))}
            placeholder={"检查您的 DM 📩 给您发送了一条消息 🙌"} rows={2} />
          )}

          <Textarea label={form.askFollow ? "打开 DM 消息（显示在关注请求上方）" : "打开DM消息"} value={form.openingText}
            onChange={e => setForm(f => ({ ...f, openingText: e.target.value }))} rows={2} />

          <Input label={"按钮文本（可选）- 如果设置，则在用户点击它后发送有效负载"}
            value={form.buttonText} onChange={e => setForm(f => ({ ...f, buttonText: e.target.value }))} placeholder={"将链接发送给我"} />

          <div className="border-t pt-3">
            <div className="font-medium text-sm mb-2 flex items-center gap-1"><MessageSquare className="w-4 h-4" />回复负载（客户收到的内容）</div>
            <Textarea label={"文本"} value={form.payload.text} onChange={e => setForm(f => ({ ...f, payload: { ...f.payload, text: e.target.value } }))} rows={2} />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-sm font-medium">媒体类型</label>
                <Select value={form.payload.mediaType} onChange={e => setForm(f => ({ ...f, payload: { ...f.payload, mediaType: e.target.value as PayloadMedia } }))}
                  options={[{ value: '', label: "无" }, { value: 'image', label: "图片" }, { value: 'video', label: "视频" }]} />
              </div>
              {form.payload.mediaType && (
                <div>
                  <label className="text-sm font-medium">媒体 URL/上传</label>
                  <Input value={form.payload.mediaUrl} onChange={e => setForm(f => ({ ...f, payload: { ...f.payload, mediaUrl: e.target.value } }))} placeholder="https://…" />
                  <input type="file" className="text-xs mt-1" accept={form.payload.mediaType === 'image' ? 'image/*' : 'video/*'}
                    onChange={e => { const file = e.target.files?.[0]; if (file && form.payload.mediaType) uploadMedia(file, form.payload.mediaType); }} />
                </div>
              )}
            </div>
            <div className="mt-2">
              <label className="text-sm font-medium flex items-center gap-1"><ListChecks className="w-4 h-4" />链接按钮（例如 PDF/网站）— 最多 3 个</label>
              {form.payload.buttons.map((b, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 mt-1">
                  <Input placeholder={"按钮标题"} value={b.title} onChange={e => setForm(f => { const buttons = [...f.payload.buttons]; buttons[i] = { ...buttons[i], title: e.target.value }; return { ...f, payload: { ...f.payload, buttons } }; })} />
                  <div className="flex gap-1">
                    <Input placeholder="https://link-to-file-or-page" value={b.url} onChange={e => setForm(f => { const buttons = [...f.payload.buttons]; buttons[i] = { ...buttons[i], url: e.target.value }; return { ...f, payload: { ...f.payload, buttons } }; })} />
                    <Button variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, payload: { ...f.payload, buttons: f.payload.buttons.filter((_, j) => j !== i) } }))}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
              {form.payload.buttons.length < 3 && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setForm(f => ({ ...f, payload: { ...f.payload, buttons: [...f.payload.buttons, { title: '', url: '' }] } }))}><Plus className="w-4 h-4 mr-1" />添加按钮</Button>
              )}
              <p className="text-[11px] text-gray-400 mt-1">PDF 无法附加在 Instagram DM 中 - 将其作为链接按钮发送（将 PDF 上传到媒体库并将其链接粘贴到此处）。</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>取消</Button>
            <Button onClick={save} disabled={saving}>{saving ? "正在保存..." : "保存"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
