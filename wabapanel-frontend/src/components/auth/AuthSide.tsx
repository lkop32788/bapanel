'use client';
import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import useBranding from '@/lib/useBranding';

const POINTS = [
  'WhatsApp, Instagram, Facebook & Telegram — one inbox',
  'Broadcasts, chatbots and automation on autopilot',
  'Team inbox with agents, roles and full chat history',
];

// Left-hand panel of the login / signup screens. The image and the copy come
// from Admin -> Site Settings -> Branding, so a white-label panel only needs to
// upload its own artwork. Without an image we fall back to a branded gradient.
export default function AuthSide() {
  const brand = useBranding();
  const headline = brand.loginHeadline || `Grow your business on WhatsApp with ${brand.name}`;
  const subtext = brand.loginSubtext || 'One platform for chats, campaigns, automation and your whole support team.';

  if (brand.loginBg) {
    return (
      <div data-ui-auth-side className="hidden lg:flex w-1/2 xl:w-[55%] items-center justify-center bg-violet-50 p-8">
        <img src={brand.loginBg} alt={brand.name} className="max-w-full max-h-[90vh] object-contain" />
      </div>
    );
  }

  return (
    <div data-ui-auth-side className="relative hidden lg:flex flex-col justify-between w-1/2 xl:w-[55%] p-10 xl:p-14 bg-linear-to-br from-violet-600 via-violet-700 to-violet-900">
      <div>
        {brand.logo
          ? (
            <span className="inline-flex items-center rounded-xl bg-white/95 px-4 py-2 shadow-sm">
              <img src={brand.logo} alt={brand.name} className="h-9 w-auto object-contain" />
            </span>
          )
          : <span className="text-2xl font-bold text-white">{brand.name}</span>}
      </div>
      <div className="max-w-lg">
        <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight">{headline}</h2>
        <p className="mt-4 text-white/80 text-base">{subtext}</p>
        <ul className="mt-8 space-y-3">
          {POINTS.map((p) => (
            <li key={p} className="flex items-start gap-3 text-white/90 text-sm">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-white" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-white/60">{brand.tagline}</p>
    </div>
  );
}
