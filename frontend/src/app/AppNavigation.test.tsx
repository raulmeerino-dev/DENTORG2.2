import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

const authState = vi.hoisted(() => ({
  user: { id: 'user-1', nombre: 'Administrador', rol: 'admin' },
}));

vi.mock('../domains/identity/session/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: authState.user,
  }),
}));

vi.mock('./shell/Layout', () => ({
  default: () => <Outlet />,
}));

vi.mock('../domains/scheduling/workspace/JornadaWorkspace', () => ({ default: function JornadaMock() { const location = useLocation(); return <div>Jornada workspace {location.search}</div>; } }));
vi.mock('../domains/scheduling/day', () => ({ default: () => <div>Hoy page</div> }));
vi.mock('../domains/patients', () => ({ default: () => <div>Pacientes page</div> }));
vi.mock('../domains/scheduling/agenda', () => ({ default: () => <div>Agenda page</div> }));
vi.mock('../domains/communications/whatsapp', () => ({ default: () => <div>WhatsApp page</div> }));
vi.mock('../domains/billing/cash-register', () => ({ default: () => <div>Caja page</div> }));
vi.mock('../domains/reporting', () => ({ default: () => <div>Listados page</div> }));
vi.mock('../domains/identity/LoginPage', () => ({ default: () => <div>Login page</div> }));
vi.mock('../domains/patient-portal/appointments', () => ({ default: () => <div>Mis citas page</div> }));
vi.mock('../domains/administration', () => ({
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
  it.each([['hoy', 'operativa'], ['agenda', 'agenda']])('migrates /%s preserving shared context', async (path, vista) => {
    authState.user = { id: 'user-1', nombre: 'Administrador', rol: 'admin' };
    window.history.pushState({}, '', `/${path}?fecha=2026-09-21&doctor_id=doc1&gabinete_id=g1&estado=en_sala&q=Ana&cita_id=c1`);
    render(<App />);
    await screen.findByText(/Jornada workspace/);
    const params = new URLSearchParams(window.location.search);
    expect(window.location.pathname).toBe('/jornada');
    expect(Object.fromEntries(params)).toEqual({ fecha: '2026-09-21', doctor_id: 'doc1', gabinete_id: 'g1', estado: 'en_sala', q: 'Ana', cita_id: 'c1', vista });
  });
  it('redirects dashboard to Admin reportes', async () => {
    authState.user = { id: 'user-1', nombre: 'Administrador', rol: 'admin' };
    window.history.pushState({}, '', '/dashboard');
    render(<App />);

    await waitFor(() => expect(screen.getByText(/Admin extras \?tab=reportes/i)).toBeInTheDocument());
  });

  it('redirects legacy configuracion tabs to unified Admin', async () => {
    authState.user = { id: 'user-1', nombre: 'Administrador', rol: 'admin' };
    window.history.pushState({}, '', '/configuracion?tab=tratamientos');
    render(<App />);

    await waitFor(() => expect(screen.getByText(/Admin extras \?tab=tratamientos/i)).toBeInTheDocument());
  });

  it('redirects patient users to their portal by default', async () => {
    authState.user = { id: 'patient-1', nombre: 'Paciente', rol: 'paciente' };
    window.history.pushState({}, '', '/');
    render(<App />);

    await waitFor(() => expect(screen.getByText(/Mis citas page/i)).toBeInTheDocument());
  });

  it('keeps patient users out of staff routes', async () => {
    authState.user = { id: 'patient-1', nombre: 'Paciente', rol: 'paciente' };
    window.history.pushState({}, '', '/hoy');
    render(<App />);

    await waitFor(() => expect(screen.getByText(/Mis citas page/i)).toBeInTheDocument());
  });

  it('opens the WhatsApp inbox for staff users', async () => {
    authState.user = { id: 'user-1', nombre: 'Administrador', rol: 'admin' };
    window.history.pushState({}, '', '/whatsapp');
    render(<App />);

    await waitFor(() => expect(screen.getByText(/WhatsApp page/i)).toBeInTheDocument());
  });

  it('renders protected lazy staff routes', async () => {
    authState.user = { id: 'user-1', nombre: 'Administrador', rol: 'admin' };
    window.history.pushState({}, '', '/pacientes');
    render(<App />);

    await waitFor(() => expect(screen.getByText(/Pacientes page/i)).toBeInTheDocument());
  });

  it('allows reception to use reports/listados for caja context', async () => {
    authState.user = { id: 'user-2', nombre: 'Recepcion', rol: 'recepcion' };
    window.history.pushState({}, '', '/listados');
    render(<App />);

    await waitFor(() => expect(screen.getByText(/Listados page/i)).toBeInTheDocument());
  });
});
