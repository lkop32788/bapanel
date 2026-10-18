// Shared status labels/variants for the affiliate partner UI (admin + portal).

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'default';

export const referralStatusLabel: Record<string, string> = {
  signed_up: "已注册", converted: 'Converted', rejected: 'Rejected',
};
export const referralStatusVariant: Record<string, Variant> = {
  converted: 'success', signed_up: 'info', rejected: 'danger',
};

export const commissionStatusLabel: Record<string, string> = {
  pending: 'Pending', credited: 'Credited', reversed: 'Reversed',
};
export const commissionStatusVariant: Record<string, Variant> = {
  credited: 'success', pending: 'warning', reversed: 'danger',
};

export const withdrawalStatusLabel: Record<string, string> = {
  pending: 'Pending', paid: 'Paid', rejected: 'Rejected',
};
export const withdrawalStatusVariant: Record<string, Variant> = {
  paid: 'success', pending: 'warning', rejected: 'danger',
};

export const kycStatusLabel: Record<string, string> = {
  not_started: "未开始", pending: "待审查", approved: 'Approved', rejected: 'Rejected',
};
export const kycStatusVariant: Record<string, Variant> = {
  not_started: 'default', pending: 'warning', approved: 'success', rejected: 'danger',
};

export const announcementTypes = ['general', 'promotion', 'commission', 'important', 'maintenance'] as const;
export type AnnouncementType = (typeof announcementTypes)[number];

export const announcementLabel: Record<AnnouncementType, string> = {
  general: 'General', promotion: 'Promotion', commission: 'Commission', important: 'Important', maintenance: 'Maintenance',
};
export const announcementVariant: Record<AnnouncementType, Variant> = {
  general: 'default', promotion: 'warning', commission: 'success', important: 'danger', maintenance: 'info',
};

export const commissionTypeLabel: Record<string, string> = {
  first_sale: "新品促销", renewal: 'Renewal',
};

export const inr = (n: number | undefined) => `₹${Number(n || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;
