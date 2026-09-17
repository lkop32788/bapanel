/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useEffect, useContext } from 'react';
import { SiteSettingsContext } from '@/components/SiteContentProvider';
import Link from 'next/link';
import { MessageSquare, Menu, X, Trash2 } from 'lucide-react';

import { useSiteContent } from '@/lib/siteContent';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function DataDeletionPage() {
  const c = useSiteContent();
  const [settings, setSettings] = useState<any>(useContext(SiteSettingsContext));
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    fetch(`${API}/public/site-settings`).then(r => r.json()).then(d => { if (d.success) setSettings(d.data); }).catch(() => {});
  }, []);

  const biz = settings?.business || { name: '', email: '', url: '' };
  const logo = settings?.branding?.logo;
  const email = biz.email || 'info@kkhsmedia.com';
  const brand = biz.name || '';

  const sections: { title: string; body: React.ReactNode }[] = [
    {
      title: "1. 概述",
      body: <>本页介绍了如何请求删除您的个人数据 {brand} 与我们的 WhatsApp Business Platform/Facebook 集成服务相关的商店。我们尊重您控制数据并遵守元平台条款和适用的数据保护法律的权利。</>,
    },
    {
      title: "2. 我们存储哪些数据",
      body: <>根据您对我们服务的使用情况，我们可能会存储：您的姓名、电话号码、电子邮件、WhatsApp/Facebook 个人资料标识符、通过平台交换的消息历史记录、您上传的联系人列表以及操作服务所需的使用/日志数据。</>,
    },
    {
      title: "3. 如何请求删除",
      body: (
        <>
          要删除您的数据，请通过以下方式之一发送删除请求：
          <ul className="list-disc pl-5 mt-3 space-y-1">
            <li>给我们发电子邮件： <a href={`mailto:${email}?subject=Data%20Deletion%20Request`} className="text-violet-600 font-semibold">{email}</a> 来自与您的账户关联的电子邮件或电话号码，并包含主题行 <b>“数据删除请求”</b>.</li>
            <li>或者，如果您有账户，请登录并转到 <b>设置 → 账户 → 删除我的数据</b> 并确认请求。</li>
          </ul>
          请提供您的注册姓名和电话号码/电子邮件，以便我们验证您的身份。
        </>
      ),
    },
    {
      title: "4. 接下来会发生什么",
      body: <>一旦我们验证您的请求，我们将在以下时间内从我们的活动系统中永久删除您的个人数据： <b>30 天</b>。加密备份中保存的数据将在正常备份轮换周期中删除。根据法律要求（例如账单/税务记录）或为了防止欺诈，可以保留某些记录；这些信息仅在法律必要时保留。</>,
    },
    {
      title: "5.确认",
      body: <>删除您的数据后，我们将向您的注册电子邮件发送确认信息。如果您在 7 个工作日内没有收到回复，请再次联系我们： {email}.</>,
    },
    {
      title: "6. 联系方式",
      body: <>如果对数据删除或隐私有任何疑问，请联系 {brand} at <a href={`mailto:${email}`} className="text-violet-600 font-semibold">{email}</a>.</>,
    },
  ];

  return (
    <div className="min-h-screen bg-[#faf9fe] text-gray-900 overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 w-[95%] max-w-6xl bg-white/80 backdrop-blur-2xl border border-gray-200/60 rounded-2xl shadow-lg shadow-purple-100/30 z-50 px-5 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            {logo ? <img src={logo} alt={brand} className="h-10 w-auto" /> : (
              <div className="w-9 h-9 bg-linear-to-br from-violet-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg shadow-violet-200">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
            )}
          </Link>
          <div className="hidden lg:flex items-center gap-1">
            {(c.nav.links || []).map((l: any, i: number) => (
              <a key={i} href={l.href} className="px-3 py-1.5 text-sm font-bold text-gray-900 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-all">{l.label}</a>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Link href="/auth/login" className="px-4 py-2 text-sm font-bold text-gray-900 hover:text-violet-700 transition-all">{c.nav.loginText}</Link>
            <Link href="/auth/register" className="px-4 py-2 text-sm font-bold text-white bg-linear-to-r from-violet-600 to-purple-600 rounded-lg shadow-md shadow-violet-200/40 hover:shadow-lg transition-all hover:-translate-y-0.5">{c.nav.registerText}</Link>
          </div>
          <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden p-2 rounded-lg hover:bg-gray-100">
            {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileMenu && (
          <div className="md:hidden pt-4 pb-2 border-t border-gray-100 mt-3 space-y-2">
            {(c.nav.links || []).map((l: any, i: number) => (
              <a key={i} href={l.href} onClick={() => setMobileMenu(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-violet-50">{l.label}</a>
            ))}
          </div>
        )}
      </nav>

      {/* Content */}
      <section className="pt-32 md:pt-40 pb-20 px-4">
        <div className="max-w-4xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full mb-4"><Trash2 className="w-3.5 h-3.5" /> 数据删除</span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-4">数据删除 <span className="bg-linear-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">说明</span></h1>
          <p className="text-sm text-gray-400 mb-10">最后更新： {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

          <div className="space-y-8">
            {sections.map((s, i) => (
              <div key={i} className="p-6 bg-white rounded-2xl border border-gray-100">
                <h2 className="text-lg font-bold text-gray-900 mb-3">{s.title}</h2>
                <div className="text-sm text-gray-600 leading-relaxed">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200/60 bg-white py-12 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">&copy; {new Date().getFullYear()} {brand}. {c.footer.copyrightText}</p>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <Link href="/privacy" className="hover:text-violet-600">隐私政策</Link>
            <Link href="/terms" className="hover:text-violet-600">服务条款</Link>
            <Link href="/data-deletion" className="hover:text-violet-600">数据删除</Link>
            <Link href="/contact" className="hover:text-violet-600">联系方式</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
