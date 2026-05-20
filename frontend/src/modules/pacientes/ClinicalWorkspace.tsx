import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { CheckCircle2, ClipboardList, Clock3, FileText, FlaskConical, History, NotebookPen, Pill, Plus, Stethoscope, Trash2, Wallet } from 'lucide-react';
import type {
  ApiPaciente,
  Cita,
  Consentimiento,
  DocumentoPaciente,
  HistorialClinico,
  PlantillaConsentimiento,
  Presupuesto,
  PresupuestoLinea,
  TrabajoLaboratorio,
  TrabajoLaboratorioUpdateInput,
  TratamientoCatalogo,
  UserRole,
} from '../../types/api';
import { formatDate, money } from '../../lib/utils';
import { TreatmentBadge } from '../../components/TreatmentBadge';
import { PatientOdontogramFlow } from '../odontogram';
import { ConsentimientosPanel } from './Consentimientos';
import { LaboratorioPacientePanel } from './Laboratorio';
import { PrimeraVisitaPanel } from './PrimeraVisita';
import type { PrimeraVisitaData } from './PrimeraVisita';
import { TratamientosRealizadosPanel } from './Realizados';
import { TrabajoPendientePanel } from './TrabajoPendiente';
import { contarLaboratorioVencidos } from './laboratorioUtils';

export type ClinicalTab = 'primera' | 'pendiente' | 'sesion' | 'realizados' | 'notas';

const CLINICAL_TABS: Array<{ id: ClinicalTab; label: string }> = [
  { id: 'primera', label: 'Diagnostico' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'sesion', label: 'Sesion actual' },
  { id: 'realizados', label: 'Realizados' },
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
  linea?: PresupuestoLinea;
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

function buildSessionTreatments(citas: Cita[], presupuestos: Presupuesto[]): SessionTreatment[] {
  const todayAppointments = citas.filter((cita) => isToday(cita.fecha_hora) && !['anulada', 'falta'].includes(cita.estado));
  const pendingLines = presupuestos.flatMap((presupuesto) => (
    presupuesto.lineas
      .filter((linea) => linea.aceptado || linea.pasado_trabajo_pendiente || presupuesto.estado === 'aceptado')
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
    });
  });

  return items;
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
  userRole,
  onCrearReceta,
  onOpenConsentimiento,
  onCrearPedidoLab,
  onCrearPedidoLabForLine,
  onOpenDocumentos,
}: {
  paciente: ApiPaciente | null;
  citas: Cita[];
  historial: HistorialClinico[];
  presupuestos: Presupuesto[];
  tratamientos: TratamientoCatalogo[];
  userRole?: UserRole | null;
  onCrearReceta: () => void;
  onOpenConsentimiento: () => void;
  onCrearPedidoLab: () => void;
  onCrearPedidoLabForLine: (linea: PresupuestoLinea) => void;
  onOpenDocumentos: () => void;
}) {
  const previstosHoy = citas.filter((cita) => isToday(cita.fecha_hora) && !['anulada', 'falta'].includes(cita.estado));
  const recientes = recentClinicalHistory(historial);
  const baseSessionItems = useMemo(() => buildSessionTreatments(citas, presupuestos), [citas, presupuestos]);
  const [sessionItems, setSessionItems] = useState<SessionTreatment[]>(baseSessionItems);
  const [selectedId, setSelectedId] = useState<string | null>(baseSessionItems[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const selected = sessionItems.find((item) => item.id === selectedId) ?? sessionItems[0] ?? null;
  const filteredCatalog = tratamientos.filter((tratamiento) => {
    const q = normalizeSessionText(catalogSearch);
    if (!q) return true;
    return normalizeSessionText(`${tratamiento.codigo ?? ''} ${tratamiento.nombre} ${tratamiento.familia?.nombre ?? ''}`).includes(q);
  }).slice(0, 80);

  useEffect(() => {
    setSessionItems(baseSessionItems);
    setSelectedId(baseSessionItems[0]?.id ?? null);
  }, [baseSessionItems]);

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

  return (
    <div className="clinical-session-workbench">
      <section className="desk-panel clinical-session-board">
        <div className="panel-caption">
          <strong>Tratamientos de la sesion</strong>
          <span>Plan de trabajo editable para el doctor en gabinete. Los cambios se preparan aqui; la persistencia completa queda para Fase 3.</span>
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
              <small>{SESSION_STATUS_LABELS[item.status]}</small>
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
            </div>
            <div className="session-treatment-actions">
              <button type="button" onClick={() => updateSelected({ status: 'realizado' })}><CheckCircle2 size={14} aria-hidden="true" /> Marcar realizado</button>
              <button type="button" onClick={() => updateSelected({ status: 'pospuesto' })}><Clock3 size={14} aria-hidden="true" /> Posponer</button>
              <button type="button" onClick={removeSelected}><Trash2 size={14} aria-hidden="true" /> Eliminar de sesion</button>
            </div>
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
        <details className="secondary-clinic-panel">
          <summary>Odontograma clinico de apoyo</summary>
          <PatientOdontogramFlow
            paciente={paciente}
            mode="current"
            title="Odontograma clinico de trabajo"
            subtitle="Mapa compartido de apoyo. La seleccion directa de pieza queda para Fase 2."
            readOnly
            enableQuickTreatments={false}
            userRole={userRole}
          />
        </details>
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
  plantillas,
  laboratorio,
  saldoPendiente,
  doctorName,
  doctorColor,
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
  plantillas: PlantillaConsentimiento[];
  laboratorio: TrabajoLaboratorio[];
  saldoPendiente: number;
  doctorName: string;
  doctorColor?: string | null;
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
          userRole={userRole}
          onCrearReceta={onCrearReceta}
          onOpenConsentimiento={() => onOpenConsentimiento()}
          onCrearPedidoLab={onCrearPedidoLabGeneral}
          onCrearPedidoLabForLine={onCrearPedidoLab}
          onOpenDocumentos={onOpenDocumentos}
        />
      )}
      {activeTab === 'realizados' && (
        <TratamientosRealizadosPanel
          historial={historial}
          consentimientos={consentimientos}
          presupuestos={presupuestos}
          paciente={paciente}
          doctorName={doctorName}
          doctorColor={doctorColor}
          tratamientos={tratamientos}
          userRole={userRole}
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
