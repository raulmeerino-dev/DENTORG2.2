import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addPresupuestoLinea } from '../../../api/treatmentPlans';
import { getOdontogramaPaciente, saveOdontograma } from '../../../api/odontogram';
import { invalidatePatientWorkspaceQueries } from '../../../shared/query/queryInvalidation';
import type { ApiPaciente, Presupuesto, TratamientoCatalogo, UserRole } from '../../../api/types';
import { odontogramaBackendToVisual } from './adapters/backendAdapter';
import {
  budgetToVisualOdontogram,
  createBudgetSnapshotFromVisual,
  hasBudgetLineForSelection,
  visualSelectionToBudgetLine,
} from './adapters/budgetAdapter';
import { OdontogramaTool } from './OdontogramaTool';
import type { OdontogramChange, ToothData, Treatment, ToothSelection } from './types/odontogram.types';

type BudgetOdontogramFlowProps = {
  paciente: ApiPaciente;
  presupuesto: Presupuesto;
  tratamientos: TratamientoCatalogo[];
  userRole?: UserRole | null;
};

export function BudgetOdontogramFlow({ paciente, presupuesto, tratamientos, userRole }: BudgetOdontogramFlowProps) {
  const queryClient = useQueryClient();
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const canUseClinicalOdontogram = userRole === 'admin' || userRole === 'doctor' || userRole === 'auxiliar';
  const odontogramaQuery = useQuery({
    queryKey: ['patient-odontogram-flow', paciente.id],
    queryFn: () => getOdontogramaPaciente(paciente.id),
    staleTime: 30_000,
    enabled: canUseClinicalOdontogram,
  });

  const baseData = useMemo(() => odontogramaBackendToVisual(odontogramaQuery.data), [odontogramaQuery.data]);
  const visualData = useMemo(() => budgetToVisualOdontogram(presupuesto, baseData), [baseData, presupuesto]);
  const totalBudget = presupuesto.lineas.reduce((sum, linea) => sum + Number(linea.importe_neto || 0), 0);

  const addTreatmentMutation = useMutation({
    mutationFn: async ({ change }: { change: OdontogramChange; nextData: ToothData[] }) => {
      const payload = visualSelectionToBudgetLine(change);
      if (!payload) return null;
      const line = await addPresupuestoLinea(presupuesto.id, payload);
      const snapshot = createBudgetSnapshotFromVisual(budgetToVisualOdontogram({ ...presupuesto, lineas: [...presupuesto.lineas, line] }, baseData));
      if (payload.pieza_dental && snapshot.teeth?.[String(payload.pieza_dental)]) {
        snapshot.teeth[String(payload.pieza_dental)].lineaId = line.id;
      }
      try { await saveOdontograma(presupuesto.id, snapshot); }
      catch { setDuplicateNotice('Línea guardada. No se pudo actualizar la vista previa del documento; las piezas del presupuesto se conservan.'); }
      return payload;
    },
    onSettled: () => {
      invalidatePatientWorkspaceQueries(queryClient, paciente.id);
    },
  });

  function handleAddTreatment(_treatment: Treatment, _selection: ToothSelection, nextData: ToothData[]) {
    if (hasBudgetLineForSelection(presupuesto, _treatment, _selection)) {
      setDuplicateNotice('Ese tratamiento ya esta en el presupuesto para esa pieza/superficie.');
      return;
    }

    setDuplicateNotice(null);
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
      {canUseClinicalOdontogram ? (
        <OdontogramaTool
          mode="presupuesto"
          paciente={paciente}
          contextId={presupuesto.id}
          data={visualData}
          title="Odontograma del presupuesto"
          subtitle="Seleccione pieza/superficie y doble clic para añadir tratamiento propuesto. No modifica el odontograma actual."
          totalBudget={totalBudget}
          readOnly={addTreatmentMutation.isPending || ['aceptado', 'rechazado', 'facturado'].includes(presupuesto.estado)}
          enableQuickTreatments
          tratamientos={tratamientos}
          userRole={userRole}
          onAddTreatment={handleAddTreatment}
        />
      ) : (
        <div className="budget-clinical-restricted" role="note">
          <strong>Odontograma reservado a clínica</strong>
          <span>Recepción puede gestionar el presupuesto desde las líneas y acciones superiores.</span>
        </div>
      )}
      {addTreatmentMutation.isPending && <div className="odontogram-flow-status">Añadiendo línea...</div>}
      {addTreatmentMutation.isError && <div className="odontogram-flow-status error">No se pudo crear la línea.</div>}
      {duplicateNotice && <div className="odontogram-flow-status">{duplicateNotice}</div>}
    </section>
  );
}
