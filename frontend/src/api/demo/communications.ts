import type {
  DoctorNotification,
  TelefonearPendiente,
  WhatsAppInboxItem,
} from '../types';
import { DEMO_DOCTORES } from './data';

export async function getWhatsAppComunicaciones(params: {
  patient_id?: string;
  appointment_id?: string;
  direction?: 'inbound' | 'outbound';
  processed?: boolean;
  intent?: string;
  limit?: number;
} = {}): Promise<WhatsAppInboxItem[]> {
  const day = new Date().toISOString().slice(0, 10);
  const fallback: WhatsAppInboxItem[] = [
    {
      id: 'demo-wa-1',
      clinica_id: 'demo-clinica-1',
      patient_id: 'demo-pac-2',
      appointment_id: 'demo-cita-2',
      direction: 'inbound' as const,
      phone: '600000001',
      message_body: 'No puedo, necesito cambiar la cita',
      received_at: `${day}T09:35:00`,
      sent_at: null,
      interpreted_intent: 'reschedule_requested',
      processed: false,
      provider_message_id: 'demo-wa-msg-1',
      idempotency_key: 'demo-inbound-wa-1',
      raw_payload: null,
      created_at: `${day}T09:35:00`,
      patient: { id: 'demo-pac-2', nombre: 'PILAR', apellidos: 'OJEDA CALVO', num_historial: 91313 },
      appointment: { id: 'demo-cita-2', fecha_hora: `${day}T16:10:00`, estado: 'reminder_sent', motivo: 'Ortodoncia', doctor_nombre: DEMO_DOCTORES[1].nombre, doctor_id: 'demo-doc-2', gabinete_id: 'gab-2', duracion_min: 40 },
    },
    {
      id: 'demo-wa-2',
      clinica_id: 'demo-clinica-1',
      patient_id: 'demo-pac-1',
      appointment_id: 'demo-cita-1',
      direction: 'outbound' as const,
      phone: '942503186',
      message_body: 'Hola CESAR, le recordamos su cita.',
      received_at: null,
      sent_at: `${day}T09:15:00`,
      interpreted_intent: null,
      processed: true,
      provider_message_id: null,
      idempotency_key: null,
      raw_payload: null,
      created_at: `${day}T09:15:00`,
      patient: { id: 'demo-pac-1', nombre: 'CESAR', apellidos: 'GUTIERREZ VELEZ', num_historial: 91312 },
      appointment: { id: 'demo-cita-1', fecha_hora: `${day}T15:00:00`, estado: 'confirmed', motivo: 'Revision', doctor_nombre: DEMO_DOCTORES[0].nombre, doctor_id: 'demo-doc-1', gabinete_id: 'gab-1', duracion_min: 30 },
    },
  ].filter((item) => {
    if (params.patient_id && item.patient_id !== params.patient_id && !params.patient_id.startsWith('demo-')) return false;
    if (params.appointment_id && item.appointment_id !== params.appointment_id) return false;
    if (params.direction && item.direction !== params.direction) return false;
    if (params.processed !== undefined && item.processed !== params.processed) return false;
    if (params.intent && item.interpreted_intent !== params.intent) return false;
    return true;
  });
  return fallback;
}

export async function getMyDoctorNotifications(): Promise<DoctorNotification[]> {
  return [];
}

export async function getTelefonear(): Promise<TelefonearPendiente[]> {
  return [
    { id: 'demo-tel-1', cita_original_id: 'demo-cita-1', paciente_id: 'demo-pac-1', doctor_id: 'demo-doc-1', nueva_cita_id: null, paciente: { nombre: 'CESAR', apellidos: 'GUTIERREZ VELEZ', telefono: '942503186' }, doctor: { nombre: DEMO_DOCTORES[0].nombre, color_agenda: DEMO_DOCTORES[0].color_agenda }, motivo: 'Confirmar cita', notas: 'Prefiere tarde', estado_contacto: 'pendiente', ultimo_intento_at: null, proximo_intento_at: new Date().toISOString(), reubicada: false },
    { id: 'demo-tel-2', cita_original_id: 'demo-cita-2', paciente_id: 'demo-pac-2', doctor_id: 'demo-doc-2', nueva_cita_id: null, paciente: { nombre: 'PILAR', apellidos: 'OJEDA CALVO', telefono: '600000001' }, doctor: { nombre: DEMO_DOCTORES[1].nombre, color_agenda: DEMO_DOCTORES[1].color_agenda }, motivo: 'Buscar hueco', notas: 'No responde a primera hora', estado_contacto: 'no_responde', ultimo_intento_at: new Date().toISOString(), proximo_intento_at: null, reubicada: false },
  ];
}
