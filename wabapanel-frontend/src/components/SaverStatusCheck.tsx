'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Download, Trash2, RefreshCw, Search, RotateCcw, Plus, AlertCircle } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { saverCheckApi } from '@/lib/api';
import { SAVER_GROUP_MAP, saverChannelOf, type SaverTypeDef } from '@/lib/saverTypes';

interface CheckTask {
  _id: string;
  fileName?: string;
  taskType?: string;
  country?: { name?: string; dial?: string; code?: string };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  total: number;
  checked?: number;
  cost?: number;
  refunded?: boolean;
  summary?: { active: number; banned: number; inactive: number; notFound: number; unknown: number };
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

// 上传限制：与后端一致（后端以自己解析去重后的条数为准计费，这里仅前置校验）
const MIN_NUMBERS = 2000;
const MAX_NUMBERS = 5000000;

const COUNTRIES: { name: string; dial: string; code: string }[] = [
  { name: '马来西亚', dial: '60', code: 'MY' },
  { name: '新加坡', dial: '65', code: 'SG' },
  { name: '印度尼西亚', dial: '62', code: 'ID' },
  { name: '泰国', dial: '66', code: 'TH' },
  { name: '越南', dial: '84', code: 'VN' },
  { name: '菲律宾', dial: '63', code: 'PH' },
  { name: '柬埔寨', dial: '855', code: 'KH' },
  { name: '缅甸', dial: '95', code: 'MM' },
  { name: '中国大陆', dial: '86', code: 'CN' },
  { name: '中国香港', dial: '852', code: 'HK' },
  { name: '中国台湾', dial: '886', code: 'TW' },
  { name: '印度', dial: '91', code: 'IN' },
  { name: '阿联酋', dial: '971', code: 'AE' },
  { name: '美国', dial: '1', code: 'US' },
  { name: '英国', dial: '44', code: 'GB' },
  { name: '巴西', dial: '55', code: 'BR' },
];

const TASK_STATUS: Record<CheckTask['status'], { label: string; cls: string }> = {
  pending: { label: '排队中', cls: 'bg-gray-100 text-gray-500' },
  processing: { label: '检测中', cls: 'bg-blue-50 text-blue-600' },
  completed: { label: '已完成', cls: 'bg-emerald-50 text-emerald-700' },
  failed: { label: '失败', cls: 'bg-red-50 text-red-600' },
};

// 按行扫描估算条数（去重）：号码（纯数字 6-17 位）/ 邮箱 / 用户名。
// 500 万行级文件避免全文大正则 match 产生巨型中间数组；结果只留计数，不留数组
const emailLineRe = /[^\s@,;|]+@[^\s@,;|]+\.[A-Za-z]{2,}/;
const countByInput = (text: string, input: SaverTypeDef['input']): number => {
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    if (input === 'email') {
      const m = line.match(emailLineRe);
      if (m) seen.add(m[0].toLowerCase());
      continue;
    }
    if (input === 'username') {
      const s = line.replace(/^@/, '');
      if (s && s.length <= 64 && !/[\s,;]/.test(s)) seen.add(s);
      continue;
    }
    const digits = line.split(/[,;\t]/)[0].replace(/\D/g, '');
    if (digits.length >= 6 && digits.length <= 17) seen.add(digits);
  }
  return seen.size;
};
const INPUT_HINT: Record<SaverTypeDef['input'], string> = {
  phone: '每行一个号码', email: '每行一个邮箱', username: '每行一个用户名',
};

const fmtTime = (d?: string) => d
  ? new Date(d).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—';
const taskNo = (id: string) => id.slice(-8).toUpperCase();
const invalidOf = (t: CheckTask) =>
  (t.summary?.banned || 0) + (t.summary?.inactive || 0) + (t.summary?.notFound || 0);
const progressOf = (t: CheckTask) => {
  if (t.status === 'completed') return 100;
  if (t.status === 'failed') return 0;
  return t.total ? Math.round(((t.checked || 0) / t.total) * 100) : 0;
};

