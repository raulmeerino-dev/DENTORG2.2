import { api } from './client';
import type {
  Cita,
  Consentimiento,
  DocumentoPaciente,
  PortalMe,
  PortalPublicCita,
  PortalPublicConsentimiento,
  PortalPublicDocumento,
  PortalPublicMe,
} from './types';
import { openOrDownloadBlob } from './downloads';

function portalPatientParams(pacienteId?: string | null) {
  return pacienteId ? { paciente_id: pacienteId } : {};
}

export async function getPortalMe(pacienteId?: string | null) {
  const { data } = await api.get<PortalMe>('/portal/me', { params: portalPatientParams(pacienteId) });
  return data;
}

export async function getPortalCitas(pacienteId?: string | null) {
  const { data } = await api.get<Cita[]>('/portal/citas', { params: portalPatientParams(pacienteId) });
  return data;
}

export async function confirmarPortalCita(citaId: string, pacienteId?: string | null) {
  const { data } = await api.post<Cita>(`/portal/citas/${citaId}/confirmar`, null, { params: portalPatientParams(pacienteId) });
  return data;
}

export async function cancelarPortalCita(citaId: string, pacienteId: string | null | undefined, motivo: string, reprogramar = false) {
  const { data } = await api.post<Cita>(`/portal/citas/${citaId}/cancelar`, {
    motivo_cancelacion: motivo,
    tipo: reprogramar ? 'reprogramada' : 'anulacion_paciente',
    crear_telefonear: reprogramar,
  }, { params: portalPatientParams(pacienteId) });
  return data;
}

export async function solicitarCambioPortalCita(citaId: string, pacienteId: string | null | undefined, motivo: string) {
  const { data } = await api.post<Cita>(`/portal/citas/${citaId}/solicitar-cambio`, {
    motivo,
  }, { params: portalPatientParams(pacienteId) });
  return data;
}

export async function getPortalDocumentos(pacienteId?: string | null) {
  const { data } = await api.get<DocumentoPaciente[]>('/portal/documentos', { params: portalPatientParams(pacienteId) });
  return data;
}

export async function getPortalConsentimientos(pacienteId?: string | null) {
  const { data } = await api.get<Consentimiento[]>('/portal/consentimientos', { params: portalPatientParams(pacienteId) });
  return data;
}

export async function firmarPortalConsentimiento(consentimientoId: string, pacienteId: string | null | undefined, firmaPacienteBase64: string) {
  const { data } = await api.post<Consentimiento>(`/portal/consentimientos/${consentimientoId}/firmar`, {
    firma_paciente_base64: firmaPacienteBase64,
  }, { params: portalPatientParams(pacienteId) });
  return data;
}

export async function validatePortalInvitation(token: string) {
  const { data } = await api.post<PortalPublicMe>('/portal/public/validate', { token });
  return data;
}

export async function getPortalPublicMe(token: string) {
  const { data } = await api.post<PortalPublicMe>('/portal/public/me', { token });
  return data;
}

export async function getPortalPublicCitas(token: string) {
  const { data } = await api.post<PortalPublicCita[]>('/portal/public/citas', { token });
  return data;
}

export async function confirmarPortalPublicCita(token: string, citaId: string) {
  const { data } = await api.post<PortalPublicCita>(`/portal/public/citas/${citaId}/confirmar`, { token });
  return data;
}

export async function cancelarPortalPublicCita(token: string, citaId: string, motivo: string, reprogramar = false) {
  const { data } = await api.post<PortalPublicCita>(`/portal/public/citas/${citaId}/cancelar`, {
    token,
    motivo_cancelacion: motivo,
    reprogramar,
  });
  return data;
}

export async function solicitarCambioPortalPublicCita(token: string, citaId: string, motivo: string) {
  const { data } = await api.post<PortalPublicCita>(`/portal/public/citas/${citaId}/solicitar-cambio`, {
    token,
    motivo,
  });
  return data;
}

export async function getPortalPublicDocumentos(token: string) {
  const { data } = await api.post<PortalPublicDocumento[]>('/portal/public/documentos', { token });
  return data;
}

export async function openPortalPublicDocumento(token: string, documentoId: string, filename = 'documento.pdf') {
  const { data } = await api.post<Blob>(`/portal/public/documentos/${documentoId}/descargar`, { token }, { responseType: 'blob' });
  return openOrDownloadBlob(data, filename, {
    requirePdf: filename.toLowerCase().endsWith('.pdf') || data.type.toLowerCase().includes('pdf'),
  });
}

export async function getPortalPublicConsentimientos(token: string) {
  const { data } = await api.post<PortalPublicConsentimiento[]>('/portal/public/consentimientos', { token });
  return data;
}

export async function firmarPortalPublicConsentimiento(token: string, consentimientoId: string, firmaPacienteBase64: string) {
  const { data } = await api.post<PortalPublicConsentimiento>(`/portal/public/consentimientos/${consentimientoId}/firmar`, {
    token,
    firma_paciente_base64: firmaPacienteBase64,
  });
  return data;
}
