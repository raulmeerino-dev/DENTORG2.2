import { ArrowRight,CheckCircle2,ClipboardCheck,Clock3,FileText,FlaskConical,NotebookPen,Pill,Plus,Trash2 } from 'lucide-react';
import { useEffect,useMemo,useRef,useState } from 'react';
import { formatDate } from '../../../shared/format';
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
TrabajoPendiente,
TratamientoCatalogo,
UserRole,
} from '../../../api/types';
import { ClinicalDictationButton } from '../../ai/clinical-dictation/ClinicalDictation';
import { useSessionDraft } from '../../identity/session/sessionDrafts';
import { TreatmentBadge } from '../components/TreatmentBadge';
import type { ToothSelection } from '../odontogram';
import { PatientOdontogramFlow,mapSurfaceToCaras } from '../odontogram';
import { PatientExitChecklistPanel } from './PatientExitChecklistPanel';
import FinishVisitAction from './FinishVisitAction';
import { getTime,isToday,recentClinicalHistory } from './clinicalHistory';
import type { PatientExitActionTarget } from './patientExitChecklist';
import { buildPatientExitChecklist } from './patientExitChecklist';
import type { SessionTreatment,SessionTreatmentStatus } from './sessionTreatments';
import { SESSION_STATUS_LABELS,buildCreatePayload,buildSessionTreatments,normalizeSessionText,sessionTreatmentFromSesionItem } from './sessionTreatments';

const SESSION_FIELD_NAMES: Partial<Record<keyof SessionTreatment, keyof SesionClinicaItemUpdateInput>> = {
  title: 'titulo', tratamientoId: 'tratamiento_id', piezaDental: 'pieza_dental',
  caras: 'caras', observaciones: 'observaciones', status: 'estado',
};

