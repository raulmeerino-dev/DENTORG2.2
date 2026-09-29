import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Presupuesto, PresupuestoLinea } from '../../api/types';
import { aceptarPresupuesto, addPresupuestoLinea, convertirPresupuestoFactura, createPresupuesto, deletePresupuestoLinea, presentarPresupuesto, rechazarPresupuesto, updatePresupuestoLinea } from '../../api/treatmentPlans';
import { getApiErrorMessage } from '../../api/errors';
import { invalidatePatientWorkspaceQueries } from '../../shared/query/queryInvalidation';
import { budgetTotals } from './budgetView';

type LineInput = Parameters<typeof addPresupuestoLinea>[1];
export type BudgetAction =
  | { kind: 'add'; lines: LineInput[] }
  | { kind: 'edit'; id: string; patch: Parameters<typeof updatePresupuestoLinea>[2] }
  | { kind: 'delete'; id: string }
  | { kind: 'accept'; ids?: string[] }
  | { kind: 'reject'; reason: string }
  | { kind: 'present' | 'invoice' | 'duplicate' };
export class BudgetBatchError extends Error {
  remaining: LineInput[];
  saved: number;
  constructor(remaining: LineInput[], saved: number, cause: unknown) {
    super(`${saved ? `${saved} ${saved === 1 ? 'línea guardada' : 'líneas guardadas'}. ` : ''}${getApiErrorMessage(cause, 'No se pudo guardar la línea.')} Revisa las piezas restantes antes de reintentar.`);
    this.remaining = remaining;
    this.saved = saved;
  }
}

export function useBudgetMutations(budget: Presupuesto) {
  const client = useQueryClient();
  const key = ['presupuestos', budget.paciente_id];
  function cacheBudget(next: Presupuesto) {
    client.setQueryData<Presupuesto[]>(key, (current = []) => current.some(item => item.id === next.id)
      ? current.map(item => item.id === next.id ? next : item) : [next, ...current]);
  }
  function cacheLine(line?: PresupuestoLinea, deletedId?: string) {
    client.setQueryData<Presupuesto[]>(key, (current = [budget]) => current.map(item => {
      if (item.id !== budget.id) return item;
      const lineas = item.lineas.filter(entry => entry.id !== deletedId);
      const index = line ? lineas.findIndex(entry => entry.id === line.id) : -1;
      if (line && index >= 0) lineas[index] = line;
      else if (line) lineas.push(line);
      const next = { ...item, lineas };
      const totals = budgetTotals(next);
      return { ...next, total: String(totals.net), total_aceptado: String(totals.accepted) };
    }));
  }
  return useMutation({
    mutationFn: async (action: BudgetAction) => {
      // Keep confirmed responses visible immediately, then reconcile with the server.
      await client.cancelQueries({ queryKey: key });
      if (action.kind === 'add') {
        for (let index = 0; index < action.lines.length; index++) {
          try { cacheLine(await addPresupuestoLinea(budget.id, action.lines[index])); }
          catch (error) { throw new BudgetBatchError(action.lines.slice(index), index, error); }
        }
      } else if (action.kind === 'edit') cacheLine(await updatePresupuestoLinea(budget.id, action.id, action.patch));
      else if (action.kind === 'delete') { await deletePresupuestoLinea(budget.id, action.id); cacheLine(undefined, action.id); }
      else if (action.kind === 'invoice') await convertirPresupuestoFactura(budget.id);
      else {
        const next = action.kind === 'accept' ? await aceptarPresupuesto(budget.id, action.ids)
          : action.kind === 'present' ? await presentarPresupuesto(budget.id)
          : action.kind === 'reject' ? await rechazarPresupuesto(budget.id, action.reason || null)
          : await createPresupuesto(budget.paciente_id, budget.doctor_id, budget.lineas);
        cacheBudget(next);
        return next;
      }
    },
    onSettled: () => invalidatePatientWorkspaceQueries(client, budget.paciente_id),
  });
}
