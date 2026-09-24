type AdminTab =
  | 'general'
  | 'clinicas'
  | 'usuarios'
  | 'doctores'
  | 'tratamientos'
  | 'agenda'
  | 'laboratorio'
  | 'inventario'
  | 'documentos'
  | 'reportes'
  | 'auditoria'
  | 'importacion'
  | 'seguridad'
  | 'backups';

export const ADMIN_TABS: Array<{ id: AdminTab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'clinicas', label: 'Clinicas' },
  { id: 'usuarios', label: 'Usuarios/Roles' },
  { id: 'doctores', label: 'Doctores' },
  { id: 'agenda', label: 'Agenda/Horarios' },
  { id: 'tratamientos', label: 'Tratamientos' },
  { id: 'laboratorio', label: 'Protesicos/Lab.' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'reportes', label: 'Reportes' },
  { id: 'auditoria', label: 'Auditoria' },
  { id: 'importacion', label: 'Importacion' },
  { id: 'seguridad', label: 'Seguridad/Backups' },
];

export type AdminTabId = AdminTab;
