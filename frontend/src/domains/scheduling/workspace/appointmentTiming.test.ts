import { describe, expect, it } from 'vitest';
import { appointmentTiming, elapsedMinutes } from './appointmentTiming';
import type { Cita } from '../../../api/types';

const cita = { fecha_hora: '2026-09-21T10:00:00+02:00', duracion_min: 30, llegada_at: '2026-09-21T08:12:00Z', atencion_iniciada_at: null, finalizada_at: null } as Cita;
describe('Appointment operational timing', () => {
  it('uses arrival timestamp and timezone offsets, not scheduled hour, for waiting', () => {
    expect(appointmentTiming(cita, Date.parse('2026-09-21T08:20:00Z'))).toEqual({ lateMinutes: 12, waitingMinutes: 8, overtimeMinutes: 0 });
  });
  it('freezes waiting on start and overtime on finalization', () => {
    expect(appointmentTiming({ ...cita, atencion_iniciada_at: '2026-09-21T08:22:00Z', finalizada_at: '2026-09-21T09:00:00Z' }, Date.parse('2026-09-21T10:00:00Z'))).toEqual({ lateMinutes: 12, waitingMinutes: 10, overtimeMinutes: 8 });
  });
  it('does not invent arrival for legacy or invalid timestamps', () => {
    expect(elapsedMinutes(null)).toBeNull(); expect(elapsedMinutes('invalid')).toBeNull();
    expect(elapsedMinutes('2026-09-22T10:00:00Z', Date.parse('2026-09-21T10:00:00Z'))).toBe(0);
  });
});
