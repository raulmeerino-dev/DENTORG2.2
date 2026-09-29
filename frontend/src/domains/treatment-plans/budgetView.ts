import type { Presupuesto, PresupuestoLinea } from '../../api/types';

export type BudgetTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export const budgetClosed = (budget: Presupuesto) => ['aceptado', 'facturado', 'rechazado'].includes(budget.estado);
export const lineEditable = (budget: Presupuesto, line: PresupuestoLinea) => !budgetClosed(budget) && !line.aceptado && !line.pasado_trabajo_pendiente;
export function budgetStatus(state: string): { label: string; tone: BudgetTone } {
  const states: Record<string, { label: string; tone: BudgetTone }> = {
    borrador: { label: 'Borrador', tone: 'neutral' }, presentado: { label: 'Presentado', tone: 'info' },
    parcial: { label: 'Aceptación parcial', tone: 'warning' }, aceptado: { label: 'Aceptado', tone: 'success' },
    rechazado: { label: 'Rechazado', tone: 'danger' }, facturado: { label: 'Facturado', tone: 'success' },
    caducado: { label: 'Caducado', tone: 'warning' },
  };
  return states[state] ?? { label: state, tone: 'neutral' };
}
export function budgetTotals(budget: Presupuesto) {
  const gross = budget.lineas.reduce((sum, line) => sum + Number(line.precio_unitario), 0);
  const net = budget.lineas.reduce((sum, line) => sum + Number(line.importe_neto), 0);
  const accepted = budget.lineas.filter(line => line.aceptado).reduce((sum, line) => sum + Number(line.importe_neto), 0);
  return { gross, net, accepted, discount: gross - net, pending: net - accepted };
}
export function budgetLineStatus(budget: Presupuesto, line: PresupuestoLinea, pending = false): { label: string; tone: BudgetTone } {
  if (budget.estado === 'rechazado') return { label: 'Rechazado', tone: 'danger' };
  if (budget.estado === 'facturado' && line.aceptado) return { label: 'Facturado', tone: 'success' };
  if (line.aceptado && pending) return { label: 'Pendiente', tone: 'warning' };
  // Acceptance alone does not prove the treatment remains unperformed.
  if (line.aceptado) return { label: 'Aceptado', tone: 'success' };
  return { label: budget.estado === 'facturado' ? 'No aceptado' : 'Planificado', tone: 'neutral' };
}
export function parseBudgetTeeth(value: string): number[] | null {
  if (!value.trim()) return [];
  const parts = value.trim().split(/[\s,;]+/);
  if (parts.some(part => !/^(?:[1-4][1-8]|[5-8][1-5])$/.test(part))) return null;
  return [...new Set(parts.map(Number))];
}

export type BudgetLineDraft = {
  lineId?: string; revision?: number; treatmentId: string; treatmentName: string;
  query: string; teeth: string; faces: string; discount: string; price: string;
};
export const emptyBudgetDraft = (): BudgetLineDraft => ({ treatmentId: '', treatmentName: '', query: '', teeth: '', faces: '', discount: '0', price: '' });
export function draftFromLine(line: PresupuestoLinea, duplicate = false): BudgetLineDraft {
  return { ...(!duplicate ? { lineId: line.id, revision: line.revision } : {}), treatmentId: line.tratamiento_id,
    treatmentName: line.tratamiento?.nombre ?? 'Tratamiento', query: line.tratamiento?.nombre ?? '',
    teeth: duplicate ? '' : String(line.pieza_dental ?? ''), faces: line.caras ?? '', discount: String(line.descuento_porcentaje), price: String(line.precio_unitario) };
}
export function validateBudgetDraft(draft: BudgetLineDraft) {
  const teeth = parseBudgetTeeth(draft.teeth);
  if (!draft.treatmentId) return 'Selecciona un tratamiento del buscador o del catálogo.';
  if (teeth === null) return 'Introduce piezas FDI válidas, separadas por comas (por ejemplo, 16, 17).';
  if (draft.lineId && teeth.length > 1) return 'Una línea corresponde a una pieza. Duplica la línea para añadir otra.';
  if (!draft.price.trim() || !Number.isFinite(Number(draft.price)) || Number(draft.price) < 0) return 'Introduce un precio igual o mayor que cero.';
  if (!draft.discount.trim() || !Number.isFinite(Number(draft.discount)) || Number(draft.discount) < 0 || Number(draft.discount) > 100) return 'El descuento debe estar entre 0 y 100 %.';
  if (draft.faces.length > 10 || /[^MODVBLPIRC]/.test(draft.faces)) return 'Revisa las caras: M, O, D, V, B, L, P, I, R o C.';
  return null;
}
