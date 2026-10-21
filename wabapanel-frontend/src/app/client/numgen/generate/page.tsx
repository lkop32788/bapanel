'use client';
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hash, ListOrdered, Shuffle, Wand2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { numgenApi } from '@/lib/api';
import { COUNTRIES, COUNTRY_GROUPS, LOCAL_LEN_HINT } from '@/lib/countries';

const MAX_SEQ = 5000000;
const MAX_RAND = 1000000;
const MAX_PREFIXES = 6;

const splitPrefixes = (text: string) =>
  Array.from(new Set(text.split(/[\s,，;；]+/).map(s => s.trim()).filter(Boolean)));

const inputCls = 'w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500';

export default function NumGenGeneratePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('MY');
  const [prefixText, setPrefixText] = useState('');
  const [localLen, setLocalLen] = useState(10);
  const [mode, setMode] = useState<'sequential' | 'random'>('sequential');
  const [count, setCount] = useState(10000);
  const [submitting, setSubmitting] = useState(false);

  const country = COUNTRIES.find(c => c.code === countryCode) || COUNTRIES[0];
  const prefixes = useMemo(() => splitPrefixes(prefixText), [prefixText]);

  // 校验与容量：容量 = Σ 10^(位数 − 前缀长)
  const prefixError = useMemo(() => {
    if (prefixes.length === 0) return '请输入号段前缀';
    if (prefixes.length > MAX_PREFIXES) return `最多 ${MAX_PREFIXES} 个前缀`;
    if (prefixes.some(p => !/^\d+$/.test(p))) return '前缀只能是数字（不含国家码和 +）';
    if (prefixes.some(p => p.length >= localLen)) return '前缀位数必须小于号码位数';
    return '';
  }, [prefixes, localLen]);
  const lenError = !Number.isInteger(localLen) || localLen < 5 || localLen > 15 ? '号码位数需在 5～15 之间' : '';
  const capacity = useMemo(() => prefixError || lenError ? 0
    : prefixes.reduce((sum, p) => sum + Math.pow(10, localLen - p.length), 0), [prefixes, localLen, prefixError, lenError]);
  const limit = mode === 'sequential' ? Math.min(MAX_SEQ, capacity) : Math.min(MAX_RAND, Math.floor(capacity / 2));
  const countError = !Number.isInteger(count) || count < 1 ? '生成数量至少 1 个'
    : capacity > 0 && count > limit ? `超出上限：${mode === 'sequential' ? '顺序模式最多' : '随机模式最多'} ${limit.toLocaleString()} 个` : '';
  const canSubmit = !prefixError && !lenError && !countError && !submitting;

  const samplePrefix = prefixes[0] && /^\d+$/.test(prefixes[0]) ? prefixes[0] : '12';
  const sample = `+${country.dial} ${samplePrefix}${'x'.repeat(Math.max(0, localLen - samplePrefix.length))}`;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await numgenApi.create({
        name: name.trim() || undefined,
        countryCode: country.code, countryName: country.name, countryDial: country.dial,
        prefixes, localLen, mode, count,
      });
      toast.success('生成完成，已加入生成列表');
      router.push('/client/numgen/list');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || '生成失败，请稍后重试');
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Hash className="w-5 h-5 text-emerald-600" />自定义号段生成
        </h1>
        <Button variant="outline" size="sm" icon={<ListOrdered className="w-4 h-4" />} onClick={() => router.push('/client/numgen/list')}>
          查看生成列表
        </Button>
      </div>

      <Card>
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">任务名称</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="不填则自动生成" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">国家</label>
              <select value={countryCode} onChange={e => setCountryCode(e.target.value)} className={inputCls}>
                {COUNTRY_GROUPS.map(g => (
                  <optgroup key={g.region} label={g.region}>
                    {g.countries.map(c => <option key={c.code} value={c.code}>{c.name} +{c.dial}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">号段前缀</label>
            <input value={prefixText} onChange={e => setPrefixText(e.target.value)} placeholder="例如：12, 13, 16（多个用逗号或空格分隔，最多 6 个）"
              className={`${inputCls} ${prefixText && prefixError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`} />
            <p className={`mt-1 text-xs ${prefixText && prefixError ? 'text-red-500' : 'text-gray-400'}`}>
              {prefixText && prefixError ? prefixError : '国家码后面的开头几位，不含国家码和 +；填多个前缀会平均分配生成'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">号码位数（不含国家码）</label>
              <input type="number" min={5} max={15} value={localLen}
                onChange={e => setLocalLen(parseInt(e.target.value, 10) || 0)}
                className={`${inputCls} ${lenError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`} />
              <p className={`mt-1 text-xs ${lenError ? 'text-red-500' : 'text-gray-400'}`}>
                {lenError || `${country.name}手机号通常 ${LOCAL_LEN_HINT[country.code] || '8～11 位'}`}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">生成数量</label>
              <input type="number" min={1} value={count}
                onChange={e => setCount(parseInt(e.target.value, 10) || 0)}
                className={`${inputCls} ${countError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`} />
              <p className={`mt-1 text-xs ${countError ? 'text-red-500' : 'text-gray-400'}`}>
                {countError || (mode === 'sequential'
                  ? `顺序模式单次最多 ${MAX_SEQ.toLocaleString()} 个`
                  : `随机模式单次最多 ${MAX_RAND.toLocaleString()} 个，且不超过号段容量的一半`)}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">生成方式</label>
            <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden">
              <button type="button" onClick={() => setMode('sequential')}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm transition-colors ${mode === 'sequential' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                <ListOrdered className="w-4 h-4" />顺序
              </button>
              <button type="button" onClick={() => setMode('random')}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm transition-colors border-l border-gray-200 ${mode === 'random' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                <Shuffle className="w-4 h-4" />随机
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              {mode === 'sequential' ? '顺序：从 000… 开始连续递增，号码连号' : '随机：在号段内打乱抽取，不重复'}
            </p>
          </div>

          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm space-y-1">
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-gray-400 w-16 shrink-0">示例号码</span>
              <span className="font-mono text-gray-900">{sample}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-gray-400 w-16 shrink-0">号段容量</span>
              {capacity > 0
                ? <span>该号段可生成 <b className="text-gray-900">{capacity.toLocaleString()}</b> 个号码</span>
                : <span className="text-gray-400">填好前缀和位数后显示</span>}
            </div>
            {capacity > 0 && count > 0 && !countError && (
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-gray-400 w-16 shrink-0">本次生成</span>
                <span><b className="text-emerald-600">{count.toLocaleString()}</b> 个（{mode === 'sequential' ? '顺序' : '随机'}）</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            {!canSubmit && !submitting && (prefixError || lenError || countError) && (
              <span className="mr-auto text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />{prefixError || lenError || countError}
              </span>
            )}
            <Button onClick={submit} disabled={!canSubmit} loading={submitting} icon={<Wand2 className="w-4 h-4" />}>
              开始生成{count > 0 && !countError ? `（${count.toLocaleString()} 个）` : ''}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
