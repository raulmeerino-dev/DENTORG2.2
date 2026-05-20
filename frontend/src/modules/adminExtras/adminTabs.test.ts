import { describe, expect, it } from 'vitest';
import { ADMIN_TABS } from './tabs';

describe('AdminExtras organization', () => {
  it('keeps admin content separated into one section at a time', () => {
    expect(ADMIN_TABS.map((tab) => tab.id)).toEqual([
      'general',
      'clinicas',
      'usuarios',
      'doctores',
      'agenda',
      'tratamientos',
      'caja',
      'laboratorio',
      'inventario',
      'documentos',
      'reportes',
      'auditoria',
      'importacion',
      'seguridad',
    ]);
  });
});
