import { api } from './client';
import type {
  Clinica,
  Doctor,
} from './types';

export async function getClinicas() {
  const { data } = await api.get<Clinica[]>('/clinicas');
  return data;
}

export async function createClinica(data: Partial<Clinica> & { nombre: string }) {
  const { data: created } = await api.post<Clinica>('/clinicas', data);
  return created;
}

export async function getDoctores() {
  const { data } = await api.get<Doctor[]>('/doctores');
  return data;
}

export async function createDoctor(data: {
  nombre: string;
  especialidad?: string | null;
  color_agenda?: string | null;
  es_auxiliar?: boolean;
  porcentaje?: string | number | null;
}) {
  const { data: created } = await api.post<Doctor>('/doctores', data);
  return created;
}

export async function updateDoctor(doctorId: string, data: Partial<{
  nombre: string;
  especialidad: string | null;
  color_agenda: string | null;
  es_auxiliar: boolean;
  porcentaje: string | number | null;
  activo: boolean;
}>) {
  const { data: updated } = await api.patch<Doctor>(`/doctores/${doctorId}`, data);
  return updated;
}
