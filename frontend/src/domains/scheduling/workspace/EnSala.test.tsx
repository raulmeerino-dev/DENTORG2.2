import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EnSala from './EnSala';

const mocks = vi.hoisted(() => ({ start: vi.fn(), user: { id: 'user1', rol: 'doctor', doctor_id: 'doctor1' } }));
vi.mock('../../identity/session/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../../../api/scheduling', () => ({
  getJornadaConfig: async () => ({ espera_aviso_min: 10, espera_critica_min: 20 }),
  getCitas: async () => [
    { id: 'one', paciente_id: 'patient1', doctor_id: 'doctor1', estado: 'en_clinica', estado_operativo: 'en_sala', fecha_hora: new Date().toISOString(), llegada_at: new Date(Date.now() - 25 * 60_000).toISOString(), duracion_min: 30, paciente: { nombre: 'Ana', apellidos: 'Pérez' }, doctor: { nombre: 'Doctora Uno' }, gabinete_nombre: 'Gabinete 2' },
    { id: 'two', paciente_id: 'patient2', doctor_id: 'doctor2', estado: 'en_clinica', estado_operativo: 'en_sala', fecha_hora: new Date().toISOString(), llegada_at: null, duracion_min: 30, paciente: { nombre: 'Luis', apellidos: 'García' }, doctor: { nombre: 'Doctor Dos' } },
    { id: 'three', paciente_id: 'patient3', doctor_id: 'doctor1', estado: 'en_atencion', estado_operativo: 'en_atencion', fecha_hora: new Date().toISOString(), duracion_min: 30, paciente: { nombre: 'Ya en atención' } },
  ],
  iniciarAtencionCita: mocks.start,
}));
function Location() { const location = useLocation(); return <output aria-label="Ruta actual">{location.pathname}{location.search}</output>; }
function setup() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><EnSala /><Location /></MemoryRouter></QueryClientProvider>); }
describe('Global waiting room', () => {
  beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-21T10:00:00Z').getTime()); mocks.start.mockReset(); sessionStorage.clear(); });
  it('shows real waiting timestamps and filters without opening or mutating patients', async () => {
    const user = userEvent.setup(); setup();
    await user.click(await screen.findByRole('button', { name: 'En sala 1' }));
    const panel = screen.getByRole('dialog', { name: 'En sala' });
    expect(within(panel).getByText('Ana Pérez')).toBeVisible();
    expect(within(panel).getByText(/25 min esperando · espera prolongada/)).toBeVisible();
    expect(within(panel).getByText(/Gabinete 2/)).toBeVisible();
    expect(within(panel).queryByText('Luis García')).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Toda la clínica' }));
    expect(within(panel).getByText('Luis García')).toBeVisible();
    expect(within(panel).getByText('Llegada sin hora registrada')).toBeVisible();
    expect(within(panel).queryByText('Ya en atención')).not.toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent(/^\/$/);
  });
  it('opening the record leaves the operational state unchanged', async () => {
    const user = userEvent.setup(); setup();
    await user.click(await screen.findByRole('button', { name: 'En sala 1' }));
    await user.click(screen.getByRole('button', { name: 'Abrir ficha' }));
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/pacientes?paciente_id=patient1');
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it('starting attention persists before opening the clinical session', async () => {
    mocks.start.mockResolvedValue({ id: 'one', paciente_id: 'patient1' });
    const user = userEvent.setup(); setup();
    await user.click(await screen.findByRole('button', { name: 'En sala 1' }));
    await user.click(screen.getByRole('button', { name: 'Atender' }));
    expect(mocks.start).toHaveBeenCalledWith('one', expect.anything());
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/pacientes?paciente_id=patient1&tab=sesion&cita_id=one');
  });
});
