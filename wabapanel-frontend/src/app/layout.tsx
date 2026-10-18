import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Toaster } from 'react-hot-toast';
import SeoHead from '@/components/SeoHead';
import SiteTheme from '@/components/SiteTheme';
import PwaProvider from '@/components/PwaProvider';
import SiteContentProvider from '@/components/SiteContentProvider';
import CustomCodeInjector from '@/components/CustomCodeInjector';
import ThemeGate from '@/components/kkhs/ThemeGate';
import { DEFAULT_THEME } from '@/lib/siteTheme';
import { publicJson } from '@/lib/serverSite';
import { I18nProvider } from '@/lib/i18n';
import './globals.css';
import '@/styles/omniclick.css';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://wabapanel.com').replace(/\/$/, '');
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api').replace(/\/$/, '');

const DEFAULT_TITLE = "WabaPanel — WhatsApp Business API CRM 和 AI 自动化平台";
const DEFAULT_DESC = "WabaPanel 是一个完整的 WhatsApp Business API 平台：团队收件箱、AI 聊天机器人、机器人流程构建器、广播、点滴活动、CRM 管道、AI 语音通话和白标转售。提供免费计划。";

// Re-evaluate branding at request time so each self-hosted install shows its own name/logo
export const dynamic = 'force-dynamic';

// White-label: canonical/OG/JSON-LD site URL must be the panel's OWN domain, not
// the master default. Prefer an explicit NEXT_PUBLIC_SITE_URL (set on master),
// otherwise derive it from the incoming request host so no install leaks wabapanel.com.
async function siteUrlFor(): Promise<string> {
  const env = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  if (env) return env;
  try {
    const h = await headers();
    const host = h.get('host') || '';
    const proto = h.get('x-forwarded-proto') || 'https';
    if (host) return `${proto}://${host}`.replace(/\/$/, '');
  } catch { /* noop */ }
  return SITE;
}

export async function generateMetadata(): Promise<Metadata> {
  const [brandRes, contentRes] = await Promise.all([
    publicJson('/public/branding'),
    publicJson('/public/site-content'),
  ]);
  const brand = brandRes?.data || {};
  const seo = contentRes?.data?.seo || {};
  const brandName: string = brand.name && brand.name !== 'WabaPanel' ? brand.name : 'WabaPanel';
  // Ignore the shipped default SEO copy (which names WabaPanel) so a white-label
  // install never leaks it; build title/description from the panel's own brand.
  const seoTitle: string = seo.metaTitle && !/wabapanel/i.test(seo.metaTitle) ? seo.metaTitle : '';
  const seoDesc: string = seo.metaDescription && !/wabapanel/i.test(seo.metaDescription) ? seo.metaDescription : '';
  const title: string = seoTitle || (brandName !== 'WabaPanel' ? `${brandName} — WhatsApp Business Platform` : DEFAULT_TITLE);
  const description: string = seoDesc || (brandName !== 'WabaPanel' ? `${brandName} — a complete WhatsApp Business API platform: team inbox, AI chatbot, bot flows, broadcasts, drip campaigns, CRM pipeline and AI voice calling.` : DEFAULT_DESC);
  // Prefer the panel's own share image, then its logo, so a white-label install
  // never leaks the default (KKHS-branded) screenshot in WhatsApp/social previews.
  const ogImage: string = seo.ogImage || brand.logo || '/assets/panel-dashboard.png';
  const favicon: string = brand.favicon || '/favicon.ico';
  // iOS home-screen icon must be a square PNG; the raw logo is often rectangular,
  // so use the backend's squared pwa-icon (logo composited on a white square) when a
  // brand logo exists — this makes the panel's own logo show as the installed app icon.
  const appleIcon: string = brand.logo ? `${API_BASE}/public/pwa-icon-192.png` : (brand.favicon || '/icons/icon-192.png');

  const site = await siteUrlFor();
  return {
    metadataBase: new URL(site),
    title: { default: title, template: brandName !== 'WabaPanel' ? `%s | ${brandName}` : '%s | WabaPanel' },
    description,
    keywords: ['WhatsApp Business API', 'WhatsApp CRM', 'WhatsApp automation', 'AI chatbot', 'WhatsApp broadcast', 'bot flow builder', 'WhatsApp panel'],
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      url: site,
      siteName: brandName,
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: brandName }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    robots: { index: true, follow: true },
    manifest: `${API_BASE}/public/manifest.webmanifest`,
    appleWebApp: { capable: true, statusBarStyle: 'default', title: brandName },
    icons: { icon: favicon, shortcut: favicon, apple: appleIcon },
  };
}

