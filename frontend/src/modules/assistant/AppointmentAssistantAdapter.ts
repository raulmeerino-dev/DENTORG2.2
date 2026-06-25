import {
  cancelarCitaAvanzada,
  createCita,
  marcarFaltaCita,
  reprogramarCita,
} from '../../lib/api';
import type { Cita } from '../../types/api';
import type { AssistantIntent } from './types';

export async function createAppointmentFromAssistant(intent: AssistantIntent, fechaHora: string, durationMinutes: number): Promise<Cita> {
  if (!intent.fields.patientId) throw new Error('Falta paciente para crear la cita.');
  if (!intent.fields.professionalId) throw new Error('Falta profesional para crear la cita.');
  return createCita({
    paciente_id: intent.fields.patientId,
    doctor_id: intent.fields.professionalId,
    fecha_hora: fechaHora,
    duracion_min: durationMinutes,
    motivo: intent.fields.treatmentType ?? 'Cita dental',
    observaciones: 'Creada desde DentCore Voice Assistant',
  });
}

export async function moveAppointmentFromAssistant(intent: AssistantIntent, fechaHora: string, durationMinutes?: number) {
  if (!intent.fields.appointmentId) throw new Error('Falta cita seleccionada para mover.');
  return reprogramarCita(intent.fields.appointmentId, {
    doctor_id: intent.fields.professionalId ?? undefined,
    fecha_hora: fechaHora,
    duracion_min: durationMinutes,
    motivo: 'Reprogramada desde DentCore Voice Assistant',
  });
}

export async function cancelAppointmentFromAssistant(intent: AssistantIntent) {
  if (!intent.fields.appointmentId) throw new Error('Falta cita seleccionada para cancelar.');
  if (intent.fields.appointmentAction === 'no_show') {
    return marcarFaltaCita(intent.fields.appointmentId, 'No vino - registrado desde DentCore Voice Assistant');
  }
  return cancelarCitaAvanzada(intent.fields.appointmentId, {
    motivo_cancelacion: 'Cancelada desde DentCore Voice Assistant',
    tipo: 'anulacion_clinica',
    crear_telefonear: false,
  });
}
