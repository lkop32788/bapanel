'use client';
import React, { useEffect } from 'react';
import { Megaphone } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { usePartnerAnnouncementStore } from '@/stores/partnerAnnouncementStore';
import { announcementLabel, announcementVariant } from '@/lib/affiliateLabels';

export default function PartnerAnnouncementsPage() {
  const { items, loading, load, markRead } = usePartnerAnnouncementStore();

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const unread = items.filter((a) => !a.read).map((a) => a._id);
    if (unread.length) markRead(unread);
  }, [items, markRead]);

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold">公告</h1>
        <p className="text-emerald-50 text-sm mt-1">联盟团队的更新</p>
      </div>

      {loading && items.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">加载中…</p>
      ) : items.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-gray-400">
            <Megaphone className="w-10 h-10 mx-auto mb-3" />
            <p className="text-sm">尚未发布任何公告。</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Card key={a._id}>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={announcementVariant[a.type]}>{announcementLabel[a.type]}</Badge>
                <span className="text-xs text-gray-400">
                  {new Date(a.postDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <h3 className="text-base font-semibold text-gray-900">{a.title}</h3>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{a.message}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
