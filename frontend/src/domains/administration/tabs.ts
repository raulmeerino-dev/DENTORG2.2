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
  { id: 'clinicas', label: 'Clínicas' },
  { id: 'usuarios', label: 'Usuarios y roles' },
  { id: 'doctores', label: 'Profesionales' },
  { id: 'agenda', label: 'Agenda y horarios' },
  { id: 'tratamientos', label: 'Tratamientos' },
  { id: 'laboratorio', label: 'Laboratorio' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'reportes', label: 'Reportes' },
  { id: 'auditoria', label: 'Auditoría' },
  { id: 'importacion', label: 'Importación' },
  { id: 'seguridad', label: 'Seguridad y copias' },
];

export type AdminTabId = AdminTab;

export const ADMINISTRATION_TAB_IDS: AdminTab[] = ['reportes', 'clinicas', 'inventario', 'importacion'];

export function administrationHref(tab: string) {
  if (tab === 'auditoria') return '/registros?vista=auditoria';
  const section = ADMINISTRATION_TAB_IDS.includes(tab as AdminTab) ? '/administracion' : '/ajustes';
  return `${section}?tab=${encodeURIComponent(tab)}`;
}