export function SessionWorkspace({
  paciente,
  citas,
  historial,
  presupuestos,
  trabajosPendientes,
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
  onOpenPresupuestos,
  onOpenHistorial,
  onDictarNotaSesion,
  canDictarNota = false,
  onSchedulePatient,
  onOpenCobro,
  onFinalizarTratamientoSesion,
  onCreateNotaDental,
}: {
  paciente: ApiPaciente | null;
  citas: Cita[];
  historial: HistorialClinico[];
  presupuestos: Presupuesto[];
  trabajosPendientes: TrabajoPendiente[];
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
  onOpenPresupuestos: () => void;
  onOpenHistorial: () => void;
  onDictarNotaSesion: () => void;
  canDictarNota?: boolean;
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
    () => buildSessionTreatments(citas, presupuestos, trabajosPendientes, sesionItems),
    [citas, presupuestos, sesionItems, trabajosPendientes],
  );
  const [draftItems, setDraftItems] = useState<SessionTreatment[]>(baseSessionItems);
  const [selectedId, setSelectedId] = useState<string | null>(baseSessionItems[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [quickNote, setQuickNote] = useSessionDraft(`session-note:${paciente?.id}:${selectedId ?? 'none'}`);
  const [savingNote, setSavingNote] = useState(false);
  const [pendingSessionWrites, setPendingSessionWrites] = useState(0);
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(() => new Set());
  const dirtyFieldsRef = useRef(new Set<string>());
  const fieldVersions = useRef(new Map<string, number>());
  const pendingMaterialize = useRef<Map<string, Promise<SessionTreatment | null>>>(new Map());
  const materializedAlias = useRef<Map<string, SessionTreatment>>(new Map());

  function updateDirtyFields(update: (current: Set<string>) => Set<string>) {
    const next = update(dirtyFieldsRef.current);
    dirtyFieldsRef.current = next;
    setDirtyFields(next);
  }

  function localIds(item: SessionTreatment) {
    return [item.id, ...[...materializedAlias.current].filter(([, promoted]) => promoted.id === item.id).map(([draftId]) => draftId)];
  }
  const selected = draftItems.find((item) => item.id === selectedId) ?? draftItems[0] ?? null;
  const filteredCatalog = tratamientos.filter((tratamiento) => {
    const q = normalizeSessionText(catalogSearch);
    if (!q) return true;
    return normalizeSessionText(`${tratamiento.codigo ?? ''} ${tratamiento.nombre} ${tratamiento.familia?.nombre ?? ''}`).includes(q);
  }).slice(0, 80);
  const acceptedUnpreparedLines = useMemo(() => presupuestos.flatMap((presupuesto) => (
    presupuesto.lineas.filter((linea) => linea.aceptado && !linea.pasado_trabajo_pendiente)
  )), [presupuestos]);
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
      setDraftItems(current => {
        const merged = baseSessionItems.map(incoming => {
          // A refetch may still contain the pre-materialization draft while
          // its newly created session item is already known locally.
          const item = materializedAlias.current.get(incoming.id) ?? incoming;
          const ids = localIds(item);
          const local = current.find(row => ids.includes(row.id));
          if (!local) return item;
          const next = { ...item };
          for (const [field, apiField] of Object.entries(SESSION_FIELD_NAMES)) {
            if (ids.some(id => dirtyFieldsRef.current.has(`${id}:${apiField}`))) {
              Object.assign(next, { [field]: local[field as keyof SessionTreatment] });
              if (field === 'tratamientoId') next.tratamiento = local.tratamiento;
            }
          }
          return next;
        });
        for (const local of current) {
          const ids = localIds(local);
          const hasDraft = [...dirtyFieldsRef.current].some(key => ids.some(id => key.startsWith(`${id}:`)));
          if (hasDraft && !merged.some(row => ids.includes(row.id))) merged.push(local);
        }
        return merged;
      });
      setSelectedId((current) => {
        if (current && baseSessionItems.some((item) => item.id === current)) return current;
        return baseSessionItems[0]?.id ?? null;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [baseSessionItems]);

  function updateLocal(patch: Partial<SessionTreatment>) {
    if (!selected) return;
    const fields = Object.keys(patch).flatMap(field => {
      const apiField = SESSION_FIELD_NAMES[field as keyof SessionTreatment];
      return apiField ? [`${selected.id}:${apiField}`] : [];
    });
    for (const field of fields) fieldVersions.current.set(field, (fieldVersions.current.get(field) ?? 0) + 1);
    updateDirtyFields(current => new Set([...current, ...fields]));
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
        setDraftItems((current) => current.map((row) => row.id === item.id ? { ...row, id: promoted.id, sesionItemId: promoted.sesionItemId } : row));
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
    if (Object.keys(cambios).length === 0) return;
    const submittedFields = Object.keys(cambios).map(field => {
      const key = `${item.id}:${field}`;
      return { key, version: fieldVersions.current.get(key) ?? 0 };
    });
    setPendingSessionWrites(count => count + 1);
    try {
      const persisted = await ensurePersistedItem(item);
      if (!persisted?.sesionItemId) return;
      const updated = await onUpdateSesionItem(persisted.sesionItemId, cambios);
      const refreshed = sessionTreatmentFromSesionItem(updated, presupuestos);
      setDraftItems((current) => current.map((row) => {
        if (row.id !== persisted.id) return row;
        const next = { ...row };
        for (const [field, apiField] of Object.entries(SESSION_FIELD_NAMES)) {
          const submitted = submittedFields.find(entry => entry.key === `${item.id}:${apiField}`);
          if (submitted && (fieldVersions.current.get(submitted.key) ?? 0) === submitted.version) {
            Object.assign(next, { [field]: refreshed[field as keyof SessionTreatment] });
            if (field === 'tratamientoId') next.tratamiento = refreshed.tratamiento;
          }
        }
        // Preserve edits to other fields and newer keystrokes while this save was in flight.
        return next;
      }));
      updateDirtyFields(current => {
        const next = new Set(current);
        for (const { key, version } of submittedFields) {
          if ((fieldVersions.current.get(key) ?? 0) === version) next.delete(key);
        }
        return next;
      });
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'No se pudo guardar el cambio en la sesion.');
    } finally {
      setPendingSessionWrites(count => count - 1);
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
    setPendingSessionWrites(count => count + 1);
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
    } finally {
      setPendingSessionWrites(count => count - 1);
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
      updateDirtyFields(current => new Set([...current].filter(key => !localIds(selected).some(id => key.startsWith(`${id}:`)))));
      return;
    }
    try {
      setSavingId(selected.id);
      await onDeleteSesionItem(selected.sesionItemId);
      updateDirtyFields(current => new Set([...current].filter(key => !localIds(selected).some(id => key.startsWith(`${id}:`)))));
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
      <div className={`clinical-session-workbench ${selected ? '' : 'is-empty'}`.trim()}>
        <section className="desk-panel clinical-session-board">
        <div className="session-board-head">
          <div>
            <span>Sesión actual</span>
            <strong>{draftItems.length} tratamientos</strong>
          </div>
          <div className="session-board-actions">
            <FinishVisitAction citas={citas} role={userRole} doctorId={doctorId} hasUnsaved={Boolean(quickNote.trim() || savingId || savingNote || pendingSessionWrites || dirtyFields.size)} />
            <ClinicalDictationButton label="Dictar nota de sesión" onClick={onDictarNotaSesion} disabled={!paciente || !canDictarNota} compact />
            <button type="button" className="primary-action" onClick={() => setAdding((open) => !open)} disabled={!paciente}>
              <Plus size={14} aria-hidden="true" /> Añadir
            </button>
          </div>
        </div>
        {adding && (
          <div className="session-add-panel">
            <input
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder="Buscar tratamiento en catálogo"
            />
            <select value={selectedCatalogId} onChange={(event) => setSelectedCatalogId(event.target.value)}>
              <option value="">Seleccionar tratamiento...</option>
              {filteredCatalog.map((tratamiento) => (
                <option key={tratamiento.id} value={tratamiento.id}>
                  {tratamiento.codigo ? `${tratamiento.codigo} - ` : ''}{tratamiento.nombre}
                </option>
              ))}
            </select>
            <button type="button" onClick={addTreatmentFromCatalog} disabled={!filteredCatalog.length}>Añadir a sesión</button>
          </div>
        )}
        {sesionItemsError && (
          <p className="session-save-error" role="alert">{sesionItemsError}</p>
        )}
        <div className="session-treatment-list" role="list" aria-label="Tratamientos de la sesión">
          {sesionItemsLoading && !draftItems.length && (
            <div className="session-empty-state"><span>Cargando sesión del paciente...</span></div>
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
            <div className={`session-empty-state ${acceptedUnpreparedLines.length ? 'is-actionable' : ''}`}>
              <span className="session-empty-icon" aria-hidden="true">
                {acceptedUnpreparedLines.length ? <ClipboardCheck size={22} /> : <Plus size={22} />}
              </span>
              <div>
                <strong>
                  {acceptedUnpreparedLines.length
                    ? `${acceptedUnpreparedLines.length} ${acceptedUnpreparedLines.length === 1 ? 'tratamiento aceptado' : 'tratamientos aceptados'} por preparar`
                    : 'Sesión sin tratamientos'}
                </strong>
                <span>
                  {acceptedUnpreparedLines.length
                    ? 'Pásalos a trabajo pendiente antes de utilizarlos en esta sesión.'
                    : 'Añade únicamente los tratamientos que vas a realizar hoy.'}
                </span>
              </div>
              <button
                type="button"
                className="session-empty-action"
                onClick={acceptedUnpreparedLines.length ? onOpenPresupuestos : () => setAdding(true)}
              >
                {acceptedUnpreparedLines.length ? 'Preparar desde presupuesto' : 'Añadir tratamiento'}
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
        </section>
        {selected && (
          <section className="desk-panel clinical-session-detail">
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
          </section>
        )}
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
