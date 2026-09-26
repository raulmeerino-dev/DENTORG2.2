import { api } from './client';
import type {
  Cita,
  CitaCambio,
  DisponibilidadDia,
  HorarioDoctor,
  HuecoLibre,
  Gabinete,
  ApiPaciente,
} from './types';

export async function getCitas(params: Record<string, string>) {
  const { data } = await api.get<Cita[]>('/citas', { params });
  return data;
}

export async function getGabinetes() {
  const { data } = await api.get<Gabinete[]>('/doctores/gabinetes/');
  return data;
}

export async function getJornadaConfig() {
  const { data } = await api.get<{ espera_aviso_min: number; espera_critica_min: number; duracion_habitual_min: number }>('/citas/jornada/config');
  return data;
}

export async function createPacienteProvisional(data: { nombre: string; telefono?: string | null }) {
  const { data: paciente } = await api.post<ApiPaciente>('/citas/paciente-provisional', data);
  return paciente;
}

export async function getPacienteCitas(pacienteId: string) {
  const { data } = await api.get<Cita[]>(`/pacientes/${pacienteId}/citas`);
  return data;
}

export async function buscarHuecosLibres(params: {
  doctor_id: string;
  gabinete_id?: string;
  duracion_min: number;
  desde: string;
  hasta: string;
  solo_manana?: boolean;
  solo_tarde?: boolean;
  max_resultados?: number;
}) {
  const { data } = await api.get<HuecoLibre[]>('/citas/buscar-hueco', { params });
  return data;
}

export async function getDisponibilidadDoctor(params: { doctor_id: string; desde: string; dias?: number }) {
  const { data } = await api.get<DisponibilidadDia[]>('/citas/disponibilidad', { params });
  return data;
}

export async function createCita(data: {
  paciente_id: string;
  doctor_id: string;
  gabinete_id?: string | null;
  presupuesto_linea_id?: string | null;
  fecha_hora: string;
  duracion_min: number;
  motivo?: string | null;
  observaciones?: string | null;
  recordatorio_enviado?: boolean;
  recordatorio_canal?: string | null;
  recordatorio_estado?: string | null;
  motivo_cancelacion?: string | null;
  es_urgencia?: boolean;
  motivo_solape?: string | null;
  forzar_fuera_horario?: boolean;
  estado?: 'programada' | 'confirmada';
}) {
  const { data: created } = await api.post<Cita>('/citas', data);
  return created;
}

export async function updateCita(citaId: string, data: Partial<{
  revision: number;
  doctor_id: string;
  gabinete_id: string | null;
  presupuesto_linea_id: string | null;
  fecha_hora: string;
  duracion_min: number;
  estado: string;
  motivo: string | null;
  observaciones: string | null;
  recordatorio_enviado: boolean;
  recordatorio_canal: string | null;
  recordatorio_estado: string | null;
  motivo_cancelacion: string | null;
  es_urgencia: boolean;
  motivo_solape: string | null;
  forzar_fuera_horario: boolean;
}>) {
  const { data: updated } = await api.patch<Cita>(`/citas/${citaId}`, data);
  return updated;
}

export async function reprogramarCita(citaId: string, data: {
  doctor_id?: string | null;
  gabinete_id?: string | null;
  fecha_hora: string;
  duracion_min?: number;
  forzar_fuera_horario?: boolean;
  motivo?: string | null;
}) {
  const { data: updated } = await api.patch<Cita>(`/citas/${citaId}/reprogramar`, data);
  return updated;
}

export async function confirmarCita(citaId: string) {
  const { data: confirmed } = await api.post<Cita>(`/citas/${citaId}/confirmar`);
  return confirmed;
}

export async function marcarLlegadaCita(citaId: string) {
  const { data } = await api.post<Cita>(`/citas/${citaId}/llegada`);
  return data;
}

export async function iniciarAtencionCita(citaId: string) {
  const { data } = await api.post<Cita>(`/citas/${citaId}/iniciar-atencion`);
  return data;
}

export async function finalizarVisitaCita(citaId: string) {
  const { data } = await api.post<Cita>(`/citas/${citaId}/finalizar-visita`);
  return data;
}

export async function resolverSalidaCita(citaId: string, observaciones?: string) {
  const { data } = await api.post<Cita>(`/citas/${citaId}/resolver-salida`, { observaciones });
  return data;
}

export async function cancelarCitaAvanzada(citaId: string, data: {
  motivo_cancelacion: string;
  tipo?: 'anulacion_paciente' | 'anulacion_clinica' | 'no_vino' | 'reprogramada' | 'otro';
  crear_telefonear?: boolean;
}) {
  const { data: cancelled } = await api.post<Cita>(`/citas/${citaId}/cancelar`, data);
  return cancelled;
}

export async function marcarFaltaCita(citaId: string, motivo: string) {
  const { data: missed } = await api.post<Cita>(`/citas/${citaId}/marcar-falta`, {
    motivo_cancelacion: motivo,
    tipo: 'no_vino',
  });
  return missed;
}

export async function getCambiosCita(citaId: string) {
  const { data } = await api.get<CitaCambio[]>(`/citas/${citaId}/cambios`);
  return data;
}

export async function getHorarios(doctorId: string) {
  const { data } = await api.get<HorarioDoctor[]>(`/doctores/${doctorId}/horarios`);
  return data;
}

export async function updateHorarioDoctor(doctorId: string, diaSemana: number, data: {
  tipo_dia: string;
  bloques: Array<{ inicio: string; fin: string }>;
  intervalo_min: number;
}) {
  const { data: updated } = await api.put<HorarioDoctor>(`/doctores/${doctorId}/horarios/${diaSemana}`, data);
  return updated;
}
