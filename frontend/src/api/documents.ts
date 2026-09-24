import { api } from './client';
import type {
  DocumentoPaciente,
} from './types';
import { openOrDownloadBlob } from './downloads';

export async function getDocumentosPaciente(pacienteId: string, categoria?: string) {
  const { data } = await api.get<DocumentoPaciente[]>(`/pacientes/${pacienteId}/documentos`, { params: categoria ? { categoria } : {} });
  return data;
}

export function documentoDownloadUrl(pacienteId: string, documentoId: string) {
  return `${api.defaults.baseURL}/pacientes/${pacienteId}/documentos/${documentoId}/descargar`;
}

export async function openDocumentoPaciente(pacienteId: string, documentoId: string, filename = 'documento.pdf') {
  const { data } = await api.get<Blob>(`/pacientes/${pacienteId}/documentos/${documentoId}/descargar`, { responseType: 'blob' });
  return openOrDownloadBlob(data, filename, {
    requirePdf: filename.toLowerCase().endsWith('.pdf') || data.type.toLowerCase().includes('pdf'),
  });
}

export async function uploadDocumentoPaciente(pacienteId: string, data: {
  archivo: File;
  categoria: string;
  descripcion?: string;
  fecha_documento?: string;
  tratamiento_id?: string | null;
  historial_id?: string | null;
  doctor_id?: string | null;
  etiquetas?: string;
}) {
  const form = new FormData();
  form.append('archivo', data.archivo);
  form.append('categoria', data.categoria);
  if (data.descripcion) form.append('descripcion', data.descripcion);
  if (data.fecha_documento) form.append('fecha_documento', data.fecha_documento);
  if (data.tratamiento_id) form.append('tratamiento_id', data.tratamiento_id);
  if (data.historial_id) form.append('historial_id', data.historial_id);
  if (data.doctor_id) form.append('doctor_id', data.doctor_id);
  if (data.etiquetas) form.append('etiquetas', data.etiquetas);
  const { data: created } = await api.post<DocumentoPaciente>(`/pacientes/${pacienteId}/documentos`, form);
  return created;
}

export async function generarDocumentoPdfPaciente(pacienteId: string, data: {
  titulo: string;
  categoria: string;
  contenido: string;
  descripcion?: string;
  etiquetas?: string;
  fecha_documento?: string;
  tratamiento_id?: string | null;
  historial_id?: string | null;
  doctor_id?: string | null;
  firma_data_url?: string | null;
}) {
  const { data: created } = await api.post<DocumentoPaciente>(`/pacientes/${pacienteId}/documentos/generar-pdf`, data);
  return created;
}
