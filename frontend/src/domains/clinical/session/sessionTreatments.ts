import { clinicDate, clinicDateKey } from '../../../shared/time/clinicTime';
import { pendingTreatments } from '../../treatment-plans/pendingTreatments';
import type {
  Cita,
  Presupuesto,
  PresupuestoLinea,
  SesionClinicaItem,
  SesionClinicaItemCreateInput,
  TrabajoPendiente,
  TratamientoCatalogo,
} from '../../../api/types';
import { isToday } from './clinicalHistory';

export type SessionTreatmentStatus = 'planificado' | 'en_curso' | 'realizado' | 'pospuesto';

type SessionTreatmentOrigen = 'cita' | 'pendiente' | 'manual';

export type SessionTreatment = {
  id: string;
  sesionItemId: string | null;
  source: SessionTreatmentOrigen;
  sourceLabel: string;
  tratamientoId: string | null;
  tratamiento: TratamientoCatalogo | PresupuestoLinea['tratamiento'] | null;
  title: string;
  piezaDental: string;
  caras: string;
  observaciones: string;
  status: SessionTreatmentStatus;
  scheduledAt?: string | null;
  citaId?: string | null;
  linea?: PresupuestoLinea;
  historialId?: string | null;
};

export const SESSION_STATUS_LABELS: Record<SessionTreatmentStatus, string> = {
  planificado: 'Planificado',
  en_curso: 'En curso',
  realizado: 'Realizado',
  pospuesto: 'Pospuesto',
};

const SESION_ITEM_ORIGEN_BY_SOURCE: Record<SessionTreatmentOrigen, 'manual' | 'cita' | 'presupuesto_linea'> =
  {
    manual: 'manual',
    cita: 'cita',
    pendiente: 'presupuesto_linea',
  };

export function normalizeSessionText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function sessionTreatmentFromSesionItem(
  item: SesionClinicaItem,
  presupuestos: Presupuesto[],
): SessionTreatment {
  const linea = item.presupuesto_linea_id
    ? presupuestos
        .flatMap((presupuesto) => presupuesto.lineas)
        .find((row) => row.id === item.presupuesto_linea_id)
    : undefined;
  const presupuesto = linea ? presupuestos.find((row) => row.id === linea.presupuesto_id) : undefined;
  const source: SessionTreatmentOrigen =
    item.origen === 'presupuesto_linea' ? 'pendiente' : item.origen === 'cita' ? 'cita' : 'manual';
  const sourceLabel =
    source === 'pendiente' && presupuesto
      ? `Ppto. ${presupuesto.numero}`
      : source === 'cita'
        ? 'Cita programada'
        : 'Anadido en sesion';
  const status: SessionTreatmentStatus =
    item.estado === 'realizado' ? 'realizado' : (item.estado as SessionTreatmentStatus);
  return {
    id: `sesion-${item.id}`,
    sesionItemId: item.id,
    source,
    sourceLabel,
    tratamientoId: item.tratamiento_id ?? linea?.tratamiento_id ?? null,
    tratamiento: item.tratamiento ?? linea?.tratamiento ?? null,
    title: item.titulo ?? item.tratamiento?.nombre ?? linea?.tratamiento?.nombre ?? 'Tratamiento de sesion',
    piezaDental: item.pieza_dental != null ? String(item.pieza_dental) : '',
    caras: item.caras ?? '',
    observaciones: item.observaciones ?? '',
    status,
    citaId: item.cita_id ?? null,
    linea: linea ?? undefined,
    historialId: item.historial_id ?? null,
  };
}

