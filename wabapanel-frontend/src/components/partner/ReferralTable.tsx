'use client';
import React from 'react';
import Badge from '@/components/ui/Badge';
import { inr, referralStatusLabel, referralStatusVariant } from '@/lib/affiliateLabels';

export interface PartnerReferral {
  _id: string;
  status: string;
  createdAt: string;
  convertedAt: string | null;
  plan: { name: string; price: number } | null;
  totalSaleAmount: number;
  totalCommission: number;
  wabaLive?: boolean;
  projectName?: string;
  customer: { name: string; email: string; phone: string };
}

export default function ReferralTable({
  rows, loading, showWaba,
}: { rows: PartnerReferral[]; loading?: boolean; showWaba?: boolean }) {
  const cols = showWaba ? 7 : 6;
  return (
    <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 bg-gray-50/70 border-b border-gray-100">
              <th className="py-3 px-5">客户</th>
              <th className="py-3 px-5">套餐</th>
              <th className="py-3 px-5">状态</th>
              {showWaba && <th className="py-3 px-5">WABA</th>}
              <th className="py-3 px-5">产生的收入</th>
              <th className="py-3 px-5">您的佣金</th>
              <th className="py-3 px-5">已加入</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={cols} className="py-10 text-center text-gray-400">加载中…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={cols} className="py-10 text-center text-gray-500">
                  尚无推荐客户 — 分享您的推荐链接即可开始
                </td>
              </tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r._id} className="border-b border-gray-50 last:border-0">
                <td className="py-3 px-5">
                  <div className="font-medium text-gray-900">{r.customer.name || r.projectName || '—'}</div>
                  <div className="text-xs text-gray-400">{r.customer.email}</div>
                </td>
                <td className="py-3 px-5 text-gray-500">{r.plan?.name || '—'}</td>
                <td className="py-3 px-5">
                  <Badge variant={referralStatusVariant[r.status] || 'default'}>
                    {referralStatusLabel[r.status] || r.status}
                  </Badge>
                </td>
                {showWaba && (
                  <td className="py-3 px-5">
                    <Badge variant={r.wabaLive ? 'success' : 'default'}>{r.wabaLive ? "直播" : "未连接"}</Badge>
                  </td>
                )}
                <td className="py-3 px-5 text-gray-700">{inr(r.totalSaleAmount)}</td>
                <td className="py-3 px-5 font-semibold text-emerald-700">{inr(r.totalCommission)}</td>
                <td className="py-3 px-5 text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
