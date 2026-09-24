import { useEffect, useState } from 'react';

/** Keep long-running workspaces current without reading the clock during render. */
export function useMinuteClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
