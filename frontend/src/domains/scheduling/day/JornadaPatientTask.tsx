import { toast } from 'sonner';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPaciente } from '../../../api/patients';
import { getDoctores } from '../../../api/identity';
import { createConsentimientoPaciente, firmarConsentimiento, getPlantillasConsentimiento, openConsentimientoPdf } from '../../../api/consents';
import { generarDocumentoPdfPaciente, openDocumentoPaciente } from '../../../api/documents';
import { createRecetaClinica, updateRecetaClinica, emitirRecetaLocal, enviarRecetaProveedor, getRecetaPlantillas, getRecetaProviderStatus, openRecetaClinicaPdf } from '../../../api/prescriptions';
import { invalidatePatientWorkspaceQueries } from '../../../shared/query/queryInvalidation';
import { DocumentDesignerModal } from '../../documents/Consentimientos';
import { RecetaModal, type RecetaSubmitPayload } from '../../clinical/prescriptions/Recetas';
import { useAuth } from '../../identity/session/AuthContext';
import { useJornada } from '../workspace/JornadaContext';

export type JornadaTaskMode = 'circular' | 'consentimiento' | 'receta';
export function JornadaPatientTask({ mode, patientId, onClose }: { mode: JornadaTaskMode; patientId: string; onClose: () => void }) {
  useEffect(() => {
    const siblings = Array.from(document.querySelector('.jornada-workspace')?.children ?? []).filter(element => !element.classList.contains('jornada-patient-task')) as HTMLElement[];
    const previous = siblings.map(element => element.inert);
    siblings.forEach(element => { element.inert = true; });
    return () => siblings.forEach((element, index) => { element.inert = previous[index]; });
  }, []);
  const client = useQueryClient();
  const { user } = useAuth();
  const jornada = useJornada();
  const patient = useQuery({ queryKey: ['paciente-detalle', patientId], queryFn: () => getPaciente(patientId) });
  const doctors = useQuery({ queryKey: ['doctores'], queryFn: getDoctores });
  const templates = useQuery({ queryKey: ['plantillas-consentimiento'], queryFn: getPlantillasConsentimiento, enabled: mode === 'consentimiento' });
  const prescriptions = useQuery({ queryKey: ['receta-plantillas'], queryFn: getRecetaPlantillas, enabled: mode === 'receta' });
  const provider = useQuery({ queryKey: ['receta-provider-status'], queryFn: getRecetaProviderStatus, enabled: mode === 'receta' });
  const prescriptionId = useRef<string | null>(null);
  const consentDraft = useRef<{ id: string; content: string } | null>(null);
  const success = async (open?: () => Promise<unknown>) => {
    invalidatePatientWorkspaceQueries(client, patientId);
    if (open) { try { await open(); } catch { toast.error('Guardado en la ficha, pero no se pudo abrir el PDF. Puedes descargarlo desde el paciente.'); } }
    toast.success(mode === 'receta' ? 'Receta guardada en la ficha del paciente.' : 'Documento guardado en la ficha del paciente.');
    onClose();
  };
  const saveDocument = useMutation({
    mutationFn: async (data: { tipo: string; titulo: string; contenido: string; firmaDataUrl: string | null }) => {
      const doctorId = user?.doctor_id || jornada?.doctorId || patient.data?.doctor_habitual_id || null;
      if (mode === 'consentimiento') {
        if (!data.firmaDataUrl) throw new Error('Firma el consentimiento antes de guardarlo.');
        const content = JSON.stringify([data.tipo, data.contenido]);
        if (consentDraft.current && consentDraft.current.content !== content) throw new Error('El consentimiento ya está guardado pendiente de firma. Reintenta la firma sin cambiar el texto o ábrelo desde la ficha para revisarlo.');
        if (!consentDraft.current) {
          const template = templates.data?.find(item => item.nombre === data.tipo);
          const draft = await createConsentimientoPaciente(patientId, data.tipo, doctorId, { plantilla_id: template?.id, plantilla_version: template?.version ?? 'personalizada', contenido: data.contenido, estado: 'pendiente_firma' });
          consentDraft.current = { id: draft.id, content };
          invalidatePatientWorkspaceQueries(client, patientId);
        }
        const signed = await firmarConsentimiento(consentDraft.current.id, data.firmaDataUrl);
        return () => openConsentimientoPdf(signed.id);
      }
      const document = await generarDocumentoPdfPaciente(patientId, { titulo: data.titulo, categoria: 'circular', contenido: data.contenido, descripcion: data.titulo, etiquetas: `circular, ${data.tipo}`, doctor_id: doctorId, firma_data_url: data.firmaDataUrl });
      return () => openDocumentoPaciente(patientId, document.id, document.nombre_original);
    }, onSuccess: success,
  });
  const savePrescription = useMutation({
    mutationFn: async ({ data, action }: RecetaSubmitPayload) => {
      const draft = prescriptionId.current ? await updateRecetaClinica(prescriptionId.current, data) : await createRecetaClinica(patientId, data);
      prescriptionId.current = draft.id;
      invalidatePatientWorkspaceQueries(client, patientId);
      if (action === 'draft') return undefined;
      const emitted = action === 'send_provider' ? await enviarRecetaProveedor(draft.id, { plantilla_id: data.plantilla_id }) : await emitirRecetaLocal(draft.id, { plantilla_id: data.plantilla_id });
      return emitted.pdf_documento_id ? () => openRecetaClinicaPdf(emitted.id) : undefined;
    }, onSuccess: success,
  });
  const queries = [patient, doctors, ...(mode === 'receta' ? [prescriptions, provider] : mode === 'consentimiento' ? [templates] : [])];
  const busy = saveDocument.isPending || savePrescription.isPending;
  const close = () => { if (!busy) onClose(); };
  const host = document.querySelector('.jornada-workspace');
  if (!host) return null;
  return createPortal(<div className="jornada-patient-task">
    {(queries.some(query => query.isError || query.isLoading)) && <button type="button" className="jornada-task-return" onClick={close}>Volver a Jornada</button>}
    {queries.some(query => query.isError) ? <p role="alert">No se pudo cargar el formulario. <button onClick={() => queries.forEach(query => void query.refetch())}>Reintentar</button></p> : queries.some(query => query.isLoading) || !patient.data ? <p role="status">Cargando paciente y plantillas…</p> : mode === 'receta' ? <RecetaModal backLabel="Volver a Jornada" paciente={patient.data} doctores={doctors.data ?? []} plantillas={prescriptions.data ?? []} providerStatus={provider.data} saving={busy} onClose={close} onSubmit={data => savePrescription.mutate(data)} errorMessage={savePrescription.error?.message} /> : <DocumentDesignerModal backLabel="Volver a Jornada" contextDate={mode === 'circular' ? jornada?.day : undefined} mode={mode} paciente={patient.data} plantillas={templates.data ?? []} saving={busy} onClose={close} onSave={data => saveDocument.mutate(data)} errorMessage={saveDocument.error?.message} />}
  </div>, host);
}
