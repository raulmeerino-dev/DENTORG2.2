import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { CalendarDays, CheckCircle2, ClipboardList, Clock3, FileText, FlaskConical, History, NotebookPen, Pill, Plus, Stethoscope, Trash2, Wallet } from 'lucide-react';
import type {
  ApiPaciente,
  Cita,
  Consentimiento,
  DocumentoPaciente,
  HistorialClinico,
  NotaDental,
  NotaDentalCreateInput,
  PlantillaConsentimiento,
  Presupuesto,
  PresupuestoLinea,
  RecetaClinica,
  SesionTratamientoRealizadoInput,
  TrabajoLaboratorio,
  TrabajoLaboratorioUpdateInput,
  TratamientoCatalogo,
  UserRole,
} from '../../types/api';
import { formatDate, money } from '../../lib/utils';
import { TreatmentBadge } from '../../components/TreatmentBadge';
import { PatientOdontogramFlow, mapSurfaceToCaras } from '../odontogram';
import type { ToothSelection } from '../odontogram';
import { ConsentimientosPanel } from './Consentimientos';
import { LaboratorioPacientePanel } from './Laboratorio';
import { PrimeraVisitaPanel } from './PrimeraVisita';
import type { PrimeraVisitaData } from './PrimeraVisita';
import { TrabajoPendientePanel } from './TrabajoPendiente';
import { contarLaboratorioVencidos } from './laboratorioUtils';

export type ClinicalTab = 'primera' | 'pendiente' | 'sesion' | 'visitas' | 'notas';

