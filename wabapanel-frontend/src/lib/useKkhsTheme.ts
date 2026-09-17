'use client';
import { useEffect, useState } from 'react';

const isOn = () =>
  typeof document !== 'undefined' && document.documentElement.getAttribute('data-kkhs') === 'on';

/** True while <html data-kkhs="on"> is present (set by ThemeGate). */
export default function useKkhsTheme(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(isOn());
    const obs = new MutationObserver(() => setOn(isOn()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-kkhs'] });
    return () => obs.disconnect();
  }, []);
  return on;
}