export function buildSessionTreatments(
  citas: Cita[],
  presupuestos: Presupuesto[],
  trabajosPendientes: TrabajoPendiente[],
  sesionItems: SesionClinicaItem[],
): SessionTreatment[] {
  const todayAppointments = citas.filter(
    (cita) =>
      isToday(cita.fecha_hora) &&
      !['anulada', 'cancelada', 'no_presentado', 'falta', 'cancelled_by_patient'].includes(cita.estado),
  );

  const persistedActive = sesionItems.filter((item) => item.estado !== 'realizado');
  const persistedLineaIds = new Set(
    persistedActive.map((item) => item.presupuesto_linea_id).filter(Boolean) as string[],
  );
  const persistedCitaIds = new Set(persistedActive.map((item) => item.cita_id).filter(Boolean) as string[]);
  const items: SessionTreatment[] = persistedActive.map((item) =>
    sessionTreatmentFromSesionItem(item, presupuestos),
  );

  const completedLineIds = new Set(
    sesionItems.filter((item) => item.historial_id).map((item) => item.presupuesto_linea_id),
  );
  const pendingLines = pendingTreatments(presupuestos, trabajosPendientes).filter(
    ({ linea }) => !persistedLineaIds.has(linea.id) && !completedLineIds.has(linea.id),
  );

  pendingLines.forEach(({ presupuesto, linea }) => {
    const cita = todayAppointments.find((item) => item.presupuesto_linea_id === linea.id);
    items.push({
      id: `linea-${linea.id}`,
      sesionItemId: null,
      source: 'pendiente',
      sourceLabel: presupuesto ? `Ppto. ${presupuesto.numero}` : 'Trabajo pendiente',
      tratamientoId: linea.tratamiento_id,
      tratamiento: linea.tratamiento,
      title: linea.tratamiento?.nombre ?? 'Tratamiento pendiente',
      piezaDental: linea.pieza_dental ? String(linea.pieza_dental) : '',
      caras: linea.caras ?? '',
      observaciones: '',
      status: 'planificado',
      scheduledAt: cita?.fecha_hora ?? null,
      citaId: cita?.id ?? null,
      linea,
    });
  });

  todayAppointments.forEach((cita) => {
    if (persistedCitaIds.has(cita.id)) return;
    const motivo = cita.motivo || 'Tratamiento previsto';
    const alreadyCovered = Boolean(
      cita.presupuesto_linea_id && items.some((item) => item.linea?.id === cita.presupuesto_linea_id),
    );
    if (alreadyCovered) return;
    items.push({
      id: `cita-${cita.id}`,
      sesionItemId: null,
      source: 'cita',
      sourceLabel: `${cita.fecha_hora.slice(11, 16)} - ${cita.estado}`,
      tratamientoId: null,
      tratamiento: null,
      title: motivo,
      piezaDental: '',
      caras: '',
      observaciones: cita.observaciones ?? '',
      status: 'planificado',
      scheduledAt: cita.fecha_hora,
      citaId: cita.id,
    });
  });

  return items.sort((a, b) => Number(Boolean(b.citaId)) - Number(Boolean(a.citaId)));
}

export function buildCreatePayload(item: SessionTreatment): SesionClinicaItemCreateInput {
  return {
    tratamiento_id: item.tratamientoId,
    presupuesto_linea_id: item.linea?.id ?? null,
    cita_id: item.citaId ?? null,
    titulo: item.title.trim() || null,
    pieza_dental: item.piezaDental ? Number(item.piezaDental) : null,
    caras: item.caras || null,
    observaciones: item.observaciones.trim() || null,
    estado: item.status === 'realizado' ? 'planificado' : item.status,
    origen: SESION_ITEM_ORIGEN_BY_SOURCE[item.source],
  };
}

export function sessionVisit(citas: Cita[], doctorId?: string | null) {
  const today = clinicDate(new Date());
  const eligible = citas.filter(
    (cita) =>
      clinicDateKey(cita.fecha_hora) === today &&
      !['anulada', 'cancelada', 'no_presentado', 'falta', 'cancelled_by_patient'].includes(cita.estado),
  );
  const matching = doctorId ? eligible.filter((cita) => cita.doctor_id === doctorId) : eligible;
  const attending = matching.filter((cita) => cita.estado === 'en_atencion');
  return attending.length === 1 ? attending[0] : matching.length === 1 ? matching[0] : null;
}
