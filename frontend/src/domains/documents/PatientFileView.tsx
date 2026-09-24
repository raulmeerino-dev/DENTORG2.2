import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getDocumentoBlob, getDocumentosPaciente } from '../../api/documents';
import { getConsentimientoPdfBlob, getConsentimientosPaciente } from '../../api/consents';
import { getRecetaPdfBlob, getRecetasPaciente } from '../../api/prescriptions';
import { getPaciente } from '../../api/patients';
import { getApiErrorMessage } from '../../api/errors';
import { TaskSurface } from '../../design-system/TaskSurface';
import { PatientTaskContext } from '../patients/PatientTaskContext';
import './patient-file.css';

type FileDetail = { title: string; filename: string; state: string; date: string | null; description: string | null; hasFile: boolean };

async function fileDetail(patient: string, kind: string, id: string): Promise<FileDetail> {
  if (kind === 'documento') {
    const document = (await getDocumentosPaciente(patient)).find(item => item.id === id);
    if (document) return { title: document.descripcion || document.nombre_original, filename: document.nombre_original, state: document.categoria, date: document.fecha_documento || document.created_at, description: document.etiquetas, hasFile: true };
  } else if (kind === 'consentimiento') {
    const consent = (await getConsentimientosPaciente(patient)).find(item => item.id === id);
    if (consent) return { title: consent.tipo, filename: `consentimiento-${id}.pdf`, state: consent.revocado ? 'Revocado' : consent.estado, date: consent.firmado_at || consent.created_at, description: consent.motivo_revocacion, hasFile: true };
  } else if (kind === 'receta') {
    const prescription = (await getRecetasPaciente(patient)).find(item => item.id === id);
    if (prescription) return { title: `Receta · ${prescription.medicamento}`, filename: `receta-${id}.pdf`, state: prescription.estado, date: prescription.fecha_prescripcion, description: `${prescription.posologia}${prescription.instrucciones_paciente ? `\n${prescription.instrucciones_paciente}` : ''}`, hasFile: Boolean(prescription.pdf_documento_id || prescription.pdf_path) };
  }
  throw new Error('El archivo no existe o no está disponible para este paciente y sus permisos.');
}

function FilePreview({ blob, filename }: { blob: Blob; filename: string }) {
  const [source, setSource] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    let disposed = false;
    void Promise.resolve().then(() => { if (!disposed) setSource(url); });
    return () => { disposed = true; URL.revokeObjectURL(url); };
  }, [blob]);
  if (!source) return <p role="status">Preparando vista…</p>;
  const isPdf = blob.type.toLowerCase().includes('pdf');
  const isImage = /^image\/(png|jpeg|gif|webp|bmp|tiff)$/i.test(blob.type);
  return <div className="patient-file-preview">
    <div className="patient-file-actions"><a href={source} download={filename}>Descargar original</a>{isPdf && <a href={source} target="_blank" rel="noopener noreferrer">Abrir PDF para imprimir</a>}</div>
    {isPdf ? <iframe title={`Vista de ${filename}`} src={source} /> : isImage ? <div className="patient-file-image"><img src={source} alt={filename} /></div> : <p>Este formato se consulta descargando el archivo original.</p>}
  </div>;
}

export default function PatientFileView() {
  const { patientId = '', kind = '', fileId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const patient = useQuery({ queryKey: ['paciente-detalle', patientId], queryFn: () => getPaciente(patientId), enabled: Boolean(patientId) });
  const detail = useQuery({ queryKey: ['patient-file-detail', patientId, kind, fileId], queryFn: () => fileDetail(patientId, kind, fileId), enabled: Boolean(patient.data), retry: false });
  const file = useQuery({ queryKey: ['patient-file-content', patientId, kind, fileId], queryFn: () => kind === 'consentimiento' ? getConsentimientoPdfBlob(fileId) : kind === 'receta' ? getRecetaPdfBlob(fileId) : getDocumentoBlob(patientId, fileId), enabled: Boolean(detail.data?.hasFile), retry: false, gcTime: 0, staleTime: Infinity });
  const error = patient.error || detail.error || file.error;
  return <TaskSurface title={detail.data?.title || 'Archivo del paciente'} context={patient.data ? <PatientTaskContext paciente={patient.data} /> : undefined} onClose={() => navigate(`/pacientes?paciente_id=${encodeURIComponent(patientId)}`, { state: location.state })} className="patient-file-task">
    {detail.data && <div className="patient-file-metadata"><span>{detail.data.state.replaceAll('_', ' ')}</span><time>{detail.data.date?.slice(0, 10)}</time>{detail.data.description && <p>{detail.data.description}</p>}</div>}
    {error && <p className="inline-alert" role="alert">{getApiErrorMessage(error, 'No se pudo abrir el archivo.')} <button type="button" onClick={() => { void patient.refetch(); void detail.refetch(); if (detail.data?.hasFile) void file.refetch(); }}>Reintentar</button></p>}
    {!error && (patient.isLoading || detail.isLoading || (detail.data?.hasFile && file.isLoading)) && <p role="status">Cargando archivo…</p>}
    {file.data && <FilePreview key={`${kind}-${fileId}`} blob={file.data} filename={detail.data?.filename || 'documento'} />}
    {detail.data && !detail.data.hasFile && <p className="patient-file-empty">Este registro todavía no tiene un PDF emitido. Se muestra su contenido original.</p>}
  </TaskSurface>;
}
