import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import MainNav from './MainNav';

const authState = vi.hoisted(() => ({ user: { id: 'user-1', nombre: 'Administrador', rol: 'admin' }, logout: vi.fn() }));
vi.mock('../../domains/identity/session/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../../api/identity', () => ({ getClinicas: async () => [{ id: 'clinic-1', nombre: 'Clínica de prueba' }] }));
vi.mock('../../domains/scheduling/workspace/EnSala', () => ({ default: () => <button>En sala</button> }));
vi.mock('../../domains/identity/components/StaffClockPopover', () => ({ default: () => null }));
vi.mock('../../domains/scheduling/components/DoctorNotificationsBell', () => ({ default: () => null }));
function renderNav(role: string, path = '/jornada') {
  authState.user = { id: 'user-1', nombre: 'Usuario', rol: role };
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><MainNav /></MemoryRouter></QueryClientProvider>);
}
describe('Persistent navigation', () => {
  it('shows the clinic and keeps the main workspaces in one navigation', async () => {
    renderNav('admin');
    expect(screen.getByRole('link', { name: 'Jornada' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Pacientes' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Caja' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Registros' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Archivos' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Administración' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ajustes' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Agenda' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    expect(await screen.findByText('Clínica de prueba')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Asistente' })).toBeVisible();
  });
  it('restricts reception and clinical navigation by role', () => {
    renderNav('doctor', '/jornada?vista=agenda');
    expect(screen.getByRole('link', { name: 'Jornada' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Pacientes' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Caja' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registros' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Archivos' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ajustes' })).not.toBeInTheDocument();
  });
  it('keeps patient portal separate from staff tools', () => {
    renderNav('paciente', '/mis-citas');
    expect(screen.getByRole('link', { name: 'Portal paciente' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Jornada' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'En sala' })).not.toBeInTheDocument();
  });
});