const saveBlob = (name: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

export default function SaverStatusCheck({ groupSlug }: { groupSlug: string }) {
  const group = SAVER_GROUP_MAP[groupSlug];
  const [typeValue, setTypeValue] = useState(group?.types[0]?.value || '');
  const def = group?.types.find(t => t.value === typeValue) || group?.types[0];
  const [tasks, setTasks] = useState<CheckTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  // 搜索表单（点搜索才生效）
  const [nameInput, setNameInput] = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [query, setQuery] = useState<{ name: string; country: string }>({ name: '', country: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // 新增弹窗。文件本地只扫一遍估算条数（显示/校验用），提交时原始文件直传后端
  const [modalOpen, setModalOpen] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ name: string; count: number } | null>(null);
  // 商家积分钱包（计费开启时显示余额和预计扣费）
  interface WalletInfo { enabled: boolean; balance?: number; priceDefault?: number; priceOverrides?: Record<string, number> }
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const loadWallet = useCallback(() => {
    saverCheckApi.wallet().then(r => setWallet(r.data.data || { enabled: false })).catch(() => {});
  }, []);
  useEffect(() => { loadWallet(); }, [loadWallet]);
  const unitPrice = wallet?.enabled
    ? (wallet.priceOverrides?.[typeValue] ?? wallet.priceDefault ?? 0) : 0;
  const round3 = (n: number) => Math.round(n * 1000) / 1000;

  const loadTasks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await saverCheckApi.list({
        type: typeValue, page, limit,
        ...(query.name ? { name: query.name } : {}),
        ...(query.country ? { country: query.country } : {}),
      });
      setTasks(res.data.data || []);
      setTotal(res.data.pagination?.total ?? (res.data.data || []).length);
    } catch { /* empty */ }
    setLoading(false);
  }, [typeValue, page, limit, query]);
  useEffect(() => { loadTasks(); }, [loadTasks]);

  // 有任务在检测中时静默轮询
  const hasRunning = tasks.some(t => t.status === 'pending' || t.status === 'processing');
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => loadTasks(true), 3000);
    return () => clearInterval(timer);
  }, [hasRunning, loadTasks]);

  const doSearch = () => { setPage(1); setQuery({ name: nameInput.trim(), country: countryInput }); };
  const doReset = () => { setNameInput(''); setCountryInput(''); setPage(1); setQuery({ name: '', country: '' }); };

  // 页内切换检测类型 tab：重置分页/筛选/勾选
  const switchTab = (value: string) => {
    if (value === typeValue) return;
    setTypeValue(value);
    setPage(1);
    setSelected(new Set());
    setNameInput('');
    setCountryInput('');
    setQuery({ name: '', country: '' });
  };

  const openCreate = () => {
    setTaskName('');
    setFileObj(null);
    setFileInfo(null);
    setParsing(false);
    setModalOpen(true);
  };
  const onFilePicked = (file: File) => {
    setFileObj(null);
    setFileInfo(null);
    setParsing(true);
    const reader = new FileReader();
    reader.onload = () => {
      // 大文件同步扫描会卡顿 1-3 秒，先让「正在识别…」渲染出来
      setTimeout(() => {
        const count = countByInput(String(reader.result || ''), def.input);
        setFileObj(file);
        setFileInfo({ name: file.name, count });
        setParsing(false);
        if (!taskName) setTaskName(file.name.replace(/\.(txt|csv)$/i, ''));
      }, 50);
    };
    reader.onerror = () => { setParsing(false); alert('文件读取失败，请重试'); };
    reader.readAsText(file);
  };

  const count = fileInfo?.count || 0;
  const countOk = count >= MIN_NUMBERS && count <= MAX_NUMBERS;

  const submit = async () => {
    if (submitting || !fileObj || !countOk || (def.country && !countryCode)) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('channel', saverChannelOf(typeValue));
      fd.append('taskType', typeValue);
      fd.append('fileName', taskName.trim() || `${def.name}-${new Date().toLocaleDateString('zh-CN')}`);
      if (def.country) {
        const c = COUNTRIES.find(x => x.code === countryCode);
        if (c) { fd.append('countryCode', c.code); fd.append('countryName', c.name); fd.append('countryDial', c.dial); }
      }
      fd.append('file', fileObj);
      await saverCheckApi.create(fd);
      setModalOpen(false);
      setPage(1);
      loadTasks();
      loadWallet();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      alert(msg || '提交失败，请稍后重试');
    }
    setSubmitting(false);
  };

  // 下载结果：后端流式生成 txt（号码\t状态\t说明），blob 保存
  const exportOne = async (t: CheckTask) => {
    try {
      const res = await saverCheckApi.exportResult(t._id);
      saveBlob(`${t.fileName || taskNo(t._id)}-检测结果.txt`, res.data);
    } catch { alert('导出失败，请稍后重试'); }
  };

  // 批量下载：逐任务各存一个 txt（百万级结果合并单文件会撑爆内存）
  const exportSelected = async () => {
    const targets = tasks.filter(t => selected.has(t._id) && t.status === 'completed');
    if (!targets.length || exporting) return;
    setExporting(true);
    try {
      for (const t of targets) {
        const res = await saverCheckApi.exportResult(t._id);
        saveBlob(`${t.fileName || taskNo(t._id)}-检测结果.txt`, res.data);
      }
    } catch { alert('批量下载失败，请稍后重试'); }
    setExporting(false);
  };

  const removeTask = async (id: string) => {
    if (!confirm('删除这条检测任务？')) return;
    try {
      await saverCheckApi.remove(id);
      setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
      loadTasks();
    } catch { /* empty */ }
  };

  const toggleAll = () => {
    setSelected(prev => prev.size === tasks.length && tasks.length > 0 ? new Set() : new Set(tasks.map(t => t._id)));
  };
  const toggleOne = (id: string) => {
    setSelected(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  };

  const pages = Math.max(1, Math.ceil(total / limit));
  const selectedDone = tasks.filter(t => selected.has(t._id) && t.status === 'completed').length;

  const th = 'px-3 py-3 font-medium whitespace-nowrap';
  const td = 'px-3 py-2.5 whitespace-nowrap';

  if (!group || !def) return <div className="py-16 text-center text-gray-400">检测类型不存在</div>;
  const TypeIcon = group.Icon;

  return (
    <div className="space-y-4">
      {/* 类型 tab */}
      {group.types.length > 1 && (
        <Card padding={false} className="overflow-hidden">
          <div className="flex overflow-x-auto">
            {group.types.map(t => (
              <button key={t.value} onClick={() => switchTab(t.value)}
                className={`px-5 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${typeValue === t.value
                  ? 'border-emerald-500 text-emerald-600 font-medium bg-emerald-50/40'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
                {t.tab}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* 搜索表单 */}
      <Card className="!p-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 shrink-0">任务名称</label>
            <input value={nameInput} onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doSearch(); }}
              placeholder="请输入任务名称"
              className="w-48 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          {def.country && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 shrink-0">国家</label>
              <select value={countryInput} onChange={e => setCountryInput(e.target.value)}
                className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">全部国家</option>
                {COUNTRIES.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" icon={<RotateCcw className="w-4 h-4" />} onClick={doReset}>重置</Button>
            <Button icon={<Search className="w-4 h-4" />} onClick={doSearch}>搜索</Button>
          </div>
        </div>
      </Card>

      {/* 工具栏 + 表格 */}
      <Card padding={false} className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-gray-100">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900">
            <TypeIcon className={`w-5 h-5 ${group.color}`} />{def.name}管理
            {wallet?.enabled && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                我的余额 <span className="text-emerald-600 font-semibold">￥{round3(wallet.balance || 0)}</span>
                <span className="ml-2">单价 ￥{unitPrice}/条</span>
                <a href="/client/saver-wallet" className="ml-2 text-emerald-600 hover:underline">去充值</a>
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={openCreate}>新增-上传文本</Button>
            <Button size="sm" variant="outline" icon={<Download className="w-4 h-4" />}
              onClick={exportSelected} disabled={!selectedDone} loading={exporting}>
              批量下载{selectedDone ? `（${selectedDone}）` : ''}
            </Button>
            <Button size="sm" variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => loadTasks()}>刷新</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[980px]">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50/60">
                <th className="pl-4 pr-1 py-3 w-10">
                  <input type="checkbox" className="accent-emerald-600"
                    checked={tasks.length > 0 && selected.size === tasks.length}
                    onChange={toggleAll} />
                </th>
                <th className={th}>任务编号</th>
                <th className={th}>任务名称</th>
                {def.country && <th className={th}>国家</th>}
                <th className={`${th} text-right`}>总数</th>
                <th className={th}>进度</th>
                <th className={`${th} text-right`}>有效</th>
                <th className={`${th} text-right`}>无效</th>
                {wallet?.enabled && <th className={`${th} text-right`}>扣费</th>}
                <th className={th}>状态</th>
                <th className={th}>开始时间</th>
                <th className={th}>结束时间</th>
                <th className={th}>结果</th>
                <th className={`${th} pr-4`}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={14} className="px-4 py-14 text-center text-gray-400">加载中…</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={14} className="px-4 py-14 text-center text-gray-400">
                  暂无数据，点击「新增-上传文本」创建第一个检测任务
                </td></tr>
              ) : tasks.map(t => (
                <tr key={t._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="pl-4 pr-1 py-2.5">
                    <input type="checkbox" className="accent-emerald-600"
                      checked={selected.has(t._id)} onChange={() => toggleOne(t._id)} />
                  </td>
                  <td className={`${td} font-mono text-xs text-gray-500`}>{taskNo(t._id)}</td>
                  <td className={`${td} font-medium text-gray-900 max-w-40 truncate`} title={t.fileName}>{t.fileName || '—'}</td>
                  {def.country && <td className={`${td} text-gray-600`}>{t.country?.name || '—'}</td>}
                  <td className={`${td} text-right text-gray-900`}>{t.total}</td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full ${t.status === 'failed' ? 'bg-red-400' : 'bg-emerald-500'}`}
                          style={{ width: `${progressOf(t)}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{progressOf(t)}%</span>
                    </div>
                  </td>
                  <td className={`${td} text-right`}>
                    {t.status === 'completed' ? <span className="text-emerald-600 font-medium">{t.summary?.active || 0}</span> : '—'}
                  </td>
                  <td className={`${td} text-right`}>
                    {t.status === 'completed' ? <span className="text-red-500 font-medium">{invalidOf(t)}</span> : '—'}
                  </td>
                  {wallet?.enabled && (
                    <td className={`${td} text-right text-gray-600`}>
                      {t.cost ? `￥${round3(t.cost)}` : '—'}
                      {t.refunded && <span className="text-xs text-emerald-600 ml-1">已退</span>}
                    </td>
                  )}
                  <td className={td}>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${TASK_STATUS[t.status].cls}`}
                      title={t.status === 'failed' ? t.error : undefined}>
                      {t.status === 'processing' && <RefreshCw className="w-3 h-3 animate-spin" />}
                      {t.status === 'failed' && <AlertCircle className="w-3 h-3" />}
                      {TASK_STATUS[t.status].label}
                    </span>
                  </td>
                  <td className={`${td} text-gray-500 text-xs`}>{fmtTime(t.startedAt || t.createdAt)}</td>
                  <td className={`${td} text-gray-500 text-xs`}>{fmtTime(t.finishedAt)}</td>
                  <td className={td}>
                    {t.status === 'completed' ? (
                      <button onClick={() => exportOne(t)}
                        className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-medium">
                        <Download className="w-3.5 h-3.5" />下载结果
                      </button>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className={`${td} pr-4`}>
                    <button onClick={() => removeTask(t._id)}
                      className="inline-flex items-center gap-1 text-gray-400 hover:text-red-500 text-xs">
                      <Trash2 className="w-3.5 h-3.5" />删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
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

      {/* 新增-上传文本 弹窗 */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={`新增${def.name}任务`} size="lg" guard={false}>
        <div className="space-y-4">
          {def.hint && <p className="text-sm text-gray-500 -mt-1">{def.hint}</p>}
          <div className={def.country ? 'grid grid-cols-2 gap-3' : ''}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">任务名称</label>
              <input value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="不填则自动生成"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            {def.country && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">客户号码国家</label>
                <select value={countryCode} onChange={e => setCountryCode(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">请选择国家</option>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name} +{c.dial}</option>)}
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">检测文件</label>
            <input ref={fileRef} type="file" accept=".txt,.csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onFilePicked(f); e.target.value = ''; }} />
            {parsing ? (
              <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-500 shrink-0" />正在识别文件内容…大文件需要几秒钟
              </div>
            ) : fileInfo ? (
              <div className="space-y-1.5">
                <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${countOk ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <span className="font-medium text-gray-900 truncate">{fileInfo.name}</span>
                  <span className={`shrink-0 ${countOk ? 'text-emerald-700' : 'text-red-600'}`}>已识别 {count.toLocaleString()} 条</span>
                  <button onClick={() => { setFileObj(null); setFileInfo(null); }}
                    className="ml-auto text-gray-400 hover:text-red-500 text-xs shrink-0">移除</button>
                </div>
                {count < MIN_NUMBERS && (
                  <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />条数不足：单次最低 {MIN_NUMBERS.toLocaleString()} 条</p>
                )}
                {count > MAX_NUMBERS && (
                  <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />超出上限：单次最多 {MAX_NUMBERS.toLocaleString()} 条，请拆分后分次提交</p>
                )}
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors px-4 py-8 text-sm text-gray-500 flex flex-col items-center gap-2">
                <Upload className="w-6 h-6 text-gray-300" />
                点击选择 .txt / .csv 文件（{INPUT_HINT[def.input]}）
              </button>
            )}
            <p className="text-xs text-gray-400 mt-1.5">单次 {MIN_NUMBERS.toLocaleString()} ～ {MAX_NUMBERS.toLocaleString()} 条；以系统实际识别去重后的条数计费</p>
          </div>
          <div className="flex items-center justify-end gap-3 pt-1">
            {wallet?.enabled && count > 0 && (
              <span className="text-sm text-gray-500 mr-auto">
                预计扣费 <span className={`font-semibold ${round3(unitPrice * count) > (wallet.balance || 0) ? 'text-red-500' : 'text-emerald-600'}`}>￥{round3(unitPrice * count)}</span>
                <span className="text-xs text-gray-400 ml-1">（余额 ￥{round3(wallet.balance || 0)}）</span>
              </span>
            )}
            <Button variant="ghost" onClick={() => setModalOpen(false)}>取消</Button>
            <Button onClick={submit} disabled={!fileObj || !countOk || (def.country && !countryCode)} loading={submitting}>
              开始检测{count ? `（${count.toLocaleString()} 条）` : ''}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
