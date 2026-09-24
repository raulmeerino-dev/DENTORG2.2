import { api } from './client';
import type {
  ApiPaciente,
} from './types';

export async function getPacientes(params: {
  q?: string;
  solo_activos?: boolean;
  limit?: number;
  offset?: number;
} = {}) {
  const { data } = await api.get<ApiPaciente[]>('/pacientes', { params });
  return data;
}

export async function getPaciente(pacienteId: string) {
  const { data } = await api.get<ApiPaciente>(`/pacientes/${pacienteId}`);
  return data;
}

export async function createPaciente(data: Partial<ApiPaciente> & { nombre: string; apellidos: string }) {
  const { data: created } = await api.post<ApiPaciente>('/pacientes', data);
  return created;
}

export async function updatePaciente(pacienteId: string, data: Partial<ApiPaciente>) {
  const { data: updated } = await api.patch<ApiPaciente>(`/pacientes/${pacienteId}`, data);
  return updated;
}

export async function syncOffline(payload: { pacientes: unknown[]; citas: unknown[] }) {
  const { data } = await api.post<{ pacientes: Record<string, string>; citas: Record<string, string>; pendientes: number }>('/sync', payload);
  return data;
}

export async function importPacientes(payload: Array<Record<string, string>>) {
  const { data } = await api.post<{ creados: number; errores: Array<Record<string, unknown>> }>('/import/pacientes', payload);
  return data;
}
