import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clearStoredAuthToken,
  getMe,
  getStoredAuthToken,
  login as loginRequest,
  logout as logoutRequest,
  refreshAuthToken,
  subscribeToSessionExpiration,
} from '../lib/api';
import type { UsuarioMe } from '../types/api';
import { clearSessionDrafts, setSessionDraftOwner } from './sessionDrafts';

interface AuthContextValue {
  user: UsuarioMe | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string, otp?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState(() => Boolean(getStoredAuthToken()));
  const [isBootstrapping, setIsBootstrapping] = useState(() => !getStoredAuthToken());

  useEffect(() => subscribeToSessionExpiration(() => {
    setHasToken(false);
    setSessionDraftOwner(null);
    void queryClient.cancelQueries();
    queryClient.clear();
  }), [queryClient]);

  useEffect(() => {
    let cancelled = false;
    if (getStoredAuthToken()) {
      return () => {
        cancelled = true;
      };
    }

    refreshAuthToken()
      .then(() => {
        if (!cancelled) setHasToken(true);
      })
      .catch(() => {
        if (!cancelled && !getStoredAuthToken()) setHasToken(false);
      })
      .finally(() => {
        if (!cancelled) setIsBootstrapping(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['me', hasToken],
    queryFn: async () => {
      const user = await getMe();
      setSessionDraftOwner(user);
      return user;
    },
    enabled: hasToken && !isBootstrapping,
    retry: false,
  });

  const value = useMemo<AuthContextValue>(() => ({
    user: hasToken ? data ?? null : null,
    isLoading: isBootstrapping || isLoading,
    isAuthenticated: hasToken && Boolean(data),
    login: async (username, password, otp) => {
      await loginRequest(username, password, otp);
      setHasToken(true);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    logout: async () => {
      clearStoredAuthToken();
      setHasToken(false);
      clearSessionDrafts();
      void queryClient.cancelQueries();
      queryClient.clear();
      await logoutRequest();
    },
  }), [data, hasToken, isBootstrapping, isLoading, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
