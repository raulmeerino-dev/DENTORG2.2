import { afterEach, describe, expect, it } from 'vitest';
import { clinicDate, clinicDateTimeToIso, clinicTime, configureClinicTimeZone } from './clinicTime';

describe('Clinic wall-clock scheduling', () => {
  afterEach(() => configureClinicTimeZone('Europe/Madrid'));
  it('keeps a chosen slot at the same clinic time in winter and summer', () => {
    expect(clinicDateTimeToIso('2026-01-21', '09:45')).toBe('2026-01-21T08:45:00.000Z');
    expect(clinicDateTimeToIso('2026-09-21', '09:45')).toBe('2026-09-21T07:45:00.000Z');
    expect(clinicTime('2026-09-21T07:45:00Z')).toBe('09:45');
  });
  it('assigns near-midnight appointments to the clinic day', () => {
    expect(clinicDate('2026-09-20T22:30:00Z')).toBe('2026-09-21');
  });
  it('uses the server clinic zone rather than the computer zone', () => {
    configureClinicTimeZone('Atlantic/Canary');
    expect(clinicDateTimeToIso('2026-09-21', '09:45')).toBe('2026-09-21T08:45:00.000Z');
  });
  it('rejects a nonexistent clock time during the daylight-saving change', () => {
    expect(() => clinicDateTimeToIso('2026-03-29', '02:30')).toThrow(/no existe/);
  });
});
