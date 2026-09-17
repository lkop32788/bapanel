'use client';
import React from 'react';
import Input from '@/components/ui/Input';

export type RangeKey = 'all' | 'today' | 'week' | 'month' | 'last_month' | 'custom';

export interface DateRange {
  key: RangeKey;
  from: string;
  to: string;
}

export const emptyRange: DateRange = { key: 'all', from: '', to: '' };

const iso = (d: Date) => {
  const off = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return off.toISOString().slice(0, 10);
};

// Resolved from/to (YYYY-MM-DD) for the picked preset — empty means "no limit".
export function rangeParams(r: DateRange): { from?: string; to?: string } {
  const now = new Date();
  if (r.key === 'custom') return { from: r.from || undefined, to: r.to || undefined };
  if (r.key === 'today') return { from: iso(now), to: iso(now) };
  if (r.key === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
    return { from: iso(start), to: iso(now) };
  }
  if (r.key === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: iso(start), to: iso(now) };
  }
  if (r.key === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: iso(start), to: iso(end) };
  }
  return {};
}

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: 'all', label: "所有时间" },
  { key: 'today', label: "今天" },
  { key: 'week', label: "本周" },
  { key: 'month', label: "本月" },
  { key: 'last_month', label: "上个月" },
  { key: 'custom', label: "定制" },
];

export default function DateRangeFilter({
  value, onChange,
}: { value: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-500 mr-1">日期范围</span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange({ ...value, key: p.key })}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              value.key === p.key
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {value.key === 'custom' && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="sm:w-48">
            <Input
              type="date"
              value={value.from}
              max={value.to || undefined}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
            />
          </div>
          <span className="text-sm text-gray-400 hidden sm:block">to</span>
          <div className="sm:w-48">
            <Input
              type="date"
              value={value.to}
              min={value.from || undefined}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
