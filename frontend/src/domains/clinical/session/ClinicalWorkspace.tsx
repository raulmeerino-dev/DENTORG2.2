import type {
  ApiPaciente,
  Cita,
  Consentimiento,
  DocumentoPaciente,
  Doctor,
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
import { DiagnosticoWorkspace } from '../first-visit/DiagnosticoWorkspace';
import { SessionWorkspace } from './SessionWorkspace';
import { VisitsWorkspace } from './VisitsWorkspace';

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
  doctores,
  tratamientos,
  onDarCita,
  onCrearPedidoLab,
  onCrearPedidoLabGeneral,
  onCrearReceta,
  onOpenConsentimiento,
  onOpenDocumentos,
  onOpenPresupuestos,
  onOpenBudget,
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
  focusedPendingId,
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
  doctores?: Doctor[];
  tratamientos: TratamientoCatalogo[];
  onDarCita: (linea: PresupuestoLinea) => void;
  onCrearPedidoLab: (linea: PresupuestoLinea) => void;
  onCrearPedidoLabGeneral: () => void;
  onCrearReceta: () => void;
  onOpenConsentimiento: (tipo?: string) => void;
  onOpenDocumentos: () => void;
  onOpenPresupuestos: () => void;
  onOpenBudget?: (budget: Presupuesto) => void;
  onOpenHistorial: (citaId?: string) => void;
  onDictarNotaSesion?: (citaId?: string) => void;
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
  focusedPendingId?: string | null;
}) {
  return (
    <section className="dc-clinical-workspace">
      <nav className="dc-clinical-tabs" aria-label="Secciones de clínica">
        {CLINICAL_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`dc-tab${activeTab === item.id ? ' active' : ''}`}
            aria-current={activeTab === item.id ? 'page' : undefined}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {activeTab === 'primera' && (
        <DiagnosticoWorkspace paciente={paciente} userRole={userRole} />
      )}
      {activeTab === 'pendiente' && (
        <TrabajoPendientePanel
          focusedId={focusedPendingId}
          trabajosPendientes={trabajosPendientes}
          presupuestos={presupuestos}
          citas={citas}
          loading={trabajosPendientesLoading}
          error={trabajosPendientesError}
          paciente={paciente}
          onDarCita={onDarCita}
          onCrearPedidoLab={onCrearPedidoLab}
          onOpenPresupuestos={onOpenPresupuestos}
          onOpenBudget={onOpenBudget}
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
          doctores={doctores}
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
