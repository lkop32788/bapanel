// Local theme preference. Remote license activation is not required.

export const KKHS_THEME_VERSION = '2026.1';
const LS_KEY = 'kkhs-theme-optin';

function allowedHosts(): string[] {
  const raw = process.env.NEXT_PUBLIC_KKHS_THEME_HOSTS ?? '';
  return raw.split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
}

export function hostIsAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return allowedHosts().some(a => host === a || host.endsWith('.' + a));
}

export function readOptIn(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(LS_KEY);
    return v === null ? null : v === '1';
  } catch { return null; }
}

export function writeOptIn(on: boolean): void {
  try { window.localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch { /* private mode */ }
}

// This local installation does not require remote store activation.
export async function addonIsActive(): Promise<boolean> {
  return true;
}

export async function shouldEnableTheme(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  return process.env.NEXT_PUBLIC_NEW_UI_2026 === 'true' && readOptIn() !== false;
}
