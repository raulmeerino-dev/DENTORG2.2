import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, FileText, FlaskConical, Info, NotebookPen, Pill, Plus, Trash2 } from 'lucide-react';
import type {
  ApiPaciente,
  Cita,
  Consentimiento,
  DocumentoPaciente,
  HistorialClinico,
  NotaDental,
  NotaDentalCreateInput,
  Presupuesto,
  PresupuestoLinea,
  RecetaClinica,
  SesionClinicaItem,
  SesionClinicaItemCreateInput,
  SesionClinicaItemUpdateInput,
  SesionTratamientoRealizadoInput,
  TrabajoLaboratorio,
  TratamientoCatalogo,
  UserRole,
} from '../../types/api';
import { formatDate } from '../../lib/utils';
import { TreatmentBadge } from '../../components/TreatmentBadge';
import { PatientOdontogramFlow, mapSurfaceToCaras } from '../odontogram';
import type { ToothSelection } from '../odontogram';
import { PrimeraVisitaPanel } from './PrimeraVisita';
import type { PrimeraVisitaData } from './PrimeraVisita';
import { TrabajoPendientePanel } from './TrabajoPendiente';
import { buildPatientExitChecklist } from './patientExitChecklist';
import type { PatientExitActionTarget, PatientExitChecklistItem } from './patientExitChecklist';

export type ClinicalTab = 'primera' | 'pendiente' | 'sesion' | 'visitas';

const CLINICAL_TABS: Array<{ id: ClinicalTab; label: string }> = [
  { id: 'primera', label: 'Diagnóstico' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'sesion', label: 'Sesión actual' },
  { id: 'visitas', label: 'Visitas' },
];

function isToday(value?: string | null) {
  if (!value) return false;
  return value.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function hasFinishedState(value?: string | null) {
  const estado = (value ?? '').toLowerCase();
  return estado.includes('realizado') || estado.includes('facturado') || estado.includes('cobrado') || estado.includes('atendido') || estado.includes('finalizado');
}

function recentClinicalHistory(historial: HistorialClinico[]) {
  return historial
    .slice()
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 5);
}

function getDateKey(value?: string | null) {
  return value?.slice(0, 10) || 'sin-fecha';
}

function getTime(value?: string | null) {
  return value && value.length >= 16 ? value.slice(11, 16) : null;
}

type VisitGroup = {
  id: string;
  date: string;
  sortDate: string;
  citas: Cita[];
  realizados: HistorialClinico[];
  previstos: Array<{ id: string; title: string; detail: string; status: string }>;
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  recetas: RecetaClinica[];
  laboratorio: TrabajoLaboratorio[];
  notasDentales: NotaDental[];
  comentarios: string[];
};

type SessionTreatmentStatus = 'planificado' | 'en_curso' | 'realizado' | 'pospuesto';

type SessionTreatmentOrigen = 'cita' | 'pendiente' | 'manual';

