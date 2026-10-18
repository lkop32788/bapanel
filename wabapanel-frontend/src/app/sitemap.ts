import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

// ADM-08: per-domain URLs — NEXT_PUBLIC_SITE_URL if set, else the request host (never the master domain)
async function siteUrl(): Promise<string> {
  const env = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  if (env) return env;
  const h = await headers();
  const host = h.get('host') || '';
  const proto = h.get('x-forwarded-proto') || (/^(localhost|127\.)/.test(host) ? 'http' : 'https');
  return host ? `${proto}://${host}` : '';
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const SITE = await siteUrl();
  // server-side data fetches: internal/absolute API URL if configured, else this site's /api
  const pub = process.env.NEXT_PUBLIC_API_URL || '';
  const API = (process.env.INTERNAL_API_URL || (/^https?:\/\//.test(pub) ? pub : `${SITE}/api`)).replace(/\/$/, '');
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/features`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE}/team`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE}/blog`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE}/knowledge-base`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/data-deletion`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/auth/register`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
  ];

  type Doc = { slug?: string; updatedAt?: string; createdAt?: string };
  const dynamicUrls: MetadataRoute.Sitemap = [];

  try {
    const r = await fetch(`${API}/public/blog?limit=200`, { cache: 'no-store' });
    const d = await r.json();
    const posts: Doc[] = Array.isArray(d.data) ? d.data : [];
    posts.forEach((p) => {
      if (p.slug) dynamicUrls.push({
        url: `${SITE}/blog/${p.slug}`,
        lastModified: new Date(p.updatedAt || p.createdAt || Date.now()),
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    });
  } catch { /* API unavailable at build time */ }

  try {
    const r = await fetch(`${API}/public/knowledge`, { cache: 'no-store' });
    const d = await r.json();
    const articles: Doc[] = Array.isArray(d.data) ? d.data : [];
    articles.forEach((a) => {
      if (a.slug) dynamicUrls.push({
        url: `${SITE}/knowledge-base/${a.slug}`,
        lastModified: new Date(a.updatedAt || a.createdAt || Date.now()),
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    });
  } catch { /* API unavailable at build time */ }

  return [...staticPages, ...dynamicUrls];
}
