import { TaskSurface } from '../../design-system/TaskSurface';
import { getPatientAccount } from '../../api/accounts';
import { ToolbarContribution } from '../../design-system/ToolbarSlots';
import { ContextToolbar } from '../../design-system/ContextToolbar';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDeferredValue,useEffect,useState } from 'react';
import { useLocation,useNavigate,useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { createConsentimientoPaciente, firmarConsentimiento, getConsentimientosPaciente, getPlantillasConsentimiento, openConsentimientoPdf, revocarConsentimiento } from '../../api/consents';
import { createFacturaDesdeHistorial, createFacturaManual, createPagoAnticipadoPaciente, getFacturas, getFormasPago, getHistorialSinFacturar, getPagosAnticipadosPaciente, getSaldoPaciente, openFacturaPdf, registrarCobro, updatePagoAnticipadoPaciente } from '../../api/billing';
import { createNotaDental, createSesionItem, deleteSesionItem, finalizarTratamientoSesion, getHistorialPaciente, getNotasDentalesPaciente, getSesionItemsPaciente, updateSesionItem } from '../../api/clinical';
import { createPaciente, getPaciente, getPacientes, updatePaciente } from '../../api/patients';
import { createPresupuesto, getPresupuestos, getTrabajosPendientesPaciente } from '../../api/treatmentPlans';
import { createRecetaClinica, emitirRecetaLocal, enviarRecetaProveedor, getRecetaPlantillas, getRecetaProviderStatus, getRecetasPaciente, importRecetaPlantilla, openRecetaClinicaPdf } from '../../api/prescriptions';
import { createTrabajoLaboratorio, getLaboratorios, getTrabajosLaboratorio } from '../../api/laboratory';
import { generarDocumentoPdfPaciente, getDocumentosPaciente, openDocumentoPaciente, uploadDocumentoPaciente } from '../../api/documents';
import { getCitas } from '../../api/scheduling';
import { getDoctores } from '../../api/identity';
import { getTratamientosCatalogo } from '../../api/treatmentCatalog';
import { money } from '../../shared/format';
import { fullName } from './patientName';
import { invalidatePatientWorkspaceQueries } from '../../shared/query/queryInvalidation';
import type { ApiPaciente,Consentimiento,DocumentoPaciente,Factura,HistorialClinico,HistorialSinFacturar,NotaDentalCreateInput,PagoAnticipadoPaciente,Presupuesto,PresupuestoLinea,SesionClinicaItem,SesionClinicaItemCreateInput,SesionClinicaItemUpdateInput,SesionTratamientoRealizadoInput,TrabajoLaboratorioCreateInput } from '../../api/types';
import { ClinicalDictationModal } from '../ai/clinical-dictation/ClinicalDictation';
import { getBillingTotals } from '../billing/patient-account/billingUtils';
import { DentCoreHistoryBillingPanel,InvoiceHistoryModal } from '../billing/patient-account/HistorialFacturacion';
import type { AnticipoModalMode } from '../billing/patient-account/modals/AnticipoModal';
import { AnticipoModal } from '../billing/patient-account/modals/AnticipoModal';
import { PatientCheckout } from '../billing/checkout/PatientCheckout';
import { FacturaManualModal } from '../billing/patient-account/modals/FacturaManualModal';
import { InvoiceCreationModal } from '../billing/patient-account/modals/FacturaModal';
import type { RecetaSubmitPayload } from '../clinical/prescriptions/Recetas';
import { HistorialRecetasDrawer,RecetaModal } from '../clinical/prescriptions/Recetas';
import type { ClinicalTab } from '../clinical/session/ClinicalWorkspace';
import { ClinicalWorkspace } from '../clinical/session/ClinicalWorkspace';
import type { DocumentDesignerMode } from '../documents/Consentimientos';
import { ConsentimientosPanel,DocumentDesignerModal } from '../documents/Consentimientos';
import { DocumentosPanel } from '../documents/Documentos';
import { RevocarConsentimientoModal } from '../documents/RevocarConsentimientoModal';
import { useAuth } from '../identity/session/AuthContext';
import { NuevoPedidoLaboratorioModal } from '../laboratory/Laboratorio';
import { PresupuestoPanel } from '../treatment-plans/Presupuestos';
import { HistorialCompletoPanel } from './HistorialCompleto';
import { ComentarioModal } from './modals/ComentarioModal';
import { NuevoPacienteModal } from './NuevoPacienteModal';
import { PatientActionsMenu } from './PatientActionsMenu';
import { buildWhatsAppUrl } from './patientActionUtils';
import { PatientEditModal } from './PatientEditModal';
import { PatientFinder } from './PatientFinder';
import { PatientHeaderContext } from './PatientHeaderContext';
import { useObjectMenu } from '../../design-system/useObjectMenu';
import { PatientFullViewModal } from './PatientFullViewModal';
import { PatientForm } from './PatientSummary';
import { nextPatientAppointment, patientAllergies } from './patientContext';
import { useMinuteClock } from '../../shared/time/useMinuteClock';
import './patient-workspace.css';


export type WorkTab = 'pacientes' | 'clinica' | 'tratamientos' | 'realizados' | 'pendiente' | 'presupuestos' | 'primera' | 'sesion' | 'visitas' | 'historial' | 'citas' | 'facturacion' | 'consentimientos' | 'documentos' | 'laboratorio';
type MainPatientTab = 'pacientes' | 'clinica' | 'presupuestos' | 'historial';

type PatientFastActionName = 'new' | 'budgets' | 'documents' | 'upload_document';

const PATIENT_FAST_ACTIONS = new Set<PatientFastActionName>(['new', 'budgets', 'documents', 'upload_document']);

function isPatientFastAction(value: string | null | undefined): value is PatientFastActionName {
  return Boolean(value && PATIENT_FAST_ACTIONS.has(value as PatientFastActionName));
}

const TAB_ICONS: Record<WorkTab, ReactNode> = {
  pacientes: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="6" r="3.2" stroke="currentColor" strokeWidth="1.6"/><path d="M2.5 15.5c0-3.038 2.91-5.5 6.5-5.5s6.5 2.462 6.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
  ),
  tratamientos: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M5 2.5c1.7 0 2.2 1.2 4 1.2s2.3-1.2 4-1.2c1.9 0 3 1.7 2.3 4.7l-1.1 5.2c-.5 2.3-1.7 3.6-3 3.6-.9 0-1.2-.7-2.2-.7s-1.3.7-2.2.7c-1.3 0-2.5-1.3-3-3.6L2.7 7.2C2 4.2 3.1 2.5 5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
  ),
  clinica: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M5 2.5c1.7 0 2.2 1.2 4 1.2s2.3-1.2 4-1.2c1.9 0 3 1.7 2.3 4.7l-1.1 5.2c-.5 2.3-1.7 3.6-3 3.6-.9 0-1.2-.7-2.2-.7s-1.3.7-2.2.7c-1.3 0-2.5-1.3-3-3.6L2.7 7.2C2 4.2 3.1 2.5 5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M6.5 9h5M9 6.5v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
  ),
  primera: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="2" y="3" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.6"/><line x1="5" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="5" y1="11" x2="10" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="9" y1="1" x2="9" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
  ),
  sesion: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="2.5" y="3" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M6 9h6M9 6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
  ),
  presupuestos: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.6"/><line x1="5" y1="6" x2="13" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="5" y1="9" x2="13" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="5" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
  ),
  pendiente: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.6"/><path d="M9 5v4l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  realizados: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.6"/><path d="M5.5 9l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  facturacion: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M6 9h6M6 12h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M9 4v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
  ),
  citas: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="2" y="3" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.6"/><line x1="2" y1="7.5" x2="16" y2="7.5" stroke="currentColor" strokeWidth="1.4"/><line x1="6" y1="1.5" x2="6" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><line x1="12" y1="1.5" x2="12" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
  ),
  visitas: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="2" y="3" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.6"/><line x1="2" y1="7.5" x2="16" y2="7.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5.5 11h7M5.5 14h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="6" y1="1.5" x2="6" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><line x1="12" y1="1.5" x2="12" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
  ),
  historial: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 2a7 7 0 1 0 0 14A7 7 0 0 0 9 2z" stroke="currentColor" strokeWidth="1.6"/><path d="M9 5v4l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  consentimientos: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="3" y="1.5" width="12" height="15" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M6 6.5l1.5 1.5 3-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><line x1="6" y1="11" x2="12" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
  ),
  documentos: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4 2h7l5 5v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.6"/><path d="M11 2v5h5" stroke="currentColor" strokeWidth="1.4"/></svg>
  ),
  laboratorio: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M6.5 2v7L3 15h12l-3.5-6V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><line x1="5" y1="2" x2="13" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
  ),
};

