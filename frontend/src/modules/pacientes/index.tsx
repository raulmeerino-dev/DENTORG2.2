import { useEffect, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  createConsentimientoPaciente,
  createFacturaDesdeHistorial,
  createFacturaManual,
  createPaciente,
  createPagoAnticipadoPaciente,
  createPresupuesto,
  createRecetaClinica,
  createTrabajoLaboratorio,
  emitirRecetaPdf,
  facturaPdfUrl,
  firmarConsentimiento,
  generarDocumentoPdfPaciente,
  getCitas,
  getConsentimientosPaciente,
  getDoctores,
  getDocumentosPaciente,
  getFacturas,
  getFormasPago,
  getHistorialPaciente,
  getHistorialSinFacturar,
  getLaboratorios,
  getPaciente,
  getPagosAnticipadosPaciente,
  getPacientes,
  getPlantillasConsentimiento,
  getPresupuestos,
  getRecetasPaciente,
  getSaldoPaciente,
  getTratamientosCatalogo,
  getTrabajosLaboratorio,
  openConsentimientoPdf,
  openDocumentoPaciente,
  openRecetaClinicaPdf,
  registrarCobro,
  revocarConsentimiento,
  updatePagoAnticipadoPaciente,
  updatePaciente,
  updatePresupuestoLinea,
  updateTrabajoLaboratorio,
  uploadDocumentoPaciente,
} from '../../lib/api';
import type { ApiPaciente, Consentimiento, DocumentoPaciente, Factura, HistorialSinFacturar, PagoAnticipadoPaciente, Presupuesto, PresupuestoLinea, RecetaCreateInput, TrabajoLaboratorioCreateInput, TrabajoLaboratorioUpdateInput } from '../../types/api';
import { money, formatDate, fullName } from '../../lib/utils';
import { PrimeraVisitaPanel } from './PrimeraVisita';
import type { PrimeraVisitaData } from './PrimeraVisita';
import { ConsentimientosPanel, DocumentDesignerModal } from './Consentimientos';
import type { DocumentDesignerMode } from './Consentimientos';
import { DocumentosPanel } from './Documentos';
import { TrabajoPendientePanel } from './TrabajoPendiente';
import { TratamientosRealizadosPanel } from './Realizados';
import { EurodentHistoryBillingPanel, InvoiceHistoryModal } from './HistorialFacturacion';
import { HistorialCompletoPanel } from './HistorialCompleto';
import { CobroModal } from './modals/CobroModal';
import { AnticipoModal } from './modals/AnticipoModal';
import type { AnticipoModalMode } from './modals/AnticipoModal';
import { InvoiceCreationModal } from './modals/FacturaModal';
import { FacturaManualModal } from './modals/FacturaManualModal';
import { RevocarConsentimientoModal } from './modals/RevocarConsentimientoModal';
import { ComentarioModal } from './modals/ComentarioModal';
import { PatientFinder, PatientForm, PatientEditModal, PatientFullViewModal, NuevoPacienteModal } from './FichaPaciente';
import { PresupuestoPanel } from './Presupuestos';
import { RecetaModal, HistorialRecetasDrawer } from './Recetas';
import { LaboratorioPacientePanel, NuevoPedidoLaboratorioModal, contarLaboratorioVencidos } from './Laboratorio';
import { PatientActionsMenu, buildWhatsAppUrl } from './PatientActionsMenu';
import { getBillingTotals, getFacturaPendientePreferida } from './billingUtils';

export type WorkTab = 'pacientes' | 'tratamientos' | 'realizados' | 'pendiente' | 'presupuestos' | 'primera' | 'historial' | 'citas' | 'facturacion' | 'consentimientos' | 'documentos' | 'laboratorio';
type MainPatientTab = 'pacientes' | 'tratamientos' | 'historial';
type TreatmentTab = 'primera' | 'presupuestos' | 'pendiente' | 'realizados';
type PatientContextMenu =
  | { x: number; y: number; kind: 'paciente' }
  | { x: number; y: number; kind: 'linea'; linea: PresupuestoLinea }
  | { x: number; y: number; kind: 'factura'; factura: Factura }
  | { x: number; y: number; kind: 'documento'; documento: DocumentoPaciente };
type PatientContextDraft =
  | { kind: 'paciente' }
  | { kind: 'linea'; linea: PresupuestoLinea }
  | { kind: 'factura'; factura: Factura }
  | { kind: 'documento'; documento: DocumentoPaciente };

const TAB_ICONS: Record<WorkTab, ReactNode> = {
  pacientes: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="6" r="3.2" stroke="currentColor" strokeWidth="1.6"/><path d="M2.5 15.5c0-3.038 2.91-5.5 6.5-5.5s6.5 2.462 6.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
  ),
  tratamientos: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M5 2.5c1.7 0 2.2 1.2 4 1.2s2.3-1.2 4-1.2c1.9 0 3 1.7 2.3 4.7l-1.1 5.2c-.5 2.3-1.7 3.6-3 3.6-.9 0-1.2-.7-2.2-.7s-1.3.7-2.2.7c-1.3 0-2.5-1.3-3-3.6L2.7 7.2C2 4.2 3.1 2.5 5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
  ),
  primera: (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="2" y="3" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.6"/><line x1="5" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="5" y1="11" x2="10" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="9" y1="1" x2="9" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
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
  { id: 'tratamientos', label: 'Tratamientos' },
  { id: 'historial', label: 'Historial' },
];

const TREATMENT_TABS: Array<{ id: TreatmentTab; label: string }> = [
  { id: 'primera', label: 'Primera visita' },
  { id: 'presupuestos', label: 'Presupuestos' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'realizados', label: 'Realizados' },
];

function isTreatmentTab(tab: WorkTab): tab is TreatmentTab {
  return tab === 'primera' || tab === 'presupuestos' || tab === 'pendiente' || tab === 'realizados';
}

