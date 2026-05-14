import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addPresupuestoLinea, getOdontogramaPaciente, saveOdontograma } from '../../lib/api';
import type { ApiPaciente, Presupuesto, TratamientoCatalogo } from '../../types/api';
import { odontogramaBackendToVisual } from './adapters/backendAdapter';
import {
  budgetToVisualOdontogram,
  createBudgetSnapshotFromVisual,
  visualSelectionToBudgetLine,
} from './adapters/budgetAdapter';
import { OdontogramaTool } from './OdontogramaTool';
import type { OdontogramChange, ToothData, Treatment, ToothSelection } from './types/odontogram.types';

type BudgetOdontogramFlowProps = {
  paciente: ApiPaciente;
  presupuesto: Presupuesto;
  tratamientos: TratamientoCatalogo[];
};

export function BudgetOdontogramFlow({ paciente, presupuesto, tratamientos }: BudgetOdontogramFlowProps) {
  const queryClient = useQueryClient();
  const odontogramaQuery = useQuery({
    queryKey: ['patient-odontogram-flow', paciente.id],
    queryFn: () => getOdontogramaPaciente(paciente.id),
    staleTime: 30_000,
  });

  const baseData = useMemo(() => odontogramaBackendToVisual(odontogramaQuery.data), [odontogramaQuery.data]);
  const visualData = useMemo(() => budgetToVisualOdontogram(presupuesto, baseData), [baseData, presupuesto]);
  const totalBudget = presupuesto.lineas.reduce((sum, linea) => sum + Number(linea.importe_neto || 0), 0);

  const addTreatmentMutation = useMutation({
    mutationFn: async ({ change, nextData }: { change: OdontogramChange; nextData: ToothData[] }) => {
      const payload = visualSelectionToBudgetLine(change);
      if (!payload) return null;
      await addPresupuestoLinea(presupuesto.id, payload);
      await saveOdontograma(presupuesto.id, createBudgetSnapshotFromVisual(nextData));
      return payload;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['presupuestos', paciente.id] });
    },
  });

  function handleAddTreatment(_treatment: Treatment, _selection: ToothSelection, nextData: ToothData[]) {
    const lastTooth = nextData.find((tooth) => tooth.plannedTreatments?.some((item) => item.id === _treatment.id));
    const surface = _selection.surface ?? _treatment.surface;
    addTreatmentMutation.mutate({
      nextData,
      change: {
        type: 'add_treatment',
        toothNumber: _selection.toothNumber || lastTooth?.number || '',
        surface,
        treatment: _treatment,
        status: 'pending',
      },
    });
  }

  return (
    <section className="odontogram-flow-panel budget-odontogram-flow">
      <OdontogramaTool
        mode="presupuesto"
        paciente={paciente}
        contextId={presupuesto.id}
        data={visualData}
        title="Odontograma del presupuesto"
        subtitle="Seleccione pieza/superficie y doble clic para anadir tratamiento propuesto. No modifica el odontograma actual."
        totalBudget={totalBudget}
        readOnly={addTreatmentMutation.isPending}
        enableQuickTreatments
        tratamientos={tratamientos}
        onAddTreatment={handleAddTreatment}
      />
      {addTreatmentMutation.isPending && <div className="odontogram-flow-status">Anadiendo linea...</div>}
      {addTreatmentMutation.isError && <div className="odontogram-flow-status error">No se pudo crear la linea.</div>}
    </section>
  );
}
