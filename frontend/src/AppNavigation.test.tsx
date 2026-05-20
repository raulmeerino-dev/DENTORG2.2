import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'user-1', nombre: 'Administrador', rol: 'admin' },
  }),
}));

vi.mock('./components/Layout', () => ({
  default: () => <Outlet />,
}));

vi.mock('./modules/hoy', () => ({ default: () => <div>Hoy page</div> }));
vi.mock('./modules/pacientes', () => ({ default: () => <div>Pacientes page</div> }));
vi.mock('./modules/agenda', () => ({ default: () => <div>Agenda page</div> }));
vi.mock('./modules/caja', () => ({ default: () => <div>Caja page</div> }));
vi.mock('./modules/listados', () => ({ default: () => <div>Listados page</div> }));
vi.mock('./modules/auth/LoginPage', () => ({ default: () => <div>Login page</div> }));
vi.mock('./modules/misCitas', () => ({ default: () => <div>Mis citas page</div> }));
vi.mock('./modules/adminExtras', () => ({
  default: function AdminExtrasMock() {
    const location = useLocation();
    return <div>Admin extras {location.search}</div>;
  },
}));
vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('App navigation', () => {
  it('redirects dashboard to Admin reportes', async () => {
    window.history.pushState({}, '', '/dashboard');
    render(<App />);

    await waitFor(() => expect(screen.getByText(/Admin extras \?tab=reportes/i)).toBeInTheDocument());
  });

  it('redirects legacy configuracion tabs to unified Admin', async () => {
    window.history.pushState({}, '', '/configuracion?tab=tratamientos');
    render(<App />);

    await waitFor(() => expect(screen.getByText(/Admin extras \?tab=tratamientos/i)).toBeInTheDocument());
  });
});
