import { describe, expect, it } from 'vitest';
import { canAccess, canRoleAccess, GLOBAL_LAUNCHER_IDS, ROLE_LABELS, WORKFLOW_ITEMS } from './workflow';

describe('workflow permissions', () => {
  it('keeps admin-only sections out of clinical roles', () => {
    const listados = WORKFLOW_ITEMS.find((item) => item.id === 'listados');
    const admin = WORKFLOW_ITEMS.find((item) => item.id === 'adminExtras');
    const portal = WORKFLOW_ITEMS.find((item) => item.id === 'portalPaciente');

    expect(listados).toBeDefined();
    expect(admin).toBeDefined();
    expect(portal).toBeDefined();
    expect(canAccess('doctor', listados!)).toBe(false);
    expect(canAccess('recepcion', listados!)).toBe(true);
    expect(canAccess('recepcion', admin!)).toBe(false);
    expect(canAccess('admin', admin!)).toBe(true);
    expect(canAccess('admin', portal!)).toBe(false);
    expect(canAccess('paciente', portal!)).toBe(true);
  });

  it('exposes every supported role label and clinical access for auxiliar', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(['admin', 'auxiliar', 'doctor', 'paciente', 'recepcion']);
    expect(canRoleAccess('auxiliar', ['admin', 'doctor', 'auxiliar'])).toBe(true);
  });

  it('keeps the launcher focused while contextual routes remain available', () => {
    const launcherItems = GLOBAL_LAUNCHER_IDS
      .map((id) => WORKFLOW_ITEMS.find((item) => item.id === id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item?.route));

    const labelsFor = (role: Parameters<typeof canAccess>[0]) => launcherItems
      .filter((item) => canAccess(role, item))
      .map((item) => item.label);

    expect(labelsFor('recepcion')).toEqual(['Hoy', 'Agenda', 'Pacientes', 'Caja', 'Reportes/Listados']);
    expect(labelsFor('doctor')).toEqual(['Hoy', 'Agenda', 'Pacientes']);
    expect(labelsFor('auxiliar')).toEqual(['Hoy', 'Agenda', 'Pacientes']);
    expect(labelsFor('admin')).toEqual(['Hoy', 'Agenda', 'Pacientes', 'Caja', 'Reportes/Listados', 'Administración']);
    expect(labelsFor('paciente')).toEqual(['Portal paciente']);

    const whatsapp = WORKFLOW_ITEMS.find((item) => item.id === 'whatsapp');
    const caja = WORKFLOW_ITEMS.find((item) => item.id === 'caja');
    expect(whatsapp?.label).toBe('WhatsApp');
    expect(whatsapp?.route).toBe('/whatsapp');
    expect(caja?.label).toBe('Caja');
    expect(caja?.route).toBe('/caja');
    expect(GLOBAL_LAUNCHER_IDS).not.toContain('whatsapp');
    expect(GLOBAL_LAUNCHER_IDS).toContain('caja');
    expect(WORKFLOW_ITEMS.find((item) => item.id === 'dashboard')).toBeUndefined();
  });
});
