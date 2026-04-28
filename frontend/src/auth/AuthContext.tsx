import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clearStoredAuthToken, getMe, getStoredAuthToken, login as loginRequest, logout as logoutRequest } from '../lib/api';
import type { UsuarioMe } from '../types/api';

interface AuthContextValue {
  user: UsuarioMe | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState(() => Boolean(getStoredAuthToken()));
  const { data, isLoading } = useQuery({
    queryKey: ['me', hasToken],
    queryFn: getMe,
    enabled: hasToken,
    retry: false,
  });

  const value = useMemo<AuthContextValue>(() => ({
    user: data ?? null,
    isLoading,
    isAuthenticated: Boolean(data),
    login: async (username, password) => {
      await loginRequest(username, password);
      setHasToken(true);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    logout: async () => {
      await logoutRequest();
      clearStoredAuthToken();
      setHasToken(false);
      queryClient.clear();
    },
  }), [data, isLoading, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
