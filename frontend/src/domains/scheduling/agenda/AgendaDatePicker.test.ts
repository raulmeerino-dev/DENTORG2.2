import { describe, expect, it } from 'vitest';
import { changeAgendaMonth } from './agendaCalendar';
import { isoDate, monthGrid } from './agendaTime';

describe('Agenda calendar navigation', () => {
  it('clamps month ends and respects leap years', () => {
    expect(changeAgendaMonth('2026-01-31', 2026, 1)).toBe('2026-02-28');
    expect(changeAgendaMonth('2028-01-31', 2028, 1)).toBe('2028-02-29');
    expect(changeAgendaMonth('2028-02-29', 2029, 1)).toBe('2029-02-28');
  });
  it('preserves the day when moving years and months', () => {
    expect(changeAgendaMonth('2026-09-25', 2030, 3)).toBe('2030-04-25');
  });
  it('keeps adjacent-month days available across months and years', () => {
    const september = monthGrid('2026-09-25').map(isoDate);
    expect(september).toHaveLength(42);
    expect(september).toContain('2026-08-31');
    expect(september).toContain('2026-10-01');
    expect(monthGrid('2026-12-25').map(isoDate)).toContain('2027-01-01');
  });
});
