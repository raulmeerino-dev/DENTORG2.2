import { api } from './client';
import type {
  DoctorNotification,
  RecordatorioCitaResponse,
  TelefonearPendiente,
  WhatsAppInboxItem,
} from './types';

export async function enviarRecordatorioCita(citaId: string, canal: 'whatsapp' | 'email' | 'ambos', mensaje?: string) {
  const { data } = await api.post<RecordatorioCitaResponse>(`/citas/${citaId}/recordatorio`, { canal, mensaje });
  return data;
}

export async function getWhatsAppComunicaciones(params: {
  patient_id?: string;
  appointment_id?: string;
  direction?: 'inbound' | 'outbound';
  processed?: boolean;
  intent?: string;
  limit?: number;
} = {}) {
  const { data } = await api.get<WhatsAppInboxItem[]>('/whatsapp/comunicaciones', { params });
  return data;
}

export async function aplicarAccionWhatsApp(
  communicationId: string,
  action: 'confirm' | 'cancel' | 'mark_pending' | 'manual_review' | 'mark_reviewed' | 'ignore',
  note?: string,
) {
  const { data } = await api.post<WhatsAppInboxItem>(`/whatsapp/comunicaciones/${communicationId}/accion`, { action, note });
  return data;
}

export async function reprogramarWhatsAppComunicacion(
  communicationId: string,
  data: {
    fecha_hora: string;
    duracion_min?: number;
    gabinete_id?: string | null;
    forzar_fuera_horario?: boolean;
    note?: string | null;
  },
) {
  const { data: updated } = await api.post<WhatsAppInboxItem>(`/whatsapp/comunicaciones/${communicationId}/reprogramar`, data);
  return updated;
}

export async function getMyDoctorNotifications(unreadOnly = false) {
  const { data } = await api.get<DoctorNotification[]>('/notificaciones/mias', {
    params: { unread_only: unreadOnly },
  });
  return data;
}

export async function markDoctorNotificationRead(notificationId: string) {
  const { data } = await api.post<DoctorNotification>(`/notificaciones/${notificationId}/leer`);
  return data;
}

export async function getTelefonear() {
  const { data } = await api.get<TelefonearPendiente[]>('/citas/panel/telefonear/pendientes');
  return data;
}

export async function marcarTelefonearReubicada(entradaId: string, nuevaCitaId: string) {
  const { data } = await api.patch<TelefonearPendiente>(`/citas/telefonear/${entradaId}/reubicar`, null, {
    params: { nueva_cita_id: nuevaCitaId },
  });
  return data;
}
