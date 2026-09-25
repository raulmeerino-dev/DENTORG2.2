import type { Presupuesto, PresupuestoLinea, TrabajoPendiente } from '../../api/types';

export type PendingTreatment = {
  trabajo?: TrabajoPendiente;
  linea: PresupuestoLinea;
  presupuesto?: Presupuesto;
};

/** Accepted legacy lines are actionable even before their work record is materialized. */
export function pendingTreatments(budgets: Presupuesto[], work: TrabajoPendiente[]): PendingTreatment[] {
  const known = new Set(work.map((item) => item.presupuesto_linea_id));
  const rows: PendingTreatment[] = work
    .filter((item) => !item.realizado)
    .map((trabajo) => ({
      trabajo,
      linea: trabajo.presupuesto_linea,
      presupuesto: budgets.find((budget) => budget.id === trabajo.presupuesto_linea.presupuesto_id),
    }));
  for (const presupuesto of budgets) {
    if (presupuesto.estado === 'rechazado') continue;
    for (const linea of presupuesto.lineas) {
      if (linea.aceptado && !linea.pasado_trabajo_pendiente && !known.has(linea.id)) {
        rows.push({ linea, presupuesto });
      }
    }
  }
  return rows;
}
