import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { invalidatePatientWorkspaceQueries } from './queryInvalidation';

describe('invalidatePatientWorkspaceQueries', () => {
  it('invalida presupuesto, odontograma, facturacion y vistas operativas relacionadas', () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    invalidatePatientWorkspaceQueries(queryClient, 'pac-1');

    expect(spy).toHaveBeenCalledWith({ queryKey: ['presupuestos', 'pac-1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['odontograma-contexto', 'pac-1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['facturas', 'pac-1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['saldo-paciente', 'pac-1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['caja-facturas'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['dashboard-bi'] });
  });
});
