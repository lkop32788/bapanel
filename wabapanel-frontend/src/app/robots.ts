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

export default async function robots(): Promise<MetadataRoute.Robots> {
  const SITE = await siteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/client', '/api/', '/pay'],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
