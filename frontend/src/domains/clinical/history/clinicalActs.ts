import type { HistorialClinico } from '../../../api/types';

/** Billing a completed act never removes it from the clinical record. */
export function isPerformedTreatment(treatment: HistorialClinico) {
  return (
    ['realizado', 'facturado', 'cobrado_parcial', 'cobrado_completo'].includes(treatment.estado) &&
    Boolean(treatment.tratamiento_id)
  );
}
