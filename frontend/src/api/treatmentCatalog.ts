import { api } from './client';
import type {
  FamiliaTratamiento,
  TratamientoCatalogo,
} from './types';

export async function getFamiliasTratamiento() {
  const { data } = await api.get<FamiliaTratamiento[]>('/tratamientos/familias');
  return data;
}

export async function createFamiliaTratamiento(data: { nombre: string; icono?: string | null; orden?: number }) {
  const { data: created } = await api.post<FamiliaTratamiento>('/tratamientos/familias', {
    nombre: data.nombre,
    icono: data.icono ?? null,
    orden: data.orden ?? 0,
  });
  return created;
}

export async function getTratamientosCatalogo(params: { q?: string; familia_id?: string; solo_activos?: boolean } = {}) {
  const { data } = await api.get<TratamientoCatalogo[]>('/tratamientos', { params });
  return data;
}

export async function createTratamientoCatalogo(data: {
  familia_id: string;
  codigo?: string | null;
  nombre: string;
  precio: string | number;
  iva_porcentaje?: string | number;
  requiere_pieza?: boolean;
  requiere_caras?: boolean;
  duracion_habitual_min?: number | null;
}) {
  const { data: created } = await api.post<TratamientoCatalogo>('/tratamientos', {
    ...data,
    iva_porcentaje: data.iva_porcentaje ?? 0,
    requiere_pieza: Boolean(data.requiere_pieza),
    requiere_caras: Boolean(data.requiere_caras),
  });
  return created;
}

export async function updateTratamientoCatalogo(id: string, data: Partial<{
  familia_id: string;
  codigo: string | null;
  nombre: string;
  precio: string | number;
  iva_porcentaje: string | number;
  requiere_pieza: boolean;
  requiere_caras: boolean;
  activo: boolean;
  duracion_habitual_min: number | null;
}>) {
  const { data: updated } = await api.patch<TratamientoCatalogo>(`/tratamientos/${id}`, data);
  return updated;
}

export async function deactivateTratamientoCatalogo(id: string) {
  const { data } = await api.delete<TratamientoCatalogo>(`/tratamientos/${id}`);
  return data;
}
