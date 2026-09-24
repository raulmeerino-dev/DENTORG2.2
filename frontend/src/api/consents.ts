import { api } from './client';
import type {
  Consentimiento,
  PlantillaConsentimiento,
} from './types';
import { openOrDownloadBlob } from './downloads';

export async function getPlantillasConsentimiento() {
  const { data } = await api.get<PlantillaConsentimiento[]>('/consentimientos/plantillas');
  return data;
}

export async function getConsentimientosPaciente(pacienteId: string) {
  const { data } = await api.get<Consentimiento[]>(`/pacientes/${pacienteId}/consentimientos`);
  return data;
}

export async function createConsentimientoPaciente(pacienteId: string, tipo: string, doctorId?: string | null, extra?: Partial<{
  plantilla_id: string | null;
  tratamiento_id: string | null;
  historial_id: string | null;
  documento_id: string | null;
  estado: string;
  fecha_firma: string;
  documento_path: string | null;
  plantilla_version: string | null;
  contenido: string | null;
}>) {
  const { data: created } = await api.post<Consentimiento>(`/pacientes/${pacienteId}/consentimientos`, {
    tipo,
    doctor_id: doctorId,
    estado: extra?.estado ?? 'pendiente_firma',
    plantilla_version: extra?.plantilla_version ?? '2026.04',
    ...extra,
  });
  return created;
}

export async function firmarConsentimiento(consentimientoId: string, firmaPacienteBase64: string, firmaDoctorBase64?: string | null) {
  const { data: signed } = await api.post<Consentimiento>(`/consentimientos/${consentimientoId}/firmar`, {
    firma_paciente_base64: firmaPacienteBase64,
    firma_doctor_base64: firmaDoctorBase64 ?? null,
  });
  return signed;
}

export async function revocarConsentimiento(consentimientoId: string, motivo: string) {
  const { data: revoked } = await api.post<Consentimiento>(`/consentimientos/${consentimientoId}/revocar`, { motivo });
  return revoked;
}

export async function openConsentimientoPdf(consentimientoId: string) {
  const { data } = await api.get<Blob>(`/consentimientos/${consentimientoId}/pdf`, { responseType: 'blob' });
  return openOrDownloadBlob(data, `consentimiento_${consentimientoId}.pdf`, { requirePdf: true });
}
