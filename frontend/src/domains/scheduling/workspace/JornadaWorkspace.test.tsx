import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCitas, getGabinetes } from '../../../api/scheduling';
import { getDoctores } from '../../../api/identity';
import { getTelefonear, getWhatsAppComunicaciones } from '../../../api/communications';
import { getCheckoutQueue, type PatientAccount } from '../../../api/accounts';
import type { Cita, Doctor, TelefonearPendiente } from '../../../api/types';
import { ToolbarSlot, ToolbarSlots } from '../../../design-system/ToolbarSlots';
import { addDaysIso, localDayRange, slotIso, todayIso } from '../agenda/agendaTime';
import JornadaWorkspace from './JornadaWorkspace';

vi.mock('../../../api/scheduling', () => ({
  getCitas: vi.fn(), getGabinetes: vi.fn(),
  confirmarCita: vi.fn(), iniciarAtencionCita: vi.fn(), marcarLlegadaCita: vi.fn(),
}));
vi.mock('../../../api/identity', () => ({ getDoctores: vi.fn() }));
vi.mock('../../../api/communications', () => ({
  getTelefonear: vi.fn(), getWhatsAppComunicaciones: vi.fn(), enviarRecordatorioCita: vi.fn(),
}));
vi.mock('../../../api/accounts', () => ({ getCheckoutQueue: vi.fn() }));
vi.mock('../../identity/session/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin', rol: 'admin' } }) }));
vi.mock('../day/JornadaActions', () => ({ JornadaActions: () => null }));
vi.mock('../agenda', () => ({ default: () => <div>Parrilla de Agenda</div> }));

const doctors: Doctor[] = [
  { id: 'a', nombre: 'Dra. Alba', activo: true, color_agenda: null },
  { id: 'b', nombre: 'Dr. Bruno', activo: true, color_agenda: null },
];
const today = todayIso();
const tomorrow = addDaysIso(today, 1);

function appointment(id: string, doctor: Doctor, estado: Cita['estado'], hour: string, day = today): Cita {
  return {
    id, paciente_id: id, doctor_id: doctor.id, gabinete_id: null, fecha_hora: slotIso(day, hour),
    estado, duracion_min: 30, es_urgencia: false, motivo: 'Revisión', observaciones: null,
    recordatorio_enviado: false, recordatorio_canal: null, recordatorio_estado: null,
    recordatorio_at: null, confirmado_at: null, motivo_cancelacion: null,
    paciente: { nombre: id, apellidos: 'Prueba', telefono: null }, doctor,
  };
}
const appointments = [
  appointment('Alba sala', doctors[0], 'en_clinica', '09:00'),
  appointment('Alba programada', doctors[0], 'programada', '10:00'),
  appointment('Alba cambio', doctors[0], 'reschedule_requested', '11:00'),
  appointment('Bruno sala', doctors[1], 'en_clinica', '08:00'),
  appointment('Bruno finalizada', doctors[1], 'atendida', '12:00'),
];
const tomorrowAppointments = [
  appointment('Alba mañana', doctors[0], 'confirmada', '09:00', tomorrow),
  appointment('Bruno mañana', doctors[1], 'programada', '10:00', tomorrow),
];
const calls: TelefonearPendiente[] = doctors.map(doctor => ({
  id: `call-${doctor.id}`, cita_original_id: `original-${doctor.id}`, paciente_id: `call-${doctor.id}`,
  doctor_id: doctor.id, nueva_cita_id: null, doctor, reubicada: false, motivo: 'Reubicar',
  paciente: { nombre: `Llamada ${doctor.nombre}`, apellidos: 'Prueba', telefono: null },
}));
const accounts: PatientAccount[] = doctors.map(doctor => ({
  paciente_id: `checkout-${doctor.id}`, paciente_nombre: `Salida ${doctor.nombre}`, version: '1',
  cargos: [], movimientos: [], total_cargos: '0', total_cobrado: '0', pendiente_cargos: '0',
  saldo_favor: '0', saldo: '0', realizado_hoy: '0', saldo_anterior: '0', sin_valorar: 0,
  cita_id: `checkout-${doctor.id}`, doctor_id: doctor.id, gabinete_id: null, pendiente_salida: true,
}));

function LocationProbe() {
  return <output aria-label="URL de Jornada">{useLocation().search}</output>;
}
function renderJornada(path = '/jornada') {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}>
      <ToolbarSlots><header aria-label="Cabecera de Jornada"><h1>Jornada</h1><ToolbarSlot name="module" /></header><main><JornadaWorkspace /></main></ToolbarSlots>
      <LocationProbe />
    </MemoryRouter>
  </QueryClientProvider>);
}
function summary() { return within(screen.getByLabelText('Resumen operativo de hoy')); }
function table() { return screen.getByRole('table'); }
function count(label: string, value: number) {
  expect(summary().getByText(label).closest('button')?.querySelector('strong')).toHaveTextContent(String(value));
}
async function chooseDoctor(value: string) {
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Profesional de Jornada' }), value);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDoctores).mockResolvedValue(doctors);
  vi.mocked(getGabinetes).mockResolvedValue([]);
  vi.mocked(getTelefonear).mockResolvedValue(calls);
  vi.mocked(getWhatsAppComunicaciones).mockResolvedValue([]);
  vi.mocked(getCheckoutQueue).mockResolvedValue(accounts);
  vi.mocked(getCitas).mockImplementation(async params => params.fecha_desde === localDayRange(today).fecha_desde
    ? appointments : params.fecha_desde === localDayRange(tomorrow).fecha_desde ? tomorrowAppointments : []);
});

