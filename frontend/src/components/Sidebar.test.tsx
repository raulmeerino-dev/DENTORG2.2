import { render, screen } from '@testing-library/react';
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

describe('MainNav', () => {
  it('shows the complete admin navigation', () => {
    authState.user = { id: 'user-1', nombre: 'Administrador', rol: 'admin' };

    render(
      <MemoryRouter>
        <MainNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Hoy/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Agenda/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /WhatsApp/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pacientes/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Caja/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Reportes\/Listados/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Administracion/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Portal paciente/i })).not.toBeInTheDocument();
  });

  it('shows reception navigation without admin modules', () => {
    authState.user = { id: 'user-2', nombre: 'Recepcion', rol: 'recepcion' };

    render(
      <MemoryRouter>
        <MainNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Hoy/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Agenda/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /WhatsApp/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pacientes/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Caja/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Reportes\/Listados/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Administracion/i })).not.toBeInTheDocument();
  });

  it('shows only the patient portal for patient users', () => {
    authState.user = { id: 'user-3', nombre: 'Paciente', rol: 'paciente' };

    render(
      <MemoryRouter>
        <MainNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Portal paciente/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Hoy/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Agenda/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /WhatsApp/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Pacientes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Caja/i })).not.toBeInTheDocument();
  });
});
