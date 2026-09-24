import { api } from './client';
import type {
  OdontogramaContextMode,
  OdontogramaContexto,
  OdontogramaEvento,
  OdontogramaPaciente,
  OdontogramaPieza,
  OdontogramaPlan,
  OdontogramaStatus,
  OdontogramaSuperficie,
  OdontogramaSurfaceName,
} from './types';

export async function getOdontogramaPaciente(pacienteId: string) {
  const { data } = await api.get<OdontogramaPaciente>(`/pacientes/${pacienteId}/odontograma`);
  return data;
}

export async function getOdontogramaContexto(
  pacienteId: string,
  mode: OdontogramaContextMode,
  contextId?: string | null,
) {
  const { data } = await api.get<OdontogramaContexto>(`/pacientes/${pacienteId}/odontograma/contexto`, {
    params: { mode, context_id: contextId || undefined },
  });
  return data;
}

export async function createOdontogramaPaciente(pacienteId: string) {
  const response = await api.post<OdontogramaPaciente>(`/pacientes/${pacienteId}/odontograma`);
  return response.data;
}

export async function updateOdontogramaPieza(odontogramaId: string, piezaFdi: number, data: {
  estado_general?: OdontogramaStatus | string;
  notas?: string | null;
}) {
  const response = await api.patch<OdontogramaPieza>(
    `/odontogramas/${odontogramaId}/piezas/${piezaFdi}`,
    data,
  );
  return response.data;
}

export async function updateOdontogramaSuperficie(odontogramaId: string, piezaFdi: number, superficie: OdontogramaSurfaceName, data: {
  condicion?: OdontogramaStatus | string;
  tratamiento_planificado_id?: string | null;
  tratamiento_realizado_id?: string | null;
  color_estado?: string | null;
  notas?: string | null;
}) {
  const response = await api.patch<OdontogramaSuperficie>(
    `/odontogramas/${odontogramaId}/piezas/${piezaFdi}/superficies/${superficie}`,
    data,
  );
  return response.data;
}

export async function getOdontogramaHistorial(odontogramaId: string) {
  const { data } = await api.get<OdontogramaEvento[]>(`/odontogramas/${odontogramaId}/historial`);
  return data;
}

export async function duplicateOdontogramaVersion(odontogramaId: string) {
  const response = await api.post<OdontogramaPaciente>(`/odontograma/${odontogramaId}/duplicar-version`);
  return response.data;
}

export async function createPresupuestoFromOdontograma(odontogramaId: string, data: {
  doctor_id: string;
  items?: Array<{ pieza_fdi: number; superficie?: OdontogramaSurfaceName | null; tratamiento_id: string; precio_unitario: string | number }>;
  pie_pagina?: string | null;
}) {
  const response = await api.post<{ presupuesto_id: string; lineas_creadas: number }>(
    `/odontogramas/${odontogramaId}/generar-presupuesto`,
    data,
  );
  return response.data;
}

export async function saveOdontograma(presupuestoId: string, odontograma: OdontogramaPlan) {
  const response = await api.put<{ presupuesto_id: string; odontograma: OdontogramaPlan }>(
    `/presupuestos/${presupuestoId}/odontograma`,
    { odontograma },
  );
  return response.data;
}
