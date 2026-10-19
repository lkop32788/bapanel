'use client';
import React from 'react';

// WhatsApp 手机界面模拟：把流程步骤画成对话气泡（含模拟的用户点击）。
// 模板市场预览和简易编辑器共用。
export interface PreviewStep {
  name: string; type: string; text: string; actionTag: string;
  actionType?: string; mode?: string;
  headerType?: string; headerMediaUrl?: string;
  mediaType?: string; mediaUrl?: string;
  listButtonText?: string;
  buttons?: { title: string }[];
  ctas?: { text: string; url: string }[];
  rows?: { title: string; description?: string }[];
  delaySeconds?: number; delayUnit?: string;
}

const DOODLE_BG =
  "url(\"data:image/svg+xml,%3Csvg width='120' height='120' viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23c8c0b6' stroke-width='1.5' opacity='0.35'%3E%3Ccircle cx='20' cy='20' r='6'/%3E%3Cpath d='M70 15 l10 10 M80 15 l-10 10'/%3E%3Crect x='95' y='40' width='14' height='10' rx='2'/%3E%3Cpath d='M15 70 q6 -10 12 0 q-6 10 -12 0'/%3E%3Ccircle cx='60' cy='60' r='5'/%3E%3Cpath d='M40 100 h16 M48 92 v16'/%3E%3Cpath d='M90 90 a8 8 0 1 0 8 8'/%3E%3C/g%3E%3C/svg%3E\")";

