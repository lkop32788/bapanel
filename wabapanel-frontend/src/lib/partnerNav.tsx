import React from 'react';
import {
  LayoutDashboard, Share2, Users, IndianRupee, Wallet, Banknote, Megaphone, ShieldCheck, User, Lock,
} from 'lucide-react';

export interface PartnerNavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

export const partnerNavItems: PartnerNavItem[] = [
  { label: "仪表盘", href: '/partner/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: "推荐链接", href: '/partner/referral', icon: <Share2 className="w-5 h-5" /> },
  { label: "我的推荐", href: '/partner/referrals', icon: <Share2 className="w-5 h-5" /> },
  { label: "客户", href: '/partner/customers', icon: <Users className="w-5 h-5" /> },
  { label: "佣金", href: '/partner/commissions', icon: <IndianRupee className="w-5 h-5" /> },
  { label: "钱包", href: '/partner/wallet', icon: <Wallet className="w-5 h-5" /> },
  { label: "撤回", href: '/partner/withdraw-request', icon: <Banknote className="w-5 h-5" /> },
  { label: "公告", href: '/partner/announcements', icon: <Megaphone className="w-5 h-5" /> },
  { label: 'KYC', href: '/partner/kyc', icon: <ShieldCheck className="w-5 h-5" /> },
  { label: "简介", href: '/partner/profile', icon: <User className="w-5 h-5" /> },
  { label: "安全", href: '/partner/security', icon: <Lock className="w-5 h-5" /> },
];
