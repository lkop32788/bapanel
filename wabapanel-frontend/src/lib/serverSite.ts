/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { headers } from 'next/headers';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api').replace(/\/$/, '');
const TTL = 60000;

const cache = new Map<string, { at: number; data: any }>();

// Last successful response also lives on disk: if the API is down (or restarting)
// the panel must keep showing its own branding instead of falling back to defaults.
const DISK_DIR = process.env.SITE_CACHE_DIR || join(process.cwd(), '.site-cache');

const diskFile = (url: string) => join(DISK_DIR, `${createHash('sha1').update(url).digest('hex')}.json`);

function diskRead(url: string): any | null {
  try {
    return JSON.parse(readFileSync(diskFile(url), 'utf8'));
  } catch {
    return null;
  }
}

function diskWrite(url: string, data: any) {
  try {
    mkdirSync(DISK_DIR, { recursive: true });
    writeFileSync(diskFile(url), JSON.stringify(data));
  } catch {
    /* cache is best-effort */
  }
}

// Server-side fetch base: prefer INTERNAL_API_URL (localhost backend) to avoid
// hairpin routing to the public domain, then absolute NEXT_PUBLIC_API_URL, then host-derived.
export async function serverApiBase(): Promise<string> {
  const internal = (process.env.INTERNAL_API_URL || '').replace(/\/$/, '');
  if (internal) return internal;
  if (!API_BASE.startsWith('/')) return API_BASE;
  const h = await headers();
  const host = h.get('host') || '';
  const proto = h.get('x-forwarded-proto') || 'https';
  return host ? `${proto}://${host}${API_BASE}` : API_BASE;
}

// Public branding/content changes rarely, so keep it in memory for a minute:
// every page is force-dynamic and would otherwise wait on the API on each hit.
export async function publicJson(path: string): Promise<any | null> {
  const url = `${await serverApiBase()}${path}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  try {
    const ctrl = new AbortController();
    // No cached copy yet (cold start): wait longer rather than paint default branding.
    const hasFallback = !!hit || diskRead(url) !== null;
    const t = setTimeout(() => ctrl.abort(), hasFallback ? 2500 : 8000);
    const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return hit ? hit.data : diskRead(url);
    const data = await r.json();
    cache.set(url, { at: Date.now(), data });
    diskWrite(url, data);
    return data;
  } catch {
    return hit ? hit.data : diskRead(url);
  }
}
