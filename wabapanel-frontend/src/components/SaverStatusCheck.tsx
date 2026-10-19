'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Download, Trash2, RefreshCw, Search, RotateCcw, Plus, AlertCircle } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { saverCheckApi } from '@/lib/api';
import { SAVER_GROUP_MAP, saverChannelOf, type SaverTypeDef } from '@/lib/saverTypes';

type ResultStatus = 'active' | 'banned' | 'inactive' | 'not_found' | 'unknown';

interface CheckTask {
  _id: string;
  fileName?: string;
  taskType?: string;
  country?: { name?: string; dial?: string; code?: string };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  total: number;
  checked?: number;
  summary?: { active: number; banned: number; inactive: number; notFound: number; unknown: number };
  results?: { phone: string; status: ResultStatus; detail?: string }[];
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

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

const STATUS_LABEL: Record<ResultStatus, string> = {
  active: '有效', banned: '已封号', inactive: '久未上线', not_found: '未开通', unknown: '未知',
};

const TASK_STATUS: Record<CheckTask['status'], { label: string; cls: string }> = {
  pending: { label: '排队中', cls: 'bg-gray-100 text-gray-500' },
  processing: { label: '检测中', cls: 'bg-blue-50 text-blue-600' },
  completed: { label: '已完成', cls: 'bg-emerald-50 text-emerald-700' },
  failed: { label: '失败', cls: 'bg-red-50 text-red-600' },
};

// 按检测类型从文本中提取内容：号码（连续数字 6-17 位）/ 邮箱 / 用户名
const extractNumbers = (text: string): string[] =>
  (text.match(/\+?\d[\d\s\-()]{4,21}\d/g) || [])
    .map(s => s.replace(/\D/g, ''))
    .filter(s => s.length >= 6 && s.length <= 17);
const extractByInput = (text: string, input: SaverTypeDef['input']): string[] => {
  if (input === 'email') {
    return Array.from(new Set((text.match(/[^\s@,;|]+@[^\s@,;|]+\.[A-Za-z]{2,}/g) || []).map(s => s.toLowerCase())));
  }
  if (input === 'username') {
    return Array.from(new Set(
      text.split(/\r?\n/).map(s => s.trim().replace(/^@/, '')).filter(s => s && s.length <= 64 && !/[\s,;]/.test(s))));
  }
  return Array.from(new Set(extractNumbers(text)));
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

const taskToTxt = (t: CheckTask) =>
  (t.results || []).map(r => `${r.phone}\t${STATUS_LABEL[r.status] || r.status}${r.detail ? `\t${r.detail}` : ''}`).join('\n');
const saveTxt = (name: string, content: string) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
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

  // 新增弹窗。文件只解析进内存数组，界面只显示文件名和识别数量
  const [modalOpen, setModalOpen] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileNumbers, setFileNumbers] = useState<string[]>([]);
  const [fileInfo, setFileInfo] = useState<{ name: string; count: number } | null>(null);
  // 检测平台积分余额
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    saverCheckApi.balance()
      .then(r => { if (r.data.data?.configured) setBalance(r.data.data.balance); })
      .catch(() => {});
  }, []);

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
    setFileNumbers([]);
    setFileInfo(null);
    setModalOpen(true);
  };
  const onFilePicked = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const found = extractByInput(String(reader.result || ''), def.input);
      setFileNumbers(found);
      setFileInfo({ name: file.name, count: found.length });
      if (!taskName) setTaskName(file.name.replace(/\.(txt|csv)$/i, ''));
    };
    reader.readAsText(file);
  };

  const submit = async () => {
    if (submitting || !fileNumbers.length || (def.country && !countryCode)) return;
    setSubmitting(true);
    try {
      const country = def.country ? COUNTRIES.find(c => c.code === countryCode) : undefined;
      await saverCheckApi.create({
        channel: saverChannelOf(typeValue), country, numbers: fileNumbers, taskType: typeValue,
        fileName: taskName.trim() || `${def.name}-${new Date().toLocaleDateString('zh-CN')}`,
      });
      setModalOpen(false);
      setPage(1);
      loadTasks();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      alert(msg || '提交失败，请稍后重试');
    }
    setSubmitting(false);
  };

  const exportOne = async (t: CheckTask) => {
    try {
      const res = await saverCheckApi.get(t._id);
      saveTxt(`${t.fileName || taskNo(t._id)}-检测结果.txt`, '号码\t状态\t说明\n' + taskToTxt(res.data.data));
    } catch { alert('导出失败，请稍后重试'); }
  };

  // 批量下载：选中的已完成任务合并为一个 txt，按任务分段
  const exportSelected = async () => {
    const targets = tasks.filter(t => selected.has(t._id) && t.status === 'completed');
    if (!targets.length || exporting) return;
    setExporting(true);
    try {
      const parts: string[] = [];
      for (const t of targets) {
        const res = await saverCheckApi.get(t._id);
        parts.push(`===== ${t.fileName || taskNo(t._id)}（${t.total} 条）=====\n号码\t状态\t说明\n${taskToTxt(res.data.data)}`);
      }
      saveTxt(`${def.name}-批量结果-${new Date().toISOString().slice(0, 10)}.txt`, parts.join('\n\n'));
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
            {balance !== null && (
              <span className="ml-2 text-xs font-normal text-gray-400">积分余额 <span className="text-emerald-600 font-semibold">{balance}</span></span>
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
                <th className={th}>状态</th>
                <th className={th}>开始时间</th>
                <th className={th}>结束时间</th>
                <th className={th}>结果</th>
                <th className={`${th} pr-4`}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} className="px-4 py-14 text-center text-gray-400">加载中…</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={13} className="px-4 py-14 text-center text-gray-400">
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
            {fileInfo ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm">
                <span className="font-medium text-gray-900 truncate">{fileInfo.name}</span>
                <span className="text-emerald-700 shrink-0">已识别 {fileInfo.count} 条</span>
                <button onClick={() => { setFileNumbers([]); setFileInfo(null); }}
                  className="ml-auto text-gray-400 hover:text-red-500 text-xs shrink-0">移除</button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors px-4 py-8 text-sm text-gray-500 flex flex-col items-center gap-2">
                <Upload className="w-6 h-6 text-gray-300" />
                点击选择 .txt / .csv 文件（{INPUT_HINT[def.input]}）
              </button>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>取消</Button>
            <Button onClick={submit} disabled={!fileNumbers.length || (def.country && !countryCode)} loading={submitting}>
              开始检测{fileNumbers.length ? `（${fileNumbers.length} 条）` : ''}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
