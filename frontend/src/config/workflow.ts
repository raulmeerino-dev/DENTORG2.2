import type { UserRole } from '../types/api';

export type AppSection =
  | 'dashboard'
  | 'hoy'
  | 'pacientes'
  | 'agenda'
  | 'listados'
  | 'ficheros'
  | 'clinica'
  | 'caja'
  | 'documentos'
  | 'laboratorio'
  | 'seguridad'
  | 'adminExtras';

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
    description: 'Hub operativo: citas del día, flujo de recepción, telefonear y acciones rápidas.',
    roles: ['admin', 'doctor', 'recepcion', 'auxiliar'],
    route: '/hoy',
    shortcut: 'HO',
  },
  {
    id: 'dashboard',
    label: 'BI',
    description: 'Panel de indicadores: producción, facturación, doctores y tratamientos.',
    roles: ['admin'],
    route: '/dashboard',
    shortcut: 'BI',
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
    id: 'agenda',
    label: 'Agenda',
    description: 'Citas, huecos, llamadas, cambios de horario y ocupacion.',
    roles: ['admin', 'doctor', 'recepcion', 'auxiliar'],
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
    id: 'adminExtras',
    label: 'Admin Pro',
    description: 'Clinicas, inventario, BI, importacion, offline y doble factor.',
    roles: ['admin'],
    route: '/admin-extras',
    shortcut: 'AD',
  },
  {
    id: 'clinica',
    label: 'Clinica',
    description: 'Historial, odontograma, tratamientos realizados y planificacion.',
    roles: ['admin', 'doctor', 'auxiliar'],
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
