import { useEffect, useState } from 'react';

export const SIDEBAR_PREFERENCE_KEY = 'dentcore-sidebar-compact';
export function useSidebarPreference() {
  const [compact, setCompact] = useState(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_PREFERENCE_KEY);
      if (saved !== null) return saved === 'true';
    } catch { /* Local storage may be unavailable; the control still works. */ }
    return window.innerWidth <= 900;
  });
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(compact)); } catch { /* Keep the in-memory preference. */ }
  }, [compact]);
  return [compact, setCompact] as const;
}
