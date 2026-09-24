type ReturnLocation = { pathname: string; search?: string; hash?: string; state?: unknown };

export function getReturnLocation(state: unknown): ReturnLocation | null {
  const from = (state as { from?: ReturnLocation } | null)?.from;
  if (!from || typeof from.pathname !== 'string') return null;
  const path = from.pathname;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\r\n]/.test(path)) return null;
  if (path === '/login' || path.startsWith('/login/')) return null;
  return {
    pathname: path,
    search: typeof from.search === 'string' && from.search.startsWith('?') ? from.search : '',
    hash: typeof from.hash === 'string' && from.hash.startsWith('#') ? from.hash : '',
    state: from.state,
  };
}