describe('Cabecera y filtro de profesional de Jornada', () => {
  it('muestra un único selector en la cabecera, sin pestañas duplicadas ni filtro profesional en el popover', async () => {
    renderJornada();
    const header = within(screen.getByRole('banner', { name: 'Cabecera de Jornada' }));
    expect(header.getByRole('heading', { name: 'Jornada' })).toBeVisible();
    expect(header.getByRole('button', { name: 'Hoy' })).toBeVisible();
    expect(header.getByRole('combobox', { name: 'Profesional de Jornada' })).toHaveValue('');
    expect(header.queryByRole('navigation', { name: 'Perspectiva de Jornada' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Filtros/ }));
    expect(screen.getAllByRole('combobox', { name: 'Profesional de Jornada' })).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'Estado de Jornada' })).toBeVisible();
  });

  it('filtra todas las citas, contadores, próxima acción, llamadas y salidas al alternar profesionales y Todos', async () => {
    renderJornada();
    await screen.findByRole('button', { name: 'Prueba, Alba sala' });
    count('Sin confirmar', 2); count('En clínica', 2); count('Cambios', 1); count('Telefonear', 2);
    expect(screen.getByLabelText('Prioridades de hoy')).toHaveTextContent('08:00 · Prueba, Bruno sala');
    expect(within(table()).getAllByRole('row')).toHaveLength(6);
    for (const value of ['a', 'b', 'a', 'b', '']) {
      await chooseDoctor(value);
      const expected = value === 'a' ? [2, 1, 1, 1] : value === 'b' ? [0, 1, 0, 1] : [2, 2, 1, 2];
      ['Sin confirmar', 'En clínica', 'Cambios', 'Telefonear'].forEach((label, i) => count(label, expected[i]));
      expect(within(table()).getAllByRole('row')).toHaveLength(value === 'a' ? 4 : value === 'b' ? 3 : 6);
      expect(screen.getByLabelText('Prioridades de hoy')).toHaveTextContent(value === 'a' ? '09:00 · Prueba, Alba sala' : '08:00 · Prueba, Bruno sala');
      const work = screen.getByLabelText('Trabajo operativo de hoy');
      const checkout = screen.getByLabelText('Pendiente de salida');
      for (const doctor of doctors) {
        const visible = !value || value === doctor.id;
        expect(work.textContent?.includes(`Llamada ${doctor.nombre}`)).toBe(visible);
        expect(checkout.textContent?.includes(`Salida ${doctor.nombre}`)).toBe(visible);
      }
      if (value) expect(table()).not.toHaveTextContent(value === 'a' ? 'Bruno' : 'Alba');
    }
  });

  it('mantiene el profesional al avanzar, retroceder, elegir fecha y volver a Hoy; filtra también la siguiente llamada en días vacíos', async () => {
    renderJornada();
    await screen.findByRole('option', { name: 'Dra. Alba' });
    await chooseDoctor('a');
    await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
    await screen.findByRole('button', { name: 'Prueba, Alba mañana' });
    expect(screen.getByRole('combobox', { name: 'Profesional de Jornada' })).toHaveValue('a');
    expect(table()).not.toHaveTextContent('Bruno');
    count('Sin confirmar', 0); count('En clínica', 0); count('Cambios', 0);
    await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    await screen.findByRole('button', { name: 'Prueba, Alba sala' });
    await userEvent.click(screen.getByRole('button', { name: 'Elegir fecha de Agenda' }));
    const emptyDay = `${today.slice(0, 8)}${Number(today.slice(-2)) <= 15 ? '25' : '05'}`;
    await userEvent.click(screen.getByRole('button', { name: new Date(`${emptyDay}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) }));
    await waitFor(() => expect(table()).toHaveTextContent('No hay citas activas con estos filtros'));
    expect(screen.getByLabelText('Prioridades de hoy')).toHaveTextContent('Llamar · Prueba, Llamada Dra. Alba');
    await chooseDoctor('b');
    expect(screen.getByLabelText('Prioridades de hoy')).toHaveTextContent('Llamar · Prueba, Llamada Dr. Bruno');
    await userEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    await screen.findByRole('button', { name: 'Prueba, Bruno sala' });
    expect(screen.getByRole('combobox', { name: 'Profesional de Jornada' })).toHaveValue('b');
    expect(screen.getByLabelText('URL de Jornada')).toHaveTextContent(`fecha=${today}`);
    expect(screen.getByLabelText('URL de Jornada')).toHaveTextContent('doctor_id=b');
  });

  it('restaura el profesional desde la URL y mantiene intactos los controles propios de Agenda', async () => {
    const view = renderJornada(`/jornada?doctor_id=b&fecha=${today}`);
    await screen.findByRole('button', { name: 'Prueba, Bruno sala' });
    expect(screen.getByRole('combobox', { name: 'Profesional de Jornada' })).toHaveValue('b');
    expect(table()).not.toHaveTextContent('Alba');
    view.unmount();
    renderJornada(`/jornada?vista=agenda&doctor_id=b&fecha=${today}`);
    await screen.findByText('Parrilla de Agenda');
    expect(screen.getByRole('combobox', { name: 'Profesional de Agenda' })).toHaveValue('b');
    expect(screen.queryByRole('combobox', { name: 'Profesional de Jornada' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Perspectiva de Jornada' })).not.toBeInTheDocument();
  });
});
