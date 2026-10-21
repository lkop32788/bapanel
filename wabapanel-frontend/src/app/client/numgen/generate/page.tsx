'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hash, ListOrdered, Shuffle, Wand2, AlertCircle, Lightbulb, MapPin, PencilLine } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { numgenApi } from '@/lib/api';
import { COUNTRIES, COUNTRY_GROUPS, LOCAL_LEN_HINT } from '@/lib/countries';
import { getMobilePrefixHints, getMobileExampleLen, type MobilePrefixHints } from '@/lib/mobilePrefixes';

const MAX_SEQ = 5000000;
const MAX_RAND = 1000000;
const MAX_PREFIXES = 6;
const ISP_OPTIONS = ['移动', '联通', '电信', '广电'];

interface RegionInfo { supported: boolean; localLen?: number; hasCity?: boolean; hasIsp?: boolean; regions: { name: string; cities?: string[] }[] }
// 3 位组 → 4 位子组 → 具体 7 位号段（items 仅在范围不大时返回）
interface PrefixGroup { key: string; count: number; sub?: { key: string; count: number; items?: string[] }[] }
interface RegionStats { count: number; localLen: number; capacity: number; sample: string[]; prefixLen?: number; groups?: PrefixGroup[] }

const splitPrefixes = (text: string) =>
  Array.from(new Set(text.split(/[\s,，;；]+/).map(s => s.trim()).filter(Boolean)));

const inputCls = 'w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed';
const errMsg = (e: unknown) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message;

