import type {
  FamiliaTratamiento,
  TratamientoCatalogo,
} from '../types';
import { DEMO_FAMILIAS, DEMO_TRATAMIENTOS } from './data';

export async function getFamiliasTratamiento(): Promise<FamiliaTratamiento[]> {
  return DEMO_FAMILIAS;
}

export async function getTratamientosCatalogo(params: { q?: string; familia_id?: string; solo_activos?: boolean } = {}): Promise<TratamientoCatalogo[]> {
  const q = params.q?.trim().toLowerCase();
  const filtered = DEMO_TRATAMIENTOS.filter((item) => {
    if (params.familia_id && item.familia_id !== params.familia_id) return false;
    if (q && !`${item.codigo} ${item.nombre} ${item.familia?.nombre}`.toLowerCase().includes(q)) return false;
    return params.solo_activos === false || item.activo;
  });
  return filtered;
}