// Build schema.org JSON-LD from the panel's own branding so white-label installs
// never leak the default (WabaPanel / KKHS Media) name. orgName defaults to the
// brand name but can be overridden from Admin → Site Settings → SEO.
function buildJsonLd(site: string, orgName: string, brandName: string, desc: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${site}/#organization`,
        name: orgName,
        url: site,
        logo: `${site}/icons/icon-192.png`,
      },
      {
        '@type': 'SoftwareApplication',
        name: brandName,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: site,
        description: desc,
        offers: [
          { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'INR' },
          { '@type': 'Offer', name: 'Starter', price: '999', priceCurrency: 'INR' },
          { '@type': 'Offer', name: 'Growth', price: '1499', priceCurrency: 'INR' },
          { '@type': 'Offer', name: 'Business', price: '1999', priceCurrency: 'INR' },
        ],
        publisher: { '@id': `${site}/#organization` },
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `What is ${brandName}?`,
            acceptedAnswer: { '@type': 'Answer', text: `${brandName} 是一个 WhatsApp Business API 平台 ${orgName} 将共享团队收件箱、人工智能聊天机器人、拖放式机器人流程构建器、广播和点滴营销活动、销售渠道 CRM 和人工智能语音通话结合在一个仪表板中。` },
          },
          {
            '@type': 'Question',
            name: `Does ${brandName} have a free plan?`,
            acceptedAnswer: { '@type': 'Answer', text: `是的。 ${brandName} 提供免费计划（0 卢比）和每月 999 卢比起的付费计划，并提供更多联系人、代理、机器人流程和 AI 功能。` },
          },
          {
            '@type': 'Question',
            name: `Does ${brandName} support the official WhatsApp Business API?`,
            acceptedAnswer: { '@type': 'Answer', text: `是的。 ${brandName} 可与官方 WhatsApp Cloud API 配合使用，包括消息模板、广播和点击 WhatsApp 广告，并且还支持基于 QR 的 WhatsApp 连接。` },
          },
          {
            '@type': 'Question',
            name: 'Can I train the AI chatbot on my own data?',
            acceptedAnswer: { '@type': 'Answer', text: `是的。您可以训练 ${brandName} AI 聊天机器人包含您自己的 PDF、Excel 文件和网站内容，因此它可以 24x7 自动回答客户问题。` },
          },
        ],
      },
    ],
  };
}

// The installed app's status/title bar must use the panel's own brand colour,
// not the shipped default green.
export async function generateViewport(): Promise<Viewport> {
  const brandRes = await publicJson('/public/branding');
  const themeColor: string = brandRes?.data?.primaryColor || '#059669';
  return { width: 'device-width', initialScale: 1, themeColor };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [brandRes, contentRes, settingsRes, themeRes] = await Promise.all([
    publicJson('/public/branding'),
    publicJson('/public/site-content'),
    publicJson('/public/site-settings'),
    publicJson('/public/site-theme'),
  ]);
  const brand = brandRes?.data || {};
  const seo = contentRes?.data?.seo || {};
  const siteContent = contentRes?.success ? contentRes.data : null;
  const bizName: string = settingsRes?.data?.business?.name || '';
  const customCode: string = settingsRes?.data?.customCode || '';
  const siteTheme = themeRes?.data ? { ...DEFAULT_THEME, ...themeRes.data } : null;
  const brandName: string = brand.name || 'WabaPanel';
  const orgName: string = seo.organizationName || brandName;
  const desc: string = (seo.metaDescription && !/wabapanel/i.test(seo.metaDescription)) ? seo.metaDescription : `${brandName} — WhatsApp Business API CRM & AI automation platform with team inbox, AI chatbot, bot flow builder, broadcasts, drip campaigns, sales pipeline and AI voice calling.`;
  const jsonLd = buildJsonLd(await siteUrlFor(), orgName, brandName, desc);
  return (
    <html lang="zh-CN" data-ui="omniclick">
      <body className="antialiased">
        <ThemeGate />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: `window.__BRAND__=${JSON.stringify(brand)};` }} />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var r=document.documentElement;var c=localStorage.getItem('brandColor');if(c){r.classList.add('brand-themed');r.style.setProperty('--brand',c);}var f=localStorage.getItem('brandFont');if(f&&f!=='Inter'){r.style.setProperty('--app-font',"'"+f+"'");}}catch(e){}})();` }} />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var K='__chunk_reload__';function chunk(m){m=String(m||'');return /Loading chunk [\\d]+ failed|ChunkLoadError|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(m);}function fix(m){if(!chunk(m))return;var last=+(sessionStorage.getItem(K)||0);if(Date.now()-last<10000)return;sessionStorage.setItem(K,String(Date.now()));window.location.reload();}window.addEventListener('error',function(e){fix((e&&e.message)||(e&&e.error&&e.error.message));},true);window.addEventListener('unhandledrejection',function(e){var r=e&&e.reason;fix(r&&(r.message||r.name||r));});}catch(e){}})();` }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <SeoHead />
        <SiteTheme initial={siteTheme} />
        <PwaProvider apiBase={API_BASE} />
        <I18nProvider><SiteContentProvider content={siteContent} bizName={bizName} settings={settingsRes?.data || null}>{children}</SiteContentProvider></I18nProvider>
        <CustomCodeInjector code={customCode} />
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      </body>
    </html>
  );
}
