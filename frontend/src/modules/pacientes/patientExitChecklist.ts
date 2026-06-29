import type {
  ApiPaciente,
  Cita,
  Consentimiento,
  DocumentoPaciente,
  HistorialClinico,
  Presupuesto,
  RecetaClinica,
  TrabajoLaboratorio,
} from '../../types/api';

export type PatientExitChecklistStatus = 'ok' | 'warning' | 'critical' | 'info';
export type PatientExitActionTarget = 'agenda' | 'caja' | 'consentimiento' | 'historial' | 'receta' | 'laboratorio' | 'documentos';

export type PatientExitChecklistItem = {
  id: string;
  label: string;
  description: string;
  status: PatientExitChecklistStatus;
  actionLabel?: string;
  actionTarget?: PatientExitActionTarget;
};

export type PatientExitChecklist = {
  ready: boolean;
  title: string;
  items: PatientExitChecklistItem[];
};

export type PatientExitChecklistInput = {
  paciente?: ApiPaciente | null;
  citas?: Cita[] | null;
  historial?: HistorialClinico[] | null;
  presupuestos?: Presupuesto[] | null;
  consentimientos?: Consentimiento[] | null;
  recetas?: RecetaClinica[] | null;
  laboratorio?: TrabajoLaboratorio[] | null;
  documentos?: DocumentoPaciente[] | null;
  saldoPendiente?: number | string | null;
  today?: string;
};

const FINISHED_STATES = new Set(['realizado', 'facturado', 'cobrado_parcial', 'cobrado_completo', 'atendido', 'finalizado']);
const CANCELLED_APPOINTMENT_STATES = new Set(['anulada', 'falta', 'cancelada', 'cancelled_by_patient']);
const RECEIVED_LAB_STATES = new Set([
  'recibido',
  'recepcionado',
  'entregado',
  'colocado',
  'finalizado',
  'completado',
  'received_in_clinic',
  'checked_in_clinic',
  'tried_in_patient',
  'delivered_or_placed',
  'cancelled',
]);

function dateKey(value?: string | null) {
  return value?.slice(0, 10) ?? '';
}

function isToday(value: string | null | undefined, today: string) {
  return dateKey(value) === today;
}

function isFinishedState(value?: string | null) {
  return FINISHED_STATES.has((value ?? '').toLowerCase());
}

function isActiveAppointment(cita: Cita) {
  return !CANCELLED_APPOINTMENT_STATES.has(cita.estado.toLowerCase());
}

