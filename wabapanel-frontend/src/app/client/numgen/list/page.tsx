'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hash, ListOrdered, Download, Trash2, RefreshCw, Search, RotateCcw, Plus, ScanSearch, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { numgenApi, saverCheckApi } from '@/lib/api';
import { SAVER_GROUPS } from '@/lib/saverTypes';

// 送检限制与省钱专家一致
const CHECK_MIN = 2000;
const CHECK_MAX = 5000000;
// 只有按号码检测的类型才能接收生成的号码（邮箱/用户名类排除）
const PHONE_GROUPS = SAVER_GROUPS
  .map(g => ({ slug: g.slug, name: g.name, types: g.types.filter(t => t.input === 'phone') }))
  .filter(g => g.types.length > 0);
const DEFAULT_TASK_TYPE = PHONE_GROUPS.find(g => g.slug === 'ws')?.types[0]?.value || PHONE_GROUPS[0]?.types[0]?.value || '';
const groupSlugOf = (taskType: string) => PHONE_GROUPS.find(g => g.types.some(t => t.value === taskType))?.slug || 'ws';
const round3 = (n: number) => Math.round(n * 1000) / 1000;

interface GenBatch {
  _id: string;
  name?: string;
  country?: { name?: string; dial?: string; code?: string };
  prefixes: string[];
  prefixCount?: number;
  region?: { name?: string; city?: string; isp?: string; selected?: string[] };
  localLen: number;
  mode: 'sequential' | 'random';
  count: number;
  capacity?: number;
  preview?: string[];
  createdAt: string;
}

const MODE_LABEL: Record<GenBatch['mode'], string> = { sequential: '顺序', random: '随机' };
const fmtTime = (d?: string) => d
  ? new Date(d).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—';