export default function FlowPhonePreview({ steps, title, highlight, onStepClick, size = 'md' }: {
  steps: PreviewStep[];
  title: string;
  highlight?: number;          // 高亮某一步（简易编辑器联动）
  onStepClick?: (i: number) => void;
  size?: 'md' | 'lg';          // lg：简易编辑器用的大号手机
}) {
  const W = size === 'lg' ? 'w-[380px]' : 'w-[300px]';
  const H = size === 'lg' ? 'h-[640px]' : 'h-[460px]';
  const sysChip = (text: string, key: string, i: number) => (
    <div key={key} className="flex justify-center" onClick={() => onStepClick?.(i)}>
      <span className={`text-[10px] text-gray-500 bg-[#dcd3c8]/80 rounded-full px-2.5 py-0.5 ${onStepClick ? 'cursor-pointer' : ''} ${highlight === i ? 'ring-2 ring-emerald-500' : ''}`}>{text}</span>
    </div>
  );
  const items: React.ReactNode[] = [];
  steps.forEach((s, i) => {
    if (s.type === 'action') {
      items.push(sysChip(s.actionType === 'add_tag' ? `🏷 自动打标签「${s.actionTag || '…'}」` : '⚙️ 自动动作', `a${i}`, i));
      return;
    }
    if (s.type === 'delay') {
      items.push(sysChip(`⏱ 等待 ${s.delaySeconds || ''} ${s.delayUnit === 'days' ? '天' : s.delayUnit === 'hours' ? '小时' : s.delayUnit === 'minutes' ? '分钟' : s.delayUnit || ''}`, `d${i}`, i));
      return;
    }
    items.push(
      <div key={`m${i}`} className="flex justify-start" onClick={() => onStepClick?.(i)}>
        <div className={`bg-white rounded-lg rounded-tl-none shadow-sm p-1.5 max-w-[88%] ${onStepClick ? 'cursor-pointer' : ''} ${highlight === i ? 'ring-2 ring-emerald-500' : ''}`}>
          {(s.headerType === 'image' || (s.type === 'media' && (s.mediaType || 'image') === 'image')) && (
            (s.headerMediaUrl || s.mediaUrl)
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={s.headerMediaUrl || s.mediaUrl} alt="" className="w-full h-28 object-cover rounded-md mb-1.5" />
              : <div className="w-full h-28 bg-gray-200 rounded-md mb-1.5 flex items-center justify-center text-gray-400 text-xs">图片</div>
          )}
          {!!s.text && <p className="text-[13px] text-gray-900 whitespace-pre-wrap px-1 pb-1">{s.text}</p>}
          {!s.text && !(s.headerMediaUrl || s.mediaUrl) && <p className="text-[13px] text-gray-300 italic px-1 pb-1">（点击编辑内容…）</p>}
          <p className="text-[10px] text-gray-400 text-right px-1">10:30</p>
          {!!(s.buttons || []).filter(b => b.title).length && (
            <div className="border-t border-gray-100 mt-0.5">
              {(s.buttons || []).filter(b => b.title).map((b, bi) => (
                <div key={bi} className="text-center text-[13px] text-[#00a5f4] py-1.5 border-b border-gray-100 last:border-b-0">{b.title}</div>
              ))}
            </div>
          )}
          {s.mode === 'list' && (
            <div className="border-t border-gray-100 mt-0.5">
              <div className="text-center text-[13px] text-[#00a5f4] py-1.5">☰ {s.listButtonText || '选择'}</div>
            </div>
          )}
          {s.mode === 'cta' && !!(s.ctas || []).filter(c => c.text).length && (
            <div className="border-t border-gray-100 mt-0.5">
              {(s.ctas || []).filter(c => c.text).map((c, ci) => (
                <div key={ci} className="text-center text-[13px] text-[#00a5f4] py-1.5 border-b border-gray-100 last:border-b-0">↗ {c.text}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
    if (s.mode === 'list' && (s.rows || []).filter(r => r.title).length) {
      items.push(
        <div key={`l${i}`} className="flex justify-start" onClick={() => onStepClick?.(i)}>
          <div className={`bg-white/90 rounded-lg shadow-sm px-3 py-2 max-w-[80%] border border-gray-200 ${highlight === i ? 'ring-2 ring-emerald-500' : ''}`}>
            {(s.rows || []).filter(r => r.title).map((r, ri) => (
              <div key={ri} className="py-1 border-b border-gray-100 last:border-b-0">
                <p className="text-[12px] text-gray-900">{r.title}</p>
                {!!r.description && <p className="text-[10px] text-gray-400">{r.description}</p>}
              </div>
            ))}
          </div>
        </div>
      );
    }
    const nextIsRenderable = steps.slice(i + 1).some(x => !['action', 'delay'].includes(x.type));
    const tap = (s.buttons || []).filter(b => b.title)[0]?.title || (s.rows || []).filter(r => r.title)[0]?.title;
    if (tap && nextIsRenderable) {
      items.push(
        <div key={`u${i}`} className="flex justify-end">
          <div className="bg-[#d9fdd3] rounded-lg rounded-tr-none shadow-sm px-2.5 py-1.5 max-w-[70%]">
            <p className="text-[13px] text-gray-900">{tap}</p>
            <p className="text-[10px] text-gray-400 text-right">10:31 ✓✓</p>
          </div>
        </div>
      );
    } else if (s.type === 'question' && nextIsRenderable) {
      items.push(
        <div key={`u${i}`} className="flex justify-end">
          <div className="bg-[#d9fdd3] rounded-lg rounded-tr-none shadow-sm px-2.5 py-1.5 max-w-[70%]">
            <p className="text-[13px] text-gray-500 italic">（客户的回复…）</p>
            <p className="text-[10px] text-gray-400 text-right">10:31 ✓✓</p>
          </div>
        </div>
      );
    }
  });
  return (
    <div className={`${W} mx-auto rounded-[2rem] border-[6px] border-gray-900 bg-gray-900 shadow-xl overflow-hidden shrink-0`}>
      <div className="bg-[#075e54] text-white flex items-center gap-2 px-3 py-2.5">
        <span className="opacity-80 text-sm">‹</span>
        <div className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center text-xs font-semibold">B</div>
        <span className="text-sm font-medium truncate">{title || '业务'}</span>
      </div>
      <div className={`${H} overflow-y-auto px-3 py-4 space-y-2`}
        style={{ backgroundColor: '#efe7dd', backgroundImage: DOODLE_BG }}>
        {items.length ? items : <p className="text-center text-xs text-gray-400 mt-32">点右侧「添加步骤」开始搭建</p>}
      </div>
    </div>
  );
}