function isPresupuestoCerrado(estado?: string | null) {
  return estado === 'aceptado' || estado === 'facturado' || estado === 'rechazado';
}

function presupuestoEstadoLabel(estado: string) {
  const labels: Record<string, string> = {
    borrador: 'Borrador',
    presentado: 'Presentado',
    aceptado: 'Aceptado',
    rechazado: 'Rechazado',
    facturado: 'Facturado',
  };
  return labels[estado] ?? estado;
}
export default function PacientesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<ApiPaciente | null>(null);
  const [tab, setTab] = useState<WorkTab>('pacientes');
  const [treatmentTab, setTreatmentTab] = useState<TreatmentTab>('primera');
  const [documentsDrawerOpen, setDocumentsDrawerOpen] = useState(false);
  const [billingLedgerOpen, setBillingLedgerOpen] = useState(false);
  const [laboratorioDetailsOpen, setLaboratorioDetailsOpen] = useState(false);
  const [designer, setDesigner] = useState<{ mode: DocumentDesignerMode; tipo?: string } | null>(null);
  const [editingPatient, setEditingPatient] = useState(false);
  const [fullPatientOpen, setFullPatientOpen] = useState(false);
  const [invoiceCreatorOpen, setInvoiceCreatorOpen] = useState(false);
  const [invoiceHistoryOpen, setInvoiceHistoryOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<PatientContextMenu | null>(null);
  const [cobroFactura, setCobroFactura] = useState<Factura | null>(null);
  const [anticipoModal, setAnticipoModal] = useState<AnticipoModalMode | null>(null);
  const [facturaManualOpen, setFacturaManualOpen] = useState(false);
  const [revocarConsentimientoTarget, setRevocarConsentimientoTarget] = useState<Consentimiento | null>(null);
  const [selectedPresupuestoId, setSelectedPresupuestoId] = useState<string | null>(null);
  const [nuevoPacienteOpen, setNuevoPacienteOpen] = useState(false);
  const [comentarioOpen, setComentarioOpen] = useState(false);
  const [recetaModalOpen, setRecetaModalOpen] = useState(false);
  const [recetasDrawerOpen, setRecetasDrawerOpen] = useState(false);
  const [recetaError, setRecetaError] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!flashMessage) return;
    const t = window.setTimeout(() => setFlashMessage(null), 5000);
    return () => window.clearTimeout(t);
  }, [flashMessage]);
  const [pedidoLabContext, setPedidoLabContext] = useState<{ open: boolean; linea: PresupuestoLinea | null }>({ open: false, linea: null });
  const [pedidoLabError, setPedidoLabError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const activeMainTab: MainPatientTab = isTreatmentTab(tab) || tab === 'tratamientos'
    ? 'tratamientos'
    : tab === 'historial' || tab === 'facturacion'
      ? 'historial'
      : 'pacientes';
  const activeTreatmentTab = isTreatmentTab(tab) ? tab : treatmentTab;
  const pacientesQuery = useQuery({ queryKey: ['pacientes'], queryFn: getPacientes });
  const pacientes = pacientesQuery.data ?? [];
  const requestedPatientId = searchParams.get('paciente_id') ?? sessionStorage.getItem('dentorg_selected_patient_id');
  const activeSummary = selected ?? pacientes.find((paciente) => paciente.id === requestedPatientId) ?? pacientes[0] ?? null;
  const pacienteDetalleQuery = useQuery({
    queryKey: ['paciente-detalle', activeSummary?.id],
    queryFn: () => getPaciente(activeSummary!.id),
    enabled: Boolean(activeSummary),
  });
  const active = pacienteDetalleQuery.data ?? activeSummary;

  const presupuestosQuery = useQuery({
    queryKey: ['presupuestos', active?.id],
    queryFn: () => getPresupuestos(active!.id),
    enabled: Boolean(active),
  });
  const facturasQuery = useQuery({
    queryKey: ['facturas', active?.id],
    queryFn: () => getFacturas(active!.id),
    enabled: Boolean(active),
  });
  const pagosAnticipadosQuery = useQuery({
    queryKey: ['pagos-anticipados', active?.id],
    queryFn: () => getPagosAnticipadosPaciente(active!.id),
    enabled: Boolean(active),
  });
  const saldoQuery = useQuery({
    queryKey: ['saldo-paciente', active?.id],
    queryFn: () => getSaldoPaciente(active!.id),
    enabled: Boolean(active),
  });
  const doctoresQuery = useQuery({ queryKey: ['doctores'], queryFn: getDoctores });
  const formasPagoQuery = useQuery({ queryKey: ['formas-pago'], queryFn: getFormasPago });
  const tratamientosQuery = useQuery({ queryKey: ['tratamientos-catalogo'], queryFn: () => getTratamientosCatalogo({ solo_activos: true }) });
  const historialQuery = useQuery({
    queryKey: ['historial-paciente', active?.id],
    queryFn: () => getHistorialPaciente(active!.id),
    enabled: Boolean(active),
  });
  const historialSinFacturarQuery = useQuery({
    queryKey: ['historial-sin-facturar', active?.id],
    queryFn: () => getHistorialSinFacturar(active!.id),
    enabled: Boolean(active) && invoiceCreatorOpen,
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
  const consentimientosQuery = useQuery({
    queryKey: ['consentimientos-paciente', active?.id],
    queryFn: () => getConsentimientosPaciente(active!.id),
    enabled: Boolean(active),
  });
  const laboratorioPacienteQuery = useQuery({
    queryKey: ['laboratorio-paciente', active?.id],
    queryFn: () => getTrabajosLaboratorio({ paciente_id: active!.id }),
    enabled: Boolean(active),
  });
  const recetasPacienteQuery = useQuery({
    queryKey: ['recetas-paciente', active?.id],
    queryFn: () => getRecetasPaciente(active!.id),
    enabled: Boolean(active),
  });
  const laboratoriosCatalogoQuery = useQuery({
    queryKey: ['laboratorios-catalogo'],
    queryFn: () => getLaboratorios({ solo_activos: true }),
  });

  const presupuestos = presupuestosQuery.data ?? [];
  const facturas = facturasQuery.data ?? [];
  const pagosAnticipados = pagosAnticipadosQuery.data ?? [];
  const billingTotals = getBillingTotals(facturas);
  const totalFacturado = Number(saldoQuery.data?.total_facturado ?? billingTotals.facturado);
  const totalPendiente = Number(saldoQuery.data?.pendiente ?? billingTotals.pendiente);
  const tratamientosRealizados = historialQuery.data?.filter((item) => ['realizado', 'facturado', 'cobrado_parcial', 'cobrado_completo'].includes(item.estado)).length ?? 0;
  const nextCita = citasPacienteQuery.data?.slice().sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0];
  const hasPatientError = pacientesQuery.isError || pacienteDetalleQuery.isError || historialQuery.isError || citasPacienteQuery.isError;
  const hasPatientLoading = pacientesQuery.isLoading || (Boolean(active?.id) && pacienteDetalleQuery.isLoading);
  const alergias = typeof active?.datos_salud?.alergias === 'string' ? active.datos_salud.alergias : '';

  useEffect(() => {
    if (sessionStorage.getItem('dentorg_patient_action') !== 'new') return;
    sessionStorage.removeItem('dentorg_patient_action');
    const timeout = window.setTimeout(() => setNuevoPacienteOpen(true), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function openPatientArea(targetTab: WorkTab) {
    if (isTreatmentTab(targetTab)) {
      setTreatmentTab(targetTab);
      setTab(targetTab);
      return;
    }
    if (targetTab === 'tratamientos') {
      setTab(treatmentTab);
      return;
    }
    if (targetTab === 'facturacion' || targetTab === 'historial') {
      setTab('historial');
      return;
    }
    if (targetTab === 'documentos' || targetTab === 'consentimientos') {
      setTab('pacientes');
      setDocumentsDrawerOpen(true);
      return;
    }
    if (targetTab === 'citas') {
      abrirAgendaPaciente();
      return;
    }
    setTab('pacientes');
  }

  const nuevoPresupuesto = useMutation({
    mutationFn: async () => {
      if (!active) throw new Error('Sin paciente');
      const doctor = doctoresQuery.data?.[0];
      if (!doctor) throw new Error('No hay doctores configurados');
      return createPresupuesto(active.id, doctor.id);
    },
    onSuccess: (presupuesto) => {
      setSelectedPresupuestoId(presupuesto.id);
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
      openPatientArea('presupuestos');
    },
  });

  const emitirFactura = useMutation({
    mutationFn: ({ concepto, importe }: { concepto: string; importe: number }) => {
      if (!active) throw new Error('Sin paciente');
      return createFacturaManual(active.id, concepto, importe);
    },
    onSuccess: () => {
      setFacturaManualOpen(false);
      void facturasQuery.refetch();
      void saldoQuery.refetch();
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
      if (data.generarCobro && data.formaPagoId) {
        await registrarCobro(factura.id, data.formaPagoId, Number(factura.total));
      }
      return factura;
    },
    onSuccess: (factura) => {
      setInvoiceCreatorOpen(false);
      openPatientArea('historial');
      void facturasQuery.refetch();
      void historialQuery.refetch();
      void historialSinFacturarQuery.refetch();
      void saldoQuery.refetch();
      window.open(facturaPdfUrl(factura.id), '_blank');
    },
  });

  const cobrarFactura = useMutation({
    mutationFn: async () => {
      const forma = formasPagoQuery.data?.[0];
      if (!forma) throw new Error('No hay formas de pago configuradas');
      const factura = getFacturaPendientePreferida(facturas);
      if (!factura) throw new Error('No hay facturas pendientes');
      return registrarCobro(factura.id, forma.id, Number(factura.pendiente));
    },
    onSuccess: () => {
      void facturasQuery.refetch();
      void saldoQuery.refetch();
      openPatientArea('historial');
    },
  });

  const cobrarImporteFactura = useMutation({
    mutationFn: ({ facturaId, formaPagoId, importe }: { facturaId: string; formaPagoId: string; importe: number }) =>
      registrarCobro(facturaId, formaPagoId, importe),
    onSuccess: () => {
      setCobroFactura(null);
      void facturasQuery.refetch();
      void saldoQuery.refetch();
      openPatientArea('historial');
    },
  });

  const crearPagoAnticipado = useMutation({
    mutationFn: ({ importe, concepto, notas, formaPagoId }: { importe: number; concepto: string; notas: string | null; formaPagoId: string }) => {
      if (!active) throw new Error('Sin paciente');
      return createPagoAnticipadoPaciente(active.id, { importe, forma_pago_id: formaPagoId, concepto, notas });
    },
    onSuccess: () => {
      setAnticipoModal(null);
      void pagosAnticipadosQuery.refetch();
      void saldoQuery.refetch();
      openPatientArea('historial');
    },
  });

  const editarPagoAnticipado = useMutation({
    mutationFn: ({ pago, importe, concepto, notas, formaPagoId }: { pago: PagoAnticipadoPaciente; importe: number; concepto: string; notas: string | null; formaPagoId: string }) => {
      if (!active) throw new Error('Sin paciente');
      return updatePagoAnticipadoPaciente(active.id, pago.id, { importe, concepto, notas, forma_pago_id: formaPagoId });
    },
    onSuccess: () => {
      setAnticipoModal(null);
      void pagosAnticipadosQuery.refetch();
      void saldoQuery.refetch();
      openPatientArea('historial');
    },
  });

  const aceptarLineaPendiente = useMutation({
    mutationFn: async (linea: PresupuestoLinea) => updatePresupuestoLinea(linea.presupuesto_id, linea.id, { aceptado: true }),
    onSuccess: () => {
      setContextMenu(null);
      void presupuestosQuery.refetch();
      openPatientArea('pendiente');
    },
  });

  const facturarLinea = useMutation({
    mutationFn: async (linea: PresupuestoLinea) => {
      if (!active) throw new Error('Sin paciente');
      const importe = Number(linea.importe_neto || linea.precio_unitario || 0);
      if (!Number.isFinite(importe) || importe <= 0) throw new Error('Importe no valido');
      return createFacturaManual(active.id, linea.tratamiento?.nombre ?? 'Tratamiento dental', importe);
    },
    onSuccess: () => {
      setContextMenu(null);
      void facturasQuery.refetch();
      void saldoQuery.refetch();
      openPatientArea('historial');
    },
  });

  const subirDocumento = useMutation({
    mutationFn: async (data: { archivo: File; categoria: string; descripcion?: string; fecha_documento?: string; etiquetas?: string }) => {
      if (!active) throw new Error('Sin paciente');
      return uploadDocumentoPaciente(active.id, data);
    },
    onSuccess: () => {
      void documentosQuery.refetch();
      setDocumentsDrawerOpen(true);
      setTab('pacientes');
    },
  });

  const guardarDocumentoDisenado = useMutation({
    mutationFn: async (data: { tipo: string; titulo: string; contenido: string; firmaDataUrl: string | null }) => {
      if (!active) throw new Error('Sin paciente');
      if (!designer) throw new Error('Sin editor');
      if (designer.mode === 'consentimiento') {
        const plantilla = (plantillasQuery.data ?? []).find((item) => item.nombre === data.tipo);
        const consentimiento = await createConsentimientoPaciente(active.id, data.tipo, doctoresQuery.data?.[0]?.id, {
          plantilla_id: plantilla?.id ?? null,
          estado: data.firmaDataUrl ? 'firmado' : 'pendiente_firma',
          plantilla_version: plantilla?.version ?? 'personalizada',
          contenido: data.contenido,
        });
        const firmado = data.firmaDataUrl
          ? await firmarConsentimiento(consentimiento.id, data.firmaDataUrl)
          : consentimiento;
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
      void documentosQuery.refetch();
      void consentimientosQuery.refetch();
      setDesigner(null);
      if (result.kind === 'consentimiento') {
        setDocumentsDrawerOpen(true);
        setTab('pacientes');
        void openConsentimientoPdf(result.consentimiento.id);
        return;
      }
      setDocumentsDrawerOpen(true);
      setTab('pacientes');
      if (active && result.doc.id) void openDocumentoPaciente(active.id, result.doc.id, result.doc.nombre_original);
    },
  });

  const guardarFichaPaciente = useMutation({
    mutationFn: async (data: Partial<ApiPaciente>) => {
      if (!active) throw new Error('Sin paciente');
      return updatePaciente(active.id, data);
    },
    onSuccess: (paciente) => {
      setSelected(paciente);
      setEditingPatient(false);
      void queryClient.invalidateQueries({ queryKey: ['paciente-detalle', paciente.id] });
      void pacientesQuery.refetch();
    },
  });

  const crearPaciente = useMutation({
    mutationFn: (data: Parameters<typeof createPaciente>[0]) => createPaciente(data),
    onSuccess: (paciente) => {
      setSelected(paciente);
      setNuevoPacienteOpen(false);
      sessionStorage.setItem('dentorg_selected_patient_id', paciente.id);
      setTab('pacientes');
      void pacientesQuery.refetch();
    },
  });

  const crearPedidoLab = useMutation({
    mutationFn: (data: TrabajoLaboratorioCreateInput) => createTrabajoLaboratorio(data),
    onSuccess: () => {
      setPedidoLabContext({ open: false, linea: null });
      setPedidoLabError(null);
      void laboratorioPacienteQuery.refetch();
    },
    onError: (error) => {
      setPedidoLabError(error instanceof Error ? error.message : 'No se pudo crear el pedido');
    },
  });

  const actualizarTrabajoLab = useMutation({
    mutationFn: ({ trabajoId, cambios }: { trabajoId: string; cambios: TrabajoLaboratorioUpdateInput }) =>
      updateTrabajoLaboratorio(trabajoId, cambios),
    onSuccess: () => {
      void laboratorioPacienteQuery.refetch();
      setFlashMessage({ kind: 'success', text: 'Trabajo de laboratorio actualizado.' });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar el trabajo de laboratorio';
      setFlashMessage({ kind: 'error', text: message });
    },
  });

  const crearReceta = useMutation({
    mutationFn: async (data: RecetaCreateInput) => {
      if (!active) throw new Error('Sin paciente');
      return createRecetaClinica(active.id, data);
    },
    onSuccess: (receta) => {
      setRecetaModalOpen(false);
      setRecetaError(null);
      void recetasPacienteQuery.refetch();
      setFlashMessage({ kind: 'success', text: 'Receta creada. Abriendo PDF...' });
      void openRecetaClinicaPdf(receta.id).catch(() => {
        setFlashMessage({ kind: 'error', text: 'Receta creada pero el navegador bloqueó el PDF. Búscala en el historial.' });
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'No se pudo crear la receta';
      setRecetaError(message);
    },
  });

  const guardarPrimeraVisita = useMutation({
    mutationFn: async (data: PrimeraVisitaData) => {
      if (!active) throw new Error('Sin paciente');
      return updatePaciente(active.id, {
        datos_salud: {
          ...(active.datos_salud ?? {}),
          primera_visita: data,
        },
      });
    },
    onSuccess: (paciente) => {
      setSelected(paciente);
      void queryClient.invalidateQueries({ queryKey: ['paciente-detalle', paciente.id] });
      void pacientesQuery.refetch();
    },
  });

  function focusPacienteSearch() {
    setTab('pacientes');
    window.setTimeout(() => document.getElementById('patient-search-input')?.focus(), 0);
  }

  function abrirCobroDesdeFicha(factura?: Factura | null) {
    const target = getFacturaPendientePreferida(facturas, factura);
    if (target) {
      setCobroFactura(target);
      return;
    }
    setAnticipoModal({ kind: 'crear' });
  }

  function revocarConsentimientoPaciente(consentimiento: Consentimiento) {
    setRevocarConsentimientoTarget(consentimiento);
  }

  function confirmarRevocacion(motivo: string) {
    if (!revocarConsentimientoTarget) return;
    const id = revocarConsentimientoTarget.id;
    setRevocarConsentimientoTarget(null);
    void revocarConsentimiento(id, motivo).then(() => {
      void consentimientosQuery.refetch();
    });
  }

  function abrirRecibos() {
    openPatientArea('historial');
    if (facturas[0]) window.open(facturaPdfUrl(facturas[0].id), '_blank');
  }

  function openContext(event: MouseEvent, menu: PatientContextDraft) {
    event.preventDefault();
    setContextMenu({ ...menu, x: event.clientX, y: event.clientY } as PatientContextMenu);
  }

  function abrirAgendaPaciente() {
    if (!active) return;
    sessionStorage.setItem('dentorg_selected_patient_id', active.id);
    sessionStorage.setItem('dentorg_selected_patient_name', fullName(active));
    setContextMenu(null);
    navigate('/agenda');
  }

  function copiarDatosPaciente() {
    if (!active) return;
    const datos = `${fullName(active)} - H ${active.num_historial}${active.telefono ? ` - ${active.telefono}` : ''}`;
    void navigator.clipboard?.writeText(datos);
    setContextMenu(null);
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

  function guardarComentario(texto: string) {
    if (!active) return;
    guardarFichaPaciente.mutate(
      { observaciones: texto.trim() || null },
      { onSuccess: () => setComentarioOpen(false) },
    );
  }

  function abrirPdfFactura(factura: Factura) {
    window.open(facturaPdfUrl(factura.id), '_blank');
    setContextMenu(null);
  }

  function emitirRecetaFactura(factura: Factura) {
    void emitirRecetaPdf(factura.id);
    setContextMenu(null);
  }

  function abrirDocumento(documento: DocumentoPaciente) {
    if (!active) return;
    void openDocumentoPaciente(active.id, documento.id, documento.nombre_original);
    setContextMenu(null);
  }

  function darCitaParaTratamiento(linea: PresupuestoLinea) {
    if (!active) return;
    sessionStorage.setItem('dentorg_selected_patient_id', active.id);
    sessionStorage.setItem('dentorg_selected_patient_name', fullName(active));
    sessionStorage.setItem('dentorg_selected_treatment', linea.tratamiento?.nombre ?? 'Tratamiento dental');
    setContextMenu(null);
    navigate('/agenda');
  }

  return (
    <>
      <div className="patient-selector-bar">
        <PatientFinder
          pacientes={pacientes}
          selectedId={active?.id ?? null}
          onNew={() => setNuevoPacienteOpen(true)}
          onSelect={(paciente) => {
            setSelected(paciente);
            sessionStorage.setItem('dentorg_selected_patient_id', paciente.id);
            setTab('pacientes');
          }}
        />
        <div className="patient-selector-current">
          <div>
            <span>Paciente activo</span>
            <strong>{active ? fullName(active) : 'Sin seleccionar'}</strong>
            <small>
              Historia {active?.num_historial ?? '-'} - {active?.telefono || 'sin telefono'}
              {alergias ? ' - ! Alergico' : ''}
              {totalPendiente > 0 ? ` - ${money(totalPendiente)} pendiente` : ''}
            </small>
          </div>
          <PatientActionsMenu
            paciente={active}
            busy={nuevoPresupuesto.isPending}
            handlers={{
              onNuevaCita: abrirAgendaPaciente,
              onNuevoPresupuesto: () => nuevoPresupuesto.mutate(),
              onCobrar: () => abrirCobroDesdeFicha(),
              onSubirDocumento: () => setDocumentsDrawerOpen(true),
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
            }}
          />
        </div>
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
        {flashMessage && (
          <div className={`patient-flash patient-flash-${flashMessage.kind}`} role="status">
            <span>{flashMessage.text}</span>
            <button type="button" onClick={() => setFlashMessage(null)} aria-label="Cerrar mensaje">×</button>
          </div>
        )}
      </div>
      <section className={`page page-shell patient-screen${activeMainTab === 'pacientes' ? ' patient-dashboard-mode' : ' no-bottom-bar'}`} onClick={() => setContextMenu(null)}>
        <div className="patient-titlebar">
          <strong>{active ? `${fullName(active)} // CLINICA DENTAL` : 'Pacientes // CLINICA DENTAL'}</strong>
        </div>
        <nav className="patient-module-tabs">
          {WORK_TABS.map((item) => (
            <button
              key={item.id}
              className={activeMainTab === item.id ? 'active' : ''}
              onClick={() => openPatientArea(item.id)}
            >
              <span className="tab-icon">{TAB_ICONS[item.id]}</span>{item.label}
            </button>
          ))}
        </nav>
        {activeMainTab !== 'pacientes' && (
          <aside className="patient-summary-strip" onContextMenu={(event) => openContext(event, { kind: 'paciente' })}>
            <span><b>Paciente</b>{active ? fullName(active) : 'Sin seleccionar'} - H {active?.num_historial ?? '-'}</span>
            <span><b>Proxima</b>{nextCita ? `${formatDate(nextCita.fecha_hora)} ${nextCita.fecha_hora.slice(11, 16)} - ${nextCita.motivo ?? ''}` : 'sin cita programada'}</span>
            <span><b>Realizados</b>{tratamientosRealizados}</span>
            <span><b>Saldo</b>{money(totalPendiente)} / {money(totalFacturado)}</span>
            <span><b>Docs</b>{documentosQuery.data?.length ?? 0} - CI {consentimientosQuery.data?.length ?? 0}</span>
          </aside>
        )}

      <main className="patient-desk">
        {activeMainTab === 'pacientes' && (
          <div onContextMenu={(event) => openContext(event, { kind: 'paciente' })}>
            <PatientForm
              paciente={active}
              facturas={facturas}
              historial={historialQuery.data ?? []}
              citas={citasPacienteQuery.data ?? []}
              presupuestos={presupuestos}
              documentos={documentosQuery.data ?? []}
              consentimientos={consentimientosQuery.data ?? []}
              laboratorio={laboratorioPacienteQuery.data ?? []}
              onEdit={() => setEditingPatient(true)}
              onOpenFull={() => setFullPatientOpen(true)}
              onOpenCitas={abrirAgendaPaciente}
              onOpenPresupuestos={() => openPatientArea('presupuestos')}
              onOpenPendientes={() => openPatientArea('pendiente')}
              onOpenRealizados={() => openPatientArea('realizados')}
              onOpenFacturacion={() => openPatientArea('historial')}
              onOpenHistorial={() => openPatientArea('historial')}
              onOpenDocumentos={() => setDocumentsDrawerOpen(true)}
              onOpenConsentimientos={() => setDesigner(active ? { mode: 'consentimiento' } : null)}
              onOpenLaboratorio={() => {
                setLaboratorioDetailsOpen(true);
                openPatientArea('historial');
              }}
              onEmitirFactura={() => setInvoiceCreatorOpen(true)}
              onRegistrarCobro={abrirCobroDesdeFicha}
              onHistorialFacturas={() => setInvoiceHistoryOpen(true)}
              onOpenOdontogramaDetail={() => openPatientArea('primera')}
            />
          </div>
        )}
        {activeMainTab === 'tratamientos' && (
          <section className="treatments-workspace">
            <nav className="treatment-subtabs" aria-label="Secciones de tratamientos">
              {TREATMENT_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={activeTreatmentTab === item.id ? 'active' : ''}
                  onClick={() => openPatientArea(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            {activeTreatmentTab === 'primera' && (
              <PrimeraVisitaPanel
                paciente={active}
                onSave={(data) => guardarPrimeraVisita.mutate(data)}
                saving={guardarPrimeraVisita.isPending}
                userRole={user?.rol}
              />
            )}
            {activeTreatmentTab === 'presupuestos' && (
              <>
                {(() => {
                  const activeId = selectedPresupuestoId ?? presupuestos[0]?.id;
                  const presupuesto = presupuestos.find((p) => p.id === activeId);
                  const noDoctorsConfigured = doctoresQuery.isFetched && !doctoresQuery.data?.length;
                  const createDisabled = !active || doctoresQuery.isLoading || !doctoresQuery.data?.length || nuevoPresupuesto.isPending;
                  const createError = nuevoPresupuesto.error instanceof Error ? nuevoPresupuesto.error.message : null;
                  const createLabel = nuevoPresupuesto.isPending ? 'Creando...' : 'Crear nuevo presupuesto';
                  const activeBudgetClosed = isPresupuestoCerrado(presupuesto?.estado);
                  const selector = (
                    <>
                      <div className="budget-workflow-header">
                        <div>
                          <strong>Presupuestos del paciente</strong>
                          <span>
                            Crea un presupuesto nuevo para tratamientos nuevos y conserva el anterior como registro clinico/economico.
                          </span>
                        </div>
                        <button
                          type="button"
                          className="primary-action budget-create-button"
                          onClick={() => nuevoPresupuesto.mutate()}
                          disabled={createDisabled}
                        >
                          {createLabel}
                        </button>
                      </div>
                      {(!active || noDoctorsConfigured || createError) && (
                        <div className="inline-alert budget-create-alert" role="alert">
                          {!active && 'Selecciona un paciente antes de crear un presupuesto.'}
                          {active && noDoctorsConfigured && 'No hay doctores configurados. Crea o activa un doctor para poder crear presupuestos.'}
                          {active && doctoresQuery.data?.length && createError}
                        </div>
                      )}
                      <div className="presupuesto-selector" aria-label="Presupuestos del paciente">
                        {presupuestos.map((p) => {
                          const totalAceptadoPresupuesto = Number(p.total_aceptado ?? 0);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              className={`presupuesto-pill${(selectedPresupuestoId ?? presupuestos[0]?.id) === p.id ? ' active' : ''} presupuesto-pill-${p.estado}`}
                              onClick={() => setSelectedPresupuestoId(p.id)}
                            >
                              <span className="pp-num">#{p.numero}</span>
                              <span className="pp-estado">{presupuestoEstadoLabel(p.estado)}</span>
                              <span className="pp-date">{formatDate(p.fecha).slice(0, 5)}</span>
                              <span className="pp-total">Total {money(Number(p.total ?? 0))}</span>
                              {totalAceptadoPresupuesto > 0 && <span className="pp-accepted">Aceptado {money(totalAceptadoPresupuesto)}</span>}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          className="presupuesto-pill presupuesto-pill-nuevo"
                          onClick={() => nuevoPresupuesto.mutate()}
                          disabled={createDisabled}
                        >
                          {nuevoPresupuesto.isPending ? 'Creando...' : '+ Nuevo'}
                        </button>
                      </div>
                      {activeBudgetClosed && presupuesto && (
                        <div className={`budget-closed-notice budget-closed-${presupuesto.estado}`} role="note">
                          <div>
                            <strong>Este presupuesto ya esta {presupuestoEstadoLabel(presupuesto.estado).toLowerCase()}.</strong>
                            <span>Para nuevos tratamientos crea un nuevo presupuesto.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => nuevoPresupuesto.mutate()}
                            disabled={createDisabled}
                          >
                            {createLabel}
                          </button>
                        </div>
                      )}
                    </>
                  );
                  if (!presupuesto) {
                    return (
                      <>
                        {selector}
                        {!presupuestosQuery.isLoading && (
                          <div className="desk-panel empty-state">No hay presupuestos para este paciente.</div>
                        )}
                      </>
                    );
                  }
                  return (
                    <>
                      {selector}
                      <PresupuestoPanel
                        key={presupuesto.id}
                        presupuesto={presupuesto}
                        paciente={active!}
                        tratamientos={tratamientosQuery.data ?? []}
                        userRole={user?.rol}
                      />
                    </>
                  );
                })()}
              </>
            )}
            {activeTreatmentTab === 'pendiente' && (
              <TrabajoPendientePanel
                presupuestos={presupuestos}
                citas={citasPacienteQuery.data ?? []}
                paciente={active}
                onDarCita={darCitaParaTratamiento}
                onContextLinea={(event, linea) => openContext(event, { kind: 'linea', linea })}
                onCrearPedidoLab={(linea) => {
                  setPedidoLabError(null);
                  setPedidoLabContext({ open: true, linea });
                }}
                userRole={user?.rol}
              />
            )}
            {activeTreatmentTab === 'realizados' && (
              <TratamientosRealizadosPanel
                historial={historialQuery.data ?? []}
                consentimientos={consentimientosQuery.data ?? []}
                presupuestos={presupuestos}
                paciente={active}
                doctorName={doctoresQuery.data?.[0]?.nombre ?? 'Doctor'}
                doctorColor={doctoresQuery.data?.[0]?.color_agenda}
                tratamientos={tratamientosQuery.data ?? []}
                userRole={user?.rol}
              />
            )}
          </section>
        )}
        {activeMainTab === 'historial' && (
          <section className="history-complete-workspace">
            <HistorialCompletoPanel
              paciente={active}
              historial={historialQuery.data ?? []}
              citas={citasPacienteQuery.data ?? []}
              presupuestos={presupuestos}
              facturas={facturas}
              anticipos={pagosAnticipados}
              documentos={documentosQuery.data ?? []}
              consentimientos={consentimientosQuery.data ?? []}
              recetas={recetasPacienteQuery.data ?? []}
              laboratorio={laboratorioPacienteQuery.data ?? []}
              onOpenDocumento={abrirDocumento}
              onOpenConsentimiento={(consentimiento) => void openConsentimientoPdf(consentimiento.id)}
              onOpenFactura={abrirPdfFactura}
              onOpenReceta={(receta) => void openRecetaClinicaPdf(receta.id)}
              userRole={user?.rol}
            />
            <details
              className="history-ledger-details"
              open={laboratorioDetailsOpen}
              onToggle={(event) => setLaboratorioDetailsOpen(event.currentTarget.open)}
            >
              <summary>Trabajos de laboratorio del paciente {contarLaboratorioVencidos(laboratorioPacienteQuery.data ?? []) > 0 ? `(${contarLaboratorioVencidos(laboratorioPacienteQuery.data ?? [])} vencido${contarLaboratorioVencidos(laboratorioPacienteQuery.data ?? []) === 1 ? '' : 's'})` : ''}</summary>
              <LaboratorioPacientePanel
                trabajos={laboratorioPacienteQuery.data ?? []}
                onCrearPedido={() => {
                  setPedidoLabError(null);
                  setPedidoLabContext({ open: true, linea: null });
                }}
                onActualizar={(trabajoId, cambios) => actualizarTrabajoLab.mutate({ trabajoId, cambios })}
              />
            </details>
            <details className="history-ledger-details" open={billingLedgerOpen} onToggle={(event) => setBillingLedgerOpen(event.currentTarget.open)}>
              <summary>Libro de historial y facturacion</summary>
              <EurodentHistoryBillingPanel
                paciente={active}
                historial={historialQuery.data ?? []}
                facturas={facturas}
                anticipos={pagosAnticipados}
                onFacturar={() => setInvoiceCreatorOpen(true)}
                onHistorialFacturas={() => setInvoiceHistoryOpen(true)}
                onCobrar={() => cobrarFactura.mutate()}
                onAddAnticipo={() => setAnticipoModal({ kind: 'crear' })}
                onEditAnticipo={(pago) => setAnticipoModal({ kind: 'editar', pago })}
                onCobrarImporte={(factura) => setCobroFactura(factura)}
                onOrtodoncia={() => openPatientArea('realizados')}
                onRecibos={abrirRecibos}
                onContextFactura={(event, factura) => openContext(event, { kind: 'factura', factura })}
              />
            </details>
          </section>
        )}
      </main>
      {contextMenu && (
        <div className="context-menu patient-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          {contextMenu.kind === 'paciente' && (
            <>
              <strong>Paciente</strong>
              <button onClick={() => { setEditingPatient(true); setContextMenu(null); }}>Editar ficha</button>
              <button onClick={() => { setContextMenu(null); focusPacienteSearch(); }}>Buscar / cambiar paciente</button>
              <button onClick={abrirAgendaPaciente}>Nueva cita</button>
              <button onClick={() => { nuevoPresupuesto.mutate(); setContextMenu(null); }} disabled={!active || nuevoPresupuesto.isPending}>Nuevo presupuesto</button>
              <span />
              <button onClick={() => { openPatientArea('primera'); setContextMenu(null); }}>Primera visita</button>
              <button onClick={() => { setDesigner(active ? { mode: 'consentimiento' } : null); setContextMenu(null); }}>Consentimiento informado</button>
              <button onClick={() => { setDesigner(active ? { mode: 'circular' } : null); setContextMenu(null); }}>Circular / justificante</button>
              <button onClick={() => { setDocumentsDrawerOpen(true); setContextMenu(null); }}>Adjuntar / ver enlaces</button>
              <span />
              <button onClick={() => { setInvoiceCreatorOpen(true); setContextMenu(null); }} disabled={!active}>Emitir factura</button>
              <button onClick={() => { abrirCobroDesdeFicha(); setContextMenu(null); }} disabled={!active}>Registrar cobro</button>
              <button onClick={() => { openPatientArea('historial'); setContextMenu(null); }}>Historial completo</button>
              <button onClick={copiarDatosPaciente}>Copiar datos</button>
            </>
          )}
          {contextMenu.kind === 'linea' && (
            <>
              <strong>Tratamiento pendiente</strong>
              <button onClick={() => darCitaParaTratamiento(contextMenu.linea)}>Dar cita para este tratamiento</button>
              <button onClick={() => aceptarLineaPendiente.mutate(contextMenu.linea)} disabled={aceptarLineaPendiente.isPending}>Marcar aceptado</button>
              <button onClick={() => facturarLinea.mutate(contextMenu.linea)} disabled={facturarLinea.isPending}>Facturar tratamiento</button>
              <button onClick={() => { setDesigner(active ? { mode: 'consentimiento', tipo: contextMenu.linea.tratamiento?.nombre } : null); setContextMenu(null); }}>Consentimiento de tratamiento</button>
              <button onClick={() => { openPatientArea('presupuestos'); setContextMenu(null); }}>Abrir presupuesto</button>
            </>
          )}
          {contextMenu.kind === 'factura' && (
            <>
              <strong>Factura</strong>
              <button onClick={() => abrirPdfFactura(contextMenu.factura)}>Ver / imprimir PDF</button>
              <button onClick={() => { cobrarFactura.mutate(); setContextMenu(null); }} disabled={cobrarFactura.isPending || Number(contextMenu.factura.pendiente) <= 0}>Registrar cobro pendiente</button>
              <button onClick={() => emitirRecetaFactura(contextMenu.factura)}>Emitir receta</button>
              <button onClick={() => { setDocumentsDrawerOpen(true); setContextMenu(null); }}>Ver documentos del paciente</button>
            </>
          )}
          {contextMenu.kind === 'documento' && (
            <>
              <strong>Documento</strong>
              <button onClick={() => abrirDocumento(contextMenu.documento)}>Abrir documento</button>
              <button onClick={() => { setDocumentsDrawerOpen(true); setContextMenu(null); }}>Adjuntar otro archivo</button>
              <button onClick={() => { setDesigner(active ? { mode: 'consentimiento' } : null); setContextMenu(null); }}>Crear consentimiento</button>
              <button onClick={() => { setDesigner(active ? { mode: 'circular' } : null); setContextMenu(null); }}>Crear circular</button>
            </>
          )}
        </div>
      )}
      {nuevoPacienteOpen && (
        <NuevoPacienteModal
          saving={crearPaciente.isPending}
          onClose={() => setNuevoPacienteOpen(false)}
          onSave={(data) => crearPaciente.mutate(data as Parameters<typeof createPaciente>[0])}
        />
      )}
      {facturaManualOpen && active && (
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
          saving={crearReceta.isPending}
          errorMessage={recetaError}
          onClose={() => {
            setRecetaModalOpen(false);
            setRecetaError(null);
          }}
          onSubmit={(data) => crearReceta.mutate(data)}
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
          onAbrirPdf={(receta) => void openRecetaClinicaPdf(receta.id)}
          onCrearNueva={() => {
            setRecetasDrawerOpen(false);
            setRecetaError(null);
            setRecetaModalOpen(true);
          }}
        />
      )}
      {invoiceHistoryOpen && (
        <InvoiceHistoryModal
          facturas={facturas}
          onClose={() => setInvoiceHistoryOpen(false)}
        />
      )}
      {invoiceCreatorOpen && active && (
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
          onClose={() => setDesigner(null)}
          onSave={(data) => guardarDocumentoDisenado.mutate(data)}
        />
      )}
      {documentsDrawerOpen && active && (
        <div className="modal-backdrop" onMouseDown={() => setDocumentsDrawerOpen(false)}>
          <section className="patient-documents-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-titlebar">
              <strong>Documentos y consentimientos</strong>
              <button type="button" onClick={() => setDocumentsDrawerOpen(false)}>Cerrar</button>
            </header>
            <DocumentosPanel
              paciente={active}
              pacienteId={active.id}
              documentos={documentosQuery.data ?? []}
              onSubir={(data) => subirDocumento.mutate(data)}
              onContextDocumento={(event, documento) => openContext(event, { kind: 'documento', documento })}
              userRole={user?.rol}
            />
            <ConsentimientosPanel
              consentimientos={consentimientosQuery.data ?? []}
              plantillas={plantillasQuery.data ?? []}
              onDisenar={(tipo) => {
                setDocumentsDrawerOpen(false);
                setDesigner(active ? { mode: 'consentimiento', tipo } : null);
              }}
              onAbrirPdf={(consentimiento) => void openConsentimientoPdf(consentimiento.id)}
              onRevocar={revocarConsentimientoPaciente}
            />
          </section>
        </div>
      )}
      {editingPatient && active && (
        <PatientEditModal
          paciente={active}
          doctores={doctoresQuery.data ?? []}
          onClose={() => setEditingPatient(false)}
          onSave={(data) => guardarFichaPaciente.mutate(data)}
        />
      )}
      {cobroFactura && (
        <CobroModal
          factura={cobroFactura}
          formasPago={formasPagoQuery.data ?? []}
          onClose={() => setCobroFactura(null)}
          onConfirm={(formaPagoId, importe) => cobrarImporteFactura.mutate({ facturaId: cobroFactura.id, formaPagoId, importe })}
        />
      )}
      {anticipoModal && active && (
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
    </>
  );
}
