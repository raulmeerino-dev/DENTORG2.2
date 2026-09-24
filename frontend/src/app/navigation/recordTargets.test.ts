import { describe, expect, it } from 'vitest';
import { recordTargetHref, recordsReturnPath } from './recordTargets';

describe('canonical record navigation', () => {
  it('opens the original appointment on its date and preserves patient targets', () => {
    const href = recordTargetHref({ kind: 'cita', id: 'appointment', date: '2026-04-02', doctor_id: 'doctor' });
    const query = new URL(href!, 'http://localhost').searchParams;
    expect(query.get('fecha')).toBe('2026-04-02');
    expect(query.get('cita_id')).toBe('appointment');
    expect(query.get('doctor_id')).toBe('doctor');
    expect(recordTargetHref({ kind: 'plan', id: 'budget', patient_id: 'patient' })).toBe('/pacientes?paciente_id=patient&tab=presupuestos&presupuesto_id=budget');
    expect(recordTargetHref({ kind: 'documento', id: 'file', patient_id: 'patient' })).toBe('/pacientes/patient/archivo/documento/file');
  });

  it('rejects unknown target types and unsafe return locations', () => {
    expect(recordTargetHref({ kind: 'https://other.example', id: 'x', patient_id: 'y' })).toBeNull();
    expect(recordTargetHref({ kind: 'documento', id: 'x' })).toBeNull();
    for (const returnTo of ['//external.example', '/pacientes', '/registros-unsafe', 'javascript:alert(1)']) {
      expect(recordsReturnPath({ returnTo })).toBeNull();
    }
    expect(recordsReturnPath({ returnTo: '/registros?q=ana&offset=50&sort_dir=asc' })).toBe('/registros?q=ana&offset=50&sort_dir=asc');
    expect(recordsReturnPath({ returnTo: '/archivos?tipo=informe' })).toBe('/archivos?tipo=informe');
  });
});
