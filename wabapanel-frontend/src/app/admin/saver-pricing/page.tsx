'use client';
// 计费单价：商家计量收费的独立管理页（2026-10-19 从 系统偏好设置→省钱专家 拆出）。
// 所有检测类型按平台分组列全，每个类型可单独设价；留空走默认单价。
// 数据仍存 SystemSettings.saverApi（billingEnabled/priceDefault/priceOverrides），
// 保存复用 PUT /admin/settings {section:'saver'}（后端只会更新传入的字段）。
import React, { useEffect, useMemo, useState } from 'react';
import { Save, ToggleLeft, ToggleRight, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { adminApi } from '@/lib/api';
import { translateApiMessage } from '@/lib/zhMessages';
import { SAVER_GROUPS } from '@/lib/saverTypes';

export default function SaverPricingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [priceDefault, setPriceDefault] = useState('0.01');
  // taskType → 输入框字符串（'' = 未覆盖，走默认价）
  const [prices, setPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    adminApi.getSettings().then((r) => {
      const s = r.data.data?.saver || {};
      setEnabled(!!s.billingEnabled);
      setPriceDefault(String(s.priceDefault ?? 0.01));
      const o: Record<string, string> = {};
      for (const [k, v] of Object.entries(s.priceOverrides || {})) o[k] = String(v);
      setPrices(o);
    }).catch(() => toast.error('加载失败')).finally(() => setLoading(false));
  }, []);

  const defNum = Number(priceDefault) || 0;
  const overrideCount = useMemo(() => Object.values(prices).filter(v => Number(v) > 0).length, [prices]);

  const setPrice = (type: string, v: string) => setPrices(prev => ({ ...prev, [type]: v }));
  const clearPrice = (type: string) => setPrices(prev => { const n = { ...prev }; delete n[type]; return n; });
  // 按组统一设价 / 清空
  const setGroup = (slug: string, v: string) => {
    const g = SAVER_GROUPS.find(x => x.slug === slug);
    if (!g) return;
    setPrices(prev => {
      const n = { ...prev };
      for (const t of g.types) {
        if (v === '') delete n[t.value]; else n[t.value] = v;
      }
      return n;
    });
  };

  const save = async () => {
    const def = Number(priceDefault);
    if (!(def > 0)) { toast.error('默认单价必须大于 0'); return; }
    const overrides: Record<string, number> = {};
    for (const [k, v] of Object.entries(prices)) {
      const n = Number(v);
      if (v !== '' && Number.isFinite(n) && n > 0) overrides[k] = n;
    }
    setSaving(true);
    try {
      await adminApi.updateSettings({ section: 'saver', data: { billingEnabled: enabled, priceDefault: def, priceOverrides: overrides } });
      toast.success('计费单价已保存');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || '保存失败'));
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  return (
    <div className="space-y-5">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">计费单价</h1>
          <p className="text-emerald-50 text-sm mt-1">商家计量收费：按「单价 × 号码数」预扣余额，任务失败自动退款</p>
        </div>
        <Button onClick={save} loading={saving} icon={<Save className="w-4 h-4" />} className="!bg-white !text-emerald-700 hover:!bg-emerald-50">保存全部</Button>
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <button type="button" onClick={() => setEnabled(!enabled)} className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-lg text-left sm:w-96">
            <span>
              <span className="block text-sm font-medium text-gray-900">商家计量收费</span>
              <span className="block text-xs text-gray-500">关闭时全部检测免费，不扣余额</span>
            </span>
            {enabled ? <ToggleRight className="w-8 h-8 text-emerald-500 shrink-0" /> : <ToggleLeft className="w-8 h-8 text-gray-400 shrink-0" />}
          </button>
          <div className="w-44">
            <Input label={'默认单价（元/条）'} type="number" step="0.000001" value={priceDefault} onChange={e => setPriceDefault(e.target.value)} />
          </div>
          <p className="text-xs text-gray-500 sm:ml-auto">
            已单独设价 <span className="font-semibold text-emerald-600">{overrideCount}</span> 个类型，其余走默认价 ￥{defNum || '—'}/条
          </p>
        </div>
      </Card>

      {SAVER_GROUPS.map((g) => {
        const GIcon = g.Icon;
        return (
          <Card key={g.slug} className="!p-0 overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
              <GIcon className={`w-5 h-5 ${g.color}`} />
              <h3 className="text-sm font-semibold text-gray-900">{g.name}</h3>
              <span className="text-xs text-gray-400">{g.types.length} 个类型</span>
              <div className="ml-auto flex items-center gap-1.5">
                <input type="number" step="0.000001" placeholder="整组设价"
                  className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  onKeyDown={(e) => { if (e.key === 'Enter') { setGroup(g.slug, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }}
                  onBlur={(e) => { if (e.target.value !== '') { setGroup(g.slug, e.target.value); e.target.value = ''; } }} />
                <button type="button" onClick={() => setGroup(g.slug, '')}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 px-1.5 py-1" title="整组恢复默认价">
                  <RotateCcw className="w-3 h-3" />恢复默认
                </button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left font-medium px-4 py-2">检测类型</th>
                  <th className="text-left font-medium px-2 py-2 hidden sm:table-cell">类型代码</th>
                  <th className="text-left font-medium px-2 py-2 w-40">单价（元/条）</th>
                  <th className="text-left font-medium px-2 py-2 w-32">生效价</th>
                  <th className="px-4 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {g.types.map((t) => {
                  const v = prices[t.value] ?? '';
                  const effective = v !== '' && Number(v) > 0 ? Number(v) : defNum;
                  const overridden = v !== '' && Number(v) > 0;
                  return (
                    <tr key={t.value} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="px-4 py-2">
                        <p className="font-medium text-gray-900">{t.name}</p>
                        {t.hint && <p className="text-[11px] text-gray-400">{t.hint}</p>}
                      </td>
                      <td className="px-2 py-2 hidden sm:table-cell"><code className="text-xs text-gray-400">{t.value}</code></td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.000001" value={v} placeholder={`默认 ${defNum || ''}`}
                          onChange={(e) => setPrice(t.value, e.target.value)}
                          className="w-32 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                      </td>
                      <td className="px-2 py-2">
                        <span className={`text-sm font-semibold ${overridden ? 'text-emerald-600' : 'text-gray-500'}`}>￥{effective || '—'}</span>
                        {overridden && <span className="ml-1 text-[10px] text-emerald-500">已覆盖</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {overridden && (
                          <button type="button" onClick={() => clearPrice(t.value)} className="text-xs text-gray-400 hover:text-red-500">恢复默认</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        );
      })}

      <div className="flex justify-end">
        <Button onClick={save} loading={saving} icon={<Save className="w-4 h-4" />}>保存全部</Button>
      </div>
    </div>
  );
}
