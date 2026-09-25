import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Cita, Doctor } from '../../../api/types';
import { AgendaResourceGrid } from './AgendaResourceGrid';
import { slotIso, weekdayIndex } from './agendaTime';

const day = '2026-09-21';
const doctores: Doctor[] = [
  { id: 'one', nombre: 'Dra. Elena Ruiz', especialidad: null, color_agenda: '#2463ad', activo: true },
  { id: 'two', nombre: 'Dr. Manuel Díaz', especialidad: null, color_agenda: '#734aaa', activo: true },
];
const cita: Cita = { id: 'visit', paciente_id: 'patient', doctor_id: 'one', gabinete_id: 'room', gabinete_nombre: 'Gabinete 2', fecha_hora: slotIso(day, '09:15'), duracion_min: 30, estado: 'confirmada', motivo: 'Revisión', paciente: { nombre: 'María', apellidos: 'Fernández', telefono: null } };

function setup() {
  const onCreate = vi.fn(); const onOpenCita = vi.fn(); const onAction = vi.fn();
  const view = render(<AgendaResourceGrid day={day} slots={['09:00', '09:15', '09:20', '09:30', '09:45']} doctorId="" doctores={doctores}
    horarios={Object.fromEntries(doctores.map(doctor => [doctor.id, [{ id: doctor.id, doctor_id: doctor.id, dia_semana: weekdayIndex(day), tipo_dia: 'laborable', bloques: [{ inicio: '09:00', fin: '10:00' }], intervalo_min: 10 }]]))}
    citas={[cita]} allCitas={[cita]} now={new Date(slotIso(day, '09:00'))} canTreat={() => true} busy={false}
    onCreate={onCreate} onOpenCita={onOpenCita} onOpenPatient={vi.fn()} onConfirm={vi.fn()} onAction={onAction} onContext={vi.fn()} />);
  return { ...view, onCreate, onOpenCita, onAction, user: userEvent.setup() };
}

describe('Parrilla por profesional', () => {
  it('mantiene ocupada toda la duración de una cita que empieza fuera del intervalo habitual', () => {
    const { container } = setup();
    expect(screen.getByText('María Fernández')).toBeInTheDocument();
    expect(screen.getByText('Gabinete 2')).toBeInTheDocument();
    const busy = container.querySelector('[data-doctor-id="one"][data-slot="09:20"]') as HTMLElement;
    expect(busy).toHaveAttribute('data-occupied', 'true');
    expect(screen.getByRole('article', { name: /Cita de María Fernández, 09:15/ })).toHaveAttribute('title', expect.stringContaining('09:15–09:45'));
    expect(within(busy).queryByRole('button', { name: /Nueva cita/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva cita 09:20 · Dr. Manuel Díaz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva cita 09:45 · Dra. Elena Ruiz' })).toBeInTheDocument();
  });

  it('envía doctor y hora de la columna elegida al crear cita', async () => {
    const { user, onCreate } = setup();
    await user.click(screen.getByRole('button', { name: 'Nueva cita 09:20 · Dr. Manuel Díaz' }));
    expect(onCreate).toHaveBeenCalledWith({ day, slot: '09:20', doctorId: 'two' });
  });

  it('registrar llegada ejecuta solo la transición y nunca abre una pantalla', async () => {
    const { user, onAction, onOpenCita } = setup();
    await user.click(screen.getByRole('button', { name: 'Llegada' }));
    expect(onAction).toHaveBeenCalledWith(cita, 'llegada');
    expect(onOpenCita).not.toHaveBeenCalled();
  });

  it('arrastra un tramo libre y conserva su duración y profesional', async () => {
    const { user, onCreate } = setup();
    const start = screen.getByRole('button', { name: 'Nueva cita 09:00 · Dr. Manuel Díaz' });
    const end = screen.getByRole('button', { name: 'Nueva cita 09:20 · Dr. Manuel Díaz' });
    await user.pointer([{ target: start, keys: '[MouseLeft>]' }, { target: end }, { keys: '[/MouseLeft]' }]);
    expect(onCreate).toHaveBeenCalledExactlyOnceWith({ day, slot: '09:00', doctorId: 'two', duration: 30 });
  });

  it('no crea un tramo que atraviesa una cita existente', async () => {
    const { user, onCreate } = setup();
    await user.pointer([
      { target: screen.getByRole('button', { name: 'Nueva cita 09:00 · Dra. Elena Ruiz' }), keys: '[MouseLeft>]' },
      { target: screen.getByRole('button', { name: 'Nueva cita 09:50 · Dra. Elena Ruiz' }) },
      { keys: '[/MouseLeft]' },
    ]);
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('contiene una cita');
  });
});
