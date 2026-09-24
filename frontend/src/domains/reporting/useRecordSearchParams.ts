import { useLayoutEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/** React Router setters do not queue updates; merge rapid filter changes synchronously. */
export function useRecordSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const latest = useRef(new URLSearchParams(searchParams));
  const pending = useRef<string[]>([]);
  useLayoutEffect(() => {
    const committed = searchParams.toString();
    const index = pending.current.indexOf(committed);
    if (index >= 0) {
      pending.current.splice(0, index + 1);
      if (!pending.current.length) latest.current = new URLSearchParams(searchParams);
    } else {
      // Browser back/forward or a navigation outside this workspace is authoritative.
      pending.current = [];
      latest.current = new URLSearchParams(searchParams);
    }
  }, [searchParams]);
  function updateSearch(build: (current: URLSearchParams) => URLSearchParams, replace = false) {
    const next = build(new URLSearchParams(latest.current));
    if (next.toString() === latest.current.toString()) return;
    latest.current = new URLSearchParams(next);
    pending.current.push(next.toString());
    setSearchParams(next, { replace });
  }
  return { searchParams, updateSearch };
}
