import { describe, expect, it } from 'vitest';
import { canAccess, canRoleAccess, ROLE_LABELS, WORKFLOW_ITEMS } from './workflow';

describe('workflow permissions', () => {
  it('keeps admin-only sections out of clinical roles', () => {
    const listados = WORKFLOW_ITEMS.find((item) => item.id === 'listados');
    const admin = WORKFLOW_ITEMS.find((item) => item.id === 'adminExtras');

    expect(listados).toBeDefined();
    expect(admin).toBeDefined();
    expect(canAccess('doctor', listados!)).toBe(false);
    expect(canAccess('recepcion', admin!)).toBe(false);
    expect(canAccess('admin', admin!)).toBe(true);
  });

  it('exposes every supported role label and clinical access for auxiliar', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(['admin', 'auxiliar', 'doctor', 'paciente', 'recepcion']);
    expect(canRoleAccess('auxiliar', ['admin', 'doctor', 'auxiliar'])).toBe(true);
  });

  it('keeps the primary navigation focused on the daily workflow', () => {
    const routed = WORKFLOW_ITEMS.filter((item) => item.route);
    const primary = routed
      .filter((item) => ['hoy', 'pacientes', 'agenda', 'caja', 'adminExtras'].includes(item.id))
      .map((item) => item.label);

    expect(primary).toEqual(['Hoy', 'Pacientes', 'Agenda', 'Caja', 'Admin']);
    expect(WORKFLOW_ITEMS.find((item) => item.id === 'dashboard')).toBeUndefined();
  });
});
