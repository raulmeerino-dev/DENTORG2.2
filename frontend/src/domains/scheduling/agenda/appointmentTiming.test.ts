import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureClinicTimeZone } from '../../../shared/time/clinicTime';
import type { Cita } from '../../../api/types';
import { appointmentConflicts, appointmentTiming } from './appointmentTiming';
import { buildAgendaSlots, localAppointmentDate, localAppointmentTime, localDayRange, slotIso, todayIso } from './agendaTime';

const cita: Cita = { id: 'one', paciente_id: 'patient', doctor_id: 'doctor', gabinete_id: 'room', fecha_hora: '2026-09-21T09:00:00Z', duracion_min: 30, estado: 'en_atencion', estado_operativo: 'en_atencion', motivo: null, llegada_at: '2026-09-21T09:12:00Z', atencion_iniciada_at: '2026-09-21T09:20:00Z' };

describe('Tiempo y ocupación de Jornada', () => {
  afterEach(() => { vi.useRealTimers(); configureClinicTimeZone('Europe/Madrid'); });
  it('comparte día y rango de consulta con la zona de la clínica, incluyendo cambios de hora', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T22:15:00Z'));
    expect(todayIso()).toBe('2026-09-25');
    expect(localDayRange('2026-03-29')).toEqual({ fecha_desde: '2026-03-28T23:00:00.000Z', fecha_hasta: '2026-03-29T21:59:59.999Z' });
    configureClinicTimeZone('Atlantic/Canary');
    expect(todayIso()).toBe('2026-09-24');
    expect(slotIso('2026-09-25', '09:00')).toBe('2026-09-25T08:00:00.000Z');
  });
  it('muestra llegada tardía y sobretiempo desde inicio real, sin modificar citas', () => {
    expect(appointmentTiming(cita, new Date('2026-09-21T10:05:00Z'))).toEqual({ arrivalDelay: 12, overtime: 15, estimatedDelay: 0 });
    expect(cita.fecha_hora).toBe('2026-09-21T09:00:00Z');
  });

  it('estima impacto de un inicio tardío sobre el siguiente paciente antes de su hora', () => {
    const next = { ...cita, id: 'next', estado: 'confirmada', estado_operativo: 'confirmada' as const, fecha_hora: '2026-09-21T09:30:00Z', llegada_at: null };
    expect(appointmentTiming(next, new Date('2026-09-21T09:25:00Z'), [cita, next]).estimatedDelay).toBe(20);
    expect(appointmentTiming({ ...next, doctor_id: 'another' }, new Date('2026-09-21T09:25:00Z'), [cita, next]).estimatedDelay).toBe(0);
  });

  it('detecta solape de profesional o gabinete, excluye canceladas y límites adyacentes', () => {
    const sameRoom = { ...cita, id: 'same-room', doctor_id: 'other' };
    const cancelled = { ...cita, id: 'cancelled', estado_operativo: 'cancelada' as const };
    const adjacent = { ...cita, id: 'adjacent', fecha_hora: '2026-09-21T09:30:00Z' };
    expect(appointmentConflicts(cita, [cita, sameRoom, cancelled, adjacent]).map(item => item.id)).toEqual(['same-room']);
  });

  it('mantiene fecha y hora local a ambos lados de medianoche y del horario de verano', () => {
    for (const day of ['2026-03-29', '2026-09-21', '2026-10-25']) {
      const instant = slotIso(day, '00:30');
      expect(localAppointmentDate(instant)).toBe(day);
      expect(localAppointmentTime(instant)).toBe('00:30');
      const range = localDayRange(day);
      expect(new Date(instant).getTime()).toBeGreaterThanOrEqual(new Date(range.fecha_desde).getTime());
      expect(new Date(instant).getTime()).toBeLessThanOrEqual(new Date(range.fecha_hasta).getTime());
    }
  });

  it('no inventa huecos cuando no hay horario y conserva citas fuera de horario', () => {
    const base = { day: '2026-09-21', doctorId: '', doctores: [], horariosByDoctor: {} };
    expect(buildAgendaSlots({ ...base, citas: [] })).toEqual([]);
    expect(buildAgendaSlots({ ...base, citas: [cita] })).toEqual([localAppointmentTime(cita.fecha_hora)]);
  });
});