const batchNo = (id: string) => id.slice(-8).toUpperCase();
const saveBlob = (fileName: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

export default function NumGenListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<GenBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [nameInput, setNameInput] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');

  // 加入检测弹窗
  interface WalletInfo { enabled: boolean; balance?: number; priceDefault?: number; priceOverrides?: Record<string, number> }
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [checkTarget, setCheckTarget] = useState<GenBatch | null>(null);
  const [checkType, setCheckType] = useState(DEFAULT_TASK_TYPE);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    saverCheckApi.wallet().then(r => setWallet(r.data.data || { enabled: false })).catch(() => {});
  }, []);
  const openCheck = (b: GenBatch) => { setCheckType(DEFAULT_TASK_TYPE); setCheckTarget(b); };
  const checkCount = checkTarget?.count || 0;
  const checkCountOk = checkCount >= CHECK_MIN && checkCount <= CHECK_MAX;
  const checkUnitPrice = wallet?.enabled ? (wallet.priceOverrides?.[checkType] ?? wallet.priceDefault ?? 0) : 0;
  const checkCost = round3(checkUnitPrice * checkCount);
  const checkInsufficient = !!wallet?.enabled && checkCost > (wallet.balance || 0);
  const submitCheck = async () => {
    if (!checkTarget || checking || !checkCountOk || !checkType) return;
    setChecking(true);
    const target = checkTarget;
    const slug = groupSlugOf(checkType);
    try {
      await numgenApi.check(target._id, { taskType: checkType });
      setCheckTarget(null);
      toast.success(t => (
        <span className="flex items-center gap-3">
          已加入检测
          <button onClick={() => { toast.dismiss(t.id); router.push(`/client/saver/${slug}`); }}
            className="text-emerald-600 font-semibold hover:underline">去查看</button>
        </span>
      ), { duration: 6000 });
      saverCheckApi.wallet().then(r => setWallet(r.data.data || { enabled: false })).catch(() => {});
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || '加入检测失败，请稍后重试');
    }
    setChecking(false);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await numgenApi.list({ page, limit, ...(query ? { name: query } : {}) });
      setRows(res.data.data || []);
      setTotal(res.data.pagination?.total ?? (res.data.data || []).length);
    } catch { /* empty */ }
    setLoading(false);
  }, [page, limit, query]);
  useEffect(() => { load(); }, [load]);

  const doSearch = () => { setPage(1); setQuery(nameInput.trim()); };
  const doReset = () => { setNameInput(''); setPage(1); setQuery(''); };

  const download = async (b: GenBatch) => {
    if (busyId) return;
    setBusyId(b._id);
    try {
      const res = await numgenApi.exportTxt(b._id);
      saveBlob(`${b.name || batchNo(b._id)}.txt`, res.data);
    } catch { toast.error('下载失败，请稍后重试'); }
    setBusyId('');
  };

  const remove = async (b: GenBatch) => {
    if (!confirm(`删除「${b.name || batchNo(b._id)}」？`)) return;
    try {
      await numgenApi.remove(b._id);
      toast.success('已删除');
      load();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || '删除失败');
    }
  };

  const pages = Math.max(1, Math.ceil(total / limit));
  const th = 'px-3 py-3 font-medium whitespace-nowrap';
  const td = 'px-3 py-2.5 whitespace-nowrap';

  return (
    <div className="space-y-4">
      <Card className="!p-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 shrink-0">任务名称</label>
            <input value={nameInput} onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doSearch(); }}
              placeholder="请输入任务名称"
              className="w-48 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" icon={<RotateCcw className="w-4 h-4" />} onClick={doReset}>重置</Button>
            <Button icon={<Search className="w-4 h-4" />} onClick={doSearch}>搜索</Button>
          </div>
        </div>
      </Card>

      <Card padding={false} className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-gray-100">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900">
            <ListOrdered className="w-5 h-5 text-emerald-600" />生成列表
          </h2>
          <div className="flex items-center gap-2">
            <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => router.push('/client/numgen/generate')}>去生成</Button>
            <Button size="sm" variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={load}>刷新</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50/60">
                <th className={`${th} pl-4`}>编号</th>
                <th className={th}>任务名称</th>
                <th className={th}>国家</th>
                <th className={th}>号段</th>
                <th className={`${th} text-right`}>位数</th>
                <th className={th}>方式</th>
                <th className={`${th} text-right`}>数量</th>
                <th className={th}>示例</th>
                <th className={th}>创建时间</th>
                <th className={`${th} pr-4`}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-14 text-center text-gray-400">加载中…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-14 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-3">
                    <Hash className="w-8 h-8 text-gray-200" />
                    <span>还没有生成过号码</span>
                    <Button size="sm" onClick={() => router.push('/client/numgen/generate')}>去生成第一批号码</Button>
                  </div>
                </td></tr>
              ) : rows.map(b => (
                <tr key={b._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className={`${td} pl-4 font-mono text-xs text-gray-500`}>{batchNo(b._id)}</td>
                  <td className={`${td} font-medium text-gray-900 max-w-40 truncate`} title={b.name}>{b.name || '—'}</td>
                  <td className={`${td} text-gray-600`}>{b.country?.name || '—'}{b.country?.dial ? ` +${b.country.dial}` : ''}</td>
                  <td className={`${td} text-gray-700`}>
                    {b.region?.name ? (
                      <div>
                        <div className="text-gray-800">{b.region.name}{b.region.city ? ` ${b.region.city}` : ''}{b.region.isp ? ` · ${b.region.isp}` : ''}</div>
                        <div className="text-xs text-gray-400">
                          {b.region.selected?.length
                            ? `已选 ${(b.prefixCount ?? (b.prefixes || []).length).toLocaleString()} 个号段（${b.region.selected.slice(0, 6).join('、')}${b.region.selected.length > 6 ? ' 等' : ''}）`
                            : `${(b.prefixCount ?? (b.prefixes || []).length).toLocaleString()} 个号段`}
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono">
                        {(b.prefixes || []).join('、')}
                        {(b.prefixCount || 0) > (b.prefixes || []).length ? <span className="font-sans text-xs text-gray-400"> 等 {(b.prefixCount || 0).toLocaleString()} 个</span> : null}
                      </span>
                    )}
                  </td>
                  <td className={`${td} text-right text-gray-600`}>{b.localLen}</td>
                  <td className={td}>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${b.mode === 'random' ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'}`}>
                      {MODE_LABEL[b.mode] || b.mode}
                    </span>
                  </td>
                  <td className={`${td} text-right text-gray-900`}>{(b.count || 0).toLocaleString()}</td>
                  <td className={`${td} font-mono text-xs text-gray-500`}>
                    {(b.preview || []).length ? (b.preview || []).slice(0, 3).join('、') : '—'}
                  </td>
                  <td className={`${td} text-gray-500 text-xs`}>{fmtTime(b.createdAt)}</td>
                  <td className={`${td} pr-4`}>
                    <div className="flex items-center gap-3">
                      <button onClick={() => download(b)} disabled={busyId === b._id}
                        className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-medium disabled:opacity-50">
                        {busyId === b._id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}下载
                      </button>
                      <button onClick={() => openCheck(b)}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline text-xs font-medium">
                        <ScanSearch className="w-3.5 h-3.5" />检测
                      </button>
                      <button onClick={() => remove(b)}
                        className="inline-flex items-center gap-1 text-gray-400 hover:text-red-500 text-xs">
                        <Trash2 className="w-3.5 h-3.5" />删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-t border-gray-100 text-sm">
          <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-600 focus:outline-none">
            {[20, 50, 100].map(n => <option key={n} value={n}>{n} 条/页</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-2.5 py-1 rounded-lg text-xs border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50">上一页</button>
            <span className="text-xs text-gray-500 px-1">{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
              className="px-2.5 py-1 rounded-lg text-xs border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50">下一页</button>
            <span className="text-xs text-gray-400 ml-2">共 {total} 条记录</span>
          </div>
        </div>
      </Card>

      {/* 加入检测：把这批号码直接送进省钱专家 */}
      <Modal isOpen={!!checkTarget} onClose={() => { if (!checking) setCheckTarget(null); }} title="加入检测" size="md" guard={false}>
        {checkTarget && (
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 shrink-0">批次</span>
                <span className="font-medium text-gray-900 truncate">{checkTarget.name || batchNo(checkTarget._id)}</span>
              </div>
              <div className="flex items-center gap-4 text-gray-600">
                <span>国家：{checkTarget.country?.name || '—'}{checkTarget.country?.dial ? ` +${checkTarget.country.dial}` : ''}</span>
                <span>数量：<b className="text-gray-900">{checkCount.toLocaleString()}</b> 条</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">检测类型</label>
              <select value={checkType} onChange={e => setCheckType(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                {PHONE_GROUPS.map(g => (
                  <optgroup key={g.slug} label={g.name}>
                    {g.types.map(t => <option key={t.value} value={t.value}>{t.name}</option>)}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">提交后在省钱专家对应平台页查看进度和结果</p>
            </div>

            {!checkCountOk && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {checkCount < CHECK_MIN
                  ? `条数不足：检测单次最低 ${CHECK_MIN.toLocaleString()} 条，这批只有 ${checkCount.toLocaleString()} 条`
                  : `超出上限：检测单次最多 ${CHECK_MAX.toLocaleString()} 条`}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              {wallet?.enabled && (
                <span className="text-sm text-gray-500 mr-auto">
                  预计扣费 <span className={`font-semibold ${checkInsufficient ? 'text-red-500' : 'text-emerald-600'}`}>￥{checkCost}</span>
                  <span className="text-xs text-gray-400 ml-1">（余额 ￥{round3(wallet.balance || 0)}）</span>
                </span>
              )}
              <Button variant="ghost" onClick={() => setCheckTarget(null)} disabled={checking}>取消</Button>
              <Button onClick={submitCheck} loading={checking} disabled={!checkCountOk || !checkType || checking}>
                加入检测
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
