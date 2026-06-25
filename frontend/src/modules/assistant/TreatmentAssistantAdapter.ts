import { getTratamientosCatalogo } from '../../lib/api';
import type { TratamientoCatalogo } from '../../types/api';
import type { AssistantTreatmentOption } from './types';

export function toAssistantTreatmentOption(tratamiento: TratamientoCatalogo): AssistantTreatmentOption {
  const unitPrice = Number(tratamiento.precio);
  return {
    id: tratamiento.id,
    displayName: tratamiento.nombre,
    code: tratamiento.codigo,
    familyName: tratamiento.familia?.nombre ?? null,
    defaultDurationMinutes: null,
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
    requiresTooth: tratamiento.requiere_pieza,
  };
}

export async function getAssistantTreatments() {
  const tratamientos = await getTratamientosCatalogo({ solo_activos: true });
  return tratamientos.map(toAssistantTreatmentOption);
}
