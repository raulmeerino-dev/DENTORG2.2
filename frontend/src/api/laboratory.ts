import { api } from './client';
import type {
  Laboratorio,
  TrabajoLaboratorioCreateInput,
  TrabajoLaboratorio,
} from './types';

export async function getLaboratorios(params: { solo_activos?: boolean } = {}) {
  const { data } = await api.get<Laboratorio[]>('/laboratorios', { params });
  return data;
}

export async function createTrabajoLaboratorio(data: TrabajoLaboratorioCreateInput) {
  const { data: trabajo } = await api.post<TrabajoLaboratorio>('/laboratorio/trabajos', data);
  return trabajo;
}

export async function asociarTrabajoLaboratorioCita(trabajoId: string, citaId: string | null) {
  const { data: trabajo } = await api.patch<TrabajoLaboratorio>(`/laboratorio/trabajos/${trabajoId}/asociar-cita`, {
    cita_id: citaId,
  });
  return trabajo;
}

export async function marcarTrabajoLaboratorioRecibido(
  trabajoId: string,
  payload: { fecha?: string | null; ubicacion_clinica?: string | null; observaciones?: string | null } = {},
) {
  const { data: trabajo } = await api.post<TrabajoLaboratorio>(`/laboratorio/trabajos/${trabajoId}/recibir`, payload);
  return trabajo;
}

export async function marcarTrabajoLaboratorioRevisado(
  trabajoId: string,
  payload: { fecha?: string | null; ubicacion_clinica?: string | null; observaciones?: string | null } = {},
) {
  const { data: trabajo } = await api.post<TrabajoLaboratorio>(`/laboratorio/trabajos/${trabajoId}/revisar`, payload);
  return trabajo;
}

export async function marcarTrabajoLaboratorioEntregado(
  trabajoId: string,
  payload: { fecha?: string | null; observaciones?: string | null } = {},
) {
  const { data: trabajo } = await api.post<TrabajoLaboratorio>(`/laboratorio/trabajos/${trabajoId}/entregar`, payload);
  return trabajo;
}

export async function getTrabajosLaboratorioCita(citaId: string) {
  const { data: trabajos } = await api.get<TrabajoLaboratorio[]>(`/laboratorio/citas/${citaId}/trabajos`);
  return trabajos;
}

export async function getTrabajosLaboratorio(params: { pendientes?: boolean; proximos?: boolean; vencidos?: boolean; estado?: string; paciente_id?: string; cita_id?: string } = {}) {
  const { data } = await api.get<TrabajoLaboratorio[]>('/laboratorio/trabajos', { params });
  return data;
}
