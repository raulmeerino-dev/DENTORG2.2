import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { ApiPaciente, Cita, TratamientoCatalogo } from '../../../api/types';
import { CitaModal } from './CitaModal';
import { localDayRange, slotIso } from './agendaTime';

const mocks = vi.hoisted(() => ({ getCitas: vi.fn(), getWhatsAppComunicaciones: vi.fn() }));
vi.mock('../../../api/scheduling', () => ({ getCitas: mocks.getCitas }));
vi.mock('../../../api/communications', () => ({ getWhatsAppComunicaciones: mocks.getWhatsAppComunicaciones }));

const paciente = { id: 'patient-1', nombre: 'Ana', apellidos: 'García', num_historial: 42, telefono: null } as ApiPaciente;
const doctor = { id: 'doctor-1', nombre: 'Dra. Ruiz', especialidad: null, color_agenda: null, activo: true };
const treatment = { id: 'treatment-1', nombre: 'Revisión', duracion_habitual_min: 15, activo: true } as TratamientoCatalogo;
const cita: Cita = { id: 'appointment-1', paciente_id: paciente.id, doctor_id: doctor.id, gabinete_id: null, fecha_hora: slotIso('2026-09-21', '09:00'), duracion_min: 30, estado: 'programada', motivo: 'Revisión', paciente };

function setup(props: Partial<ComponentProps<typeof CitaModal>> = {}) {
  const onSubmit = vi.fn();
  const onCreateTemporaryPaciente = vi.fn().mockResolvedValue({ ...paciente, id: 'provisional-1', nombre: 'Lucía', apellidos: '' });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <CitaModal cita={null} draft={{ day: '2026-09-21', slot: '09:00', doctorId: doctor.id, pacienteId: paciente.id }} pacientes={[paciente]} doctores={[doctor]} tratamientos={[treatment]} onClose={vi.fn()} onSubmit={onSubmit} onCreateTemporaryPaciente={onCreateTemporaryPaciente} {...props} />
  </QueryClientProvider>);
  return { onSubmit, onCreateTemporaryPaciente, user: userEvent.setup() };
}

beforeEach(() => {
  sessionStorage.clear();
  mocks.getCitas.mockReset().mockResolvedValue([]);
  mocks.getWhatsAppComunicaciones.mockReset().mockResolvedValue([]);
});

describe('Cita: contexto y disponibilidad', () => {
  it('conserva fecha, hora local, doctor y duración del hueco sin volver a preguntarlos', async () => {
    const { onSubmit, user } = setup({ defaultDuration: 20, draft: { day: '2026-09-21', slot: '00:30', doctorId: doctor.id, pacienteId: paciente.id, duration: 45 } });
    expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Profesional')).not.toBeInTheDocument();
    expect(screen.getByText(/00:30–01:15/)).toBeInTheDocument();
    expect(screen.getByLabelText('Duración (minutos)')).toHaveValue(45);
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ fecha_hora: slotIso('2026-09-21', '00:30'), duracion_min: 45, doctor_id: doctor.id }));
  });

  it('propone duración habitual y respeta una modificación manual', async () => {
    const { user } = setup({ defaultDuration: 20 });
    const duration = screen.getByLabelText('Duración (minutos)');
    expect(duration).toHaveValue(20);
    await user.type(screen.getByLabelText('Tratamiento previsto'), 'Revisión');
    expect(duration).toHaveValue(15);
    fireEvent.change(duration, { target: { value: '45' } });
    await user.clear(screen.getByLabelText('Tratamiento previsto'));
    expect(duration).toHaveValue(45);
  });

  it('exige urgencia, autorización y motivo antes de guardar un solape', async () => {
    mocks.getCitas.mockResolvedValue([cita]);
    const { user, onSubmit } = setup();
    await screen.findByText('Solape con 1 cita');
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }));
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText('Urgencia'));
    await user.click(screen.getByLabelText('Autorizar solape de urgencia'));
    await user.type(screen.getByLabelText('Motivo del solape'), 'Urgencia con dolor; recepción ha coordinado el gabinete.');
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ es_urgencia: true, motivo_solape: 'Urgencia con dolor; recepción ha coordinado el gabinete.' }));
  });

  it('crea un paciente provisional sin exigir teléfono ni inventar datos', async () => {
    const { user, onCreateTemporaryPaciente, onSubmit } = setup({ draft: { day: '2026-09-21', slot: '09:00', doctorId: doctor.id } });
    await user.click(screen.getByRole('button', { name: 'Crear paciente provisional' }));
    await user.type(screen.getByLabelText('Nombre del paciente provisional'), 'Lucía');
    await user.click(screen.getByRole('button', { name: 'Apuntar' }));
    await waitFor(() => expect(onCreateTemporaryPaciente).toHaveBeenCalledWith({ nombreCompleto: 'Lucía', telefono: '' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ paciente_id: 'provisional-1' }));
  });

  it('conserva el estado de atención y bloquea modificar su horario', async () => {
    const { user, onSubmit } = setup({ cita: { ...cita, estado: 'en_atencion', estado_operativo: 'en_atencion' }, draft: null });
    expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Duración (minutos)')).toBeDisabled();
    expect(screen.getByText('Paciente en clínica: Sí')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Observaciones de la cita/tratamiento'), 'Información de recepción');
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ estado: 'en_atencion', observaciones: 'Información de recepción' }));
  });

  it('consulta los conflictos del nuevo día al editar la fecha', async () => {
    mocks.getCitas.mockImplementation(async (range: { fecha_desde: string }) => range.fecha_desde === localDayRange('2026-09-22').fecha_desde ? [{ ...cita, fecha_hora: slotIso('2026-09-22', '09:00') }] : []);
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole('button', { name: 'Cambiar horario' }));
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-22' } });
    await screen.findByText('Solape con 1 cita');
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
