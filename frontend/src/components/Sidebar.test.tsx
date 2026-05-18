import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import MainNav from './Sidebar';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', nombre: 'Administrador', rol: 'admin' },
    logout: vi.fn(),
  }),
}));

describe('MainNav', () => {
  it('shows only the main operational sections without Reportes', () => {
    render(
      <MemoryRouter>
        <MainNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Hoy/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pacientes/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Agenda/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Caja/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Admin/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Reportes/i })).not.toBeInTheDocument();
  });
});
