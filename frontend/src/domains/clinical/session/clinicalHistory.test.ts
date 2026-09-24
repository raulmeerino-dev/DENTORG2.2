import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureClinicTimeZone } from '../../../shared/time/clinicTime';
import { getDateKey, getTime, isToday } from './clinicalHistory';

describe('clinical day around midnight', () => {
  afterEach(() => { vi.useRealTimers(); configureClinicTimeZone('Europe/Madrid'); });
  it('keeps the active appointment on the clinic day while UTC is still yesterday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T22:15:00Z'));
    expect(isToday('2026-09-25T07:00:00Z')).toBe(true);
    expect(isToday('2026-09-24T22:05:00Z')).toBe(true);
    expect(isToday('2026-09-25')).toBe(true);
    expect(isToday('2026-09-24')).toBe(false);
    expect(getDateKey('2026-09-24T22:05:00Z')).toBe('2026-09-25');
    expect(getTime('2026-09-24T22:05:00Z')).toBe('00:05');
  });
  it('preserves date-only records in a clinic west of UTC', () => {
    configureClinicTimeZone('America/Bogota');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T01:15:00Z'));
    expect(isToday('2026-09-24')).toBe(true);
    expect(isToday('2026-09-25T01:00:00Z')).toBe(true);
    expect(getDateKey('2026-09-24')).toBe('2026-09-24');
    expect(isToday('')).toBe(false);
  });
});
