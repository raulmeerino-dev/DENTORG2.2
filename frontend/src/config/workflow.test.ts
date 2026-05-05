import { describe, expect, it } from 'vitest';
import { canAccess, canRoleAccess, ROLE_LABELS, WORKFLOW_ITEMS } from './workflow';

describe('workflow permissions', () => {
  it('keeps admin-only sections out of clinical roles', () => {
    const listados = WORKFLOW_ITEMS.find((item) => item.id === 'listados');
    const ajustes = WORKFLOW_ITEMS.find((item) => item.id === 'ficheros');

    expect(listados).toBeDefined();
    expect(ajustes).toBeDefined();
    expect(canAccess('doctor', listados!)).toBe(false);
    expect(canAccess('recepcion', ajustes!)).toBe(false);
    expect(canAccess('admin', ajustes!)).toBe(true);
  });

  it('exposes every supported role label and clinical access for auxiliar', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(['admin', 'auxiliar', 'doctor', 'paciente', 'recepcion']);
    expect(canRoleAccess('auxiliar', ['admin', 'doctor', 'auxiliar'])).toBe(true);
  });
});
