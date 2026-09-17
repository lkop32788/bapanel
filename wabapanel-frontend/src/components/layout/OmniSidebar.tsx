import type { ReactNode } from 'react';

const ICONS: Record<string, string> = {
  Dashboard: '📊', Vendors: '🏢', Inbox: '💬', Contacts: '👥', Campaigns: '📢',
  Automation: '🤖', Channels: '📱', Settings: '⚙️', Tools: '🧰',
  'Feature Controls': '🔧', 'Data Cleanup': '🗑️', Accounting: '💳',
  Inquiries: '✉️', Coupons: '🎟️', Announcements: '📣',
  'System Health': '🔧', 'One Click Signup': '🔑', 'Client API Docs': '📖',
  'Panel Updates': '⬇️', 'License & Updates': '🔑', 'Support Tickets': '🎧',
  'User Guide': '📚', 'AI Assistant': '✨', 'Leads & Commerce': '🛍️',
  'AI Intelligence': '✨', 'Affiliate Partners': '🤝',
};

export function OmniNavIcon({ label, fallback }: { label: string; fallback: ReactNode }) {
  return <span data-ui-nav-icon aria-hidden="true">{ICONS[label] || fallback}</span>;
}

export function OmniSidebarBrand({ name, logo }: { name: string; logo?: string }) {
  return (
    <div data-ui-side-brand>
      <span data-ui-side-name title={name}>{name}</span>
      <span data-ui-side-mark aria-hidden="true">
        {logo ? <img src={logo} alt="" /> : (name?.charAt(0)?.toUpperCase() || 'O')}
      </span>
    </div>
  );
}