const WORK_TABS: Array<{ id: MainPatientTab; label: string }> = [
  { id: 'pacientes', label: 'Ficha' },
  { id: 'clinica', label: 'Clínica' },
  { id: 'presupuestos', label: 'Presupuestos' },
  { id: 'historial', label: 'Historial' },
];
const PATIENT_PAGE_SIZE = 50;

function isClinicalTab(tab: WorkTab): tab is ClinicalTab {
  return tab === 'primera' || tab === 'pendiente' || tab === 'sesion' || tab === 'visitas';
}

function presupuestoEstadoLabel(estado: string) {
  const labels: Record<string, string> = {
    borrador: 'Borrador',
    presentado: 'Presentado',
    aceptado: 'Aceptado',
    parcial: 'Aceptación parcial',
    rechazado: 'Rechazado',
    facturado: 'Facturado',
  };
  return labels[estado] ?? estado;
}

export default function PacientesPage() {
  const [searchParams] = useSearchParams();
  const explicitPatient = searchParams.get('paciente_id');
  const patientScope = explicitPatient !== null
    ? explicitPatient.trim()
    : sessionStorage.getItem('dentcore_selected_patient_id');
  // All drafts, selections and mutations belong to this patient. A global
  // patient switch replaces the workspace synchronously, including cached data.
  return <PatientWorkspace key={patientScope || 'unselected-patient'} />;
}

