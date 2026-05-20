import type { MouseEvent } from 'react';
import { ClipboardList, FileText, FlaskConical, History, NotebookPen, Pill, Stethoscope, Wallet } from 'lucide-react';
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
  userRole,
  onCrearReceta,
  onOpenConsentimiento,
  onCrearPedidoLab,
  onOpenDocumentos,
}: {
  paciente: ApiPaciente | null;
  citas: Cita[];
  historial: HistorialClinico[];
  userRole?: UserRole | null;
  onCrearReceta: () => void;
  onOpenConsentimiento: () => void;
  onCrearPedidoLab: () => void;
  onOpenDocumentos: () => void;
}) {
  const previstosHoy = citas.filter((cita) => isToday(cita.fecha_hora) && !['anulada', 'falta'].includes(cita.estado));
  const recientes = recentClinicalHistory(historial);

  return (
    <div className="clinical-session-grid">
      <section className="desk-panel clinical-session-main">
        <div className="panel-caption">
          <strong>Sesion actual</strong>
          <span>Trabajo clinico de gabinete, separado de presupuestos y caja.</span>
          <button type="button" onClick={onCrearReceta} disabled={!paciente}>Receta</button>
          <button type="button" onClick={onOpenConsentimiento} disabled={!paciente}>Consentimiento</button>
        </div>
        <PatientOdontogramFlow
          paciente={paciente}
          mode="current"
          title="Odontograma clinico de trabajo"
          subtitle="Mapa compartido para orientar la sesion y revisar estado reciente."
          readOnly
          enableQuickTreatments={false}
          userRole={userRole}
        />
      </section>
      <aside className="clinical-side-stack">
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
        <section className="desk-panel clinical-quick-actions">
          <div className="panel-caption">
            <strong>Acciones clinicas</strong>
            <span>Documentos y trabajo asociado a la sesion.</span>
          </div>
          <div>
            <button type="button" onClick={onCrearReceta} disabled={!paciente}><Pill size={14} aria-hidden="true" /> Crear receta</button>
            <button type="button" onClick={onOpenConsentimiento} disabled={!paciente}><FileText size={14} aria-hidden="true" /> Nuevo consentimiento</button>
            <button type="button" onClick={onCrearPedidoLab} disabled={!paciente}><FlaskConical size={14} aria-hidden="true" /> Pedido laboratorio</button>
            <button type="button" onClick={onOpenDocumentos} disabled={!paciente}><NotebookPen size={14} aria-hidden="true" /> Documentos / fotos</button>
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
          userRole={userRole}
          onCrearReceta={onCrearReceta}
          onOpenConsentimiento={() => onOpenConsentimiento()}
          onCrearPedidoLab={onCrearPedidoLabGeneral}
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
