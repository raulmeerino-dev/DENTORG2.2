import type { ChangeEvent } from './invalidation';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting';
interface Options {
  url: string;
  token: () => string | null;
  refresh: () => Promise<unknown>;
  onChange: (event: ChangeEvent) => void;
  onResync: () => void;
  onState: (state: ConnectionState) => void;
}

export function connectRealtime(options: Options) {
  let stopped = false;
  let cursor: number | null = null;
  let attempt = 0;
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lastMessage = Date.now();

  function open() {
    if (stopped || !options.token()) return;
    options.onState(attempt ? 'reconnecting' : 'connecting');
    socket = new WebSocket(options.url);
    const current = socket;
    current.onopen = () => {
      lastMessage = Date.now();
      current.send(JSON.stringify({ token: options.token(), cursor }));
      heartbeat = setInterval(() => {
        if (Date.now() - lastMessage > 45_000) current.close();
        else if (current.readyState === WebSocket.OPEN) current.send(JSON.stringify({ type: 'ping' }));
      }, 20_000);
    };
    current.onmessage = (message) => {
      if (stopped || current !== socket) return;
      lastMessage = Date.now();
      try {
        const data = JSON.parse(message.data);
        if (!Number.isSafeInteger(data.cursor) || data.cursor < 0) return;
        if (data.type === 'change' && (cursor === null || data.cursor > cursor)) options.onChange(data as ChangeEvent);
        if (data.type === 'resync') options.onResync();
        cursor = data.type === 'resync' ? data.cursor : Math.max(cursor ?? 0, data.cursor);
        if (data.type === 'ready') { attempt = 0; options.onState('connected'); }
      } catch { current.close(); }
    };
    current.onclose = async (event) => {
      clearInterval(heartbeat);
      if (stopped || current !== socket) return;
      options.onState('reconnecting');
      if (event.code === 4401) {
        try { await options.refresh(); } catch { return; }
      }
      if (stopped) return;
      const delay = Math.min(30_000, 500 * 2 ** Math.min(attempt++, 6)) + Math.random() * 300;
      retry = setTimeout(open, delay);
    };
  }

  function reconnect() {
    if (socket?.readyState === WebSocket.OPEN) socket.close();
    else { clearTimeout(retry); open(); }
  }
  window.addEventListener('online', reconnect);
  open();
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(heartbeat);
    window.removeEventListener('online', reconnect);
    socket?.close();
  };
}
