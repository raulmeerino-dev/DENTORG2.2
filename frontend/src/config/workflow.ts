import type { UserRole } from '../types/api';

export type AppSection =
  | 'dashboard'
  | 'pacientes'
  | 'agenda'
  | 'listados'
  | 'ficheros'
  | 'clinica'
  | 'caja'
  | 'documentos'
  | 'laboratorio'
  | 'seguridad';

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
};

export const WORKFLOW_ITEMS: WorkflowItem[] = [
  {
    id: 'dashboard',
    label: 'Inicio',
    description: 'Panel diario con citas, llamadas, caja, laboratorio y alertas.',
    roles: ['admin', 'doctor', 'recepcion'],
    route: '/dashboard',
    shortcut: 'IN',
  },
  {
    id: 'pacientes',
    label: 'Pacientes',
    description: 'Ficha, historia, presupuestos, realizados, cobros y documentos.',
    roles: ['admin', 'doctor', 'recepcion'],
    route: '/pacientes',
    shortcut: 'PA',
  },
  {
    id: 'agenda',
    label: 'Agenda',
    description: 'Citas, huecos, llamadas, cambios de horario y ocupacion.',
    roles: ['admin', 'doctor', 'recepcion'],
    route: '/agenda',
    shortcut: 'AG',
  },
  {
    id: 'listados',
    label: 'Listados',
    description: 'Caja, facturacion, pacientes, actividad clinica y control diario.',
    roles: ['admin'],
    route: '/listados',
    shortcut: 'LI',
  },
  {
    id: 'ficheros',
    label: 'Ajustes',
    description: 'Ajustes generales: doctores, horarios, tratamientos, laboratorios, documentos y usuarios.',
    roles: ['admin'],
    route: '/configuracion',
    shortcut: 'AJ',
  },
  {
    id: 'clinica',
    label: 'Clinica',
    description: 'Historial, odontograma, tratamientos realizados y planificacion.',
    roles: ['admin', 'doctor'],
  },
  {
    id: 'caja',
    label: 'Caja',
    description: 'Cobros, facturas, recibos, saldo y arqueo diario.',
    roles: ['admin', 'recepcion'],
  },
  {
    id: 'documentos',
    label: 'Documentos',
    description: 'Consentimientos, imagenes, adjuntos clinicos y PDFs emitidos.',
    roles: ['admin', 'doctor', 'recepcion'],
  },
  {
    id: 'laboratorio',
    label: 'Protesicos',
    description: 'Laboratorios, trabajos enviados, recepcion, incidencias y entregas.',
    roles: ['admin', 'doctor', 'recepcion'],
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
