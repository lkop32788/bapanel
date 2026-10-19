'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Plus, Trash2, ChevronUp, ChevronDown, Workflow, MessageSquare, Image as ImageIcon, MousePointerClick, List, HelpCircle, Timer, Tag, Link2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import FlowPhonePreview, { type PreviewStep } from '@/components/FlowPhonePreview';
import { botFlowApi } from '@/lib/api';
import toast from 'react-hot-toast';

// 简易流程编辑器：左边傻瓜式步骤卡片，右边手机实时预览。
// 线性步骤 + 按钮可跳转到任意步骤；复杂分支请用高级设计器。

type EasyType = 'text' | 'image' | 'buttons' | 'list' | 'question' | 'delay' | 'tag' | 'cta';
interface EasyBtn { title: string; jump: string } // jump: '__next'=下一步 ''=结束 其他=步骤id
interface EasyRow { title: string; description: string; jump: string }
interface EasyCta { text: string; url: string }
interface EasyStep {
  id: string; type: EasyType; text: string;
  mediaUrl: string; headerMediaUrl: string;
  buttons: EasyBtn[]; rows: EasyRow[]; ctas: EasyCta[]; listButtonText: string;
  actionTag: string; delayVal: number; delayUnit: 'minutes' | 'hours' | 'days';
  answerVar: string; afterJump: string; // 本步之后：__next/''/步骤id
}

const TYPE_META: Record<EasyType, { label: string; icon: React.ReactNode; hint: string }> = {
  text: { label: '发文字', icon: <MessageSquare className="w-4 h-4" />, hint: '给客户发一段话' },
  image: { label: '发图片', icon: <ImageIcon className="w-4 h-4" />, hint: '图片 + 说明文字' },
  buttons: { label: '图文按钮', icon: <MousePointerClick className="w-4 h-4" />, hint: '最多 3 个按钮，客户点哪个走哪条' },
  list: { label: '列表选择', icon: <List className="w-4 h-4" />, hint: '下拉列表，适合选项多时' },
  question: { label: '提问', icon: <HelpCircle className="w-4 h-4" />, hint: '等客户回复后继续' },
  delay: { label: '等待', icon: <Timer className="w-4 h-4" />, hint: '隔一段时间再发下一步' },
  tag: { label: '打标签', icon: <Tag className="w-4 h-4" />, hint: '自动给客户打标签，客户无感' },
  cta: { label: '网址按钮', icon: <Link2 className="w-4 h-4" />, hint: '客户点按钮直接打开链接（商城/官网等）' },
};

const newStep = (type: EasyType): EasyStep => ({
  id: 'e' + Date.now() + Math.floor(Math.random() * 1000),
  type, text: '', mediaUrl: '', headerMediaUrl: '',
  buttons: type === 'buttons' ? [{ title: '', jump: '__next' }] : [],
  rows: type === 'list' ? [{ title: '', description: '', jump: '__next' }] : [],
  ctas: type === 'cta' ? [{ text: '', url: '' }] : [],
  listButtonText: '选择', actionTag: '', delayVal: 1, delayUnit: 'hours',
  answerVar: '', afterJump: '__next',
});

