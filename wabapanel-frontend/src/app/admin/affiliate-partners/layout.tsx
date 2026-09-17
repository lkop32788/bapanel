'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { adminPartnersApi } from '@/lib/api';
import Card from '@/components/ui/Card';

export default function AffiliateAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<{ licensed: boolean; enabled: boolean; active: boolean } | null>(null);

  useEffect(() => {
    adminPartnersApi.module()
      .then((r) => setState(r.data.data))
      .catch(() => setState({ licensed: false, enabled: false, active: false }));
  }, []);

  const onSettings = pathname === '/admin/affiliate-partners/settings';

  return (
    <div className="space-y-6">
      {state && !state.active && !onSettings ? (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900">联盟合作伙伴不活跃</h2>
          <p className="text-sm text-gray-600 mt-2">
            {!state.licensed
              ? "此插件未获得此面板的许可。在 KKHS Media 商店中为此域启用“附属合作伙伴”，然后在此处将其打开。"
              : "该附加组件已获得许可但已关闭。在“设置”中将其打开以启动程序。"}
          </p>
          <Link href="/admin/affiliate-partners/settings" className="inline-block mt-4 text-sm font-medium text-emerald-700 hover:underline">
            转到设置
          </Link>
        </Card>
      ) : (
        children
      )}
    </div>
  );
}
