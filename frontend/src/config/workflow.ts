import type { UserRole } from '../types/api';

export type AppSection =
  | 'dashboard'
  | 'hoy'
  | 'pacientes'
  | 'agenda'
  | 'whatsapp'
  | 'listados'
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
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  doctor: 'Doctor',
  recepcion: 'Recepcion',
  auxiliar: 'Auxiliar',
  paciente: 'Paciente',
};

export const WORKFLOW_ITEMS: WorkflowItem[] = [
  {
    id: 'hoy',
    label: 'Hoy',
    description: 'Centro operativo diario: citas, llamadas, cobros pendientes y acciones rapidas.',
    roles: ['admin', 'doctor', 'recepcion', 'auxiliar'],
    route: '/hoy',
    shortcut: 'HO',
  },
  {
    id: 'agenda',
    label: 'Agenda',
    description: 'Citas, huecos, llamadas, estados y ocupacion.',
    roles: ['admin', 'doctor', 'recepcion', 'auxiliar'],
    route: '/agenda',
    shortcut: 'AG',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    description: 'Respuestas, confirmaciones, cambios y reprogramacion asistida.',
    roles: ['admin', 'doctor', 'recepcion', 'auxiliar'],
    shortcut: 'WA',
  },
  {
    id: 'pacientes',
    label: 'Pacientes',
    description: 'Ficha, historia, presupuestos, realizados, cobros y documentos.',
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
    label: 'Reportes/Listados',
    description: 'Reportes, listados fiscales y listados operativos de la clinica.',
    roles: ['admin'],
    route: '/listados',
    shortcut: 'RE',
  },
  {
    id: 'adminExtras',
    label: 'Administracion',
    description: 'Clinicas, usuarios, inventario, catalogos, auditoria, seguridad y backups.',
    roles: ['admin'],
    route: '/admin-extras',
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
    label: 'Clinica',
    description: 'Historial, odontograma, tratamientos realizados y planificacion.',
    roles: ['admin', 'doctor', 'auxiliar'],
  },
  {
    id: 'documentos',
    label: 'Documentos',
    description: 'Consentimientos, imagenes, adjuntos clinicos y PDFs emitidos.',
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
    description: 'Usuarios, permisos, sesiones, auditoria y privacidad.',
    roles: ['admin'],
  },
];

export function canAccess(role: UserRole | undefined | null, item: WorkflowItem) {
  return Boolean(role && item.roles.includes(role));
}

export function canRoleAccess(role: UserRole | undefined | null, roles: UserRole[]) {
  return Boolean(role && roles.includes(role));
}
