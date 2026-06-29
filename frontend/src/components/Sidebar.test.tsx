import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import MainNav from './Sidebar';

const authState = vi.hoisted(() => ({
  user: { id: 'user-1', nombre: 'Administrador', rol: 'admin' },
  logout: vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    logout: authState.logout,
  }),
}));

function renderMainNav() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MainNav />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MainNav', () => {
  it('shows the official admin launcher navigation without contextual modules', async () => {
    const user = userEvent.setup();
    authState.user = { id: 'user-1', nombre: 'Administrador', rol: 'admin' };

    renderMainNav();

    expect(screen.queryByRole('menuitem', { name: /Hoy/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /DentCore Clinic/i }));

    expect(screen.getByRole('menuitem', { name: /Hoy/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Agenda/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Pacientes/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Reportes\/Listados/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Administracion/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^WhatsApp\b/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Caja\b/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Portal paciente/i })).not.toBeInTheDocument();
  });

  it('shows reception launcher navigation with reports but without admin modules', async () => {
    const user = userEvent.setup();
    authState.user = { id: 'user-2', nombre: 'Recepcion', rol: 'recepcion' };

    renderMainNav();

    await user.click(screen.getByRole('button', { name: /DentCore Clinic/i }));

    expect(screen.getByRole('menuitem', { name: /Hoy/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Agenda/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Pacientes/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Reportes\/Listados/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^WhatsApp\b/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Caja\b/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Administracion/i })).not.toBeInTheDocument();
  });

  it('shows only the patient portal for patient users', async () => {
    const user = userEvent.setup();
    authState.user = { id: 'user-3', nombre: 'Paciente', rol: 'paciente' };

    renderMainNav();

    await user.click(screen.getByRole('button', { name: /DentCore Clinic/i }));

    expect(screen.getByRole('menuitem', { name: /Portal paciente/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Hoy/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Agenda/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^WhatsApp\b/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Pacientes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Caja\b/i })).not.toBeInTheDocument();
  });
});