const CLINICAL_TABS: Array<{ id: ClinicalTab; label: string }> = [
  { id: 'primera', label: 'Diagnostico' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'sesion', label: 'Sesion actual' },
  { id: 'visitas', label: 'Visitas' },
  { id: 'notas', label: 'Notas / docs' },
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

type SessionTreatment = {
  id: string;
  source: 'cita' | 'pendiente' | 'manual';
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

function normalizeSessionText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildSessionTreatments(citas: Cita[], presupuestos: Presupuesto[], historial: HistorialClinico[]): SessionTreatment[] {
  const todayAppointments = citas.filter((cita) => isToday(cita.fecha_hora) && !['anulada', 'falta'].includes(cita.estado));
  const completedBudgetLines = new Set(
    historial
      .filter((entrada) => hasFinishedState(entrada.estado) && entrada.presupuesto_linea_id)
      .map((entrada) => entrada.presupuesto_linea_id as string),
  );
  const pendingLines = presupuestos.flatMap((presupuesto) => (
    presupuesto.lineas
      .filter((linea) => !completedBudgetLines.has(linea.id) && (linea.aceptado || linea.pasado_trabajo_pendiente || presupuesto.estado === 'aceptado'))
      .map((linea) => ({ presupuesto, linea }))
  ));
  const items: SessionTreatment[] = [];

  pendingLines.forEach(({ presupuesto, linea }) => {
    items.push({
      id: `linea-${linea.id}`,
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
    const motivo = cita.motivo || 'Tratamiento previsto';
    const normalizedMotivo = normalizeSessionText(motivo);
    const alreadyCovered = items.some((item) => {
      const title = normalizeSessionText(item.title);
      return title && normalizedMotivo && (title.includes(normalizedMotivo) || normalizedMotivo.includes(title));
    });
    if (alreadyCovered) return;
    items.push({
      id: `cita-${cita.id}`,
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
    const date = trabajo.fecha_recepcion || trabajo.fecha_salida || trabajo.fecha_entrega_prevista;
    if (date) ensure(date, date).laboratorio.push(trabajo);
  });

  return Array.from(groups.values()).sort((a, b) => b.sortDate.localeCompare(a.sortDate));
}

function ClinicalOverview({
  citas,
  historial,
  presupuestos,
  documentos,
  consentimientos,
  laboratorio,
  saldoPendiente,
}: {
  citas: Cita[];
  historial: HistorialClinico[];
  presupuestos: Presupuesto[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  laboratorio: TrabajoLaboratorio[];
  saldoPendiente: number;
}) {
  const pendientes = presupuestos.flatMap((presupuesto) => (
    presupuesto.lineas.filter((linea) => linea.aceptado || linea.pasado_trabajo_pendiente || presupuesto.estado === 'aceptado')
  ));
  const previstosHoy = citas.filter((cita) => isToday(cita.fecha_hora) && !['anulada', 'falta'].includes(cita.estado));
  const realizados = historial.filter((entrada) => hasFinishedState(entrada.estado));
  const consentimientosPendientes = consentimientos.filter((item) => item.estado !== 'firmado' && item.estado !== 'revocado').length;
  const labVencidos = contarLaboratorioVencidos(laboratorio);

  return (
    <section className="clinical-overview" aria-label="Resumen clinico operativo">
      <div className="clinical-overview-item">
        <span><ClipboardList size={14} aria-hidden="true" /> Pendientes</span>
        <strong>{pendientes.length}</strong>
      </div>
      <div className="clinical-overview-item">
        <span><Stethoscope size={14} aria-hidden="true" /> Hoy</span>
        <strong>{previstosHoy.length}</strong>
      </div>
      <div className="clinical-overview-item">
        <span><History size={14} aria-hidden="true" /> Realizados</span>
        <strong>{realizados.length}</strong>
      </div>
      <div className={`clinical-overview-item ${consentimientosPendientes ? 'needs-attention' : ''}`}>
        <span><FileText size={14} aria-hidden="true" /> CI pte.</span>
        <strong>{consentimientosPendientes}</strong>
      </div>
      <div className={`clinical-overview-item ${labVencidos ? 'needs-attention' : ''}`}>
        <span><FlaskConical size={14} aria-hidden="true" /> Lab.</span>
        <strong>{laboratorio.length}</strong>
      </div>
      <div className={`clinical-overview-item ${saldoPendiente > 0 ? 'has-debt' : ''}`}>
        <span><Wallet size={14} aria-hidden="true" /> Saldo</span>
        <strong>{money(saldoPendiente)}</strong>
      </div>
      {documentos.length > 0 && (
        <div className="clinical-overview-item">
          <span><FileText size={14} aria-hidden="true" /> Docs</span>
          <strong>{documentos.length}</strong>
        </div>
      )}
    </section>
  );
}

function SessionWorkspace({
  paciente,
  citas,
  historial,
  presupuestos,
  tratamientos,
  notasDentales,
  doctorId,
  userRole,
  onCrearReceta,
  onOpenConsentimiento,
  onCrearPedidoLab,
  onCrearPedidoLabForLine,
  onOpenDocumentos,
  onFinalizarTratamientoSesion,
  onCreateNotaDental,
}: {
  paciente: ApiPaciente | null;
  citas: Cita[];
  historial: HistorialClinico[];
  presupuestos: Presupuesto[];
  tratamientos: TratamientoCatalogo[];
  notasDentales: NotaDental[];
  doctorId?: string | null;
  userRole?: UserRole | null;
  onCrearReceta: () => void;
  onOpenConsentimiento: () => void;
  onCrearPedidoLab: () => void;
  onCrearPedidoLabForLine: (linea: PresupuestoLinea) => void;
  onOpenDocumentos: () => void;
  onFinalizarTratamientoSesion: (data: SesionTratamientoRealizadoInput) => Promise<HistorialClinico>;
  onCreateNotaDental: (data: NotaDentalCreateInput) => Promise<NotaDental>;
}) {
  const previstosHoy = citas.filter((cita) => isToday(cita.fecha_hora) && !['anulada', 'falta'].includes(cita.estado));
  const recientes = recentClinicalHistory(historial);
  const baseSessionItems = useMemo(() => buildSessionTreatments(citas, presupuestos, historial), [citas, historial, presupuestos]);
  const [sessionItems, setSessionItems] = useState<SessionTreatment[]>(baseSessionItems);
  const [selectedId, setSelectedId] = useState<string | null>(baseSessionItems[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [quickNote, setQuickNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const selected = sessionItems.find((item) => item.id === selectedId) ?? sessionItems[0] ?? null;
  const filteredCatalog = tratamientos.filter((tratamiento) => {
    const q = normalizeSessionText(catalogSearch);
    if (!q) return true;
    return normalizeSessionText(`${tratamiento.codigo ?? ''} ${tratamiento.nombre} ${tratamiento.familia?.nombre ?? ''}`).includes(q);
  }).slice(0, 80);
  const selectedPieceNumber = selected?.piezaDental ? Number(selected.piezaDental) : null;
  const selectedPieceNotes = selectedPieceNumber
    ? notasDentales.filter((nota) => nota.pieza_dental === selectedPieceNumber).slice(0, 3)
    : [];

  useEffect(() => {
    setSessionItems(baseSessionItems);
    setSelectedId(baseSessionItems[0]?.id ?? null);
  }, [baseSessionItems]);

  useEffect(() => {
    setQuickNote('');
  }, [selectedId]);

  function updateSelected(patch: Partial<SessionTreatment>) {
    if (!selected) return;
    setSessionItems((current) => current.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
  }

  function addTreatmentFromCatalog() {
    const tratamiento = tratamientos.find((item) => item.id === selectedCatalogId) ?? filteredCatalog[0];
    if (!tratamiento) return;
    const next: SessionTreatment = {
      id: `manual-${Date.now()}`,
      source: 'manual',
      sourceLabel: 'Anadido en sesion',
      tratamientoId: tratamiento.id,
      tratamiento,
      title: tratamiento.nombre,
      piezaDental: '',
      caras: '',
      observaciones: '',
      status: 'en_curso',
    };
    setSessionItems((current) => [next, ...current]);
    setSelectedId(next.id);
    setAdding(false);
    setCatalogSearch('');
    setSelectedCatalogId('');
  }

  function removeSelected() {
    if (!selected) return;
    const nextItems = sessionItems.filter((item) => item.id !== selected.id);
    setSessionItems(nextItems);
    setSelectedId(nextItems[0]?.id ?? null);
  }

  function applyDentalTarget(selection: ToothSelection) {
    if (!selected) return;
    const cara = mapSurfaceToCaras(selection.surface);
    updateSelected({
      piezaDental: selection.toothNumber.replace(/[^\d]/g, '').slice(0, 2),
      caras: cara ?? selected.caras,
    });
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
      const historialCreado = await onFinalizarTratamientoSesion({
        paciente_id: paciente.id,
        tratamiento_id: selected.tratamientoId,
        doctor_id: doctorId ?? null,
        gabinete_id: null,
        cita_id: selected.citaId ?? null,
        presupuesto_linea_id: selected.linea?.id ?? null,
        pieza_dental: selected.piezaDental ? Number(selected.piezaDental) : null,
        caras: selected.caras || null,
        procedimiento: selected.title.trim() || selected.tratamiento?.nombre || null,
        observaciones: selected.observaciones.trim() || null,
        origen: selected.source === 'pendiente' ? 'presupuesto_linea' : selected.source,
        importe: selected.linea?.importe_neto ?? selected.linea?.precio_unitario ?? null,
      });
      setSessionItems((current) => current.map((item) => item.id === selected.id ? {
        ...item,
        status: 'realizado',
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

  return (
    <div className="clinical-session-stack">
      <div className="clinical-session-workbench">
        <section className="desk-panel clinical-session-board">
        <div className="panel-caption">
          <strong>Tratamientos de la sesion</strong>
          <span>Plan de trabajo editable para el doctor en gabinete. Al finalizar, queda registrado en el historial clinico.</span>
          <button type="button" className="primary-action" onClick={() => setAdding((open) => !open)} disabled={!paciente}>
            <Plus size={14} aria-hidden="true" /> Anadir tratamiento
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
        <div className="session-treatment-list" role="list" aria-label="Tratamientos de la sesion">
          {sessionItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`session-treatment-row ${selected?.id === item.id ? 'active' : ''} session-status-${item.status}`}
              onClick={() => setSelectedId(item.id)}
            >
              <span className="session-treatment-source">{item.sourceLabel}</span>
              <strong>{item.title}</strong>
              <em>{item.piezaDental ? `Pieza ${item.piezaDental}${item.caras ? ` - ${item.caras}` : ''}` : 'Sin pieza'}</em>
              <small>{item.historialId ? 'En historial' : SESSION_STATUS_LABELS[item.status]}</small>
            </button>
          ))}
          {!sessionItems.length && (
            <div className="session-empty-state">
              <strong>Sin tratamientos en la sesion</strong>
              <span>Anade uno desde catalogo o usa tratamientos aceptados del paciente.</span>
            </div>
          )}
        </div>
        </section>
        <section className="desk-panel clinical-session-detail">
        <div className="panel-caption">
          <strong>Detalle clinico</strong>
          <span>Pieza, caras y observacion pertenecen al tratamiento seleccionado, no a la observacion general del paciente.</span>
        </div>
        {selected ? (
          <>
            <div className="session-detail-head">
              <div>
                <span>{selected.sourceLabel}</span>
                <strong>{selected.title}</strong>
                {selected.tratamiento && <TreatmentBadge tratamiento={selected.tratamiento} />}
              </div>
              <select
                value={selected.status}
                onChange={(event) => updateSelected({ status: event.target.value as SessionTreatmentStatus })}
                aria-label="Estado del tratamiento en sesion"
              >
                {Object.entries(SESSION_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="session-detail-grid">
              <label>Nombre en sesion
                <input value={selected.title} onChange={(event) => updateSelected({ title: event.target.value })} />
              </label>
              <label>Tratamiento catalogo
                <select
                  value={selected.tratamientoId ?? ''}
                  onChange={(event) => {
                    const tratamiento = tratamientos.find((item) => item.id === event.target.value) ?? null;
                    updateSelected({
                      tratamientoId: tratamiento?.id ?? null,
                      tratamiento,
                      title: tratamiento?.nombre ?? selected.title,
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
                  onChange={(event) => updateSelected({ piezaDental: event.target.value.replace(/[^\d]/g, '').slice(0, 2) })}
                  placeholder="24"
                />
              </label>
              <label>Caras
                <input
                  value={selected.caras}
                  onChange={(event) => updateSelected({ caras: event.target.value.toUpperCase().replace(/[^MODVLP]/g, '').slice(0, 6) })}
                  placeholder="MOD"
                />
              </label>
              <label className="wide">Observacion clinica del tratamiento
                <textarea
                  value={selected.observaciones}
                  onChange={(event) => updateSelected({ observaciones: event.target.value })}
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
              <button type="button" onClick={() => updateSelected({ status: 'pospuesto' })}><Clock3 size={14} aria-hidden="true" /> Posponer</button>
              <button type="button" onClick={removeSelected}><Trash2 size={14} aria-hidden="true" /> Eliminar de sesion</button>
            </div>
            {sessionError && <p className="session-save-error" role="alert">{sessionError}</p>}
            <details className="session-secondary-actions">
              <summary>Acciones secundarias del tratamiento</summary>
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
          <section className="desk-panel clinical-today-panel">
          <div className="panel-caption">
            <strong>Tratamientos previstos hoy</strong>
            <span>Citas activas del paciente para esta fecha.</span>
          </div>
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
          </section>
          <section className="desk-panel clinical-today-panel">
          <div className="panel-caption">
            <strong>Historial clinico reciente</strong>
            <span>Ultimas entradas utiles durante la consulta.</span>
          </div>
          <div className="clinical-list">
            {recientes.map((entrada) => (
              <article key={entrada.id}>
                <time>{formatDate(entrada.fecha)}</time>
                <strong>{entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental'}</strong>
                <span>Pieza {entrada.pieza_dental ?? '-'} - {entrada.estado}</span>
                <small>{entrada.observaciones || entrada.diagnostico || 'Sin comentario.'}</small>
              </article>
            ))}
            {!recientes.length && <p>Sin historial clinico reciente.</p>}
          </div>
          </section>
        </aside>
      </div>
      <details className="secondary-clinic-panel session-odontogram-support" open>
        <summary>Odontograma clinico de trabajo</summary>
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
          const comments = Array.from(new Set(visita.comentarios.filter(Boolean))).slice(0, 3);
          return (
            <article key={visita.id} className="visit-card">
              <header>
                <time>{formatDate(visita.date)}{getTime(citaPrincipal?.fecha_hora) ? ` - ${getTime(citaPrincipal?.fecha_hora)}` : ''}</time>
                <span>{citaPrincipal?.estado || (visita.realizados.length ? 'con tratamientos' : 'actividad clinica')}</span>
                <div>
                  <strong>{citaPrincipal?.motivo || visita.realizados[0]?.procedimiento || visita.realizados[0]?.tratamiento?.nombre || 'Visita clinica'}</strong>
                  <p>{[doctor, gabinete ? `Gab. ${gabinete}` : null, citaPrincipal?.duracion_min ? `${citaPrincipal.duracion_min} min` : null].filter(Boolean).join(' - ') || 'Sin doctor o gabinete asignado'}</p>
                </div>
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
                  <span>Asociado</span>
                  <p>
                    <small>{visita.documentos.length} docs</small>
                    <small>{visita.recetas.length} recetas</small>
                    <small>{visita.consentimientos.length} consent.</small>
                    <small>{visita.laboratorio.length} lab.</small>
                  </p>
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
  plantillas,
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
  onActualizarTrabajoLab,
  onCrearReceta,
  onOpenConsentimiento,
  onOpenConsentimientoPdf,
  onRevocarConsentimiento,
  onOpenDocumentos,
  onOpenHistorial,
  onFinalizarTratamientoSesion,
  onCreateNotaDental,
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
  plantillas: PlantillaConsentimiento[];
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
  onActualizarTrabajoLab: (trabajoId: string, cambios: TrabajoLaboratorioUpdateInput) => void;
  onCrearReceta: () => void;
  onOpenConsentimiento: (tipo?: string) => void;
  onOpenConsentimientoPdf: (consentimiento: Consentimiento) => void;
  onRevocarConsentimiento: (consentimiento: Consentimiento) => void;
  onOpenDocumentos: () => void;
  onOpenHistorial: () => void;
  onFinalizarTratamientoSesion: (data: SesionTratamientoRealizadoInput) => Promise<HistorialClinico>;
  onCreateNotaDental: (data: NotaDentalCreateInput) => Promise<NotaDental>;
  userRole?: UserRole | null;
}) {
  return (
    <section className="clinical-workspace">
      <ClinicalOverview
        citas={citas}
        historial={historial}
        presupuestos={presupuestos}
        documentos={documentos}
        consentimientos={consentimientos}
        laboratorio={laboratorio}
        saldoPendiente={saldoPendiente}
      />
      <nav className="treatment-subtabs clinical-subtabs" aria-label="Secciones de clinica">
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
          tratamientos={tratamientos}
          notasDentales={notasDentales}
          doctorId={doctorId}
          userRole={userRole}
          onCrearReceta={onCrearReceta}
          onOpenConsentimiento={() => onOpenConsentimiento()}
          onCrearPedidoLab={onCrearPedidoLabGeneral}
          onCrearPedidoLabForLine={onCrearPedidoLab}
          onOpenDocumentos={onOpenDocumentos}
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
      {activeTab === 'notas' && (
        <div className="clinical-notes-grid">
          <details className="secondary-clinic-panel" open>
            <summary>Consentimientos necesarios</summary>
            <ConsentimientosPanel
              consentimientos={consentimientos}
              plantillas={plantillas}
              onDisenar={onOpenConsentimiento}
              onAbrirPdf={onOpenConsentimientoPdf}
              onRevocar={onRevocarConsentimiento}
            />
          </details>
          <details className="secondary-clinic-panel" open={laboratorio.length > 0}>
            <summary>Laboratorio y protesicos</summary>
            <LaboratorioPacientePanel
              trabajos={laboratorio}
              onCrearPedido={onCrearPedidoLabGeneral}
              onActualizar={onActualizarTrabajoLab}
            />
          </details>
          <section className="desk-panel clinical-documents-panel">
            <div className="panel-caption">
              <strong>Documentos y fotos relevantes</strong>
              <span>Radiografias, fotos, informes y adjuntos siguen en el gestor documental del paciente.</span>
              <button type="button" onClick={onOpenDocumentos} disabled={!paciente}>Abrir documentos</button>
            </div>
            <div className="clinical-list">
              {documentos.slice(0, 6).map((documento) => (
                <article key={documento.id}>
                  <time>{formatDate(documento.fecha_documento || documento.created_at)}</time>
                  <strong>{documento.descripcion || documento.nombre_original}</strong>
                  <span>{documento.categoria}</span>
                </article>
              ))}
              {!documentos.length && <p>Sin documentos clinicos adjuntos.</p>}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
