type AdminTab = 'clinicas' | 'usuarios' | 'inventario' | 'catalogo' | 'reportes' | 'auditoria' | 'importacion' | 'seguridad' | 'backups';

export const ADMIN_TABS: Array<{ id: AdminTab; label: string }> = [
  { id: 'clinicas', label: 'Clinicas' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'catalogo', label: 'Catalogo tratamientos' },
  { id: 'reportes', label: 'Reportes' },
  { id: 'auditoria', label: 'Auditoria' },
  { id: 'importacion', label: 'Importacion' },
  { id: 'seguridad', label: 'Seguridad' },
  { id: 'backups', label: 'Backups' },
];

export type AdminTabId = AdminTab;
