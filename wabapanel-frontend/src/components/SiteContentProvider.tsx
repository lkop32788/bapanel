/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { createContext, useMemo } from 'react';
import { buildSiteContent } from '@/lib/siteContentData';

export const SiteContentContext = createContext<any | null>(null);
// Server-fetched /public/site-settings so client pages can paint the panel's own brand on first render.
export const SiteSettingsContext = createContext<any | null>(null);

// The root layout already loads the panel's website content on the server, so
// every marketing page can render its own copy on the first paint instead of
// briefly showing the shipped WabaPanel defaults.
export default function SiteContentProvider(
  { content, bizName, settings = null, children }: { content: any | null; bizName: string; settings?: any | null; children: React.ReactNode }
) {
  const value = useMemo(
    () => (content ? buildSiteContent(content, bizName || '') : null),
    [content, bizName]
  );
  return (
    <SiteContentContext.Provider value={value}>
      <SiteSettingsContext.Provider value={settings}>{children}</SiteSettingsContext.Provider>
    </SiteContentContext.Provider>
  );
}