type SessionTreatment = {
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

const SESSION_STATUS_LABELS: Record<SessionTreatmentStatus, string> = {
  planificado: 'Planificado',
  en_curso: 'En curso',
  realizado: 'Realizado',
  pospuesto: 'Pospuesto',
};

const SESION_ITEM_ORIGEN_BY_SOURCE: Record<SessionTreatmentOrigen, 'manual' | 'cita' | 'presupuesto_linea'> = {
  manual: 'manual',
  cita: 'cita',
  pendiente: 'presupuesto_linea',
};

function normalizeSessionText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function sessionTreatmentFromSesionItem(
  item: SesionClinicaItem,
  presupuestos: Presupuesto[],
): SessionTreatment {
  const linea = item.presupuesto_linea_id
    ? presupuestos.flatMap((presupuesto) => presupuesto.lineas).find((row) => row.id === item.presupuesto_linea_id)
    : undefined;
  const presupuesto = linea ? presupuestos.find((row) => row.id === linea.presupuesto_id) : undefined;
  const source: SessionTreatmentOrigen = item.origen === 'presupuesto_linea'
    ? 'pendiente'
    : item.origen === 'cita'
      ? 'cita'
      : 'manual';
  const sourceLabel = source === 'pendiente' && presupuesto
    ? `Ppto. ${presupuesto.numero}`
    : source === 'cita'
      ? 'Cita programada'
      : 'Anadido en sesion';
  const status: SessionTreatmentStatus = item.estado === 'realizado'
    ? 'realizado'
    : (item.estado as SessionTreatmentStatus);
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

function buildSessionTreatments(
  citas: Cita[],
  presupuestos: Presupuesto[],
  historial: HistorialClinico[],
  sesionItems: SesionClinicaItem[],
): SessionTreatment[] {
  const todayAppointments = citas.filter((cita) => isToday(cita.fecha_hora) && !['anulada', 'falta', 'cancelled_by_patient'].includes(cita.estado));
  const completedBudgetLines = new Set(
    historial
      .filter((entrada) => hasFinishedState(entrada.estado) && entrada.presupuesto_linea_id)
      .map((entrada) => entrada.presupuesto_linea_id as string),
  );

  const persistedActive = sesionItems.filter((item) => item.estado !== 'realizado');
  const persistedLineaIds = new Set(persistedActive.map((item) => item.presupuesto_linea_id).filter(Boolean) as string[]);
  const persistedCitaIds = new Set(persistedActive.map((item) => item.cita_id).filter(Boolean) as string[]);
  const items: SessionTreatment[] = persistedActive.map((item) => sessionTreatmentFromSesionItem(item, presupuestos));

  const pendingLines = presupuestos.flatMap((presupuesto) => (
    presupuesto.lineas
      .filter((linea) => (
        !completedBudgetLines.has(linea.id)
        && !persistedLineaIds.has(linea.id)
        && (linea.aceptado || linea.pasado_trabajo_pendiente || presupuesto.estado === 'aceptado')
      ))
      .map((linea) => ({ presupuesto, linea }))
  ));

  pendingLines.forEach(({ presupuesto, linea }) => {
    items.push({
      id: `linea-${linea.id}`,
      sesionItemId: null,
      source: 'pendiente',
      sourceLabel: `Ppto. ${presupuesto.numero}`,
      tratamientoId: linea.tratamiento_id,
      tratamiento: linea.tratamiento,
      title: linea.tratamiento?.nombre ?? 'Tratamiento pendiente',
      piezaDental: linea.pieza_dental ? String(linea.pieza_dental) : '',
      caras: linea.caras ?? '',
      observaciones: '',
      status: 'planificado',
      linea,
    });
  });

  todayAppointments.forEach((cita) => {
    if (persistedCitaIds.has(cita.id)) return;
    const motivo = cita.motivo || 'Tratamiento previsto';
    const normalizedMotivo = normalizeSessionText(motivo);
    const alreadyCovered = items.some((item) => {
      const title = normalizeSessionText(item.title);
      return title && normalizedMotivo && (title.includes(normalizedMotivo) || normalizedMotivo.includes(title));
    });
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

  return items;
}

function buildVisitGroups({
  citas,
  historial,
  presupuestos,
  documentos,
  consentimientos,
  recetas,
  laboratorio,
  notasDentales,
}: {
  citas: Cita[];
  historial: HistorialClinico[];
  presupuestos: Presupuesto[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  recetas: RecetaClinica[];
  laboratorio: TrabajoLaboratorio[];
  notasDentales: NotaDental[];
}) {
  const groups = new Map<string, VisitGroup>();

  function ensure(date: string, sortDate = date) {
    const key = getDateKey(date);
    const existing = groups.get(key);
    if (existing) {
      if (sortDate.localeCompare(existing.sortDate) > 0) existing.sortDate = sortDate;
      return existing;
    }
    const group: VisitGroup = {
      id: key,
      date: key,
      sortDate,
      citas: [],
      realizados: [],
      previstos: [],
      documentos: [],
      consentimientos: [],
      recetas: [],
      laboratorio: [],
      notasDentales: [],
      comentarios: [],
    };
    groups.set(key, group);
    return group;
  }

  citas.forEach((cita) => {
    const group = ensure(cita.fecha_hora, cita.fecha_hora);
    group.citas.push(cita);
    if (cita.observaciones) group.comentarios.push(cita.observaciones);
  });

  historial.forEach((entrada) => {
    const group = ensure(entrada.fecha, entrada.fecha);
    if (hasFinishedState(entrada.estado)) {
      group.realizados.push(entrada);
    } else {
      group.previstos.push({
        id: `hist-${entrada.id}`,
        title: entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento clinico',
        detail: [entrada.pieza_dental ? `Pieza ${entrada.pieza_dental}` : null, entrada.caras].filter(Boolean).join(' - '),
        status: entrada.estado,
      });
    }
    if (entrada.observaciones || entrada.diagnostico) group.comentarios.push(entrada.observaciones || entrada.diagnostico || '');
  });

  presupuestos.forEach((presupuesto) => {
    presupuesto.lineas
      .filter((linea) => linea.aceptado || linea.pasado_trabajo_pendiente)
      .forEach((linea) => {
        const group = ensure(presupuesto.fecha, presupuesto.fecha);
        group.previstos.push({
          id: `linea-${linea.id}`,
          title: linea.tratamiento?.nombre || 'Tratamiento pendiente',
          detail: [
            linea.pieza_dental ? `Pieza ${linea.pieza_dental}` : null,
            linea.caras,
            `Ppto. ${presupuesto.numero}`,
          ].filter(Boolean).join(' - '),
          status: linea.pasado_trabajo_pendiente ? 'pendiente' : 'aceptado',
        });
      });
  });

  // Documentos, recetas, consentimientos y laboratorio no siempre traen visita_id/cita_id;
  // se agrupan por fecha para no inventar relaciones clínicas que aún no existen en backend.
  documentos.forEach((documento) => {
    const date = documento.fecha_documento || documento.created_at;
    if (date) ensure(date, date).documentos.push(documento);
  });
  consentimientos.forEach((consentimiento) => {
    const date = consentimiento.fecha_firma || consentimiento.created_at;
    if (date) ensure(date, date).consentimientos.push(consentimiento);
  });
  recetas.forEach((receta) => {
    ensure(receta.fecha_prescripcion, receta.fecha_prescripcion).recetas.push(receta);
  });
  notasDentales.forEach((nota) => {
    const group = ensure(nota.fecha, nota.fecha);
    group.notasDentales.push(nota);
    group.comentarios.push(`Pieza ${nota.pieza_dental}${nota.caras ? ` - ${nota.caras}` : ''}: ${nota.texto}`);
  });
  laboratorio.forEach((trabajo) => {
    // Sin relacion directa de visita/sesion para laboratorio: se agrupa por fecha operativa disponible.
    const date = trabajo.fecha_recepcion || trabajo.fecha_salida || trabajo.fecha_entrega_prevista;
    if (date) ensure(date, date).laboratorio.push(trabajo);
  });

  gruposPorFecha(groups).forEach((group) => {
    group.citas.sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));
    group.realizados.sort((a, b) => a.fecha.localeCompare(b.fecha));
    group.previstos.sort((a, b) => a.title.localeCompare(b.title));
    group.documentos.sort((a, b) => (a.fecha_documento || a.created_at || '').localeCompare(b.fecha_documento || b.created_at || ''));
    group.consentimientos.sort((a, b) => (a.fecha_firma || a.created_at || '').localeCompare(b.fecha_firma || b.created_at || ''));
    group.recetas.sort((a, b) => a.fecha_prescripcion.localeCompare(b.fecha_prescripcion));
    group.laboratorio.sort((a, b) => (a.fecha_recepcion || a.fecha_salida || a.fecha_entrega_prevista || '').localeCompare(b.fecha_recepcion || b.fecha_salida || b.fecha_entrega_prevista || ''));
  });

  return gruposPorFecha(groups).sort((a, b) => b.sortDate.localeCompare(a.sortDate));
}

function gruposPorFecha(groups: Map<string, VisitGroup>) {
  return Array.from(groups.values());
}

function PatientExitChecklistPanel({
  title,
  ready,
  items,
  onAction,
}: {
  title: string;
  ready: boolean;
  items: PatientExitChecklistItem[];
  onAction: (target: PatientExitActionTarget) => void;
}) {
  const visibleItems = items.filter((item) => (
    item.status !== 'ok' || ['tratamientos-hoy', 'caja', 'proxima-cita'].includes(item.id)
  ));

  return (
    <section className={`desk-panel patient-exit-checklist ${ready ? 'is-ready' : 'needs-review'}`} aria-label="Checklist de salida del paciente">
      <div className="panel-caption patient-exit-head">
        <strong>
          {ready ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
          Checklist de salida
        </strong>
        <span>{title}</span>
      </div>
      <div className="patient-exit-items">
        {visibleItems.map((item) => (
          <article key={item.id} className={`patient-exit-item status-${item.status}`}>
            <span className="patient-exit-status-icon" aria-hidden="true">
              {item.status === 'critical' || item.status === 'warning' ? <AlertTriangle size={14} /> : item.status === 'info' ? <Info size={14} /> : <CheckCircle2 size={14} />}
            </span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </div>
            {item.actionLabel && item.actionTarget && (
              <button type="button" onClick={() => item.actionTarget && onAction(item.actionTarget)}>{item.actionLabel}</button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function buildCreatePayload(item: SessionTreatment): SesionClinicaItemCreateInput {
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

function SessionWorkspace({
  paciente,
  citas,
  historial,
  presupuestos,
  documentos,
  consentimientos,
  recetas,
  laboratorio,
  saldoPendiente,
  tratamientos,
  notasDentales,
  doctorId,
  userRole,
  sesionItems,
  sesionItemsLoading,
  sesionItemsError,
  onCreateSesionItem,
  onUpdateSesionItem,
  onDeleteSesionItem,
  onCrearReceta,
  onOpenConsentimiento,
  onCrearPedidoLab,
  onCrearPedidoLabForLine,
  onOpenDocumentos,
  onOpenHistorial,
  onSchedulePatient,
  onOpenCobro,
  onFinalizarTratamientoSesion,
  onCreateNotaDental,
}: {
  paciente: ApiPaciente | null;
  citas: Cita[];
  historial: HistorialClinico[];
  presupuestos: Presupuesto[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  recetas: RecetaClinica[];
  laboratorio: TrabajoLaboratorio[];
  saldoPendiente: number;
  tratamientos: TratamientoCatalogo[];
  notasDentales: NotaDental[];
  doctorId?: string | null;
  userRole?: UserRole | null;
  sesionItems: SesionClinicaItem[];
  sesionItemsLoading: boolean;
  sesionItemsError: string | null;
  onCreateSesionItem: (input: SesionClinicaItemCreateInput) => Promise<SesionClinicaItem>;
  onUpdateSesionItem: (itemId: string, cambios: SesionClinicaItemUpdateInput) => Promise<SesionClinicaItem>;
  onDeleteSesionItem: (itemId: string) => Promise<unknown>;
  onCrearReceta: () => void;
  onOpenConsentimiento: () => void;
  onCrearPedidoLab: () => void;
  onCrearPedidoLabForLine: (linea: PresupuestoLinea) => void;
  onOpenDocumentos: () => void;
  onOpenHistorial: () => void;
  onSchedulePatient?: () => void;
  onOpenCobro?: () => void;
  onFinalizarTratamientoSesion: (data: SesionTratamientoRealizadoInput) => Promise<HistorialClinico>;
  onCreateNotaDental: (data: NotaDentalCreateInput) => Promise<NotaDental>;
}) {
  const previstosHoy = citas.filter((cita) => isToday(cita.fecha_hora) && !['anulada', 'falta', 'cancelled_by_patient'].includes(cita.estado));
  const recientes = recentClinicalHistory(historial);
  const [sessionStartedAt] = useState(() => new Date().toISOString());
  const proximaCita = useMemo(() => {
    const now = Date.parse(sessionStartedAt);
    return citas
      .filter((cita) => {
        const timestamp = Date.parse(cita.fecha_hora);
        return Number.isFinite(timestamp)
          && timestamp >= now
          && !['anulada', 'falta', 'cancelled_by_patient'].includes(cita.estado);
      })
      .sort((a, b) => Date.parse(a.fecha_hora) - Date.parse(b.fecha_hora))[0] ?? null;
  }, [citas, sessionStartedAt]);
  const baseSessionItems = useMemo(
    () => buildSessionTreatments(citas, presupuestos, historial, sesionItems),
    [citas, historial, presupuestos, sesionItems],
  );
  const [draftItems, setDraftItems] = useState<SessionTreatment[]>(baseSessionItems);
  const [selectedId, setSelectedId] = useState<string | null>(baseSessionItems[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [quickNote, setQuickNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const pendingMaterialize = useRef<Map<string, Promise<SessionTreatment | null>>>(new Map());
  const materializedAlias = useRef<Map<string, SessionTreatment>>(new Map());
  const selected = draftItems.find((item) => item.id === selectedId) ?? draftItems[0] ?? null;
  const filteredCatalog = tratamientos.filter((tratamiento) => {
    const q = normalizeSessionText(catalogSearch);
    if (!q) return true;
    return normalizeSessionText(`${tratamiento.codigo ?? ''} ${tratamiento.nombre} ${tratamiento.familia?.nombre ?? ''}`).includes(q);
  }).slice(0, 80);
  const selectedPieceNumber = selected?.piezaDental ? Number(selected.piezaDental) : null;
  const selectedPieceNotes = selectedPieceNumber
    ? notasDentales.filter((nota) => nota.pieza_dental === selectedPieceNumber).slice(0, 3)
    : [];
  const exitChecklist = useMemo(() => buildPatientExitChecklist({
    paciente,
    citas,
    historial,
    presupuestos,
    consentimientos,
    recetas,
    laboratorio,
    documentos,
    saldoPendiente,
  }), [citas, consentimientos, documentos, historial, laboratorio, paciente, presupuestos, recetas, saldoPendiente]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setDraftItems(baseSessionItems);
      setSelectedId((current) => {
        if (current && baseSessionItems.some((item) => item.id === current)) return current;
        return baseSessionItems[0]?.id ?? null;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [baseSessionItems]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setQuickNote('');
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function updateLocal(patch: Partial<SessionTreatment>) {
    if (!selected) return;
    setDraftItems((current) => current.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
  }

  async function ensurePersistedItem(item: SessionTreatment): Promise<SessionTreatment | null> {
    if (item.sesionItemId) return item;
    const cached = materializedAlias.current.get(item.id);
    if (cached?.sesionItemId) return cached;
    const inflight = pendingMaterialize.current.get(item.id);
    if (inflight) return inflight;
    const promise = (async () => {
      try {
        const created = await onCreateSesionItem(buildCreatePayload(item));
        const promoted = sessionTreatmentFromSesionItem(created, presupuestos);
        materializedAlias.current.set(item.id, promoted);
        setDraftItems((current) => current.map((row) => row.id === item.id ? promoted : row));
        setSelectedId((current) => (current === item.id ? promoted.id : current));
        return promoted;
      } finally {
        pendingMaterialize.current.delete(item.id);
      }
    })();
    pendingMaterialize.current.set(item.id, promise);
    return promise;
  }

  async function persistUpdate(item: SessionTreatment, cambios: SesionClinicaItemUpdateInput) {
    const persisted = await ensurePersistedItem(item);
    if (!persisted?.sesionItemId) return;
    if (Object.keys(cambios).length === 0) return;
    try {
      const updated = await onUpdateSesionItem(persisted.sesionItemId, cambios);
      const refreshed = sessionTreatmentFromSesionItem(updated, presupuestos);
      setDraftItems((current) => current.map((row) => {
        if (row.id !== persisted.id) return row;
        return {
          ...refreshed,
          // Preserve client-only fields that backend doesn't echo (e.g. historialId set by finalize race).
          historialId: row.historialId ?? refreshed.historialId,
          status: row.historialId ? row.status : refreshed.status,
        };
      }));
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'No se pudo guardar el cambio en la sesion.');
    }
  }

  function pieceToUpdate(pieza: string) {
    const trimmed = pieza.replace(/[^\d]/g, '').slice(0, 2);
    return trimmed ? Number(trimmed) : null;
  }

  async function addTreatmentFromCatalog() {
    const tratamiento = tratamientos.find((item) => item.id === selectedCatalogId) ?? filteredCatalog[0];
    if (!tratamiento) return;
    setSessionError(null);
    setAdding(false);
    setCatalogSearch('');
    setSelectedCatalogId('');
    try {
      const created = await onCreateSesionItem({
        tratamiento_id: tratamiento.id,
        titulo: tratamiento.nombre,
        estado: 'en_curso',
        origen: 'manual',
      });
      const promoted = sessionTreatmentFromSesionItem(created, presupuestos);
      setSelectedId(promoted.id);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'No se pudo anadir el tratamiento a la sesion.');
    }
  }

  async function removeSelected() {
    if (!selected) return;
    setSessionError(null);
    if (!selected.sesionItemId) {
      setDraftItems((current) => {
        const next = current.filter((item) => item.id !== selected.id);
        setSelectedId(next[0]?.id ?? null);
        return next;
      });
      return;
    }
    try {
      setSavingId(selected.id);
      await onDeleteSesionItem(selected.sesionItemId);
      setSelectedId(null);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'No se pudo eliminar el item de la sesion.');
    } finally {
      setSavingId(null);
    }
  }

  function applyDentalTarget(selection: ToothSelection) {
    if (!selected) return;
    const cara = mapSurfaceToCaras(selection.surface);
    const piezaDental = selection.toothNumber.replace(/[^\d]/g, '').slice(0, 2);
    const caras = cara ?? selected.caras;
    updateLocal({ piezaDental, caras });
    void persistUpdate(selected, { pieza_dental: piezaDental ? Number(piezaDental) : null, caras: caras || null });
  }

  async function finishSelectedTreatment() {
    if (!paciente || !selected || selected.historialId) return;
    if (!selected.tratamientoId) {
      setSessionError('Asocia un tratamiento del catalogo antes de guardarlo en historial.');
      return;
    }
    setSessionError(null);
    setSavingId(selected.id);
    try {
      const persisted = await ensurePersistedItem(selected);
      if (!persisted) return;
      const historialCreado = await onFinalizarTratamientoSesion({
        paciente_id: paciente.id,
        tratamiento_id: persisted.tratamientoId!,
        doctor_id: doctorId ?? null,
        gabinete_id: null,
        cita_id: persisted.citaId ?? null,
        presupuesto_linea_id: persisted.linea?.id ?? null,
        sesion_item_id: persisted.sesionItemId ?? null,
        pieza_dental: persisted.piezaDental ? Number(persisted.piezaDental) : null,
        caras: persisted.caras || null,
        procedimiento: persisted.title.trim() || persisted.tratamiento?.nombre || null,
        observaciones: persisted.observaciones.trim() || null,
        origen: persisted.source === 'pendiente' ? 'presupuesto_linea' : persisted.source,
        importe: persisted.linea?.importe_neto ?? persisted.linea?.precio_unitario ?? null,
      });
      setDraftItems((current) => current.map((item) => item.id === persisted.id ? {
        ...item,
        status: 'realizado' as SessionTreatmentStatus,
        historialId: historialCreado.id,
        sourceLabel: item.source === 'manual' ? 'Historial' : item.sourceLabel,
      } : item));
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'No se pudo guardar el tratamiento en historial.');
    } finally {
      setSavingId(null);
    }
  }

  async function saveQuickDentalNote() {
    if (!paciente || !selected || !selectedPieceNumber || !quickNote.trim()) return;
    setSavingNote(true);
    setSessionError(null);
    try {
      await onCreateNotaDental({
        paciente_id: paciente.id,
        pieza_dental: selectedPieceNumber,
        caras: selected.caras || null,
        texto: quickNote.trim(),
        doctor_id: doctorId ?? null,
        cita_id: selected.citaId ?? null,
      });
      setQuickNote('');
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'No se pudo guardar la nota de pieza.');
    } finally {
      setSavingNote(false);
    }
  }

  function handleExitChecklistAction(target: PatientExitActionTarget) {
    if (target === 'agenda') onSchedulePatient?.();
    if (target === 'caja') onOpenCobro?.();
    if (target === 'consentimiento') onOpenConsentimiento();
    if (target === 'historial') onOpenHistorial();
    if (target === 'receta') onCrearReceta();
    if (target === 'laboratorio') onCrearPedidoLab();
    if (target === 'documentos') onOpenDocumentos();
  }

  return (
    <div className="clinical-session-stack">
      <div className="clinical-session-workbench">
        <section className="desk-panel clinical-session-board">
        <div className="session-board-head">
          <div>
            <span>Sesion actual</span>
            <strong>{draftItems.length} tratamientos</strong>
          </div>
          <button type="button" className="primary-action" onClick={() => setAdding((open) => !open)} disabled={!paciente}>
            <Plus size={14} aria-hidden="true" /> Anadir
          </button>
        </div>
        {adding && (
          <div className="session-add-panel">
            <input
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder="Buscar tratamiento en catalogo"
            />
            <select value={selectedCatalogId} onChange={(event) => setSelectedCatalogId(event.target.value)}>
              <option value="">Seleccionar tratamiento...</option>
              {filteredCatalog.map((tratamiento) => (
                <option key={tratamiento.id} value={tratamiento.id}>
                  {tratamiento.codigo ? `${tratamiento.codigo} - ` : ''}{tratamiento.nombre}
                </option>
              ))}
            </select>
            <button type="button" onClick={addTreatmentFromCatalog} disabled={!filteredCatalog.length}>Anadir a sesion</button>
          </div>
        )}
        {sesionItemsError && (
          <p className="session-save-error" role="alert">{sesionItemsError}</p>
        )}
        <div className="session-treatment-list" role="list" aria-label="Tratamientos de la sesion">
          {sesionItemsLoading && !draftItems.length && (
            <div className="session-empty-state"><span>Cargando sesion del paciente...</span></div>
          )}
          {draftItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`session-treatment-row ${selected?.id === item.id ? 'active' : ''} session-status-${item.status}`}
              onClick={() => setSelectedId(item.id)}
            >
              <span className={`session-treatment-source source-${item.source}`}>
                {item.source === 'pendiente' ? 'Ppto.' : item.source === 'cita' ? 'Cita' : 'Manual'}
              </span>
              <span className="session-treatment-copy">
                <strong>{item.title}</strong>
                <em>{item.piezaDental ? `Pieza ${item.piezaDental}${item.caras ? ` - ${item.caras}` : ''}` : 'Sin pieza'}</em>
                <span className="session-treatment-origin">{item.sourceLabel}</span>
              </span>
              <small>{item.historialId ? 'En historial' : SESSION_STATUS_LABELS[item.status]}</small>
            </button>
          ))}
          {!sesionItemsLoading && !draftItems.length && (
            <div className="session-empty-state">
              <strong>Sin tratamientos en la sesion</strong>
              <span>Anade uno desde catalogo o usa tratamientos aceptados del paciente.</span>
            </div>
          )}
        </div>
        </section>
        <section className="desk-panel clinical-session-detail">
        {selected ? (
          <>
            <div className="session-detail-head">
              <div className="session-detail-title">
                <span className={`session-treatment-source source-${selected.source}`}>
                  {selected.source === 'pendiente' ? 'Presupuesto' : selected.source === 'cita' ? 'Cita' : 'Manual'}
                </span>
                <strong>{selected.title}</strong>
                <small>{selected.piezaDental ? `Pieza ${selected.piezaDental}${selected.caras ? ` - ${selected.caras}` : ''}` : 'Sin pieza asignada'} - {selected.sourceLabel}</small>
                {selected.tratamiento && <TreatmentBadge tratamiento={selected.tratamiento} />}
              </div>
              <select
                value={selected.status}
                onChange={(event) => {
                  const value = event.target.value as SessionTreatmentStatus;
                  if (value === 'realizado') return;
                  updateLocal({ status: value });
                  void persistUpdate(selected, { estado: value });
                }}
                aria-label="Estado del tratamiento en sesion"
                disabled={Boolean(selected.historialId)}
              >
                {Object.entries(SESSION_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value} disabled={value === 'realizado' && !selected.historialId}>{label}</option>
                ))}
              </select>
            </div>
            <div className="session-detail-grid">
              <label>Nombre en sesion
                <input
                  value={selected.title}
                  onChange={(event) => updateLocal({ title: event.target.value })}
                  onBlur={() => persistUpdate(selected, { titulo: selected.title.trim() || null })}
                />
              </label>
              <label>Tratamiento catalogo
                <select
                  value={selected.tratamientoId ?? ''}
                  onChange={(event) => {
                    const tratamiento = tratamientos.find((item) => item.id === event.target.value) ?? null;
                    const nextTitle = tratamiento?.nombre ?? selected.title;
                    updateLocal({
                      tratamientoId: tratamiento?.id ?? null,
                      tratamiento,
                      title: nextTitle,
                    });
                    void persistUpdate(selected, {
                      tratamiento_id: tratamiento?.id ?? null,
                      titulo: nextTitle.trim() || null,
                    });
                  }}
                >
                  <option value="">Sin catalogo asociado</option>
                  {tratamientos.map((tratamiento) => (
                    <option key={tratamiento.id} value={tratamiento.id}>
                      {tratamiento.codigo ? `${tratamiento.codigo} - ` : ''}{tratamiento.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>Pieza FDI
                <input
                  inputMode="numeric"
                  value={selected.piezaDental}
                  onChange={(event) => updateLocal({ piezaDental: event.target.value.replace(/[^\d]/g, '').slice(0, 2) })}
                  onBlur={() => persistUpdate(selected, { pieza_dental: pieceToUpdate(selected.piezaDental) })}
                  placeholder="24"
                />
              </label>
              <label>Caras
                <input
                  value={selected.caras}
                  onChange={(event) => updateLocal({ caras: event.target.value.toUpperCase().replace(/[^MODVLP]/g, '').slice(0, 6) })}
                  onBlur={() => persistUpdate(selected, { caras: selected.caras || null })}
                  placeholder="MOD"
                />
              </label>
              <label className="wide">Observacion clinica del tratamiento
                <textarea
                  value={selected.observaciones}
                  onChange={(event) => updateLocal({ observaciones: event.target.value })}
                  onBlur={() => persistUpdate(selected, { observaciones: selected.observaciones.trim() || null })}
                  placeholder="Material, anestesia, evolucion, incidencias, indicaciones..."
                />
              </label>
              <div className="wide session-tooth-note">
                <label>Nota rapida de pieza
                  <textarea
                    value={quickNote}
                    onChange={(event) => setQuickNote(event.target.value)}
                    placeholder={selectedPieceNumber ? `Nota para pieza ${selectedPieceNumber}${selected.caras ? ` - ${selected.caras}` : ''}` : 'Seleccione una pieza antes de guardar nota'}
                    disabled={!selectedPieceNumber}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void saveQuickDentalNote()}
                  disabled={!selectedPieceNumber || !quickNote.trim() || savingNote}
                >
                  {savingNote ? 'Guardando nota...' : 'Guardar nota de pieza'}
                </button>
                {selectedPieceNotes.length > 0 && (
                  <div className="session-tooth-note-history">
                    {selectedPieceNotes.map((nota) => (
                      <span key={nota.id}>{formatDate(nota.fecha)}: {nota.texto}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="session-treatment-actions">
              <button type="button" onClick={finishSelectedTreatment} disabled={savingId === selected.id || Boolean(selected.historialId) || !selected.tratamientoId}>
                <CheckCircle2 size={14} aria-hidden="true" /> {selected.historialId ? 'Guardado en historial' : savingId === selected.id ? 'Guardando...' : 'Finalizar como realizado'}
              </button>
              <button
                type="button"
                onClick={() => {
                  updateLocal({ status: 'pospuesto' });
                  void persistUpdate(selected, { estado: 'pospuesto' });
                }}
                disabled={Boolean(selected.historialId) || savingId === selected.id}
              >
                <Clock3 size={14} aria-hidden="true" /> Posponer
              </button>
              <button
                type="button"
                onClick={() => void removeSelected()}
                disabled={Boolean(selected.historialId) || savingId === selected.id}
              >
                <Trash2 size={14} aria-hidden="true" /> Eliminar de sesion
              </button>
            </div>
            {sessionError && <p className="session-save-error" role="alert">{sessionError}</p>}
            <details className="session-secondary-actions">
              <summary>Mas acciones del tratamiento</summary>
              <div>
                <button type="button" onClick={onCrearReceta} disabled={!paciente}><Pill size={14} aria-hidden="true" /> Receta</button>
                <button type="button" onClick={onOpenConsentimiento} disabled={!paciente}><FileText size={14} aria-hidden="true" /> Consentimiento</button>
                <button
                  type="button"
                  onClick={() => selected.linea ? onCrearPedidoLabForLine(selected.linea) : onCrearPedidoLab()}
                  disabled={!paciente}
                >
                  <FlaskConical size={14} aria-hidden="true" /> Laboratorio
                </button>
                <button type="button" onClick={onOpenDocumentos} disabled={!paciente}><NotebookPen size={14} aria-hidden="true" /> Documentos / fotos</button>
              </div>
            </details>
          </>
        ) : (
          <p className="session-empty-detail">Selecciona o anade un tratamiento para editar la sesion.</p>
        )}
        </section>
        <aside className="clinical-session-context">
          <PatientExitChecklistPanel
            title={exitChecklist.title}
            ready={exitChecklist.ready}
            items={exitChecklist.items}
            onAction={handleExitChecklistAction}
          />
          <section className="session-context-card">
            <span>Proxima cita</span>
            {proximaCita ? (
              <>
                <strong>{formatDate(proximaCita.fecha_hora)} {getTime(proximaCita.fecha_hora)}</strong>
                <small>{proximaCita.motivo || 'Cita sin motivo'} - {proximaCita.estado}</small>
              </>
            ) : (
              <>
                <strong>Sin cita programada</strong>
                <small>Agenda una revision antes de cerrar la sesion si procede.</small>
              </>
            )}
            {onSchedulePatient && (
              <button type="button" onClick={onSchedulePatient}>Abrir agenda</button>
            )}
          </section>
          <section className="session-context-card">
            <span>Historial reciente</span>
            <div className="session-context-list">
              {recientes.slice(0, 2).map((entrada) => (
                <article key={entrada.id}>
                  <time>{formatDate(entrada.fecha)}</time>
                  <strong>{entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental'}</strong>
                  <small>Pieza {entrada.pieza_dental ?? '-'} - {entrada.estado}</small>
                </article>
              ))}
              {!recientes.length && <p>Sin historial clinico reciente.</p>}
            </div>
            <button type="button" onClick={onOpenHistorial}>Abrir historial</button>
          </section>
          <details className="session-context-details">
            <summary>Informacion secundaria</summary>
            <div className="clinical-list">
              {previstosHoy.map((cita) => (
                <article key={cita.id}>
                  <time>{cita.fecha_hora.slice(11, 16)}</time>
                  <strong>{cita.motivo || 'Cita sin motivo'}</strong>
                  <span>{cita.estado}</span>
                  {cita.observaciones && <small>{cita.observaciones}</small>}
                </article>
              ))}
              {!previstosHoy.length && <p>No hay tratamientos previstos hoy.</p>}
            </div>
          </details>
        </aside>
      </div>
      <details className="secondary-clinic-panel session-odontogram-support">
        <summary>Abrir odontograma de trabajo</summary>
        <PatientOdontogramFlow
          paciente={paciente}
          mode="current"
          title="Odontograma clinico de trabajo"
          subtitle="Selecciona una pieza o superficie para aplicarla al tratamiento activo de la sesion."
          enableQuickTreatments={false}
          userRole={userRole}
          onSelectDentalTarget={applyDentalTarget}
        />
      </details>
    </div>
  );
}

function VisitsWorkspace({
  citas,
  historial,
  presupuestos,
  documentos,
  consentimientos,
  recetas,
  laboratorio,
  notasDentales,
  onOpenHistorial,
}: {
  citas: Cita[];
  historial: HistorialClinico[];
  presupuestos: Presupuesto[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  recetas: RecetaClinica[];
  laboratorio: TrabajoLaboratorio[];
  notasDentales: NotaDental[];
  onOpenHistorial: () => void;
}) {
  const visitas = useMemo(() => buildVisitGroups({
    citas,
    historial,
    presupuestos,
    documentos,
    consentimientos,
    recetas,
    laboratorio,
    notasDentales,
  }), [citas, consentimientos, documentos, historial, laboratorio, notasDentales, presupuestos, recetas]);
  const citasOrdenadas = useMemo(() => citas.slice().sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora)), [citas]);

  function nextAfter(date: string) {
    return citasOrdenadas.find((cita) => cita.fecha_hora.slice(0, 10) > date);
  }

  return (
    <section className="visits-workspace">
      <header className="visits-head">
        <div>
          <span><CalendarDays size={15} aria-hidden="true" /> Visitas del paciente</span>
          <strong>{visitas.length} dia{visitas.length === 1 ? '' : 's'} con actividad clinica</strong>
        </div>
        <button type="button" onClick={onOpenHistorial}>Abrir historial completo</button>
      </header>
      <div className="visits-list">
        {visitas.map((visita) => {
          const citaPrincipal = visita.citas[0];
          const proxima = nextAfter(visita.date);
          const doctor = citaPrincipal?.doctor?.nombre || visita.realizados.find((entrada) => entrada.doctor?.nombre)?.doctor?.nombre || visita.laboratorio.find((trabajo) => trabajo.doctor?.nombre)?.doctor?.nombre;
          const gabinete = citaPrincipal?.gabinete_id;
          const motivoCita = visita.citas.map((cita) => cita.motivo).filter(Boolean).join(' - ');
          const estadoVisita = visita.citas.length
            ? `${visita.citas.length} cita${visita.citas.length === 1 ? '' : 's'}`
            : visita.realizados.length ? 'con tratamientos' : 'actividad clinica';
          const tituloVisita = motivoCita || visita.realizados[0]?.procedimiento || visita.realizados[0]?.tratamiento?.nombre || 'Visita clinica';
          const comments = Array.from(new Set(visita.comentarios.filter(Boolean))).slice(0, 3);
          return (
            <article key={visita.id} className="visit-card">
              <header>
                <time>{formatDate(visita.date)}{getTime(citaPrincipal?.fecha_hora) ? ` - ${getTime(citaPrincipal?.fecha_hora)}` : ''}</time>
                <span>{citaPrincipal?.estado || estadoVisita}</span>
                <div>
                  <strong>Motivo: {tituloVisita}</strong>
                  <p>{[doctor, gabinete ? `Gab. ${gabinete}` : null, citaPrincipal?.duracion_min ? `${citaPrincipal.duracion_min} min` : null].filter(Boolean).join(' - ') || 'Sin doctor o gabinete asignado'}</p>
                </div>
                <button type="button" onClick={onOpenHistorial}>Abrir detalle en Historial</button>
              </header>
              <div className="visit-body">
                <section>
                  <span>Realizado</span>
                  {visita.realizados.slice(0, 4).map((entrada) => (
                    <p key={entrada.id}>
                      <strong>{entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental'}</strong>
                      <small>{[entrada.pieza_dental ? `Pieza ${entrada.pieza_dental}` : null, entrada.caras, entrada.estado].filter(Boolean).join(' - ')}</small>
                    </p>
                  ))}
                  {!visita.realizados.length && <em>Sin tratamientos realizados registrados ese dia.</em>}
                </section>
                <section>
                  <span>Previsto / pospuesto</span>
                  {visita.previstos.slice(0, 3).map((item) => (
                    <p key={item.id}>
                      <strong>{item.title}</strong>
                      <small>{[item.detail, item.status].filter(Boolean).join(' - ')}</small>
                    </p>
                  ))}
                  {!visita.previstos.length && <em>Sin pendientes asociados por fecha.</em>}
                </section>
                <section className="visit-comments">
                  <span>Comentarios</span>
                  {comments.map((comentario, index) => <p key={`${visita.id}-comment-${index}`}>{comentario}</p>)}
                  {!comments.length && <em>Sin comentarios clinicos u observaciones de cita.</em>}
                </section>
                <section className="visit-links">
                  <span>Asociado por fecha</span>
                  <p>
                    <small>{visita.documentos.length} docs</small>
                    <small>{visita.recetas.length} recetas</small>
                    <small>{visita.consentimientos.length} consent.</small>
                    <small>{visita.laboratorio.length} lab.</small>
                  </p>
                  {[...visita.recetas.slice(0, 1).map((receta) => receta.medicamento), ...visita.documentos.slice(0, 1).map((documento) => documento.descripcion || documento.nombre_original), ...visita.laboratorio.slice(0, 1).map((trabajo) => trabajo.descripcion)].map((item, index) => (
                    <em key={`${visita.id}-assoc-${index}`}>{item}</em>
                  ))}
                  {proxima && <em>Proxima cita: {formatDate(proxima.fecha_hora)} {getTime(proxima.fecha_hora)} - {proxima.motivo || 'sin motivo'}</em>}
                </section>
              </div>
            </article>
          );
        })}
        {!visitas.length && (
          <div className="visits-empty">
            <strong>Sin visitas registradas</strong>
            <span>Cuando haya citas, tratamientos o documentos con fecha se agruparan aqui.</span>
          </div>
        )}
      </div>
    </section>
  );
}

export function ClinicalWorkspace({
  activeTab,
  onTabChange,
  paciente,
  citas,
  historial,
  presupuestos,
  documentos,
  consentimientos,
  recetas,
  notasDentales,
  laboratorio,
  saldoPendiente,
  doctorId,
  tratamientos,
  savingPrimeraVisita,
  onSavePrimeraVisita,
  onDarCita,
  onContextLinea,
  onCrearPedidoLab,
  onCrearPedidoLabGeneral,
  onCrearReceta,
  onOpenConsentimiento,
  onOpenDocumentos,
  onOpenPresupuestos,
  onOpenHistorial,
  onSchedulePatient,
  onOpenCobro,
  onFinalizarTratamientoSesion,
  onCreateNotaDental,
  sesionItems,
  sesionItemsLoading,
  sesionItemsError,
  onCreateSesionItem,
  onUpdateSesionItem,
  onDeleteSesionItem,
  userRole,
}: {
  activeTab: ClinicalTab;
  onTabChange: (tab: ClinicalTab) => void;
  paciente: ApiPaciente | null;
  citas: Cita[];
  historial: HistorialClinico[];
  presupuestos: Presupuesto[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  recetas: RecetaClinica[];
  notasDentales: NotaDental[];
  laboratorio: TrabajoLaboratorio[];
  saldoPendiente: number;
  doctorId?: string | null;
  tratamientos: TratamientoCatalogo[];
  savingPrimeraVisita: boolean;
  onSavePrimeraVisita: (data: PrimeraVisitaData) => void;
  onDarCita: (linea: PresupuestoLinea) => void;
  onContextLinea: (event: MouseEvent, linea: PresupuestoLinea) => void;
  onCrearPedidoLab: (linea: PresupuestoLinea) => void;
  onCrearPedidoLabGeneral: () => void;
  onCrearReceta: () => void;
  onOpenConsentimiento: (tipo?: string) => void;
  onOpenDocumentos: () => void;
  onOpenPresupuestos: () => void;
  onOpenHistorial: () => void;
  onSchedulePatient?: () => void;
  onOpenCobro?: () => void;
  onFinalizarTratamientoSesion: (data: SesionTratamientoRealizadoInput) => Promise<HistorialClinico>;
  onCreateNotaDental: (data: NotaDentalCreateInput) => Promise<NotaDental>;
  sesionItems: SesionClinicaItem[];
  sesionItemsLoading: boolean;
  sesionItemsError: string | null;
  onCreateSesionItem: (input: SesionClinicaItemCreateInput) => Promise<SesionClinicaItem>;
  onUpdateSesionItem: (itemId: string, cambios: SesionClinicaItemUpdateInput) => Promise<SesionClinicaItem>;
  onDeleteSesionItem: (itemId: string) => Promise<unknown>;
  userRole?: UserRole | null;
}) {
  return (
    <section className="clinical-workspace">
      <nav className="treatment-subtabs clinical-subtabs" aria-label="Secciones de clínica">
        {CLINICAL_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeTab === item.id ? 'active' : ''}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
        <button type="button" className="clinical-subtab-action" onClick={onOpenPresupuestos} disabled={!paciente}>
          Presupuestos
        </button>
      </nav>

      {activeTab === 'primera' && (
        <PrimeraVisitaPanel
          paciente={paciente}
          onSave={onSavePrimeraVisita}
          saving={savingPrimeraVisita}
          userRole={userRole}
        />
      )}
      {activeTab === 'pendiente' && (
        <TrabajoPendientePanel
          presupuestos={presupuestos}
          citas={citas}
          historial={historial}
          paciente={paciente}
          onDarCita={onDarCita}
          onContextLinea={onContextLinea}
          onCrearPedidoLab={onCrearPedidoLab}
          userRole={userRole}
        />
      )}
      {activeTab === 'sesion' && (
        <SessionWorkspace
          paciente={paciente}
          citas={citas}
          historial={historial}
          presupuestos={presupuestos}
          documentos={documentos}
          consentimientos={consentimientos}
          recetas={recetas}
          laboratorio={laboratorio}
          saldoPendiente={saldoPendiente}
          tratamientos={tratamientos}
          notasDentales={notasDentales}
          doctorId={doctorId}
          userRole={userRole}
          sesionItems={sesionItems}
          sesionItemsLoading={sesionItemsLoading}
          sesionItemsError={sesionItemsError}
          onCreateSesionItem={onCreateSesionItem}
          onUpdateSesionItem={onUpdateSesionItem}
          onDeleteSesionItem={onDeleteSesionItem}
          onCrearReceta={onCrearReceta}
          onOpenConsentimiento={() => onOpenConsentimiento()}
          onCrearPedidoLab={onCrearPedidoLabGeneral}
          onCrearPedidoLabForLine={onCrearPedidoLab}
          onOpenDocumentos={onOpenDocumentos}
          onOpenHistorial={onOpenHistorial}
          onSchedulePatient={onSchedulePatient}
          onOpenCobro={onOpenCobro}
          onFinalizarTratamientoSesion={onFinalizarTratamientoSesion}
          onCreateNotaDental={onCreateNotaDental}
        />
      )}
      {activeTab === 'visitas' && (
        <VisitsWorkspace
          citas={citas}
          historial={historial}
          presupuestos={presupuestos}
          documentos={documentos}
          consentimientos={consentimientos}
          recetas={recetas}
          laboratorio={laboratorio}
          notasDentales={notasDentales}
          onOpenHistorial={onOpenHistorial}
        />
      )}
    </section>
  );
}
