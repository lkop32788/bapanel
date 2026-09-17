import { create } from 'zustand';
import { authApi, partnerApi } from '@/lib/api';

// Session store for the Partner Portal (/partner/*). Partners are real users
// with role 'partner', so the API token works exactly like any other login —
// but the portal keeps its own store and only ever accepts role 'partner', so
// an admin/vendor session can never render partner pages and vice versa.

export interface PartnerProfile {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
}

export interface PartnerAccount {
  code: string;
  status: 'active' | 'suspended';
  walletBalance: number;
  totalPaidOut: number;
  kycStatus: 'not_started' | 'pending' | 'approved' | 'rejected';
  payoutDetails: {
    method: '' | 'upi' | 'bank';
    upiId?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    bankIfsc?: string;
    bankName?: string;
  };
  settings: {
    commissionRate: number;
    recurringCommission: boolean;
    clearingDays: number;
    minWithdrawAmount: number;
    terms: string;
  };
}

interface PartnerAuthState {
  profile: PartnerProfile | null;
  account: PartnerAccount | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loadPartner: () => Promise<void>;
  logout: () => void;
  setProfile: (data: Partial<PartnerProfile>) => void;
}

export const usePartnerAuthStore = create<PartnerAuthState>((set, get) => ({
  profile: null,
  account: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    const res = await authApi.login({ email, password });
    const { token, user } = res.data.data;
    if (user?.role !== 'partner') {
      throw new Error('This login is only for affiliate partners');
    }
    localStorage.setItem('token', token);
    localStorage.removeItem('workspaceId');
    set({ profile: user, isAuthenticated: true, isLoading: false });
    await get().loadPartner();
  },

  loadPartner: async () => {
    if (typeof window === 'undefined' || !localStorage.getItem('token')) {
      set({ isAuthenticated: false, isLoading: false });
      return;
    }
    try {
      const [meRes, accountRes] = await Promise.all([authApi.getMe(), partnerApi.me()]);
      const user = meRes.data.data?.user || meRes.data.data;
      if (user?.role !== 'partner') {
        set({ profile: null, account: null, isAuthenticated: false, isLoading: false });
        return;
      }
      set({ profile: user, account: accountRes.data.data, isAuthenticated: true, isLoading: false });
    } catch {
      set({ profile: null, account: null, isAuthenticated: false, isLoading: false });
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('workspaceId');
    set({ profile: null, account: null, isAuthenticated: false, isLoading: false });
  },

  setProfile: (data) => set((s) => ({ profile: s.profile ? { ...s.profile, ...data } : s.profile })),
}));
