import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectRealtime } from './connection';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  onopen?: () => void;
  onmessage?: (message: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  send = vi.fn();
  close = vi.fn(() => this.onclose?.({ code: 1000 }));
  constructor() { Socket.instances.push(this); }
  receive(data: object) { this.onmessage?.({ data: JSON.stringify(data) }); }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); Socket.instances = []; });
describe('realtime reconnect protocol', () => {
  it('resumes its cursor, ignores duplicates and releases resources on logout', async () => {
    vi.useFakeTimers(); vi.stubGlobal('WebSocket', Socket);
    const onChange = vi.fn(); const onResync = vi.fn();
    const stop = connectRealtime({ url: 'ws://localhost/api/realtime/ws', token: () => 'test-token', refresh: vi.fn(), onChange, onResync, onState: vi.fn() });
    const first = Socket.instances[0]; first.onopen?.();
    first.receive({ type: 'resync', cursor: 3 });
    first.receive({ type: 'change', cursor: 4, event: 'patient.updated' });
    first.receive({ type: 'change', cursor: 4, event: 'patient.updated' });
    expect(onResync).toHaveBeenCalledTimes(1); expect(onChange).toHaveBeenCalledTimes(1);
    first.onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(1000);
    const next = Socket.instances[1]; next.onopen?.();
    expect(JSON.parse(next.send.mock.calls[0][0])).toMatchObject({ token: 'test-token', cursor: 4 });
    next.receive({ type: 'change', cursor: 5, event: 'patient.updated' });
    expect(onChange).toHaveBeenCalledTimes(2);
    stop(); await vi.advanceTimersByTimeAsync(60_000);
    expect(Socket.instances).toHaveLength(2); expect(next.close).toHaveBeenCalled();
  });
  it('renews an expired token before reconnecting and never puts tokens in URLs', async () => {
    vi.useFakeTimers(); vi.stubGlobal('WebSocket', Socket);
    const refresh = vi.fn(async () => undefined);
    const stop = connectRealtime({ url: 'ws://localhost/api/realtime/ws', token: () => 'secret', refresh, onChange: vi.fn(), onResync: vi.fn(), onState: vi.fn() });
    Socket.instances[0].onclose?.({ code: 4401 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(1); expect(Socket.instances).toHaveLength(2);
    stop();
  });
});