export default function EasyFlowEditor() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const flowId = String(params?.id || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [matchType, setMatchType] = useState<'exact' | 'contains'>('contains');
  const [isActive, setIsActive] = useState(false);
  const [steps, setSteps] = useState<EasyStep[]>([]);
  const [sel, setSel] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [complexNote, setComplexNote] = useState(false);

  // ---- 载入：按 next 链路把节点排成线性步骤 ----
  useEffect(() => {
    botFlowApi.get(flowId).then(r => {
      const f = r.data.data;
      setName(f.name || '');
      setKeywords((f.triggerKeywords || []).join(', '));
      setMatchType(f.matchType === 'exact' ? 'exact' : 'contains');
      setIsActive(!!f.isActive);
      interface RawNode {
        id: string; type?: string; mode?: string; text?: string; caption?: string;
        mediaUrl?: string; headerMediaUrl?: string; headerType?: string; listButtonText?: string;
        buttons?: { title?: string; next?: string }[];
        rows?: { title?: string; description?: string; next?: string }[];
        actionType?: string; actionTag?: string; delaySeconds?: number; delayUnit?: string;
        answerVar?: string; next?: string; nextTimeout?: string;
      }
      const nodes: RawNode[] = f.nodes || [];
      const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
      const order: RawNode[] = [];
      const seen = new Set<string>();
      const visit = (id?: string) => {
        if (!id || seen.has(id) || !byId[id]) return;
        seen.add(id);
        const n = byId[id];
        order.push(n);
        visit(n.next);
        for (const b of n.buttons || []) visit(b.next);
        for (const rr of n.rows || []) visit(rr.next);
        visit(n.nextTimeout);
      };
      visit(f.startNode || nodes[0]?.id);
      let complex = false;
      for (const n of nodes) if (!seen.has(n.id)) { order.push(n); complex = true; }
      if (nodes.some((n) => n.nextTimeout)) complex = true;
      setComplexNote(complex);
      const idAt = (idx: number) => order[idx + 1]?.id || '';
      const jumpOf = (next: string | undefined, idx: number) =>
        !next ? '' : next === idAt(idx) ? '__next' : next;
      setSteps(order.map((n, idx) => {
        const s = newStep('text');
        s.id = n.id;
        s.text = n.text || n.caption || '';
        s.mediaUrl = n.mediaUrl || '';
        s.headerMediaUrl = n.headerMediaUrl || '';
        s.listButtonText = n.listButtonText || '选择';
        s.actionTag = n.actionTag || '';
        s.delayVal = n.delaySeconds || 1;
        s.delayUnit = (['minutes', 'hours', 'days'].includes(n.delayUnit || '') ? n.delayUnit : 'hours') as EasyStep['delayUnit'];
        s.answerVar = n.answerVar || '';
        s.afterJump = jumpOf(n.next, idx);
        if (n.type === 'interactive' && n.mode === 'cta') {
          s.type = 'cta';
          const ctas = (n as RawNode & { ctas?: { text?: string; url?: string }[]; ctaText?: string; ctaUrl?: string });
          s.ctas = (ctas.ctas || []).length
            ? (ctas.ctas || []).map(c => ({ text: c.text || '', url: c.url || '' }))
            : (ctas.ctaText ? [{ text: ctas.ctaText, url: ctas.ctaUrl || '' }] : [{ text: '', url: '' }]);
        } else if (n.type === 'interactive' && n.mode === 'list') {
          s.type = 'list';
          s.rows = (n.rows || []).map((rr) => ({ title: rr.title || '', description: rr.description || '', jump: jumpOf(rr.next, idx) }));
        } else if (n.type === 'interactive') {
          s.type = 'buttons';
          s.buttons = (n.buttons || []).map((b) => ({ title: b.title || '', jump: jumpOf(b.next, idx) }));
        } else if (n.type === 'media') s.type = 'image';
        else if (n.type === 'question') s.type = 'question';
        else if (n.type === 'delay') s.type = 'delay';
        else if (n.type === 'action') s.type = 'tag';
        else s.type = 'text';
        return s;
      }));
      setLoading(false);
    }).catch(() => { toast.error('加载失败'); setLoading(false); });
  }, [flowId]);

  // ---- 保存：步骤还原为节点 ----
  const save = async () => {
    if (!steps.length) { toast.error('请先添加步骤'); return; }
    setSaving(true);
    try {
      const resolve = (jump: string, idx: number) => jump === '__next' ? (steps[idx + 1]?.id || '') : jump;
      const nodes = steps.map((s, idx) => {
        const base = { id: s.id, name: `${idx + 1}. ${TYPE_META[s.type].label}`, next: resolve(s.afterJump, idx), x: 40 + (idx % 4) * 260, y: 60 + Math.floor(idx / 4) * 170 };
        if (s.type === 'buttons') return { ...base, type: 'interactive', mode: 'buttons', text: s.text, headerType: s.headerMediaUrl ? 'image' : 'none', headerMediaUrl: s.headerMediaUrl, buttons: s.buttons.filter(b => b.title.trim()).map(b => ({ title: b.title, next: resolve(b.jump, idx) })), next: '' };
        if (s.type === 'cta') return { ...base, type: 'interactive', mode: 'cta', text: s.text, ctas: s.ctas.filter(c => c.text.trim() && c.url.trim()) };
        if (s.type === 'list') return { ...base, type: 'interactive', mode: 'list', text: s.text, listButtonText: s.listButtonText || '选择', rows: s.rows.filter(rr => rr.title.trim()).map(rr => ({ title: rr.title, description: rr.description, next: resolve(rr.jump, idx) })), next: '' };
        if (s.type === 'image') return { ...base, type: 'media', mediaType: 'image', mediaUrl: s.mediaUrl, caption: s.text };
        if (s.type === 'question') return { ...base, type: 'question', text: s.text, answerVar: s.answerVar || `ans_${idx + 1}` };
        if (s.type === 'delay') return { ...base, type: 'delay', delaySeconds: s.delayVal, delayUnit: s.delayUnit };
        if (s.type === 'tag') return { ...base, type: 'action', actionType: 'add_tag', actionTag: s.actionTag };
        return { ...base, type: 'text', text: s.text };
      });
      await botFlowApi.update(flowId, {
        name: name.trim() || '未命名流程',
        triggerKeywords: keywords.split(/[,，]/).map(k => k.trim()).filter(Boolean),
        matchType, isActive,
        startNode: steps[0].id,
        nodes,
      });
      toast.success('已保存');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || '保存失败');
    }
    setSaving(false);
  };

  const upd = (i: number, patch: Partial<EasyStep>) =>
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const move = (i: number, dir: -1 | 1) => setSteps(prev => {
    const j = i + dir;
    if (j < 0 || j >= prev.length) return prev;
    const a = [...prev]; [a[i], a[j]] = [a[j], a[i]];
    setSel(j);
    return a;
  });
  const remove = (i: number) => { setSteps(prev => prev.filter((_, idx) => idx !== i)); setSel(Math.max(0, i - 1)); };
  const add = (type: EasyType) => { setSteps(prev => [...prev, newStep(type)]); setSel(steps.length); setAddOpen(false); };

  // ---- 手机预览数据 ----
  const previewSteps: PreviewStep[] = useMemo(() => steps.map(s => ({
    name: '', type: s.type === 'buttons' || s.type === 'list' ? 'interactive' : s.type === 'image' ? 'media' : s.type === 'tag' ? 'action' : s.type,
    text: s.text, actionTag: s.actionTag, actionType: s.type === 'tag' ? 'add_tag' : '',
    mode: s.type === 'list' ? 'list' : s.type === 'buttons' ? 'buttons' : s.type === 'cta' ? 'cta' : '',
    headerType: s.headerMediaUrl ? 'image' : '', headerMediaUrl: s.headerMediaUrl,
    mediaType: s.type === 'image' ? 'image' : '', mediaUrl: s.mediaUrl,
    listButtonText: s.listButtonText,
    buttons: s.buttons, rows: s.rows, ctas: s.ctas,
    delaySeconds: s.delayVal, delayUnit: s.delayUnit,
  })), [steps]);

  const jumpOptions = (self: number) => [
    { value: '__next', label: '继续下一步' },
    { value: '', label: '结束流程' },
    ...steps.map((s, i) => ({ value: s.id, label: `跳到第 ${i + 1} 步（${TYPE_META[s.type].label}）` })).filter((_, i) => i !== self),
  ];

  const JumpSelect = ({ value, onChange, self }: { value: string; onChange: (v: string) => void; self: number }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500">
      {jumpOptions(self).map(o => <option key={o.value || 'end'} value={o.value}>{o.label}</option>)}
    </select>
  );

  const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

  if (loading) return <div className="py-20 text-center text-gray-400">加载中…</div>;

  return (
    <div className="space-y-4">
      <div className="page-hero flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/client/bot-flows')} className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="流程名称"
          className="text-xl font-bold text-gray-900 bg-transparent border-b-2 border-transparent focus:border-emerald-500 focus:outline-none min-w-50" />
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="accent-emerald-600 w-4 h-4" />
          启用
        </label>
        <Button variant="outline" icon={<Workflow className="w-4 h-4" />} onClick={() => router.push(`/client/bot-flows/${flowId}`)}>高级设计器</Button>
        <Button icon={<Save className="w-4 h-4" />} onClick={save} loading={saving}>保存</Button>
      </div>

      {complexNote && (
        <div className="rounded-xl bg-amber-50 text-amber-700 text-sm px-4 py-2.5">
          此流程包含简易模式无法完整表达的分支（如超时跳转）。这里可以查看和改文案，复杂跳转请用高级设计器调整；在这里保存会按当前排列重写流程结构。
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 items-start">
        {/* 左：步骤编辑 */}
        <div className="space-y-3">
          <Card className="!p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm text-gray-600 shrink-0">触发关键词</label>
              <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="如：你好, hi, 咨询（逗号分隔）"
                className="flex-1 min-w-50 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <select value={matchType} onChange={e => setMatchType(e.target.value as 'exact' | 'contains')}
                className="rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-600 focus:outline-none">
                <option value="contains">包含即触发</option>
                <option value="exact">完全一致才触发</option>
              </select>
            </div>
          </Card>

          {steps.map((s, i) => (
            <Card key={s.id} className={`!p-4 ${sel === i ? 'ring-2 ring-emerald-500' : ''}`} >
              <div className="flex items-center gap-2 mb-3" onClick={() => setSel(i)}>
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">{TYPE_META[s.type].icon}{TYPE_META[s.type].label}</span>
                <span className="text-xs text-gray-400 hidden sm:inline">{TYPE_META[s.type].hint}</span>
                <span className="flex-1" />
                <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                <button onClick={() => move(i, 1)} disabled={i === steps.length - 1} className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                <button onClick={() => remove(i)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>

              <div className="space-y-2.5" onClick={() => setSel(i)}>
                {(s.type === 'text' || s.type === 'buttons' || s.type === 'list' || s.type === 'question' || s.type === 'cta') && (
                  <textarea value={s.text} onChange={e => upd(i, { text: e.target.value })} rows={2}
                    placeholder={s.type === 'question' ? '想问客户什么？（客户回复后才继续）' : '要发给客户的文字…'}
                    className={inputCls} />
                )}
                {s.type === 'image' && (<>
                  <input value={s.mediaUrl} onChange={e => upd(i, { mediaUrl: e.target.value })} placeholder="图片链接 https://…（可先在媒体库上传后复制链接）" className={inputCls} />
                  <input value={s.text} onChange={e => upd(i, { text: e.target.value })} placeholder="图片说明文字（选填）" className={inputCls} />
                </>)}
                {s.type === 'buttons' && (<>
                  <input value={s.headerMediaUrl} onChange={e => upd(i, { headerMediaUrl: e.target.value })} placeholder="顶部图片链接（选填，填了就是图文卡片）" className={inputCls} />
                  {s.buttons.map((b, bi) => (
                    <div key={bi} className="flex items-center gap-2">
                      <input value={b.title} onChange={e => upd(i, { buttons: s.buttons.map((x, xi) => xi === bi ? { ...x, title: e.target.value } : x) })}
                        placeholder={`按钮 ${bi + 1} 文字`} maxLength={20}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                      <JumpSelect value={b.jump} self={i} onChange={v => upd(i, { buttons: s.buttons.map((x, xi) => xi === bi ? { ...x, jump: v } : x) })} />
                      <button onClick={() => upd(i, { buttons: s.buttons.filter((_, xi) => xi !== bi) })} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {s.buttons.length < 3 && (
                    <button onClick={() => upd(i, { buttons: [...s.buttons, { title: '', jump: '__next' }] })}
                      className="text-xs text-emerald-600 hover:underline">+ 加按钮（最多 3 个）</button>
                  )}
                </>)}
                {s.type === 'list' && (<>
                  <input value={s.listButtonText} onChange={e => upd(i, { listButtonText: e.target.value })} placeholder="列表按钮文字（如：选择服务）" maxLength={20} className={inputCls} />
                  {s.rows.map((rr, ri) => (
                    <div key={ri} className="flex items-center gap-2">
                      <input value={rr.title} onChange={e => upd(i, { rows: s.rows.map((x, xi) => xi === ri ? { ...x, title: e.target.value } : x) })}
                        placeholder={`选项 ${ri + 1}`} maxLength={24}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                      <JumpSelect value={rr.jump} self={i} onChange={v => upd(i, { rows: s.rows.map((x, xi) => xi === ri ? { ...x, jump: v } : x) })} />
                      <button onClick={() => upd(i, { rows: s.rows.filter((_, xi) => xi !== ri) })} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {s.rows.length < 10 && (
                    <button onClick={() => upd(i, { rows: [...s.rows, { title: '', description: '', jump: '__next' }] })}
                      className="text-xs text-emerald-600 hover:underline">+ 加选项（最多 10 个）</button>
                  )}
                </>)}
                {s.type === 'cta' && (<>
                  {s.ctas.map((c, ci) => (
                    <div key={ci} className="flex items-center gap-2">
                      <input value={c.text} onChange={ev => upd(i, { ctas: s.ctas.map((x, xi) => xi === ci ? { ...x, text: ev.target.value } : x) })}
                        placeholder="按钮文字（如：进入商城）" maxLength={20}
                        className="w-40 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                      <input value={c.url} onChange={ev => upd(i, { ctas: s.ctas.map((x, xi) => xi === ci ? { ...x, url: ev.target.value } : x) })}
                        placeholder="https://…"
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                      <button onClick={() => upd(i, { ctas: s.ctas.filter((_, xi) => xi !== ci) })} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {s.ctas.length < 3 && (
                    <button onClick={() => upd(i, { ctas: [...s.ctas, { text: '', url: '' }] })}
                      className="text-xs text-emerald-600 hover:underline">+ 加网址按钮（最多 3 个）</button>
                  )}
                </>)}
                {s.type === 'delay' && (
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} value={s.delayVal} onChange={e => upd(i, { delayVal: Number(e.target.value) || 1 })}
                      className="w-24 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    <select value={s.delayUnit} onChange={e => upd(i, { delayUnit: e.target.value as EasyStep['delayUnit'] })}
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-600 focus:outline-none">
                      <option value="minutes">分钟</option><option value="hours">小时</option><option value="days">天</option>
                    </select>
                    <span className="text-xs text-gray-400">后发送下一步</span>
                  </div>
                )}
                {s.type === 'tag' && (
                  <input value={s.actionTag} onChange={e => upd(i, { actionTag: e.target.value })} placeholder="标签名，如：高意向" className={inputCls} />
                )}
                {s.type !== 'buttons' && s.type !== 'list' && (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    此步之后：<JumpSelect value={s.afterJump} self={i} onChange={v => upd(i, { afterJump: v })} />
                  </div>
                )}
              </div>
            </Card>
          ))}

          <div className="relative">
            <Button variant="outline" icon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(v => !v)}>添加步骤</Button>
            {addOpen && (
              <div className="absolute z-10 mt-2 bg-white rounded-xl shadow-lg ring-1 ring-gray-100 p-2 grid grid-cols-2 gap-1 w-72">
                {(Object.keys(TYPE_META) as EasyType[]).map(t => (
                  <button key={t} onClick={() => add(t)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-emerald-50 text-left">
                    {TYPE_META[t].icon}{TYPE_META[t].label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右：手机实时预览 */}
        <div className="lg:sticky lg:top-4">
          <FlowPhonePreview steps={previewSteps} title={name || '业务'} highlight={sel} onStepClick={setSel} size="lg" />
          <p className="text-center text-xs text-gray-400 mt-2">实时预览 · 点气泡可定位到对应步骤</p>
        </div>
      </div>
    </div>
  );
}