function PatientWorkspace() {
  const workspaceTime = useMinuteClock();
  const { user } = useAuth();
  const canManageBilling = user?.rol === 'admin' || user?.rol === 'recepcion';
  const canViewClinicalDocuments = user?.rol === 'admin' || user?.rol === 'doctor' || user?.rol === 'auxiliar';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedArea = searchParams.get('tab');
  const initialArea = requestedArea === 'diagnostico' ? 'primera' : requestedArea;
  const [tab, setTab] = useState<WorkTab>(() => initialArea === 'clinica' || initialArea === 'tratamientos' || initialArea === 'presupuestos' || initialArea === 'primera' || initialArea === 'visitas' || initialArea === 'sesion' || initialArea === 'pendiente' || initialArea === 'historial' || initialArea === 'facturacion' ? initialArea : 'pacientes');
  const [clinicalTab, setClinicalTab] = useState<ClinicalTab>(() => initialArea === 'primera' || initialArea === 'visitas' || initialArea === 'sesion' ? initialArea : 'pendiente');
  const [documentsDrawerOpen, setDocumentsDrawerOpen] = useState(false);
  const [documentsUploadOpen, setDocumentsUploadOpen] = useState(false);
  const [treatmentHistoryOpen, setTreatmentHistoryOpen] = useState(false);
  const [designer, setDesigner] = useState<{ mode: DocumentDesignerMode; tipo?: string } | null>(null);
  const [editingPatient, setEditingPatient] = useState(false);
  const [fullPatientOpen, setFullPatientOpen] = useState(false);
  const [invoiceCreatorOpen, setInvoiceCreatorOpen] = useState(false);
  const [invoiceHistoryOpen, setInvoiceHistoryOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [anticipoModal, setAnticipoModal] = useState<AnticipoModalMode | null>(null);
  const [facturaManualOpen, setFacturaManualOpen] = useState(false);
  const [revocarConsentimientoTarget, setRevocarConsentimientoTarget] = useState<Consentimiento | null>(null);
  const selectedPresupuestoId = searchParams.get('presupuesto_id');
  const [nuevoPacienteOpen, setNuevoPacienteOpen] = useState(false);
  const [comentarioOpen, setComentarioOpen] = useState(false);
  const [recetaModalOpen, setRecetaModalOpen] = useState(false);
  const [recetasDrawerOpen, setRecetasDrawerOpen] = useState(false);
  const [recetaError, setRecetaError] = useState<string | null>(null);
  const [dictationContext, setDictationContext] = useState<{ contexto: 'ficha' | 'sesion'; citaId?: string } | null>(null);
  const [pedidoLabContext, setPedidoLabContext] = useState<{ open: boolean; linea: PresupuestoLinea | null }>({ open: false, linea: null });
  const [pedidoLabError, setPedidoLabError] = useState<string | null>(null);
  const dedicatedTaskOpen = Boolean(designer || recetaModalOpen || documentsDrawerOpen);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientOffset, setPatientOffset] = useState(0);
  const deferredPatientSearch = useDeferredValue(patientSearch);
  useEffect(() => {
    // External navigation (including the assistant) must update an already open patient.
    const timer = window.setTimeout(() => {
      if (initialArea && isClinicalTab(initialArea as WorkTab)) { setTab('clinica'); setClinicalTab(initialArea as ClinicalTab); }
      else if (initialArea === 'presupuestos') setTab('presupuestos');
      else if (initialArea === 'clinica' || initialArea === 'tratamientos') setTab('clinica');
      else if (initialArea === 'historial' || initialArea === 'facturacion' || initialArea === 'realizados') setTab('historial');
      else {
        setTab('pacientes');
        if (initialArea === 'documentos' || initialArea === 'consentimientos') setDocumentsDrawerOpen(true);
        if (initialArea === 'receta') setRecetaModalOpen(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialArea]);
  const activeMainTab: MainPatientTab = isClinicalTab(tab) || tab === 'tratamientos' || tab === 'clinica'
      ? 'clinica'
      : tab === 'historial' || tab === 'facturacion' || tab === 'realizados'
      ? 'historial'
      : tab === 'presupuestos'
      ? 'presupuestos'
      : 'pacientes';
  const activeClinicalTab = isClinicalTab(tab) ? tab : clinicalTab;
  const patientSearchTerm = deferredPatientSearch.trim();
  const pacientesQuery = useQuery({
    queryKey: ['pacientes', { q: patientSearchTerm, limit: PATIENT_PAGE_SIZE, offset: patientOffset }],
    queryFn: () => getPacientes({
      q: patientSearchTerm || undefined,
      limit: PATIENT_PAGE_SIZE,
      offset: patientOffset,
    }),
  });
  const pacientes = pacientesQuery.data ?? [];
  const urlPatientParam = searchParams.get('paciente_id');
  const hasPatientQueryParam = urlPatientParam !== null;
  const urlPatientId = urlPatientParam?.trim() || null;
  const cachedPatientId = hasPatientQueryParam ? null : sessionStorage.getItem('dentcore_selected_patient_id');
  const requestedPatientId = urlPatientId ?? cachedPatientId;
  const requestedPatientSummary = pacientes.find((paciente) => paciente.id === requestedPatientId) ?? null;
  const firstPatient = !requestedPatientId && !hasPatientQueryParam ? (pacientes[0] ?? null) : null;
  const activeSummary = requestedPatientSummary ?? firstPatient;
  const activePatientId = requestedPatientSummary?.id ?? requestedPatientId ?? firstPatient?.id ?? null;
  const pacienteDetalleQuery = useQuery({
    queryKey: ['paciente-detalle', activePatientId],
    queryFn: () => getPaciente(activePatientId!),
    enabled: Boolean(activePatientId),
  });
  const active = pacienteDetalleQuery.data ?? activeSummary;

  const presupuestosQuery = useQuery({
    queryKey: ['presupuestos', active?.id],
    queryFn: () => getPresupuestos(active!.id),
    enabled: Boolean(active),
  });
  const trabajosPendientesQuery = useQuery({
    queryKey: ['trabajo-pendiente', active?.id],
    queryFn: () => getTrabajosPendientesPaciente(active!.id),
    enabled: Boolean(active),
  });
  const facturasQuery = useQuery({
    queryKey: ['facturas', active?.id],
    queryFn: () => getFacturas(active!.id),
    enabled: Boolean(active) && canManageBilling,
  });
  const pagosAnticipadosQuery = useQuery({
    queryKey: ['pagos-anticipados', active?.id],
    queryFn: () => getPagosAnticipadosPaciente(active!.id),
    enabled: Boolean(active) && canManageBilling,
  });
  const accountQuery = useQuery({ queryKey: ['cuenta-paciente', active?.id], queryFn: () => getPatientAccount(active!.id), enabled: Boolean(active?.id && canManageBilling) });
  const saldoQuery = useQuery({
    queryKey: ['saldo-paciente', active?.id],
    queryFn: () => getSaldoPaciente(active!.id),
    enabled: Boolean(active) && canManageBilling,
  });
  const doctoresQuery = useQuery({ queryKey: ['doctores'], queryFn: getDoctores });
  const formasPagoQuery = useQuery({
    queryKey: ['formas-pago'],
    queryFn: getFormasPago,
    enabled: canManageBilling,
  });
  const tratamientosQuery = useQuery({ queryKey: ['tratamientos-catalogo'], queryFn: () => getTratamientosCatalogo({ solo_activos: true }) });
  const historialQuery = useQuery({
    queryKey: ['historial-paciente', active?.id],
    queryFn: () => getHistorialPaciente(active!.id),
    enabled: Boolean(active),
  });
  const historialSinFacturarQuery = useQuery({
    queryKey: ['historial-sin-facturar', active?.id],
    queryFn: () => getHistorialSinFacturar(active!.id),
    enabled: Boolean(active) && canManageBilling && invoiceCreatorOpen,
  });
  const citasPacienteQuery = useQuery({
    queryKey: ['citas-paciente', active?.id],
    queryFn: () => getCitas({ paciente_id: active!.id }),
    enabled: Boolean(active),
  });
  const documentosQuery = useQuery({
    queryKey: ['documentos-paciente', active?.id],
    queryFn: () => getDocumentosPaciente(active!.id),
    enabled: Boolean(active),
  });
  const plantillasQuery = useQuery({ queryKey: ['plantillas-consentimiento'], queryFn: getPlantillasConsentimiento });
  const recetaPlantillasQuery = useQuery({ queryKey: ['receta-plantillas'], queryFn: getRecetaPlantillas, enabled: canViewClinicalDocuments });
  const recetaProviderStatusQuery = useQuery({ queryKey: ['receta-provider-status'], queryFn: getRecetaProviderStatus, enabled: canViewClinicalDocuments });
  const consentimientosQuery = useQuery({
    queryKey: ['consentimientos-paciente', active?.id],
    queryFn: () => getConsentimientosPaciente(active!.id),
    enabled: Boolean(active) && canViewClinicalDocuments,
  });
  const laboratorioPacienteQuery = useQuery({
    queryKey: ['laboratorio-paciente', active?.id],
    queryFn: () => getTrabajosLaboratorio({ paciente_id: active!.id }),
    enabled: Boolean(active),
  });
  const recetasPacienteQuery = useQuery({
    queryKey: ['recetas-paciente', active?.id],
    queryFn: () => getRecetasPaciente(active!.id),
    enabled: Boolean(active) && canViewClinicalDocuments,
  });
  const notasDentalesQuery = useQuery({
    queryKey: ['notas-dentales', active?.id],
    queryFn: () => getNotasDentalesPaciente(active!.id),
    enabled: Boolean(active),
  });
  const sesionItemsQuery = useQuery({
    queryKey: ['sesion-items', active?.id],
    queryFn: () => getSesionItemsPaciente(active!.id),
    enabled: Boolean(active),
  });
  const laboratoriosCatalogoQuery = useQuery({
    queryKey: ['laboratorios-catalogo'],
    queryFn: () => getLaboratorios({ solo_activos: true }),
  });

  const presupuestos = presupuestosQuery.data ?? [];
  const trabajosPendientes = trabajosPendientesQuery.data ?? [];
  const facturas = canManageBilling ? (facturasQuery.data ?? []) : [];
  const pagosAnticipados = canManageBilling ? (pagosAnticipadosQuery.data ?? []) : [];
  const billingTotals = getBillingTotals(facturas);
  const totalPendiente = canManageBilling
    ? Number(saldoQuery.data?.pendiente ?? billingTotals.pendiente)
    : 0;
  const trabajosPendientesError = trabajosPendientesQuery.isError
    ? (trabajosPendientesQuery.error instanceof Error ? trabajosPendientesQuery.error.message : 'No se pudieron cargar los tratamientos pendientes.')
    : null;
  const sesionItemsError = sesionItemsQuery.isError
    ? (sesionItemsQuery.error instanceof Error ? sesionItemsQuery.error.message : 'No se pudieron cargar los items de la sesion.')
    : null;
  const hasPatientError = pacientesQuery.isError || pacienteDetalleQuery.isError || historialQuery.isError || citasPacienteQuery.isError || trabajosPendientesQuery.isError;
  const hasPatientLoading = pacientesQuery.isLoading || (Boolean(active?.id) && pacienteDetalleQuery.isLoading);
  const alergias = patientAllergies(active);
  const proximaCita = nextPatientAppointment(citasPacienteQuery.data ?? [], workspaceTime);
  const canDictarNota = user?.rol === 'admin' || user?.rol === 'doctor';
  const hasPreviousPatientPage = patientOffset > 0;
  const hasNextPatientPage = pacientes.length === PATIENT_PAGE_SIZE;
  const patientPageLabel = pacientes.length
    ? `${patientOffset + 1}-${patientOffset + pacientes.length}${patientSearchTerm ? ' filtrados' : ''}`
    : 'Sin resultados';

  useEffect(() => {
    function runPatientFastAction(action: PatientFastActionName) {
      if (dedicatedTaskOpen) {
        document.querySelector<HTMLElement>('.dc-task-heading h1')?.focus({ preventScroll: true });
        toast.info('Termina la tarea actual o vuelve a la ficha antes de abrir otra acción.');
        return;
      }
      if (action === 'new') {
        setNuevoPacienteOpen(true);
        return;
      }
      if (action === 'budgets') {
        setTab('presupuestos');
        setSearchParams(current => { const next = new URLSearchParams(current); next.set('tab', 'presupuestos'); return next; }, { replace: true, state: location.state });
        return;
      }
      if (action === 'documents' || action === 'upload_document') {
        setDocumentsDrawerOpen(true);
        setDocumentsUploadOpen(action === 'upload_document');
      }
    }

    const storedAction = sessionStorage.getItem('dentcore_patient_action');
    const timeout = isPatientFastAction(storedAction)
      ? window.setTimeout(() => {
          sessionStorage.removeItem('dentcore_patient_action');
          runPatientFastAction(storedAction);
        }, 0)
      : null;

    function handlePatientFastAction(event: Event) {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (!isPatientFastAction(action)) return;
      sessionStorage.removeItem('dentcore_patient_action');
      runPatientFastAction(action);
    }

    window.addEventListener('dentcore:patient-fast-action', handlePatientFastAction);
    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      window.removeEventListener('dentcore:patient-fast-action', handlePatientFastAction);
    };
  }, [dedicatedTaskOpen, setSearchParams, location.state]);

  useEffect(() => {
    if (!active?.id) return;
    sessionStorage.setItem('dentcore_selected_patient_id', active.id);
    sessionStorage.setItem('dentcore_selected_patient_name', fullName(active));
    if (urlPatientId === active.id) return;
    const next = new URLSearchParams(searchParams);
    next.set('paciente_id', active.id);
    setSearchParams(next, { replace: true, state: location.state });
  }, [active, searchParams, setSearchParams, urlPatientId, location.state]);

  function setActivePatient(paciente: ApiPaciente, options: { replace?: boolean } = {}) {
    queryClient.setQueryData(['paciente-detalle', paciente.id], paciente);
    sessionStorage.setItem('dentcore_selected_patient_id', paciente.id);
    sessionStorage.setItem('dentcore_selected_patient_name', fullName(paciente));
    const next = new URLSearchParams();
    next.set('paciente_id', paciente.id);
    setSearchParams(next, { replace: options.replace ?? true, state: location.state });
  }

  function openBudget(presupuestoId: string) {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      next.set('tab', 'presupuestos');
      next.set('presupuesto_id', presupuestoId);
      return next;
    }, { replace: true, state: location.state });
    setTab('presupuestos');
  }

  function openPatientArea(targetTab: WorkTab) {
    if (targetTab !== 'citas') setSearchParams(current => {
      const next = new URLSearchParams(current);
      next.set('tab', targetTab === 'clinica' || targetTab === 'tratamientos' ? clinicalTab : targetTab);
      return next;
    }, { replace: true, state: location.state });
    if (targetTab === 'presupuestos') {
      setTab('presupuestos');
      return;
    }
    if (isClinicalTab(targetTab)) {
      setClinicalTab(targetTab);
      setTab('clinica');
      return;
    }
    if (targetTab === 'tratamientos' || targetTab === 'clinica') {
      setTab('clinica');
      return;
    }
    if (targetTab === 'realizados' || targetTab === 'facturacion' || targetTab === 'historial') {
      setTab('historial');
      return;
    }
    if (targetTab === 'documentos' || targetTab === 'consentimientos') {
      setTab('pacientes');
      openDocumentsDrawer();
      return;
    }
    if (targetTab === 'citas') {
      abrirAgendaPaciente();
      return;
    }
    setTab('pacientes');
  }

  function openDocumentsDrawer(options: { upload?: boolean } = {}) {
    setDocumentsDrawerOpen(true);
    setDocumentsUploadOpen(Boolean(options.upload));
  }

  function invalidatePatientWorkspace(pacienteId: string) {
    invalidatePatientWorkspaceQueries(queryClient, pacienteId);
  }

  const nuevoPresupuesto = useMutation({
    onMutate: () => {
      openPatientArea('presupuestos');
    },
    mutationFn: async () => {
      if (!active) throw new Error('Sin paciente');
      const doctor = doctoresQuery.data?.find(item => item.id === user?.doctor_id) ?? doctoresQuery.data?.[0];
      if (!doctor) throw new Error('No hay doctores configurados');
      return createPresupuesto(active.id, doctor.id);
    },
    onSuccess: (presupuesto) => {
      queryClient.setQueryData<Presupuesto[]>(['presupuestos', presupuesto.paciente_id], (current = []) => [
        presupuesto,
        ...current.filter((item) => item.id !== presupuesto.id),
      ]);
      void presupuestosQuery.refetch().then((result) => {
        if (result.data?.some((item) => item.id === presupuesto.id)) return;
        queryClient.setQueryData<Presupuesto[]>(['presupuestos', presupuesto.paciente_id], (current = []) => [
          presupuesto,
          ...current.filter((item) => item.id !== presupuesto.id),
        ]);
      });
      openBudget(presupuesto.id);
    },
  });

  const emitirFactura = useMutation({
    mutationFn: ({ concepto, importe }: { concepto: string; importe: number }) => {
      if (!active) throw new Error('Sin paciente');
      return createFacturaManual(active.id, concepto, importe);
    },
    onSuccess: () => {
      setFacturaManualOpen(false);
      if (active?.id) invalidatePatientWorkspace(active.id);
      openPatientArea('historial');
    },
  });

  const generarFacturaDesdeHistorial = useMutation({
    mutationFn: async (data: {
      lineas: HistorialSinFacturar[];
      fecha: string;
      serie: string;
      formaPagoId: string | null;
      descuento: number;
      generarCobro: boolean;
    }) => {
      if (!active) throw new Error('Sin paciente');
      if (!data.lineas.length) throw new Error('Selecciona al menos un tratamiento');
      if (data.generarCobro && !data.formaPagoId) throw new Error('Selecciona forma de pago para generar cobro');
      const factura = await createFacturaDesdeHistorial(active.id, {
        fecha: data.fecha,
        serie: data.serie,
        forma_pago_id: data.formaPagoId,
        descuento_porcentaje: data.descuento,
        lineas: data.lineas,
        observaciones: 'Factura generada desde tratamientos no facturados',
      });
      if (data.generarCobro && data.formaPagoId && Number(factura.pendiente) > 0) {
        await registrarCobro(factura.id, data.formaPagoId, Number(factura.pendiente));
      }
      return factura;
    },
    onSuccess: (factura) => {
      setInvoiceCreatorOpen(false);
      openPatientArea('historial');
      invalidatePatientWorkspace(factura.paciente_id);
      void openFacturaPdf(factura.id).catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Factura creada, pero no se pudo abrir el PDF.');
      });
    },
  });

  const crearPagoAnticipado = useMutation({
    mutationFn: ({ importe, concepto, notas, formaPagoId }: { importe: number; concepto: string; notas: string | null; formaPagoId: string }) => {
      if (!active) throw new Error('Sin paciente');
      return createPagoAnticipadoPaciente(active.id, { importe, forma_pago_id: formaPagoId, concepto, notas });
    },
    onSuccess: () => {
      setAnticipoModal(null);
      if (active?.id) invalidatePatientWorkspace(active.id);
      openPatientArea('historial');
    },
  });

  const editarPagoAnticipado = useMutation({
    mutationFn: ({ pago, importe, concepto, notas, formaPagoId }: { pago: PagoAnticipadoPaciente; importe: number; concepto: string; notas: string | null; formaPagoId: string }) => {
      if (!active) throw new Error('Sin paciente');
      return updatePagoAnticipadoPaciente(active.id, pago.id, { importe, concepto, notas, forma_pago_id: formaPagoId, revision: pago.revision });
    },
    onSuccess: () => {
      setAnticipoModal(null);
      if (active?.id) invalidatePatientWorkspace(active.id);
      openPatientArea('historial');
    },
  });

  const subirDocumento = useMutation({
    mutationFn: async (data: { archivo: File; categoria: string; descripcion?: string; fecha_documento?: string; etiquetas?: string }) => {
      if (!active) throw new Error('Sin paciente');
      return uploadDocumentoPaciente(active.id, data);
    },
    onSuccess: (documento) => {
      invalidatePatientWorkspace(documento.paciente_id);
      setDocumentsDrawerOpen(true);
      setDocumentsUploadOpen(false);
      setTab('pacientes');
      toast.success('Documento guardado en la ficha.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir el documento.');
    },
  });

  const guardarDocumentoDisenado = useMutation({
    mutationFn: async (data: { tipo: string; titulo: string; contenido: string; firmaDataUrl: string | null }) => {
      if (!active) throw new Error('Sin paciente');
      if (!designer) throw new Error('Sin editor');
      if (designer.mode === 'consentimiento') {
        if (!data.firmaDataUrl) {
          throw new Error('Firma el consentimiento antes de guardar el PDF en la ficha.');
        }
        const plantilla = (plantillasQuery.data ?? []).find((item) => item.nombre === data.tipo);
        const consentimiento = await createConsentimientoPaciente(active.id, data.tipo, doctoresQuery.data?.[0]?.id, {
          plantilla_id: plantilla?.id ?? null,
          estado: 'pendiente_firma',
          plantilla_version: plantilla?.version ?? 'personalizada',
          contenido: data.contenido,
        });
        const firmado = await firmarConsentimiento(consentimiento.id, data.firmaDataUrl);
        return { kind: 'consentimiento' as const, consentimiento: firmado };
      }
      const categoria = 'circular';
      const doc = await generarDocumentoPdfPaciente(active.id, {
        titulo: data.titulo,
        categoria,
        contenido: data.contenido,
        descripcion: data.titulo,
        etiquetas: `circular, ${data.tipo}`,
        doctor_id: doctoresQuery.data?.[0]?.id ?? null,
        firma_data_url: data.firmaDataUrl,
      });
      return { kind: 'documento' as const, doc };
    },
    onSuccess: (result) => {
      setDesigner(null);
      if (result.kind === 'consentimiento') {
        invalidatePatientWorkspace(result.consentimiento.paciente_id);
        setDocumentsDrawerOpen(true);
        setTab('pacientes');
        void openConsentimientoPdf(result.consentimiento.id).catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Consentimiento guardado, pero no se pudo abrir el PDF.');
        });
        return;
      }
      invalidatePatientWorkspace(result.doc.paciente_id);
      setDocumentsDrawerOpen(true);
      setTab('pacientes');
      if (active && result.doc.id) {
        void openDocumentoPaciente(active.id, result.doc.id, result.doc.nombre_original).catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Documento guardado, pero no se pudo abrir.');
        });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el documento.');
    },
  });

  const guardarFichaPaciente = useMutation({
    mutationFn: async (data: Partial<ApiPaciente>) => {
      if (!active) throw new Error('Sin paciente');
      return updatePaciente(active.id, data);
    },
    onSuccess: (paciente) => {
      setActivePatient(paciente, { replace: true });
      setEditingPatient(false);
      invalidatePatientWorkspace(paciente.id);
      void pacientesQuery.refetch();
    },
  });

  const crearPaciente = useMutation({
    mutationFn: (data: Parameters<typeof createPaciente>[0]) => createPaciente(data),
    onSuccess: (paciente) => {
      setActivePatient(paciente);
      setNuevoPacienteOpen(false);
      setTab('pacientes');
      void pacientesQuery.refetch();
    },
  });

  const crearPedidoLab = useMutation({
    mutationFn: (data: TrabajoLaboratorioCreateInput) => createTrabajoLaboratorio(data),
    onSuccess: (trabajo) => {
      setPedidoLabContext({ open: false, linea: null });
      setPedidoLabError(null);
      invalidatePatientWorkspace(trabajo.paciente_id);
    },
    onError: (error) => {
      setPedidoLabError(error instanceof Error ? error.message : 'No se pudo crear el pedido');
    },
  });

  const guardarReceta = useMutation({
    mutationFn: async ({ data, action }: RecetaSubmitPayload) => {
      if (!active) throw new Error('Sin paciente');
      const borrador = await createRecetaClinica(active.id, data);
      if (action === 'draft') return { receta: borrador, action };
      const emitirPayload = { plantilla_id: data.plantilla_id ?? null };
      const receta = action === 'send_provider'
        ? await enviarRecetaProveedor(borrador.id, emitirPayload)
        : await emitirRecetaLocal(borrador.id, emitirPayload);
      return { receta, action };
    },
    onSuccess: ({ receta, action }) => {
      setRecetaModalOpen(false);
      setRecetaError(null);
      invalidatePatientWorkspace(receta.paciente_id);
      if (action === 'draft') {
        toast.success('Borrador de receta guardado.');
        return;
      }
      const message = action === 'send_provider'
        ? 'Receta enviada a proveedor.'
        : 'Receta local no certificada emitida.';
      toast.success(receta.pdf_documento_id ? `${message} Abriendo PDF...` : `${message} PDF final pendiente.`);
      if (receta.pdf_documento_id) {
        void openRecetaClinicaPdf(receta.id).catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Receta emitida, pero no se pudo abrir el PDF.');
        });
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la receta';
      setRecetaError(message);
    },
  });

  const importarPlantillaReceta = useMutation({
    mutationFn: importRecetaPlantilla,
    onSuccess: () => {
      setRecetaError(null);
      void queryClient.invalidateQueries({ queryKey: ['receta-plantillas'] });
      toast.success('Plantilla de receta importada.');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'No se pudo importar la plantilla de receta';
      setRecetaError(message);
      toast.error(message);
    },
  });

  const finalizarSesionClinica = useMutation({
    mutationFn: (data: SesionTratamientoRealizadoInput) => finalizarTratamientoSesion(data),
    onSuccess: (entrada: HistorialClinico) => {
      queryClient.setQueryData<HistorialClinico[]>(['historial-paciente', entrada.paciente_id], (current = []) => [
        entrada,
        ...current.filter((item) => item.id !== entrada.id),
      ]);
      invalidatePatientWorkspace(entrada.paciente_id);
      toast.success('Tratamiento guardado en historial.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el tratamiento en historial.');
    },
  });

  const crearSesionItem = useMutation({
    mutationFn: async (input: SesionClinicaItemCreateInput) => {
      if (!active) throw new Error('Sin paciente');
      return createSesionItem(active.id, input);
    },
    onSuccess: (item: SesionClinicaItem) => {
      void queryClient.invalidateQueries({ queryKey: ['sesion-items', item.paciente_id] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el item de la sesion.');
    },
  });

  const actualizarSesionItem = useMutation({
    mutationFn: async ({ itemId, cambios }: { itemId: string; cambios: SesionClinicaItemUpdateInput }) => {
      if (!active) throw new Error('Sin paciente');
      return updateSesionItem(active.id, itemId, cambios);
    },
    onSuccess: (item: SesionClinicaItem) => {
      void queryClient.invalidateQueries({ queryKey: ['sesion-items', item.paciente_id] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el item de la sesion.');
    },
  });

  const eliminarSesionItem = useMutation({
    mutationFn: async (itemId: string) => {
      if (!active) throw new Error('Sin paciente');
      await deleteSesionItem(active.id, itemId);
      return { itemId, paciente_id: active.id };
    },
    onSuccess: ({ paciente_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['sesion-items', paciente_id] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar el item de la sesion.');
    },
  });

  const crearNotaDental = useMutation({
    mutationFn: (data: NotaDentalCreateInput) => createNotaDental(data),
    onSuccess: (nota) => {
      invalidatePatientWorkspace(nota.paciente_id);
      toast.success('Nota de pieza guardada.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la nota de pieza.');
    },
  });

  function abrirCobroDesdeFicha() {
    if (active && canManageBilling) setCheckoutOpen(true);
  }

  function revocarConsentimientoPaciente(consentimiento: Consentimiento) {
    setRevocarConsentimientoTarget(consentimiento);
  }

  function confirmarRevocacion(motivo: string) {
    if (!revocarConsentimientoTarget) return;
    const id = revocarConsentimientoTarget.id;
    setRevocarConsentimientoTarget(null);
    void revocarConsentimiento(id, motivo).then(() => {
      if (active?.id) invalidatePatientWorkspace(active.id);
      toast.success('Consentimiento revocado.');
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo revocar el consentimiento.');
    });
  }

  function abrirRecibos() {
    abrirCobroDesdeFicha();
  }

  function abrirAgendaPaciente() {
    if (!active) return;
    sessionStorage.setItem('dentcore_selected_patient_id', active.id);
    sessionStorage.setItem('dentcore_selected_patient_name', fullName(active));
    sessionStorage.setItem('dentcore_agenda_action', 'new');
    sessionStorage.removeItem('dentcore_selected_treatment');
    sessionStorage.removeItem('dentcore_selected_presupuesto_linea_id');
    navigate('/agenda');
  }

  function copiarDatosPaciente() {
    if (!active) return;
    const datos = `${fullName(active)} - H ${active.num_historial}${active.telefono ? ` - ${active.telefono}` : ''}`;
    void navigator.clipboard?.writeText(datos);
  }

  function abrirWhatsAppPaciente() {
    if (!active) return;
    const url = buildWhatsAppUrl(active);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function abrirRevocarConsentimientoMenu() {
    const candidato = (consentimientosQuery.data ?? []).find((item) => item.estado !== 'revocado');
    if (!candidato) return;
    setRevocarConsentimientoTarget(candidato);
  }

  function guardarComentario(texto: string, revision?: number) {
    if (!active) return;
    guardarFichaPaciente.mutate(
      { observaciones: texto.trim() || null, revision },
      { onSuccess: () => setComentarioOpen(false) },
    );
  }

  function abrirPdfFactura(factura: Factura) {
    void openFacturaPdf(factura.id).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo abrir la factura.');
    });
  }

  function abrirDocumento(documento: DocumentoPaciente) {
    if (!active) return;
    void openDocumentoPaciente(active.id, documento.id, documento.nombre_original).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo abrir el documento.');
    });
  }

  function abrirConsentimiento(consentimiento: Consentimiento) {
    void openConsentimientoPdf(consentimiento.id).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo abrir el consentimiento.');
    });
  }

  function abrirRecetaClinica(recetaId: string) {
    void openRecetaClinicaPdf(recetaId).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo abrir la receta.');
    });
  }

  function darCitaParaTratamiento(linea: PresupuestoLinea) {
    if (!active) return;
    sessionStorage.setItem('dentcore_selected_patient_id', active.id);
    sessionStorage.setItem('dentcore_selected_patient_name', fullName(active));
    sessionStorage.setItem('dentcore_selected_treatment', linea.tratamiento?.nombre ?? 'Tratamiento dental');
    sessionStorage.setItem('dentcore_selected_presupuesto_linea_id', linea.id);
    sessionStorage.setItem('dentcore_agenda_action', 'new');
    navigate('/agenda');
  }

  function renderPresupuestosContextPanel() {
    const activeId = selectedPresupuestoId ?? presupuestos[0]?.id;
    const presupuesto = presupuestos.find((p) => p.id === activeId);
    const noDoctorsConfigured = doctoresQuery.isFetched && !doctoresQuery.data?.length;
    const createDisabled = !active || doctoresQuery.isLoading || !doctoresQuery.data?.length || nuevoPresupuesto.isPending;
    const createError = nuevoPresupuesto.error instanceof Error ? nuevoPresupuesto.error.message : null;
    const createLabel = nuevoPresupuesto.isPending ? 'Creando...' : 'Crear nuevo presupuesto';
    const selector = (
      <>
        {(!active || noDoctorsConfigured || createError) && (
          <div className="inline-alert budget-create-alert" role="alert">
            {!active && 'Selecciona un paciente antes de crear un presupuesto.'}
            {active && noDoctorsConfigured && 'No hay doctores configurados. Crea o activa un doctor para poder crear presupuestos.'}
            {active && doctoresQuery.data?.length && createError}
          </div>
        )}
        <div className="dc-budget-selector" aria-label="Presupuestos del paciente">
          {presupuestos.map((p) => {
            return (
              <button
                key={p.id}
                type="button"
                className={`dc-budget-choice${(selectedPresupuestoId ?? presupuestos[0]?.id) === p.id ? ' active' : ''}`}
                aria-pressed={(selectedPresupuestoId ?? presupuestos[0]?.id) === p.id}
                onClick={() => openBudget(p.id)}
              >
                <span className="pp-num">#{p.numero}</span>
                <span className="pp-estado">{presupuestoEstadoLabel(p.estado)}</span>
                <span className="pp-total">Total {money(Number(p.total ?? 0))}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="dc-budget-choice dc-budget-new"
            aria-label={createLabel}
            title={createLabel}
            onClick={() => nuevoPresupuesto.mutate()}
            disabled={createDisabled}
          >
            {nuevoPresupuesto.isPending ? 'Creando...' : '+ Nuevo'}
          </button>
        </div>
      </>
    );

    return (
      <section className="dc-patient-budgets" aria-label="Presupuestos">
        {selector}
        {!presupuesto && !presupuestosQuery.isLoading && (
          <div className="desk-panel empty-state">No hay presupuestos para este paciente.</div>
        )}
        {presupuesto && active && (
          <PresupuestoPanel
            key={presupuesto.id}
            onOpenBudget={(budget) => { queryClient.setQueryData<Presupuesto[]>(['presupuestos', budget.paciente_id], (current = []) => [budget, ...current.filter(item => item.id !== budget.id)]); openBudget(budget.id); }}
            presupuesto={presupuesto}
            pendingLineIds={trabajosPendientes.filter(item => !item.realizado).map(item => item.presupuesto_linea_id)}
            paciente={active}
            tratamientos={tratamientosQuery.data ?? []}
            userRole={user?.rol}
          />
        )}
      </section>
    );
  }

  const patientActions = {
    onNuevaCita: abrirAgendaPaciente,
    onNuevoPresupuesto: () => nuevoPresupuesto.mutate(),
    onCobrar: () => abrirCobroDesdeFicha(),
    onSubirDocumento: () => openDocumentsDrawer({ upload: true }),
    onCrearReceta: () => {
      setRecetaError(null);
      setRecetaModalOpen(true);
    },
    onPedidoLaboratorio: () => {
      setPedidoLabError(null);
      setPedidoLabContext({ open: true, linea: null });
    },
    onConsentimiento: () => setDesigner(active ? { mode: 'consentimiento' } : null),
    onRevocarConsentimiento: abrirRevocarConsentimientoMenu,
    onCircular: () => setDesigner(active ? { mode: 'circular' } : null),
    onCuestionarioMedico: () => setDesigner(active ? { mode: 'circular', tipo: 'Cuestionario medico' } : null),
    onDocumentoLOPD: () => setDesigner(active ? { mode: 'circular', tipo: 'Documento LOPD / proteccion de datos' } : null),
    onWhatsApp: abrirWhatsAppPaciente,
    onComentario: () => setComentarioOpen(true),
    onCopiarDatos: copiarDatosPaciente,
    onVistaCompleta: () => setFullPatientOpen(true),
  };
  const patientMenu = useObjectMenu({ items: active ? [active] : [], id: patient => patient.id, label: fullName, actions: () => [
    { id: 'appointment', label: 'Nueva cita', run: patientActions.onNuevaCita },
    { id: 'budget', label: 'Nuevo presupuesto', disabled: nuevoPresupuesto.isPending, run: patientActions.onNuevoPresupuesto },
    { id: 'documents', label: 'Subir documento', run: patientActions.onSubirDocumento },
    ...(canViewClinicalDocuments ? [{ id: 'consent', label: 'Consentimiento informado', run: patientActions.onConsentimiento }] : []),
    ...(canManageBilling ? [{ id: 'checkout', label: 'Cobrar', run: patientActions.onCobrar }] : []),
  ] });
  if ((!active && hasPatientLoading) || (active && urlPatientId !== active.id)) {
    return <div className="dc-patient-workspace" role="status">Abriendo ficha del paciente…</div>;
  }

  return (
    <div className="dc-patient-workspace">
      <ToolbarContribution slot="module">{active && <PatientHeaderContext paciente={active} proximaCita={proximaCita} />}</ToolbarContribution>
      <ContextToolbar className="dc-patient-header" hidden={dedicatedTaskOpen}>
        <PatientFinder
          pacientes={pacientes}
          selectedId={active?.id ?? null}
          query={patientSearch}
          onQueryChange={(value) => {
            setPatientSearch(value);
            setPatientOffset(0);
          }}
          loading={pacientesQuery.isFetching}
          pageLabel={patientPageLabel}
          hasPreviousPage={hasPreviousPatientPage}
          hasNextPage={hasNextPatientPage}
          onPreviousPage={() => setPatientOffset((current) => Math.max(0, current - PATIENT_PAGE_SIZE))}
          onNextPage={() => setPatientOffset((current) => current + PATIENT_PAGE_SIZE)}
          onNew={() => setNuevoPacienteOpen(true)}
          onSelect={(paciente) => {
            setActivePatient(paciente);
            setTab('pacientes');
          }}
        />
        {(alergias || totalPendiente > 0) && (
          <div className="dc-patient-chips" aria-label="Avisos del paciente">
            {alergias && <span className="dc-patient-chip dc-patient-chip-danger" title={`Alérgico: ${alergias}`}>Alergias: {alergias}</span>}
            {canManageBilling && totalPendiente > 0 && (
              <span className="dc-patient-chip dc-patient-chip-danger" title="Saldo pendiente">{money(totalPendiente)}</span>
            )}
          </div>
        )}
        {(
          <PatientActionsMenu
            paciente={active}
            busy={nuevoPresupuesto.isPending}
            canManageBilling={canManageBilling}
            canViewClinicalDocuments={canViewClinicalDocuments}
            handlers={patientActions}
          />
        )}
        {hasPatientError && (
          <div className="inline-alert">
            Algunos datos del paciente no se han podido cargar. Revisa la conexion o cambia de paciente para reintentar.
          </div>
        )}
        {hasPatientLoading && (
          <div className="patient-loading-strip" aria-label="Cargando paciente">
            <span />
            <span />
            <span />
          </div>
        )}
      </ContextToolbar>
      <section className="dc-patient-view">
        <nav className="dc-patient-tabs" aria-label="Áreas del paciente" hidden={dedicatedTaskOpen}>
          {WORK_TABS.map((item) => (
            <button
              key={item.id}
              className={`dc-tab${activeMainTab === item.id ? ' active' : ''}`}
              aria-current={activeMainTab === item.id ? 'page' : undefined}
              onClick={() => openPatientArea(item.id)}
            >
              <span className="tab-icon">{TAB_ICONS[item.id]}</span>{item.label}
            </button>
          ))}
        </nav>
      <div className="dc-patient-body" hidden={dedicatedTaskOpen}>
        {activeMainTab === 'pacientes' && (
          <div {...(active ? patientMenu.bindings(active) : {})}>
            <PatientForm
              embedded
              paciente={active}
              facturas={facturas}
              canManageBilling={canManageBilling}
              historial={historialQuery.data ?? []}
              citas={citasPacienteQuery.data ?? []}
              presupuestos={presupuestos}
              documentos={documentosQuery.data ?? []}
              consentimientos={consentimientosQuery.data ?? []}
              laboratorio={laboratorioPacienteQuery.data ?? []}
              onEdit={() => setEditingPatient(true)}
              onOpenFull={() => setFullPatientOpen(true)}
              onOpenCitas={abrirAgendaPaciente}
              onDictarNota={() => setDictationContext({ contexto: 'ficha' })}
              canDictarNota={canDictarNota}
              onComentario={() => setComentarioOpen(true)}
              onNuevoPresupuesto={() => nuevoPresupuesto.mutate()}
              onCrearReceta={() => {
                setRecetaError(null);
                setRecetaModalOpen(true);
              }}
              onWhatsApp={abrirWhatsAppPaciente}
              onOpenPresupuestos={() => openPatientArea('presupuestos')}
              onOpenPendientes={() => openPatientArea('pendiente')}
              onOpenRealizados={() => openPatientArea('realizados')}
              onOpenFacturacion={() => openPatientArea('historial')}
              onOpenHistorial={() => openPatientArea('historial')}
              onOpenDocumentos={() => openDocumentsDrawer()}
              onSubirDocumento={() => openDocumentsDrawer({ upload: true })}
              onOpenConsentimientos={() => setDesigner(active ? { mode: 'consentimiento' } : null)}
              onEmitirFactura={() => setInvoiceCreatorOpen(true)}
              onRegistrarCobro={abrirCobroDesdeFicha}
              onHistorialFacturas={() => setInvoiceHistoryOpen(true)}
              onOpenOdontogramaDetail={() => openPatientArea('primera')}
            />
          </div>
        )}
        {activeMainTab === 'clinica' && (
          <ClinicalWorkspace
            focusedPendingId={searchParams.get('tratamiento_id')}
            activeTab={activeClinicalTab}
            onTabChange={(nextTab) => openPatientArea(nextTab)}
            paciente={active}
            citas={citasPacienteQuery.data ?? []}
            historial={historialQuery.data ?? []}
            presupuestos={presupuestos}
            trabajosPendientes={trabajosPendientes}
            trabajosPendientesLoading={trabajosPendientesQuery.isLoading}
            trabajosPendientesError={trabajosPendientesError}
            documentos={documentosQuery.data ?? []}
            consentimientos={consentimientosQuery.data ?? []}
            recetas={recetasPacienteQuery.data ?? []}
            notasDentales={notasDentalesQuery.data ?? []}
            laboratorio={laboratorioPacienteQuery.data ?? []}
            saldoPendiente={totalPendiente}
            doctorId={user?.doctor_id ?? null}
            doctores={doctoresQuery.data ?? []}
            tratamientos={tratamientosQuery.data ?? []}
            onDarCita={darCitaParaTratamiento}
            onOpenBudget={budget => openBudget(budget.id)}
            onCrearPedidoLab={(linea) => {
              setPedidoLabError(null);
              setPedidoLabContext({ open: true, linea });
            }}
            onCrearPedidoLabGeneral={() => {
              setPedidoLabError(null);
              setPedidoLabContext({ open: true, linea: null });
            }}
            onCrearReceta={() => {
              setRecetaError(null);
              setRecetaModalOpen(true);
            }}
            onOpenConsentimiento={(tipo) => setDesigner(active ? { mode: 'consentimiento', tipo } : null)}
            onOpenDocumentos={() => openDocumentsDrawer()}
            onOpenPresupuestos={() => openPatientArea('presupuestos')}
            onOpenHistorial={(citaId) => { openPatientArea('historial'); if (citaId) setSearchParams(current => { const next = new URLSearchParams(current); next.set('visita_id', citaId); next.set('tab', 'historial'); return next; }); }}
            onDictarNotaSesion={(citaId) => setDictationContext({ contexto: 'sesion', citaId })}
            canDictarNota={canDictarNota}
            onSchedulePatient={abrirAgendaPaciente}
            onOpenCobro={canManageBilling ? () => abrirCobroDesdeFicha() : undefined}
            onFinalizarTratamientoSesion={(data) => finalizarSesionClinica.mutateAsync(data)}
            onCreateNotaDental={(data) => crearNotaDental.mutateAsync(data)}
            sesionItems={sesionItemsQuery.data ?? []}
            sesionItemsLoading={sesionItemsQuery.isLoading || trabajosPendientesQuery.isLoading}
            sesionItemsError={sesionItemsError ?? trabajosPendientesError}
            onCreateSesionItem={(input) => crearSesionItem.mutateAsync(input)}
            onUpdateSesionItem={(itemId, cambios) => actualizarSesionItem.mutateAsync({ itemId, cambios })}
            onDeleteSesionItem={(itemId) => eliminarSesionItem.mutateAsync(itemId)}
            userRole={user?.rol}
          />
        )}
        {activeMainTab === 'presupuestos' && renderPresupuestosContextPanel()}
        {activeMainTab === 'historial' && (
          <section className="history-complete-workspace">
            <HistorialCompletoPanel
              key={active?.id}
              account={accountQuery.data}
              saldo={saldoQuery.data}
              professionals={doctoresQuery.data ?? []}
              onOpenPresupuesto={(presupuesto) => openBudget(presupuesto.id)}
              loading={[historialQuery, citasPacienteQuery, presupuestosQuery, facturasQuery, pagosAnticipadosQuery, documentosQuery, consentimientosQuery, notasDentalesQuery, saldoQuery, accountQuery].some(query => query.isLoading)}
              error={[historialQuery, citasPacienteQuery, presupuestosQuery, facturasQuery, pagosAnticipadosQuery, documentosQuery, consentimientosQuery, notasDentalesQuery, saldoQuery, accountQuery].some(query => query.isError)}
              focusedVisitId={searchParams.get('visita_id')}
              initialFilter={initialArea === 'facturacion' ? 'facturacion' : undefined}
              focusedRecordId={searchParams.get('factura_id') || searchParams.get('cobro_id') || searchParams.get('anticipo_id') || searchParams.get('registro_id') || searchParams.get('laboratorio_id')}
              paciente={active}
              historial={historialQuery.data ?? []}
              citas={citasPacienteQuery.data ?? []}
              presupuestos={presupuestos}
              facturas={facturas}
              anticipos={pagosAnticipados}
              documentos={documentosQuery.data ?? []}
              consentimientos={consentimientosQuery.data ?? []}
              notasDentales={notasDentalesQuery.data ?? []}
              onOpenDocumento={abrirDocumento}
              onOpenConsentimiento={abrirConsentimiento}
              onOpenFactura={abrirPdfFactura}
              onOpenTreatmentHistory={() => setTreatmentHistoryOpen(true)}
              userRole={user?.rol}
              canManageBilling={canManageBilling}
            />
          </section>
        )}
      </div>
      {patientMenu.menu}
      {nuevoPacienteOpen && (
        <NuevoPacienteModal
          saving={crearPaciente.isPending}
          onClose={() => setNuevoPacienteOpen(false)}
          onSave={(data) => crearPaciente.mutate(data as Parameters<typeof createPaciente>[0])}
        />
      )}
      {canManageBilling && facturaManualOpen && active && (
        <FacturaManualModal
          saving={emitirFactura.isPending}
          onClose={() => setFacturaManualOpen(false)}
          onConfirm={(concepto, importe) => emitirFactura.mutate({ concepto, importe })}
        />
      )}
      {revocarConsentimientoTarget && (
        <RevocarConsentimientoModal
          consentimiento={revocarConsentimientoTarget}
          onClose={() => setRevocarConsentimientoTarget(null)}
          onConfirm={confirmarRevocacion}
        />
      )}
      {comentarioOpen && active && (
        <ComentarioModal
          revision={active.revision}
          initialValue={active.observaciones}
          saving={guardarFichaPaciente.isPending}
          onClose={() => setComentarioOpen(false)}
          onConfirm={guardarComentario}
        />
      )}
      {recetaModalOpen && active && (
        <RecetaModal
          paciente={active}
          doctores={doctoresQuery.data ?? []}
          plantillas={recetaPlantillasQuery.data ?? []}
          providerStatus={recetaProviderStatusQuery.data}
          saving={guardarReceta.isPending}
          importingPlantilla={importarPlantillaReceta.isPending}
          errorMessage={recetaError}
          onClose={() => {
            setRecetaModalOpen(false);
            setRecetaError(null);
          }}
          onSubmit={(payload) => guardarReceta.mutate(payload)}
          onImportPlantilla={(input) => importarPlantillaReceta.mutate(input)}
        />
      )}
      {pedidoLabContext.open && active && (
        <NuevoPedidoLaboratorioModal
          paciente={active}
          doctores={doctoresQuery.data ?? []}
          laboratorios={laboratoriosCatalogoQuery.data ?? []}
          presupuestoLinea={pedidoLabContext.linea}
          saving={crearPedidoLab.isPending}
          errorMessage={pedidoLabError ?? (
            (laboratoriosCatalogoQuery.data?.length ?? 0) === 0
              ? 'No hay laboratorios configurados. Configura uno en Admin antes de crear pedidos.'
              : null
          )}
          onClose={() => {
            setPedidoLabContext({ open: false, linea: null });
            setPedidoLabError(null);
          }}
          onSubmit={(data) => crearPedidoLab.mutate(data)}
        />
      )}
      {recetasDrawerOpen && active && (
        <HistorialRecetasDrawer
          paciente={active}
          recetas={recetasPacienteQuery.data ?? []}
          loading={recetasPacienteQuery.isLoading}
          onClose={() => setRecetasDrawerOpen(false)}
          onAbrirPdf={(receta) => abrirRecetaClinica(receta.id)}
          onCrearNueva={() => {
            setRecetasDrawerOpen(false);
            setRecetaError(null);
            setRecetaModalOpen(true);
          }}
        />
      )}
      {canManageBilling && invoiceHistoryOpen && (
        <InvoiceHistoryModal
          facturas={facturas}
          onClose={() => setInvoiceHistoryOpen(false)}
        />
      )}
      {treatmentHistoryOpen && active && (
        <div className="modal-backdrop" onMouseDown={() => setTreatmentHistoryOpen(false)}>
          <section className="patient-documents-drawer patient-history-ledger-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-titlebar">
              <strong>{canManageBilling ? 'Tratamientos y facturación' : 'Tratamientos realizados'}</strong>
              <button type="button" onClick={() => setTreatmentHistoryOpen(false)}>Cerrar</button>
            </header>
            {canManageBilling && accountQuery.isError && <p role="alert">No se pudo actualizar la cuenta. <button onClick={() => void accountQuery.refetch()}>Reintentar</button></p>}
            <DentCoreHistoryBillingPanel
              account={accountQuery.data}
              paciente={active}
              historial={historialQuery.data ?? []}
              facturas={facturas}
              canManageBilling={canManageBilling}
              onFacturar={() => setInvoiceCreatorOpen(true)}
              onHistorialFacturas={() => setInvoiceHistoryOpen(true)}
              onCobrar={() => abrirCobroDesdeFicha()}
              onAddAnticipo={() => setAnticipoModal({ kind: 'crear' })}
              onCobrarImporte={() => abrirCobroDesdeFicha()}
              onRecibos={abrirRecibos}
              onCrearReceta={() => {
                setRecetaError(null);
                setRecetaModalOpen(true);
              }}
            />
          </section>
        </div>
      )}
      {dictationContext && active && (
        <ClinicalDictationModal
          pacienteId={active.id}
          pacienteNombre={fullName(active)}
          contexto={dictationContext.contexto}
          citaId={dictationContext.citaId}
          onClose={() => setDictationContext(null)}
          onSaved={(result) => {
            setDictationContext(null);
            invalidatePatientWorkspace(result.paciente_id);
            toast.success('Nota clinica guardada desde dictado.');
          }}
        />
      )}
      {canManageBilling && invoiceCreatorOpen && active && (
        <InvoiceCreationModal
          paciente={active}
          lineas={historialSinFacturarQuery.data ?? []}
          formasPago={formasPagoQuery.data ?? []}
          loading={historialSinFacturarQuery.isLoading}
          saving={generarFacturaDesdeHistorial.isPending}
          onClose={() => setInvoiceCreatorOpen(false)}
          onGenerate={(data) => generarFacturaDesdeHistorial.mutate(data)}
        />
      )}
      {designer && active && (
        <DocumentDesignerModal
          mode={designer.mode}
          paciente={active}
          plantillas={plantillasQuery.data ?? []}
          initialTipo={designer.tipo}
          saving={guardarDocumentoDisenado.isPending}
          errorMessage={guardarDocumentoDisenado.error instanceof Error ? guardarDocumentoDisenado.error.message : null}
          onClose={() => setDesigner(null)}
          onSave={(data) => guardarDocumentoDisenado.mutate(data)}
        />
      )}
      {documentsDrawerOpen && active && (
        <TaskSurface title="Documentos y consentimientos" context={fullName(active)} className="dc-patient-documents-task" onClose={() => {
          setDocumentsDrawerOpen(false);
          setDocumentsUploadOpen(false);
        }}>
            <DocumentosPanel
              pacienteId={active.id}
              documentos={documentosQuery.data ?? []}
              uploadOpen={documentsUploadOpen}
              onUploadOpenChange={setDocumentsUploadOpen}
              onSubir={(data) => subirDocumento.mutateAsync(data)}
              onAbrirDocumento={abrirDocumento}
            />
            {canViewClinicalDocuments && <ConsentimientosPanel
              consentimientos={consentimientosQuery.data ?? []}
              plantillas={plantillasQuery.data ?? []}
              onDisenar={(tipo) => {
                setDocumentsDrawerOpen(false);
                setDesigner(active ? { mode: 'consentimiento', tipo } : null);
              }}
              onAbrirPdf={abrirConsentimiento}
              onRevocar={revocarConsentimientoPaciente}
            />}
        </TaskSurface>
      )}
      {editingPatient && active && (
        <PatientEditModal
          paciente={active}
          doctores={doctoresQuery.data ?? []}
          onClose={() => setEditingPatient(false)}
          onSave={(data) => guardarFichaPaciente.mutate(data)}
        />
      )}
      {canManageBilling && active && checkoutOpen && <PatientCheckout patientId={active.id} onClose={() => setCheckoutOpen(false)} />}
      {canManageBilling && anticipoModal && active && (
        <AnticipoModal
          pacienteNombre={fullName(active)}
          formasPago={formasPagoQuery.data ?? []}
          mode={anticipoModal}
          onClose={() => setAnticipoModal(null)}
          onConfirm={(data) => anticipoModal.kind === 'crear'
            ? crearPagoAnticipado.mutate(data)
            : editarPagoAnticipado.mutate({ pago: anticipoModal.pago, ...data })}
        />
      )}
      {fullPatientOpen && active && (
        <PatientFullViewModal
          paciente={active}
          facturas={facturas}
          canManageBilling={canManageBilling}
          historial={historialQuery.data ?? []}
          citas={citasPacienteQuery.data ?? []}
          presupuestos={presupuestos}
          documentos={documentosQuery.data ?? []}
          consentimientos={consentimientosQuery.data ?? []}
          laboratorio={laboratorioPacienteQuery.data ?? []}
          onClose={() => setFullPatientOpen(false)}
          onEdit={() => {
            setFullPatientOpen(false);
            setEditingPatient(true);
          }}
          onOpenTab={openPatientArea}
        />
      )}
    </section>
    </div>
  );
}
