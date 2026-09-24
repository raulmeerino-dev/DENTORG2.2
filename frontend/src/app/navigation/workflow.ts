import type { UserRole } from '../../api/types';

export type AppSection =
  | 'dashboard'
  | 'hoy'
  | 'pacientes'
  | 'agenda'
  | 'whatsapp'
  | 'listados'
  | 'archivos'
  | 'administracion'
  | 'clinica'
  | 'caja'
  | 'documentos'
  | 'laboratorio'
  | 'seguridad'
  | 'adminExtras'
  | 'portalPaciente';

export interface WorkflowItem {
  id: AppSection;
  label: string;
  description: string;
  roles: UserRole[];
  route?: string;
  shortcut?: string;
  group?: 'daily' | 'secondary';
}

export const GLOBAL_LAUNCHER_IDS: AppSection[] = [
  'hoy',
  'pacientes',
  'caja',
  'listados',
  'archivos',
  'administracion',
  'adminExtras',
  'portalPaciente',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  doctor: 'Doctor',
  recepcion: 'Recepción',
  auxiliar: 'Auxiliar',
  paciente: 'Paciente',
};

export const WORKFLOW_ITEMS: WorkflowItem[] = [
  {
    id: 'hoy',
    label: 'Jornada',
    description: 'Operativa diaria y agenda de la clínica.',
    roles: ['admin', 'doctor', 'recepcion', 'auxiliar'],
    route: '/jornada',
    shortcut: 'HO',
  },
  {
    id: 'agenda',
    label: 'Agenda',
    description: 'Citas, huecos, llamadas, estados y ocupación.',
    roles: ['admin', 'doctor', 'recepcion', 'auxiliar'],
    route: '/agenda',
    shortcut: 'AG',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    description: 'Respuestas, confirmaciones, cambios y reprogramacion asistida.',
    roles: ['admin', 'doctor', 'recepcion', 'auxiliar'],
    route: '/whatsapp',
    shortcut: 'WA',
  },
  {
    id: 'pacientes',
    label: 'Pacientes',
    description: 'Ficha, clinica, historial, presupuestos contextuales, cobros y documentos.',
    roles: ['admin', 'doctor', 'recepcion', 'auxiliar'],
    route: '/pacientes',
    shortcut: 'PA',
  },
  {
    id: 'caja',
    label: 'Caja',
    description: 'Cobros, facturas, recibos, saldo y arqueo diario.',
    roles: ['admin', 'recepcion'],
    route: '/caja',
    shortcut: 'CA',
  },
  {
    id: 'listados',
    label: 'Registros',
    description: 'Buscar, filtrar y consultar la actividad autorizada de la clínica.',
    roles: ['admin', 'doctor', 'recepcion', 'auxiliar'],
    route: '/registros',
    group: 'secondary',
    shortcut: 'RE',
  },
  {
    id: 'archivos',
    label: 'Archivos',
    description: 'Consulta transversal de documentos y archivos de pacientes.',
    roles: ['admin', 'doctor', 'recepcion', 'auxiliar'],
    route: '/archivos',
    group: 'secondary',
  },
  {
    id: 'administracion',
    label: 'Administración',
    description: 'Gestión de clínicas, inventario, importaciones e indicadores.',
    roles: ['admin'],
    route: '/administracion',
    group: 'secondary',
  },
  {
    id: 'adminExtras',
    label: 'Ajustes',
    description: 'Usuarios, catálogos, horarios, documentos, seguridad y backups.',
    roles: ['admin'],
    route: '/ajustes',
    group: 'secondary',
    shortcut: 'AD',
  },
  {
    id: 'portalPaciente',
    label: 'Portal paciente',
    description: 'Mis citas, documentos y consentimientos del paciente.',
    roles: ['paciente'],
    route: '/mis-citas',
    shortcut: 'MI',
  },
  {
    id: 'clinica',
    label: 'Clínica',
    description: 'Historial, odontograma, tratamientos realizados y planificación.',
    roles: ['admin', 'doctor', 'auxiliar'],
  },
  {
    id: 'documentos',
    label: 'Documentos',
    description: 'Consentimientos, imágenes, adjuntos clínicos y PDFs emitidos.',
    roles: ['admin', 'doctor', 'recepcion', 'auxiliar'],
  },
  {
    id: 'laboratorio',
    label: 'Protesicos',
    description: 'Laboratorios, trabajos enviados, recepcion, incidencias y entregas.',
    roles: ['admin', 'doctor', 'recepcion', 'auxiliar'],
  },
  {
    id: 'seguridad',
    label: 'Usuarios y roles',
    description: 'Usuarios, permisos, sesiones, auditoría y privacidad.',
    roles: ['admin'],
  },
];

export function canAccess(role: UserRole | undefined | null, item: WorkflowItem) {
  return Boolean(role && item.roles.includes(role));
}

export function canRoleAccess(role: UserRole | undefined | null, roles: UserRole[]) {
  return Boolean(role && roles.includes(role));
}
