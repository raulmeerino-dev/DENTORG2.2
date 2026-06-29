import type {
  ApiPaciente,
  Cita,
  Consentimiento,
  HistorialClinico,
  Presupuesto,
  TrabajoLaboratorio,
} from '../../types/api';

export type PatientStatusSeverity = 'ok' | 'info' | 'warning' | 'critical';

export type PatientStatusCode =
  | 'activo'
  | 'en_tratamiento'
  | 'pendiente_presupuesto'
  | 'presupuesto_aceptado_sin_cita'
  | 'pendiente_cita'
  | 'pendiente_cobro'
  | 'pendiente_laboratorio'
  | 'revision_vencida'
  | 'inactivo';

export interface PatientStatus {
  status: PatientStatusCode;
  label: string;
  description: string;
  severity: PatientStatusSeverity;
  suggestedAction?: string;
}

export interface PatientStatusInput {
  paciente?: ApiPaciente | null;
  presupuestos?: Presupuesto[] | null;
  citas?: Cita[] | null;
  historial?: HistorialClinico[] | null;
  saldoPendiente?: number | string | null;
  laboratorio?: TrabajoLaboratorio[] | null;
  consentimientos?: Consentimiento[] | null;
  today?: string;
}

const CANCELLED_APPOINTMENT_STATES = new Set(['anulada', 'falta', 'cancelada', 'cancelled_by_patient']);
const RECEIVED_LAB_STATES = new Set([
  'recibido',
  'recepcionado',
  'entregado',
  'colocado',
  'finalizado',
  'completado',
  'cancelado',
  'received_in_clinic',
  'checked_in_clinic',
  'tried_in_patient',
  'delivered_or_placed',
  'cancelled',
]);

const REVISION_THRESHOLD_MONTHS = 12;

function dateKey(value?: string | null): string {
  return value?.slice(0, 10) ?? '';
}

function isActiveAppointment(cita: Cita): boolean {
  return !CANCELLED_APPOINTMENT_STATES.has(cita.estado.toLowerCase());
}

function hasPendingLab(laboratorio: TrabajoLaboratorio[]): boolean {
  return laboratorio.some((trabajo) => {
    if (trabajo.fecha_recepcion || trabajo.fecha_entrega_paciente || trabajo.colocado) return false;
    return !RECEIVED_LAB_STATES.has((trabajo.estado ?? '').toLowerCase());
  });
}

function isPresupuestoAceptado(presupuesto: Presupuesto): boolean {
  return (presupuesto.estado ?? '').toLowerCase() === 'aceptado';
}

function hasPendingLines(presupuestos: Presupuesto[]): boolean {
  return presupuestos.some((presupuesto) =>
    presupuesto.lineas.some((linea) => linea.aceptado || linea.pasado_trabajo_pendiente)
  );
}

function lastVisitDate(historial: HistorialClinico[]): string {
  return historial
    .map((entrada) => dateKey(entrada.fecha))
    .filter(Boolean)
    .sort()
    .at(-1) ?? '';
}

function thresholdDate(today: string, months: number): string {
  const base = new Date(today.length === 10 ? `${today}T00:00:00Z` : today);
  base.setUTCMonth(base.getUTCMonth() - months);
  return base.toISOString().slice(0, 10);
}

export function buildPatientStatus({
  paciente,
  presupuestos = [],
  citas = [],
  historial = [],
  saldoPendiente = 0,
  laboratorio = [],
  today = new Date().toISOString().slice(0, 10),
}: PatientStatusInput): PatientStatus {
  if (!paciente) {
    return {
      status: 'activo',
      label: 'Sin paciente',
      description: 'Seleccione un paciente para calcular el estado.',
      severity: 'info',
    };
  }

  if (paciente.activo === false) {
    return {
      status: 'inactivo',
      label: 'Inactivo',
      description: 'Paciente marcado como inactivo en la ficha.',
      severity: 'info',
    };
  }

  const safePresupuestos = presupuestos ?? [];
  const safeCitas = citas ?? [];
  const safeHistorial = historial ?? [];
  const safeLaboratorio = laboratorio ?? [];
  const saldo = Number(saldoPendiente ?? 0);

  if (Number.isFinite(saldo) && saldo > 0) {
    const money = saldo.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return {
      status: 'pendiente_cobro',
      label: 'Pendiente de cobro',
      description: `Saldo pendiente: ${money} €.`,
      severity: 'critical',
      suggestedAction: 'Pasar por caja',
    };
  }

  if (hasPendingLab(safeLaboratorio)) {
    return {
      status: 'pendiente_laboratorio',
      label: 'Pendiente de laboratorio',
      description: 'Trabajo de laboratorio en curso pendiente de recepción.',
      severity: 'warning',
      suggestedAction: 'Revisar laboratorio',
    };
  }

  const citaFutura = safeCitas.some(
    (cita) => isActiveAppointment(cita) && dateKey(cita.fecha_hora) > today,
  );
  const presupuestoAceptado = safePresupuestos.some(isPresupuestoAceptado);
  const lineasPendientes = hasPendingLines(safePresupuestos);

  if (presupuestoAceptado || lineasPendientes) {
    if (citaFutura) {
      return {
        status: 'en_tratamiento',
        label: 'En tratamiento',
        description: 'Plan aceptado con próxima cita programada.',
        severity: 'info',
      };
    }
    if (presupuestoAceptado) {
      return {
        status: 'presupuesto_aceptado_sin_cita',
        label: 'Presupuesto aceptado sin cita',
        description: 'Hay presupuesto aceptado y ninguna cita futura programada.',
        severity: 'warning',
        suggestedAction: 'Dar cita',
      };
    }
    return {
      status: 'pendiente_cita',
      label: 'Pendiente de cita',
      description: 'Tratamientos pendientes sin cita programada.',
      severity: 'warning',
      suggestedAction: 'Dar cita',
    };
  }

  const ultimaVisita = lastVisitDate(safeHistorial);
  if (ultimaVisita) {
    const limite = thresholdDate(today, REVISION_THRESHOLD_MONTHS);
    if (!citaFutura && ultimaVisita < limite) {
      return {
        status: 'revision_vencida',
        label: 'Revisión vencida',
        description: `Última visita el ${ultimaVisita}, sin nueva cita programada.`,
        severity: 'warning',
        suggestedAction: 'Programar revisión',
      };
    }
    return {
      status: 'pendiente_presupuesto',
      label: 'Pendiente de presupuesto',
      description: 'Paciente con visita registrada y sin presupuesto creado.',
      severity: 'info',
      suggestedAction: 'Crear presupuesto',
    };
  }

  return {
    status: 'activo',
    label: 'Activo',
    description: 'Paciente activo sin pendientes destacables.',
    severity: 'ok',
  };
}
