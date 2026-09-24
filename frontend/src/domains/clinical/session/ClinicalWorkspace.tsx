import type { MouseEvent } from 'react';
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
import { TrabajoPendientePanel } from '../../treatment-plans/TrabajoPendiente';
import type { PrimeraVisitaData } from '../first-visit/PrimeraVisita';
import { PrimeraVisitaPanel } from '../first-visit/PrimeraVisita';
import { SessionWorkspace } from './SessionWorkspace';
import { VisitsWorkspace } from './VisitsWorkspace';
import { TaskSurface } from '../../../design-system/TaskSurface';
import { PatientTaskContext } from '../../patients/PatientTaskContext';

export type ClinicalTab = 'primera' | 'pendiente' | 'sesion' | 'visitas';

const CLINICAL_TABS: Array<{ id: ClinicalTab; label: string }> = [
  { id: 'primera', label: 'Diagnóstico' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'sesion', label: 'Sesión actual' },
  { id: 'visitas', label: 'Visitas' },
];

export function ClinicalWorkspace({
  activeTab,
  onTabChange,
  paciente,
  citas,
  historial,
  presupuestos,
  trabajosPendientes,
  trabajosPendientesLoading,
  trabajosPendientesError,
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
  onDictarNotaSesion = () => undefined,
  canDictarNota = false,
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
  trabajosPendientes: TrabajoPendiente[];
  trabajosPendientesLoading: boolean;
  trabajosPendientesError: string | null;
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
  onDictarNotaSesion?: () => void;
  canDictarNota?: boolean;
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
    <section className="dc-clinical-workspace">
      <nav className="dc-clinical-tabs" aria-label="Secciones de clínica">
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
        <TaskSurface title="Primera visita" context={paciente ? <PatientTaskContext paciente={paciente} /> : 'Selecciona un paciente'} onClose={() => onTabChange('pendiente')} backLabel="Volver a tratamientos" className="dc-firstvisit-task">
        <PrimeraVisitaPanel
          paciente={paciente}
          onSave={onSavePrimeraVisita}
          saving={savingPrimeraVisita}
          userRole={userRole}
        />
        </TaskSurface>
      )}
      {activeTab === 'pendiente' && (
        <TrabajoPendientePanel
          trabajosPendientes={trabajosPendientes}
          presupuestos={presupuestos}
          citas={citas}
          loading={trabajosPendientesLoading}
          error={trabajosPendientesError}
          paciente={paciente}
          onDarCita={onDarCita}
          onContextLinea={onContextLinea}
          onCrearPedidoLab={onCrearPedidoLab}
          onOpenPresupuestos={onOpenPresupuestos}
          userRole={userRole}
        />
      )}
      {activeTab === 'sesion' && (
        <SessionWorkspace
          paciente={paciente}
          citas={citas}
          historial={historial}
          presupuestos={presupuestos}
          trabajosPendientes={trabajosPendientes}
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
          onOpenPresupuestos={onOpenPresupuestos}
          onOpenHistorial={onOpenHistorial}
          onDictarNotaSesion={onDictarNotaSesion}
          canDictarNota={canDictarNota}
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
