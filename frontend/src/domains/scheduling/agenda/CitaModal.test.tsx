import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { ApiPaciente, Cita, TratamientoCatalogo } from '../../../api/types';
import { CitaModal } from './CitaModal';
import { localDayRange, slotIso } from './agendaTime';

const mocks = vi.hoisted(() => ({ getCitas: vi.fn(), getWhatsAppComunicaciones: vi.fn(), getPacientes: vi.fn(), getPaciente: vi.fn() }));
vi.mock('../../../api/scheduling', () => ({ getCitas: mocks.getCitas }));
vi.mock('../../../api/communications', () => ({ getWhatsAppComunicaciones: mocks.getWhatsAppComunicaciones }));
vi.mock('../../../api/patients', () => ({ getPacientes: mocks.getPacientes, getPaciente: mocks.getPaciente }));

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
  mocks.getPacientes.mockReset().mockResolvedValue([]);
  mocks.getPaciente.mockReset().mockResolvedValue(null);
});

describe('Cita: contexto y disponibilidad', () => {
  it('un hueco nuevo no adopta silenciosamente al último paciente de otra pantalla', () => {
    sessionStorage.setItem('dentcore_selected_patient_id', 'unrelated-patient');
    setup({ draft: { day: '2026-09-21', slot: '10:00', doctorId: doctor.id, duration: 40 } });
    expect(screen.getByLabelText('Buscar paciente')).toBeInTheDocument();
    expect(screen.getByLabelText('Duración (minutos)')).toHaveValue(40);
    expect(mocks.getPaciente).not.toHaveBeenCalledWith('unrelated-patient');
    expect(screen.getByText(/10:00–10:40/)).toBeInTheDocument();
  });
  it('busca pacientes fuera de la primera página y permite citarlos', async () => {
    const remoto = { ...paciente, id: 'patient-remote', nombre: 'Beatriz', num_historial: 501 };
    mocks.getPacientes.mockResolvedValue([remoto]);
    mocks.getPaciente.mockResolvedValue(remoto);
    const { user, onSubmit } = setup({ draft: { day: '2026-09-21', slot: '09:00', doctorId: doctor.id } });
    await user.type(screen.getByLabelText('Buscar paciente'), 'Beatriz');
    await screen.findByRole('option', { name: /501 - García, Beatriz/ });
    expect(mocks.getPacientes).toHaveBeenCalledWith({ q: 'Beatriz', limit: 50 });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Paciente' }), remoto.id);
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ paciente_id: remoto.id }));
  });

  it('carga el paciente del contexto aunque no esté en la primera página', async () => {
    const remoto = { ...paciente, id: 'patient-remote', nombre: 'Beatriz', num_historial: 501 };
    mocks.getPaciente.mockResolvedValue(remoto);
    const { user, onSubmit } = setup({ draft: { day: '2026-09-21', slot: '09:00', doctorId: doctor.id, pacienteId: remoto.id } });
    await screen.findByText('Beatriz García');
    expect(mocks.getPaciente).toHaveBeenCalledWith(remoto.id);
    expect(screen.queryByLabelText('Buscar paciente')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ paciente_id: remoto.id }));
  });

  it('muestra el error de búsqueda remota sin fingir que no existen coincidencias', async () => {
    mocks.getPacientes.mockRejectedValue(new Error('Sin conexión'));
    const { user } = setup({ draft: { day: '2026-09-21', slot: '09:00', doctorId: doctor.id } });
    await user.type(screen.getByLabelText('Buscar paciente'), 'Beatriz');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se ha podido completar la búsqueda');
    expect(screen.queryByText(/No hay coincidencias/)).not.toBeInTheDocument();
  });

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
    await user.click(screen.getByRole('button', { name: 'Nuevo paciente' }));
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

  it('rechaza una hora inexistente por cambio de horario sin cerrar el formulario', async () => {
    const { user, onSubmit } = setup({ draft: { day: '2026-03-29', slot: '01:30', doctorId: doctor.id, pacienteId: paciente.id } });
    await user.click(screen.getByRole('button', { name: 'Cambiar horario' }));
    fireEvent.change(screen.getByLabelText('Hora inicio'), { target: { value: '02:30' } });
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('no existe en la zona horaria');
    expect(screen.getByRole('button', { name: 'Guardar cita' })).toBeVisible();
  });

  it('permite corregir un hueco inicial que no existe por cambio de horario', async () => {
    const { user, onSubmit } = setup({ draft: { day: '2026-03-29', slot: '02:30', doctorId: doctor.id, pacienteId: paciente.id } });
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('no existe en la zona horaria');
    await user.click(screen.getByRole('button', { name: 'Cambiar horario' }));
    fireEvent.change(screen.getByLabelText('Hora inicio'), { target: { value: '03:30' } });
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ fecha_hora: '2026-03-29T01:30:00.000Z' }));
  });

  it.each(['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z'])('conserva el instante %s al editar una observación durante la hora repetida', async fechaHora => {
    const { user, onSubmit } = setup({ cita: { ...cita, fecha_hora: fechaHora }, draft: null });
    expect(screen.getByLabelText('Hora inicio')).toHaveValue('02:30');
    await user.type(screen.getByLabelText('Observaciones de la cita/tratamiento'), 'Confirmado');
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ fecha_hora: fechaHora, observaciones: 'Confirmado' }));
  });
});
