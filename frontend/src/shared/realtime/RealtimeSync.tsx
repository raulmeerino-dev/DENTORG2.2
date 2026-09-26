import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { API_BASE_URL } from '../../api/config';
import { getStoredAuthToken, refreshSessionToken } from '../../api/session';
import { useAuth } from '../../domains/identity/session/AuthContext';
import { connectRealtime } from './connection';
import { invalidateChanges, resyncRealtimeQueries, type ChangeEvent } from './invalidation';

export default function RealtimeSync() {
  const { user } = useAuth();
  const client = useQueryClient();
  const owner = user && user.rol !== 'paciente' ? `${user.id}:${user.clinica_id}:${user.rol}` : null;
  useEffect(() => {
    if (!owner || import.meta.env.VITE_DEMO_MODE === 'true') return;
    const url = new URL(`${API_BASE_URL}/realtime/ws`, window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const pending: ChangeEvent[] = [];
    let flush: ReturnType<typeof setTimeout> | undefined;
    let warning: ReturnType<typeof setTimeout> | undefined;
    let fallback: ReturnType<typeof setInterval> | undefined;
    const stop = connectRealtime({
      url: url.toString(), token: getStoredAuthToken, refresh: async () => {
        await refreshSessionToken(api);
        await client.invalidateQueries({ queryKey: ['me'] });
      },
      onChange: event => {
        pending.push(event);
        if (!flush) flush = setTimeout(() => {
          flush = undefined;
          void invalidateChanges(client, pending.splice(0));
        }, 60);
      },
      onResync: () => { void resyncRealtimeQueries(client); },
      onState: state => {
        if (state === 'connected') {
          clearTimeout(warning); warning = undefined;
          clearInterval(fallback); fallback = undefined;
          toast.dismiss('realtime-connection');
        } else if (!warning) {
          warning = setTimeout(() => {
            toast.info('Reconectando actualizaciones en directo. Puedes seguir trabajando.', { id: 'realtime-connection', duration: Infinity });
            fallback = setInterval(() => { void resyncRealtimeQueries(client); }, 60_000);
          }, 8_000);
        }
      },
    });
    return () => {
      stop(); clearTimeout(flush); clearTimeout(warning); clearInterval(fallback);
      toast.dismiss('realtime-connection');
    };
  }, [owner, client]);
  return null;
}
