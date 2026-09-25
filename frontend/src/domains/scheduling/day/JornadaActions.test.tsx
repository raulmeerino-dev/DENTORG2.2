import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { JornadaActions } from './JornadaActions';

vi.mock('../../../api/patients', () => ({ getPacientes: vi.fn(async () => [{ id: 'found-901', nombre: 'Ana', apellidos: 'Remota', num_historial: 901, telefono: '600000000' }]) }));
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
function show(canManageBilling = true) {
  const reminders = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/jornada']}><JornadaActions canManageBilling={canManageBilling} replies={3} onReminders={reminders} /><Location /></MemoryRouter></QueryClientProvider>);
  return reminders;
}
describe('JornadaActions', () => {
  it('abre el paciente encontrado por la API y mantiene recordatorios accesible', async () => {
    const user = userEvent.setup(); const reminders = show();
    await user.click(screen.getByRole('button', { name: 'Enviar recordatorios por WhatsApp' }));
    expect(reminders).toHaveBeenCalledOnce();
    await user.type(screen.getByRole('textbox', { name: 'Buscar paciente' }), 'Remota');
    await user.click(await screen.findByRole('button', { name: /Remota, Ana/ }));
    expect(screen.getByRole('status')).toHaveTextContent('/pacientes?paciente_id=found-901');
  });
  it('conserva los permisos económicos y la preparación de nueva ficha', async () => {
    const user = userEvent.setup(); show(false);
    await user.click(screen.getByRole('button', { name: 'Más acciones' }));
    expect(screen.queryByRole('menuitem', { name: 'Cobros' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Respuestas (3)' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Nueva ficha' }));
    expect(sessionStorage.getItem('dentcore_patient_action')).toBe('new');
    expect(screen.getByRole('status')).toHaveTextContent('/pacientes');
  });
});
