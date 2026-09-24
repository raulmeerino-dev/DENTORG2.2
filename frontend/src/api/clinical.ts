import { api } from './client';
import type {
  HistorialClinico,
  SesionClinicaItem,
  SesionClinicaItemCreateInput,
  SesionClinicaItemUpdateInput,
  SesionTratamientoRealizadoInput,
  NotaDental,
  NotaDentalCreateInput,
} from './types';

export async function getHistorialPaciente(pacienteId: string) {
  const { data } = await api.get<HistorialClinico[]>(`/tratamientos/historial/${pacienteId}`);
  return data;
}

export async function finalizarTratamientoSesion(data: SesionTratamientoRealizadoInput) {
  const { data: saved } = await api.post<HistorialClinico>('/tratamientos/historial/sesion-realizada', data);
  return saved;
}

export async function getSesionItemsPaciente(pacienteId: string, options: { incluirRealizados?: boolean } = {}) {
  const { data } = await api.get<SesionClinicaItem[]>(`/tratamientos/pacientes/${pacienteId}/sesion-items`, {
    params: options.incluirRealizados ? { incluir_realizados: true } : undefined,
  });
  return data;
}

export async function createSesionItem(pacienteId: string, payload: SesionClinicaItemCreateInput) {
  const { data } = await api.post<SesionClinicaItem>(
    `/tratamientos/pacientes/${pacienteId}/sesion-items`,
    payload,
  );
  return data;
}

export async function updateSesionItem(pacienteId: string, itemId: string, payload: SesionClinicaItemUpdateInput) {
  const { data } = await api.patch<SesionClinicaItem>(
    `/tratamientos/pacientes/${pacienteId}/sesion-items/${itemId}`,
    payload,
  );
  return data;
}

export async function deleteSesionItem(pacienteId: string, itemId: string) {
  await api.delete(`/tratamientos/pacientes/${pacienteId}/sesion-items/${itemId}`);
}

export async function getNotasDentalesPaciente(pacienteId: string, pieza?: number) {
  const { data } = await api.get<NotaDental[]>(`/tratamientos/notas-dentales/${pacienteId}`, {
    params: pieza ? { pieza } : undefined,
  });
  return data;
}

export async function createNotaDental(data: NotaDentalCreateInput) {
  const { data: saved } = await api.post<NotaDental>('/tratamientos/notas-dentales', data);
  return saved;
}