function moneyLabel(value: number) {
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function activePendingBudgetLines(presupuestos: Presupuesto[], historial: HistorialClinico[]) {
  const completedLineIds = new Set(
    historial
      .filter((entrada) => isFinishedState(entrada.estado) && entrada.presupuesto_linea_id)
      .map((entrada) => entrada.presupuesto_linea_id as string),
  );
  return presupuestos.flatMap((presupuesto) => (
    presupuesto.lineas.filter((linea) => (
      !completedLineIds.has(linea.id)
      && (linea.aceptado || linea.pasado_trabajo_pendiente || presupuesto.estado === 'aceptado')
    ))
  ));
}

export function buildPatientExitChecklist({
  paciente,
  citas = [],
  historial = [],
  presupuestos = [],
  consentimientos = [],
  recetas = [],
  laboratorio = [],
  documentos = [],
  saldoPendiente = 0,
  today = new Date().toISOString().slice(0, 10),
}: PatientExitChecklistInput): PatientExitChecklist {
  const safeCitas = citas ?? [];
  const safeHistorial = historial ?? [];
  const safePresupuestos = presupuestos ?? [];
  const safeConsentimientos = consentimientos ?? [];
  const safeRecetas = recetas ?? [];
  const safeLaboratorio = laboratorio ?? [];
  const safeDocumentos = documentos ?? [];
  const saldo = Number(saldoPendiente ?? 0);

  const realizadosHoy = safeHistorial.filter((entrada) => isToday(entrada.fecha, today) && isFinishedState(entrada.estado));
  const pendientesAceptados = activePendingBudgetLines(safePresupuestos, safeHistorial);
  const proximaCita = safeCitas
    .filter((cita) => isActiveAppointment(cita) && dateKey(cita.fecha_hora) > today)
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0];
  const consentimientosPendientes = safeConsentimientos.filter((item) => (
    !item.revocado && !['firmado', 'revocado'].includes(item.estado.toLowerCase())
  ));
  const recetasHoy = safeRecetas.filter((receta) => isToday(receta.fecha_prescripcion || receta.created_at, today));
  const laboratorioPendiente = safeLaboratorio.filter((trabajo) => {
    if (trabajo.fecha_recepcion || trabajo.fecha_entrega_paciente || trabajo.colocado) return false;
    return !RECEIVED_LAB_STATES.has((trabajo.estado ?? '').toLowerCase());
  });
  const laboratorioVencido = laboratorioPendiente.filter((trabajo) => (
    Boolean(trabajo.fecha_entrega_prevista) && dateKey(trabajo.fecha_entrega_prevista) < today
  ));
  const laboratorioHoy = safeLaboratorio.filter((trabajo) => (
    isToday(trabajo.fecha_salida, today) || isToday(trabajo.fecha_entrega_prevista, today) || isToday(trabajo.fecha_recepcion, today)
  ));
  const documentosHoy = safeDocumentos.filter((documento) => isToday(documento.fecha_documento || documento.created_at, today));
  const comentariosClinicosHoy = safeHistorial.filter((entrada) => (
    isToday(entrada.fecha, today) && Boolean((entrada.observaciones || entrada.diagnostico || '').trim())
  ));

  const items: PatientExitChecklistItem[] = [];

  items.push(realizadosHoy.length > 0 ? {
    id: 'tratamientos-hoy',
    label: 'Tratamientos realizados hoy',
    description: `${realizadosHoy.length} tratamiento${realizadosHoy.length === 1 ? '' : 's'} registrado${realizadosHoy.length === 1 ? '' : 's'} en historial.`,
    status: 'ok',
    actionLabel: 'Ver historial',
    actionTarget: 'historial',
  } : {
    id: 'tratamientos-hoy',
    label: 'Tratamientos realizados hoy',
    description: 'No hay tratamientos realizados registrados hoy.',
    status: 'info',
  });

  items.push(saldo > 0 ? {
    id: 'caja',
    label: 'Debe pasar por caja',
    description: `Saldo pendiente: ${moneyLabel(saldo)}.`,
    status: 'critical',
    actionLabel: 'Cobrar',
    actionTarget: 'caja',
  } : {
    id: 'caja',
    label: 'Caja',
    description: 'Sin aviso de cobro pendiente.',
    status: 'ok',
  });

  const tratamientosHoySinFactura = realizadosHoy.filter((entrada) => !entrada.factura_id && Number(entrada.importe ?? 0) > 0);
  if (tratamientosHoySinFactura.length > 0 && saldo <= 0) {
    items.push({
      id: 'facturacion-hoy',
      label: 'Facturacion de hoy',
      description: `${tratamientosHoySinFactura.length} tratamiento${tratamientosHoySinFactura.length === 1 ? '' : 's'} realizado${tratamientosHoySinFactura.length === 1 ? '' : 's'} sin factura vinculada.`,
      status: 'warning',
      actionLabel: 'Revisar caja',
      actionTarget: 'caja',
    });
  }

  items.push(proximaCita ? {
    id: 'proxima-cita',
    label: 'Proxima cita',
    description: `${dateKey(proximaCita.fecha_hora)} ${proximaCita.fecha_hora.slice(11, 16)} - ${proximaCita.motivo || 'cita programada'}.`,
    status: 'ok',
    actionLabel: 'Agenda',
    actionTarget: 'agenda',
  } : {
    id: 'proxima-cita',
    label: 'Proxima cita no programada',
    description: pendientesAceptados.length > 0
      ? `${pendientesAceptados.length} tratamiento${pendientesAceptados.length === 1 ? '' : 's'} aceptado${pendientesAceptados.length === 1 ? '' : 's'} pendiente${pendientesAceptados.length === 1 ? '' : 's'} sin proxima cita.`
      : 'No hay proxima cita registrada para el paciente.',
    status: 'warning',
    actionLabel: 'Dar cita',
    actionTarget: 'agenda',
  });

  items.push(consentimientosPendientes.length > 0 ? {
    id: 'consentimientos',
    label: 'Consentimiento pendiente de firma',
    description: `${consentimientosPendientes.length} consentimiento${consentimientosPendientes.length === 1 ? '' : 's'} pendiente${consentimientosPendientes.length === 1 ? '' : 's'}.`,
    status: 'warning',
    actionLabel: 'Consentimiento',
    actionTarget: 'consentimiento',
  } : {
    id: 'consentimientos',
    label: 'Consentimientos',
    description: 'Sin consentimientos pendientes detectados.',
    status: 'ok',
  });

  items.push(recetasHoy.length > 0 ? {
    id: 'recetas',
    label: 'Receta creada hoy',
    description: `${recetasHoy.length} receta${recetasHoy.length === 1 ? '' : 's'} registrada${recetasHoy.length === 1 ? '' : 's'} hoy.`,
    status: 'info',
    actionLabel: 'Recetas',
    actionTarget: 'receta',
  } : {
    id: 'recetas',
    label: 'Recetas',
    description: 'No hay receta creada hoy.',
    status: 'ok',
  });

  if (laboratorioVencido.length > 0) {
    items.push({
      id: 'laboratorio',
      label: 'Laboratorio pendiente vencido',
      description: `${laboratorioVencido.length} trabajo${laboratorioVencido.length === 1 ? '' : 's'} de laboratorio sin recibir con fecha vencida.`,
      status: 'warning',
      actionLabel: 'Laboratorio',
      actionTarget: 'laboratorio',
    });
  } else if (laboratorioPendiente.length > 0 || laboratorioHoy.length > 0) {
    const count = laboratorioPendiente.length || laboratorioHoy.length;
    items.push({
      id: 'laboratorio',
      label: 'Laboratorio solicitado o pendiente',
      description: `${count} trabajo${count === 1 ? '' : 's'} de laboratorio en seguimiento.`,
      status: laboratorioPendiente.length > 0 ? 'warning' : 'info',
      actionLabel: 'Laboratorio',
      actionTarget: 'laboratorio',
    });
  } else {
    items.push({
      id: 'laboratorio',
      label: 'Laboratorio',
      description: 'Sin trabajos de laboratorio pendientes detectados.',
      status: 'ok',
    });
  }

  items.push(documentosHoy.length > 0 ? {
    id: 'documentos',
    label: 'Documentos o fotos añadidos hoy',
    description: `${documentosHoy.length} documento${documentosHoy.length === 1 ? '' : 's'} archivado${documentosHoy.length === 1 ? '' : 's'} hoy.`,
    status: 'info',
    actionLabel: 'Documentos',
    actionTarget: 'documentos',
  } : {
    id: 'documentos',
    label: 'Documentos y fotos',
    description: 'No hay documentos añadidos hoy.',
    status: 'ok',
  });

  items.push(comentariosClinicosHoy.length > 0 ? {
    id: 'comentarios',
    label: 'Comentarios clinicos de hoy',
    description: `${comentariosClinicosHoy.length} comentario${comentariosClinicosHoy.length === 1 ? '' : 's'} clinico${comentariosClinicosHoy.length === 1 ? '' : 's'} registrado${comentariosClinicosHoy.length === 1 ? '' : 's'} en historial.`,
    status: 'info',
    actionLabel: 'Ver historial',
    actionTarget: 'historial',
  } : {
    id: 'comentarios',
    label: 'Comentarios clinicos',
    description: 'Sin comentarios clinicos pendientes de revisar detectados.',
    status: 'ok',
  });

  if (!paciente) {
    items.unshift({
      id: 'paciente',
      label: 'Paciente',
      description: 'Seleccione un paciente para calcular la salida.',
      status: 'info',
    });
  }

  const ready = !items.some((item) => item.status === 'warning' || item.status === 'critical');
  return {
    ready,
    title: ready ? 'Salida lista' : 'Revisar salida del paciente',
    items,
  };
}
