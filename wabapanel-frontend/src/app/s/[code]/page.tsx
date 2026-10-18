import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '');

interface LinkData {
  title: string;
  description: string;
  imageUrl: string;
  originalUrl: string;
  showPreview: boolean;
  clicks: number;
}

async function loadLink(code: string, hit: boolean): Promise<LinkData | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || '';
  const proto = h.get('x-forwarded-proto') || 'https';
  const base = API_BASE.startsWith('http') ? API_BASE : `${proto}://${host}${API_BASE}`;
  try {
    const res = await fetch(`${base}/public/short-link/${encodeURIComponent(code)}${hit ? '?hit=1' : ''}`, {
      cache: 'no-store',
      headers: {
        'x-visitor-ua': h.get('user-agent') || '',
        'x-visitor-ip': (h.get('x-forwarded-for') || '').split(',')[0].trim(),
        'x-visitor-referrer': h.get('referer') || '',
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? (json.data as LinkData) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const link = await loadLink(code, false);
  if (!link) return { title: "找不到链接" };
  return {
    title: link.title || 'Shared link',
    description: link.description || link.originalUrl,
    openGraph: {
      title: link.title || 'Shared link',
      description: link.description || link.originalUrl,
      images: link.imageUrl ? [link.imageUrl] : undefined,
      type: 'website',
    },
    twitter: {
      card: link.imageUrl ? 'summary_large_image' : 'summary',
      title: link.title || 'Shared link',
      description: link.description || link.originalUrl,
      images: link.imageUrl ? [link.imageUrl] : undefined,
    },
  };
}

export default async function ShortLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await loadLink(code, true);

  if (!link) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">链接不可用</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            该短链接不存在、已过期或已被禁用。
          </p>
        </div>
      </div>
    );
  }

  if (!link.showPreview) redirect(link.originalUrl);

  let host = link.originalUrl;
  try { host = new URL(link.originalUrl).hostname; } catch { /* keep raw url */ }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        {link.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={link.imageUrl} alt={link.title || "预览"} className="w-full max-h-72 object-cover" />
        )}
        <div className="p-6 space-y-3">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{link.title || "共享链接"}</h1>
          {link.description && <p className="text-sm text-gray-600 dark:text-gray-300">{link.description}</p>}
          <p className="text-xs text-gray-400 dark:text-gray-500 break-all">{host}</p>
          <a
            href={link.originalUrl}
            className="inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-white"
            style={{ background: 'var(--brand, #059669)' }}
          >
            继续
          </a>
        </div>
      </div>
    </div>
  );
}
