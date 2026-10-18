import { create } from 'zustand';
import { partnerApi } from '@/lib/api';

export interface PartnerAnnouncement {
  _id: string;
  title: string;
  message: string;
  type: 'general' | 'promotion' | 'commission' | 'important' | 'maintenance';
  postDate: string;
  expiresAt: string | null;
  read: boolean;
}

interface PartnerAnnouncementState {
  items: PartnerAnnouncement[];
  loading: boolean;
  load: () => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
}

export const usePartnerAnnouncementStore = create<PartnerAnnouncementState>((set, get) => ({
  items: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const res = await partnerApi.announcements();
      set({ items: res.data.data || [], loading: false });
    } catch {
      set({ loading: false });
    }
  },

  markRead: async (ids) => {
    const unread = ids.filter((id) => get().items.some((a) => a._id === id && !a.read));
    if (!unread.length) return;
    set({ items: get().items.map((a) => (unread.includes(a._id) ? { ...a, read: true } : a)) });
    try {
      await partnerApi.markAnnouncementsRead(unread);
    } catch {
      /* the next load will restore the real state */
    }
  },
}));
