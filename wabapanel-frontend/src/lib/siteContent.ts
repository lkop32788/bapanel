/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useContext } from 'react';
import { SiteContentContext } from '@/components/SiteContentProvider';
import { DEFAULT_CONTENT, deepMergeContent, replacePlaceholders, buildSiteContent } from './siteContentData';
export { DEFAULT_CONTENT, deepMergeContent, buildSiteContent };


const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';




export function useSiteContent(initial?: any) {
  // Content loaded by the root layout on the server: available on the very
  // first render, so the panel's own copy never flashes the defaults.
  const fromServer = useContext(SiteContentContext);
  const [content, setContent] = useState<any>(() => initial || fromServer || DEFAULT_CONTENT);
  useEffect(() => {
    if (initial || fromServer) return;
    Promise.all([
      fetch(`${API}/public/site-content?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`${API}/public/site-settings`, { cache: 'no-store' }).then(r => r.json()),
    ]).then(([c, s]) => {
      const bizName = (s && s.data && s.data.business && s.data.business.name) || '';
      const merged = c.success && c.data ? deepMergeContent(DEFAULT_CONTENT, c.data) : DEFAULT_CONTENT;
      setContent(replacePlaceholders(merged, bizName));
    }).catch(() => {});
  }, []);
  return content;
}