export default function NumGenGeneratePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('MY');
  const [prefixText, setPrefixText] = useState('');
  const [localLen, setLocalLen] = useState(10);
  // 选国家后自动填该国手机号位数（中国 11、美国 10、马来西亚 9…），仍可手改；地区模式随后会按数据集覆盖并锁定
  useEffect(() => {
    const n = getMobileExampleLen(countryCode);
    if (n) setLocalLen(n);
  }, [countryCode]);
  const [mode, setMode] = useState<'sequential' | 'random'>('sequential');
  const [count, setCount] = useState(10000);
  const [submitting, setSubmitting] = useState(false);

  const country = COUNTRIES.find(c => c.code === countryCode) || COUNTRIES[0];
  const prefixes = useMemo(() => splitPrefixes(prefixText), [prefixText]);

  // 号段来源：手动填 / 按州省（仅后端有地区号段库的国家可选）
  const [source, setSource] = useState<'manual' | 'region'>('manual');
  const [regionInfo, setRegionInfo] = useState<RegionInfo | null>(null);
  const [regionLoading, setRegionLoading] = useState(false);
  const [regionName, setRegionName] = useState('');
  const [cityName, setCityName] = useState('');
  const [ispName, setIspName] = useState('');
  const [stats, setStats] = useState<RegionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');
  const isRegion = source === 'region' && !!regionInfo?.supported;
  // 商户在范围内挑选的号段：3 位 key = 整组，7 位 key = 具体号段；列表为空 = 用该范围全部号段。范围变化时清空
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [pickGroup, setPickGroup] = useState('');
  const [pickMid, setPickMid] = useState('');

  useEffect(() => {
    // 切换国家：回到手动模式并重置地区选择，再查该国是否支持按州省
    setSource('manual');
    setRegionInfo(null);
    setRegionName('');
    setCityName('');
    setIspName('');
    setStats(null);
    setStatsError('');
    let stale = false;
    setRegionLoading(true);
    numgenApi.regions(country.code)
      .then(res => { if (!stale) setRegionInfo(res.data.data || { supported: false, regions: [] }); })
      .catch(() => { if (!stale) setRegionInfo({ supported: false, regions: [] }); })
      .finally(() => { if (!stale) setRegionLoading(false); });
    return () => { stale = true; };
  }, [country.code]);

  useEffect(() => {
    if (!isRegion || !regionName) { setStats(null); setStatsError(''); return; }
    let stale = false;
    setStatsLoading(true);
    setStatsError('');
    numgenApi.regionPrefixes({
      country: country.code, region: regionName,
      ...(cityName ? { city: cityName } : {}), ...(ispName ? { isp: ispName } : {}),
    })
      .then(res => {
        if (stale) return;
        const d = res.data.data as RegionStats;
        setStats(d);
        if (d?.localLen) setLocalLen(d.localLen);
        setSelectedKeys([]);
        setPickGroup('');
        setPickMid('');
      })
      .catch(e => { if (!stale) { setStats(null); setStatsError(errMsg(e) || '获取号段失败，请稍后重试'); } })
      .finally(() => { if (!stale) setStatsLoading(false); });
    return () => { stale = true; };
  }, [isRegion, country.code, regionName, cityName, ispName]);

  const cities = useMemo(() => regionInfo?.regions?.find(r => r.name === regionName)?.cities || [], [regionInfo, regionName]);

  // 号段挑选：级联双下拉（前三位 → 中间四位）+「添加」累积到列表；selectedKeys 为空 = 该范围全部号段
  const groups = useMemo(() => stats?.groups || [], [stats]);
  const groupMap = useMemo(() => new Map(groups.map(g => [g.key, g])), [groups]);
  const prefixLen = stats?.prefixLen || (groups[0]?.key.length ?? 0);
  const cascade = prefixLen > 4; // 中国七位号段才有第二级；美加区号/巴西 DDD 只有一级
  const pickedGroup = groupMap.get(pickGroup);
  // 该组下全部具体号段（整省大范围时后端不下发 items，只能按前三位整组选）
  const pickItems = useMemo(() => (pickedGroup?.sub || []).flatMap(s => s.items || []).sort(), [pickedGroup]);
  const midOptions = useMemo(() => pickItems.map(it => it.slice(3)), [pickItems]);
  const selectedCount = useMemo(() => {
    if (!stats) return 0;
    if (selectedKeys.length === 0) return stats.count;
    return selectedKeys.reduce((n, k) => n + (k.length <= 4 ? (groupMap.get(k)?.count || 0) : 1), 0);
  }, [stats, selectedKeys, groupMap]);
  const selectedCapacity = stats ? selectedCount * Math.pow(10, Math.max(0, stats.localLen - prefixLen)) : 0;
  const keyLabel = (k: string) => {
    if (k.length > 4) return k;
    const c = groupMap.get(k)?.count || 0;
    return c > 1 ? `${k}（整组 ${c.toLocaleString()} 个）` : k;
  };
  const addSelection = () => {
    if (!pickGroup) return;
    if (!cascade || !pickMid) {
      // 整组：去掉该组已单独添加的具体号段，避免重复
      setSelectedKeys(prev => [...prev.filter(k => !(k.length > 4 && k.startsWith(pickGroup))), ...(prev.includes(pickGroup) ? [] : [pickGroup])]);
      if (selectedKeys.includes(pickGroup)) toast('该组已添加');
    } else {
      const key = pickGroup + pickMid;
      if (selectedKeys.includes(pickGroup)) { toast('该组已整组选中'); return; }
      if (selectedKeys.includes(key)) { toast('该号段已添加'); return; }
      setSelectedKeys(prev => [...prev, key]);
    }
    setPickMid('');
  };
  const removeKey = (k: string) => setSelectedKeys(prev => prev.filter(x => x !== k));
  const clearKeys = () => setSelectedKeys([]);

  // 真实号段提示：仅面板展开时按当前国家离线推算（同步计算几十毫秒，延后一帧让「计算中」先渲染）
  const [hintOpen, setHintOpen] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [hints, setHints] = useState<MobilePrefixHints | null>(null);
  useEffect(() => {
    if (!hintOpen) return;
    setHintLoading(true);
    setHints(null);
    const t = setTimeout(() => {
      setHints(getMobilePrefixHints(country.code, country.dial));
      setHintLoading(false);
    }, 30);
    return () => clearTimeout(t);
  }, [hintOpen, country.code, country.dial]);

  const togglePrefix = (p: string) => {
    if (prefixes.includes(p)) {
      setPrefixText(prefixes.filter(x => x !== p).join(', '));
      return;
    }
    if (prefixes.length >= MAX_PREFIXES) { toast.error(`最多 ${MAX_PREFIXES} 个前缀`); return; }
    setPrefixText([...prefixes, p].join(', '));
  };

  // 校验与容量：手动模式 容量 = Σ 10^(位数 − 前缀长)；地区模式用接口返回的容量
  const prefixError = useMemo(() => {
    if (isRegion) {
      if (!regionName) return '请选择州/省';
      if (statsLoading) return '正在获取号段…';
      if (statsError) return statsError;
      if (!stats || stats.count === 0) return '该范围没有可用号段';
      return '';
    }
    if (prefixes.length === 0) return '请输入号段前缀';
    if (prefixes.length > MAX_PREFIXES) return `最多 ${MAX_PREFIXES} 个前缀`;
    if (prefixes.some(p => !/^\d+$/.test(p))) return '前缀只能是数字（不含国家码和 +）';
    if (prefixes.some(p => p.length >= localLen)) return '前缀位数必须小于号码位数';
    return '';
  }, [isRegion, regionName, statsLoading, statsError, stats, prefixes, localLen]);
  const lenError = isRegion ? '' : (!Number.isInteger(localLen) || localLen < 5 || localLen > 15 ? '号码位数需在 5～15 之间' : '');
  const capacity = useMemo(() => {
    if (prefixError || lenError) return 0;
    if (isRegion) return groups.length > 0 ? selectedCapacity : (stats?.capacity || 0);
    return prefixes.reduce((sum, p) => sum + Math.pow(10, localLen - p.length), 0);
  }, [isRegion, stats, groups.length, selectedCapacity, prefixes, localLen, prefixError, lenError]);
  const limit = mode === 'sequential' ? Math.min(MAX_SEQ, capacity) : Math.min(MAX_RAND, Math.floor(capacity / 2));
  const countError = !Number.isInteger(count) || count < 1 ? '生成数量至少 1 个'
    : capacity > 0 && count > limit ? `超出上限：${mode === 'sequential' ? '顺序模式最多' : '随机模式最多'} ${limit.toLocaleString()} 个` : '';
  const canSubmit = !prefixError && !lenError && !countError && !submitting;

  const samplePrefix = isRegion
    ? (stats?.sample?.[0] || '')
    : (prefixes[0] && /^\d+$/.test(prefixes[0]) ? prefixes[0] : '12');
  const sample = samplePrefix
    ? `+${country.dial} ${samplePrefix}${'x'.repeat(Math.max(0, localLen - samplePrefix.length))}`
    : '选好地区后显示';

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await numgenApi.create({
        name: name.trim() || undefined,
        countryCode: country.code, countryName: country.name, countryDial: country.dial,
        mode, count,
        ...(isRegion
          ? { region: {
              name: regionName,
              ...(cityName ? { city: cityName } : {}),
              ...(ispName ? { isp: ispName } : {}),
              // 没挑号段就不传，让后端用该范围全部号段
              ...(selectedKeys.length > 0 ? { selected: selectedKeys } : {}),
            } }
          : { prefixes, localLen }),
      });
      toast.success('生成完成，已加入生成列表');
      router.push('/client/numgen/list');
    } catch (e) {
      toast.error(errMsg(e) || '生成失败，请稍后重试');
      setSubmitting(false);
    }
  };

  const selectRegion = (v: string) => { setRegionName(v); setCityName(''); };

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

          {(regionLoading || regionInfo?.supported) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">号段来源</label>
              {regionLoading ? (
                <p className="text-xs text-gray-400">正在检查该国家是否支持按州/省生成…</p>
              ) : (
                <>
                  <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden">
                    <button type="button" onClick={() => setSource('manual')}
                      className={`flex items-center gap-1.5 px-4 py-2 text-sm transition-colors ${!isRegion ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      <PencilLine className="w-4 h-4" />手动填号段
                    </button>
                    <button type="button" onClick={() => setSource('region')}
                      className={`flex items-center gap-1.5 px-4 py-2 text-sm transition-colors border-l border-gray-200 ${isRegion ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      <MapPin className="w-4 h-4" />按州/省
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">
                    {isRegion ? `选好地区后自动使用${country.name}该地区的真实号段，无需手动填写` : '自己填写号段前缀，或切换为按州/省自动选号段'}
                  </p>
                </>
              )}
            </div>
          )}

          {isRegion ? (
            <div>
              <div className={`grid grid-cols-1 gap-4 ${regionInfo?.hasCity && regionInfo?.hasIsp ? 'md:grid-cols-3' : regionInfo?.hasCity || regionInfo?.hasIsp ? 'md:grid-cols-2' : ''}`}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">州/省</label>
                  <select value={regionName} onChange={e => selectRegion(e.target.value)} className={inputCls}>
                    <option value="">请选择州/省</option>
                    {(regionInfo?.regions || []).map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                  </select>
                </div>
                {regionInfo?.hasCity && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">城市</label>
                    <select value={cityName} onChange={e => setCityName(e.target.value)} disabled={!regionName} className={inputCls}>
                      <option value="">全部城市</option>
                      {cities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                {regionInfo?.hasIsp && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">运营商</label>
                    <select value={ispName} onChange={e => setIspName(e.target.value)} className={inputCls}>
                      <option value="">全部运营商</option>
                      {ISP_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <p className={`mt-1.5 text-xs ${statsError ? 'text-red-500' : 'text-gray-400'}`}>
                {!regionName ? '先选择州/省，号段和位数会自动确定'
                  : statsLoading ? '正在获取该地区号段…'
                  : statsError ? statsError
                  : stats ? (stats.count > 0
                    ? <>该范围 <b className="text-gray-700">{stats.count.toLocaleString()}</b> 个号段，可生成 <b className="text-gray-700">{stats.capacity.toLocaleString()}</b> 个号码
                      {stats.sample?.length ? <>，示例前缀 <span className="font-mono text-gray-600">{stats.sample.slice(0, 5).join('、')}</span></> : null}</>
                    : '该范围没有可用号段，换个地区或运营商试试')
                  : ''}
              </p>

              {stats && groups.length > 0 && !statsLoading && (
                <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 space-y-3">
                  <div className="text-sm text-gray-700">
                    可选号段：已选 <b className="text-emerald-600">{selectedCount.toLocaleString()}</b> 个号段
                    <span className="text-gray-400"> · 可生成 {selectedCapacity.toLocaleString()} 个号码</span>
                  </div>
                  <div className={`grid grid-cols-1 gap-3 items-end ${cascade ? 'md:grid-cols-[1fr_1fr_auto]' : 'md:grid-cols-[1fr_auto]'}`}>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{cascade ? '前三位' : '号段'}</label>
                      <select value={pickGroup} onChange={e => { setPickGroup(e.target.value); setPickMid(''); }} className={inputCls}>
                        <option value="">请选择</option>
                        {groups.map(g => (
                          <option key={g.key} value={g.key}>{cascade ? `${g.key}（${g.count.toLocaleString()} 个号段）` : g.key}</option>
                        ))}
                      </select>
                    </div>
                    {cascade && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">中间四位</label>
                        <select value={pickMid} onChange={e => setPickMid(e.target.value)} disabled={!pickGroup} className={inputCls}>
                          <option value="">{pickedGroup ? `全部（${pickedGroup.count.toLocaleString()} 个号段）` : '全部'}</option>
                          {midOptions.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    )}
                    <Button size="sm" variant="outline" onClick={addSelection} disabled={!pickGroup}>添加</Button>
                  </div>
                  {cascade && pickGroup && pickItems.length === 0 && (
                    <p className="text-xs text-gray-400">范围较大，只能按前三位选择；缩小到市/运营商可选到具体号段</p>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap gap-1.5 min-h-7">
                      {selectedKeys.length === 0 ? (
                        <span className="self-center text-xs text-gray-400">未添加则使用该范围全部 {stats.count.toLocaleString()} 个号段</span>
                      ) : selectedKeys.map(k => (
                        <span key={k} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2 py-0.5 text-xs font-mono text-emerald-700">
                          {keyLabel(k)}
                          <button type="button" onClick={() => removeKey(k)} title="移除" className="font-sans text-sm leading-none text-gray-400 hover:text-red-500">×</button>
                        </span>
                      ))}
                    </div>
                    {selectedKeys.length > 0 && (
                      <button type="button" onClick={clearKeys}
                        className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50">清空</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">号段前缀</label>
                <button type="button" onClick={() => setHintOpen(v => !v)}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors ${hintOpen ? 'bg-amber-50 text-amber-700' : 'text-amber-600 hover:bg-amber-50'}`}>
                  <Lightbulb className="w-3.5 h-3.5" />真实号段提示
                </button>
              </div>
              <input value={prefixText} onChange={e => setPrefixText(e.target.value)} placeholder="例如：12, 13, 16（多个用逗号或空格分隔，最多 6 个）"
                className={`${inputCls} ${prefixText && prefixError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`} />
              <p className={`mt-1 text-xs ${prefixText && prefixError ? 'text-red-500' : 'text-gray-400'}`}>
                {prefixText && prefixError ? prefixError : '国家码后面的开头几位，不含国家码和 +；填多个前缀会平均分配生成'}
              </p>
              {hintOpen && (
                <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50/40 px-4 py-3 text-sm space-y-2.5">
                  <p className="text-xs text-gray-500">
                    依据 Google libphonenumber 规则库离线推算，<b className="text-gray-700">{country.name}</b> 常见手机号段，点击加入前缀
                  </p>
                  {hintLoading || !hints ? (
                    <p className="text-xs text-gray-400">计算中…</p>
                  ) : hints.prefixes.length === 0 ? (
                    <p className="text-xs text-gray-400">该国家暂无规则数据，请按运营商号段手动填写</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {hints.prefixes.map(h => {
                          const on = prefixes.includes(h.prefix);
                          return (
                            <button key={h.prefix} type="button" title={h.example} onClick={() => togglePrefix(h.prefix)}
                              className={`rounded-lg px-2.5 py-1 font-mono text-xs border transition-colors ${on
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'bg-white border-gray-200 text-gray-700 hover:border-emerald-400 hover:text-emerald-700'}`}>
                              {h.prefix}
                            </button>
                          );
                        })}
                      </div>
                      {hints.exampleLen > 0 && (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>推荐位数 <b className="text-gray-800">{hints.exampleLen} 位</b>（示例 {hints.example}）</span>
                          {localLen !== hints.exampleLen && (
                            <button type="button" onClick={() => setLocalLen(hints.exampleLen)}
                              className="rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-emerald-700 hover:bg-emerald-50">采用</button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">号码位数（不含国家码）</label>
              <input type="number" min={5} max={15} value={localLen} disabled={isRegion}
                onChange={e => setLocalLen(parseInt(e.target.value, 10) || 0)}
                className={`${inputCls} ${lenError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`} />
              <p className={`mt-1 text-xs ${lenError ? 'text-red-500' : 'text-gray-400'}`}>
                {lenError || (isRegion ? '按所选地区自动确定' : `${country.name}手机号通常 ${LOCAL_LEN_HINT[country.code] || '8～11 位'}`)}
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
              <span className={samplePrefix ? 'font-mono text-gray-900' : 'text-gray-400'}>{sample}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-gray-400 w-16 shrink-0">号段容量</span>
              {capacity > 0
                ? <span>{isRegion ? (selectedKeys.length > 0 ? '已选号段' : '该地区') : '该号段'}可生成 <b className="text-gray-900">{capacity.toLocaleString()}</b> 个号码</span>
                : <span className="text-gray-400">{isRegion ? '选好地区后显示' : '填好前缀和位数后显示'}</span>}
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
