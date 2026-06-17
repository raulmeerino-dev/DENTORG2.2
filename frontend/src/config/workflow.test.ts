import { describe, expect, it } from 'vitest';
import { canAccess, canRoleAccess, ROLE_LABELS, WORKFLOW_ITEMS } from './workflow';

describe('workflow permissions', () => {
  it('keeps admin-only sections out of clinical roles', () => {
    const listados = WORKFLOW_ITEMS.find((item) => item.id === 'listados');
    const admin = WORKFLOW_ITEMS.find((item) => item.id === 'adminExtras');
    const portal = WORKFLOW_ITEMS.find((item) => item.id === 'portalPaciente');

    expect(listados).toBeDefined();
    expect(admin).toBeDefined();
    expect(portal).toBeDefined();
    expect(canAccess('doctor', listados!)).toBe(false);
    expect(canAccess('recepcion', admin!)).toBe(false);
    expect(canAccess('admin', admin!)).toBe(true);
    expect(canAccess('admin', portal!)).toBe(false);
    expect(canAccess('paciente', portal!)).toBe(true);
  });

  it('exposes every supported role label and clinical access for auxiliar', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(['admin', 'auxiliar', 'doctor', 'paciente', 'recepcion']);
    expect(canRoleAccess('auxiliar', ['admin', 'doctor', 'auxiliar'])).toBe(true);
  });

  it('keeps the primary navigation focused by role', () => {
    const routed = WORKFLOW_ITEMS.filter((item) => item.route);

    const labelsFor = (role: Parameters<typeof canAccess>[0]) => routed
      .filter((item) => canAccess(role, item))
      .map((item) => item.label);

    expect(labelsFor('recepcion')).toEqual(['Hoy', 'Agenda', 'WhatsApp', 'Pacientes', 'Caja']);
    expect(labelsFor('doctor')).toEqual(['Hoy', 'Agenda', 'WhatsApp', 'Pacientes']);
    expect(labelsFor('auxiliar')).toEqual(['Hoy', 'Agenda', 'WhatsApp', 'Pacientes']);
    expect(labelsFor('admin')).toEqual(['Hoy', 'Agenda', 'WhatsApp', 'Pacientes', 'Caja', 'Reportes/Listados', 'Administracion']);
    expect(labelsFor('paciente')).toEqual(['Portal paciente']);
    expect(WORKFLOW_ITEMS.find((item) => item.id === 'dashboard')).toBeUndefined();
  });
});
