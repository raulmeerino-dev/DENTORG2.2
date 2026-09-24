import { api } from './client';
import type {
  RecetaClinica,
  RecetaCreateInput,
  RecetaEmitirInput,
  RecetaPlantilla,
  RecetaProviderStatus,
  RecetaUpdateInput,
} from './types';
import { openOrDownloadBlob } from './downloads';

export async function getRecetasPaciente(pacienteId: string) {
  const { data } = await api.get<RecetaClinica[]>('/recetas', { params: { paciente_id: pacienteId } });
  return data;
}

export async function getRecetaProviderStatus() {
  const { data } = await api.get<RecetaProviderStatus>('/recetas/provider-status');
  return data;
}

export async function getRecetaPlantillas() {
  const { data } = await api.get<RecetaPlantilla[]>('/recetas/plantillas');
  return data;
}

export async function importRecetaPlantilla(input: {
  archivo: File;
  nombre: string;
  campos_config?: Record<string, unknown> | null;
  requiere_dni?: boolean;
  requiere_fecha_nacimiento?: boolean;
}) {
  const formData = new FormData();
  formData.append('archivo', input.archivo);
  formData.append('nombre', input.nombre);
  if (input.campos_config) formData.append('campos_config', JSON.stringify(input.campos_config));
  formData.append('requiere_dni', String(input.requiere_dni ?? true));
  formData.append('requiere_fecha_nacimiento', String(input.requiere_fecha_nacimiento ?? false));
  const { data } = await api.post<RecetaPlantilla>('/recetas/plantillas', formData);
  return data;
}

export async function createRecetaClinica(pacienteId: string, data: RecetaCreateInput) {
  const { data: receta } = await api.post<RecetaClinica>(`/recetas/pacientes/${pacienteId}`, data);
  return receta;
}

export async function updateRecetaClinica(recetaId: string, data: RecetaUpdateInput) {
  const { data: receta } = await api.patch<RecetaClinica>(`/recetas/${recetaId}`, data);
  return receta;
}

export async function firmarRecetaClinica(recetaId: string, firmaDataUrl: string) {
  const { data } = await api.post<RecetaClinica>(`/recetas/${recetaId}/firma`, { firma_data_url: firmaDataUrl });
  return data;
}

export async function emitirRecetaLocal(recetaId: string, data: RecetaEmitirInput = {}) {
  const { data: receta } = await api.post<RecetaClinica>(`/recetas/${recetaId}/emitir-local`, data);
  return receta;
}

export async function enviarRecetaProveedor(recetaId: string, data: RecetaEmitirInput = {}) {
  const { data: receta } = await api.post<RecetaClinica>(`/recetas/${recetaId}/enviar-proveedor`, data);
  return receta;
}

export async function anularRecetaClinica(recetaId: string, motivo: string) {
  const { data } = await api.post<RecetaClinica>(`/recetas/${recetaId}/anular`, { motivo });
  return data;
}

export async function openRecetaClinicaPdf(recetaId: string) {
  const { data } = await api.get<Blob>(`/recetas/${recetaId}/pdf`, { responseType: 'blob' });
  return openOrDownloadBlob(data, `receta_${recetaId}.pdf`, { requirePdf: true });
}

export function recetaPdfUrl(facturaId: string) {
  return `${api.defaults.baseURL}/facturas/${facturaId}/receta`;
}

export async function emitirRecetaPdf(facturaId: string) {
  const { data } = await api.post<Blob>(`/facturas/${facturaId}/receta`, undefined, { responseType: 'blob' });
  return openOrDownloadBlob(data, `receta-${facturaId}.pdf`, { requirePdf: true });
}
