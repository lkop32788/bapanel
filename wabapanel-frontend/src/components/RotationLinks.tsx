'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Copy, Power } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { rotationLinkApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface RotationNumber { workspace: string; workspaceName: string; phone: string; dailyCap: number; sessions24h: number; clicks24h: number }
interface RotationLink { _id: string; title: string; code: string; prefillText: string; isActive: boolean; numbers: RotationNumber[]; createdAt?: string }
interface AvailableNumber { workspace: string; workspaceName: string; phone: string; connected: boolean }

const DEFAULT_CAP = 20;

export default function RotationLinks() {
  const [links, setLinks] = useState<RotationLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editLink, setEditLink] = useState<RotationLink | null>(null);
  const [title, setTitle] = useState('');
  const [prefillText, setPrefillText] = useState('Hi');
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [available, setAvailable] = useState<AvailableNumber[]>([]);
  const [numbersLoading, setNumbersLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [bulkCap, setBulkCap] = useState(DEFAULT_CAP);

  const linkUrl = (l: RotationLink) => (typeof window !== 'undefined' ? window.location.origin : '') + '/s/' + l.code;

  const fetchLinks = async () => {
    try { const res = await rotationLinkApi.list(); setLinks(res.data.data || []); } catch { /* empty */ }
    setLoading(false);
  };
  useEffect(() => { fetchLinks(); }, []);

  const errMsg = (err: unknown, fallback: string) => {
    const e = err as { response?: { data?: { message?: string } } };
    return translateApiMessage(e.response?.data?.message || fallback);
  };

  const openModal = async (l: RotationLink | null) => {
    setEditLink(l);
    setTitle(l?.title || '');
    setPrefillText(l ? l.prefillText : 'Hi');
    setQuery('');
    setStatusFilter('all');
    setBulkCap(DEFAULT_CAP);
    const sel: Record<string, number> = {};
    (l?.numbers || []).forEach(n => { sel[n.workspace] = n.dailyCap || DEFAULT_CAP; });
    setSelected(sel);
    setShowModal(true);
    setNumbersLoading(true);
    try {
      const res = await rotationLinkApi.numbers();
      setAvailable(res.data.data || []);
    } catch (err) {
      toast.error(errMsg(err, "无法加载号码列表"));
    }
    setNumbersLoading(false);
  };

  // Include already-selected numbers missing from the available list (so they stay editable)
  const rows: AvailableNumber[] = [
    ...available,
    ...(editLink?.numbers || [])
      .filter(n => !available.some(a => a.workspace === n.workspace))
      .map(n => ({ workspace: n.workspace, workspaceName: n.workspaceName, phone: n.phone, connected: false })),
  ];

  const toggle = (ws: string, checked: boolean) => {
    setSelected(prev => {
      const next = { ...prev };
      if (checked) next[ws] = next[ws] || DEFAULT_CAP; else delete next[ws];
      return next;
    });
  };

  const handleSave = async () => {
    if (submitting) return;
    if (!title.trim()) { toast.error(translateApiMessage("请输入链接标题")); return; }
    const entries = Object.entries(selected);
    if (entries.length < 1) { toast.error(translateApiMessage("请至少选择一个号码")); return; }
    for (const [, cap] of entries) {
      if (!Number.isFinite(cap) || cap < 1 || cap > 1000) { toast.error(translateApiMessage("每日上限须在 1-1000 之间")); return; }
    }
    const payload = {
      title: title.trim(),
      prefillText: prefillText.trim() || 'Hi',
      numbers: entries.map(([workspace, dailyCap]) => ({ workspace, dailyCap })),
    };
    setSubmitting(true);
    try {
      if (editLink) await rotationLinkApi.update(editLink._id, payload);
      else await rotationLinkApi.create(payload);
      toast.success(translateApiMessage(editLink ? "已更新" : "链接已创建"));
      setShowModal(false);
      fetchLinks();
    } catch (err) {
      toast.error(errMsg(err, "操作失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (l: RotationLink) => {
    try {
      await rotationLinkApi.update(l._id, { isActive: !l.isActive });
      toast.success(translateApiMessage(l.isActive ? "已停用" : "已启用"));
      fetchLinks();
    } catch (err) {
      toast.error(errMsg(err, "操作失败"));
    }
  };

  const remove = (l: RotationLink) => {
    if (!confirm("确定删除？")) return;
    rotationLinkApi.delete(l._id)
      .then(() => { fetchLinks(); toast.success(translateApiMessage("链接已删除")); })
      .catch(() => toast.error(translateApiMessage("删除失败")));
  };

  const columns = [
    { key: 'title', title: "标题", render: (l: RotationLink) => (
      <div>
        <p className="font-medium text-gray-900">{l.title || "无标题"}</p>
        <p className="text-xs text-gray-400 truncate max-w-[200px]">预填：{l.prefillText}</p>
      </div>
    )},
    { key: 'link', title: "链接", render: (l: RotationLink) => (
      <div className="flex items-center gap-2">
        <code className="text-sm text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded break-all">{linkUrl(l)}</code>
        <button onClick={() => { navigator.clipboard.writeText(linkUrl(l)); toast.success(translateApiMessage("链接已复制！")); }} className="p-1 hover:bg-emerald-50 rounded" title={"复制链接"}>
          <Copy className="w-3 h-3 text-gray-400 hover:text-emerald-600" />
        </button>
      </div>
    )},
    { key: 'count', title: "号码数", render: (l: RotationLink) => <span className="font-medium">{(l.numbers || []).length}</span> },
    { key: 'usage', title: "号码使用情况", render: (l: RotationLink) => (
      <div className="space-y-1 min-w-[260px]">
        {(l.numbers || []).map(n => (
          <div key={n.workspace} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-gray-700">{n.phone || n.workspaceName}</span>
            <span className="text-gray-500 whitespace-nowrap">今日会话 <b className="text-gray-900">{n.sessions24h || 0}/{n.dailyCap}</b> · 24h点击 <b className="text-gray-900">{n.clicks24h || 0}</b></span>
          </div>
        ))}
      </div>
    )},
    { key: 'status', title: "状态", render: (l: RotationLink) => <Badge variant={l.isActive ? 'success' : 'default'}>{l.isActive ? "启用" : "停用"}</Badge> },
    { key: 'actions', title: '', render: (l: RotationLink) => (
      <div className="flex gap-1">
        <button title={"编辑"} onClick={() => openModal(l)} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
        <button title={l.isActive ? "停用" : "启用"} onClick={() => toggleActive(l)} className="p-1 hover:bg-gray-100 rounded"><Power className={`w-4 h-4 ${l.isActive ? 'text-emerald-500' : 'text-gray-400'}`} /></button>
        <button title={"删除"} onClick={() => remove(l)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-gray-500 text-sm">一个链接轮流分配给多个 WhatsApp 号码，每个号码按每日会话上限自动分流</p>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}>创建链接</Button>
      </div>

      <Table columns={columns} data={links} loading={loading} emptyText={"还没有轮询链接"} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editLink ? "编辑轮询链接" : "创建轮询链接"} size="xl">
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
          {/* 左栏：链接设置与汇总 */}
          <div className="space-y-4">
            <Input label={"标题"} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={"例如：广告投放A"} />
            <Input label={"预填文本"} value={prefillText} onChange={(e) => setPrefillText(e.target.value)} placeholder="Hi" />
            <p className="text-xs text-gray-500">访客消息框将预填“{prefillText.trim() || 'Hi'} [编码]”。编码用于统计归因，请提醒客服不要让访客删除。</p>
            <div className="rounded-xl bg-gray-50 p-4 space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-gray-500">已选号码</span>
                <span className="text-2xl font-semibold text-gray-900">{Object.keys(selected).length}</span>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-gray-500">当日接客容量合计</span>
                <span className="text-2xl font-semibold text-emerald-600">
                  {Object.values(selected).reduce((s, c) => s + (Number.isFinite(c) ? c : 0), 0)}
                </span>
              </div>
              <p className="text-xs text-gray-400 pt-1">访客按「当日会话最少优先」自动分流，全部到达上限时仍分配给最空闲号码。</p>
            </div>
          </div>

          {/* 右栏：号码池 */}
          <div className="flex flex-col min-h-[380px] rounded-xl border border-gray-200">
            <div className="p-3 space-y-2 border-b border-gray-100">
              <div className="flex flex-wrap items-center gap-2">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={"搜索工作区或号码…"}
                  className="flex-1 min-w-[160px] rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900" />
                {(['all', 'online', 'offline'] as const).map(k => (
                  <button key={k} type="button" onClick={() => setStatusFilter(k)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusFilter === k ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {k === 'all' ? "全部" : k === 'online' ? "在线" : "离线/未登录"}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button type="button" className="text-emerald-600 hover:underline font-medium"
                  onClick={() => setSelected(prev => {
                    const next = { ...prev };
                    rows.filter(r => r.connected).forEach(r => { next[r.workspace] = next[r.workspace] || DEFAULT_CAP; });
                    return next;
                  })}>全选在线号码</button>
                <button type="button" className="text-gray-400 hover:underline" onClick={() => setSelected({})}>清空</button>
                <span className="ml-auto flex items-center gap-1 text-gray-500">
                  统一上限
                  <input type="number" min={1} max={1000} value={bulkCap} onChange={(e) => setBulkCap(Number(e.target.value) || DEFAULT_CAP)}
                    className="w-16 rounded border border-gray-300 px-2 py-1 text-xs text-gray-900" />
                  <button type="button" className="text-emerald-600 hover:underline font-medium"
                    onClick={() => setSelected(prev => Object.fromEntries(Object.keys(prev).map(k => [k, Math.min(1000, Math.max(1, bulkCap))])))}>
                    应用到已选
                  </button>
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[46vh]">
              {numbersLoading ? <p className="p-4 text-sm text-gray-400">加载中…</p>
                : rows.length === 0 ? (
                <div className="m-4 rounded-lg border border-dashed border-gray-300 p-5 text-sm text-gray-500">
                  你的账户名下还没有可用的 WhatsApp 号码。请先到 <b>WhatsApp 连接</b> 页扫码登录号码；号码属于各自的工作区，仅工作区所有者账号可在此选择。
                </div>
              ) : (() => {
                const q = query.trim().toLowerCase();
                const filtered = rows.filter(n => {
                  if (q && !(`${n.workspaceName} ${n.phone}`.toLowerCase().includes(q))) return false;
                  if (statusFilter === 'online') return n.connected;
                  if (statusFilter === 'offline') return !n.connected;
                  return true;
                });
                if (!filtered.length) return <p className="p-4 text-sm text-gray-400">没有匹配的号码，换个筛选条件试试。</p>;
                return (
                  <div className="divide-y divide-gray-100">
                    {filtered.map(n => {
                      const checked = n.workspace in selected;
                      const noPhone = !n.phone;
                      const disabled = noPhone || (!n.connected && !checked);
                      return (
                        <div key={n.workspace} className={`flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 ${disabled ? 'opacity-55' : ''}`}>
                          <input type="checkbox" className="rounded shrink-0" checked={checked} disabled={disabled} onChange={(e) => toggle(n.workspace, e.target.checked)} />
                          <span className={`w-2 h-2 rounded-full shrink-0 ${n.connected ? 'bg-emerald-500' : noPhone ? 'bg-amber-400' : 'bg-gray-300'}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-800 truncate">{n.phone || "未扫码登录"}</p>
                            <p className="text-xs text-gray-400 truncate">{n.workspaceName}{noPhone ? " · 到 WhatsApp 连接页扫码后可用" : n.connected ? '' : " · 离线"}</p>
                          </div>
                          <label className={`flex items-center gap-1 text-xs whitespace-nowrap ${checked ? 'text-gray-600' : 'text-gray-300'}`}>
                            当日上限
                            <input type="number" min={1} max={1000} disabled={!checked}
                              value={checked ? (Number.isFinite(selected[n.workspace]) ? selected[n.workspace] : '') : DEFAULT_CAP}
                              onChange={(e) => setSelected(prev => ({ ...prev, [n.workspace]: e.target.value === '' ? NaN : Number(e.target.value) }))}
                              className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-400" />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-5">
          <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
          <Button onClick={handleSave}>{editLink ? "更新" : "创建"}</Button>
        </div>
      </Modal>
    </div>
  );
}
