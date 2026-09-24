import { describe, expect, it } from 'vitest';
import { nextPatientAppointment, patientAppointmentLabel } from './patientContext';

describe('Patient appointment context', () => {
  it('excludes cancelled visits and orders instants with different UTC offsets', () => {
    const cancelled = { fecha_hora: '2026-09-25T07:00:00Z', estado: 'programada', estado_operativo: 'cancelada' as const, observaciones: null };
    const first = { fecha_hora: '2026-09-25T10:00:00+02:00', estado: 'confirmada', observaciones: null };
    const later = { fecha_hora: '2026-09-25T09:00:00Z', estado: 'programada', observaciones: null };
    expect(nextPatientAppointment([later, cancelled, first], Date.parse('2026-09-25T06:00:00Z'))).toBe(first);
  });
  it('shows the clinic date and time across midnight in UTC', () => {
    expect(patientAppointmentLabel('2026-09-24T23:30:00Z')).toBe('25-09-26 · 01:30');
  });
});
