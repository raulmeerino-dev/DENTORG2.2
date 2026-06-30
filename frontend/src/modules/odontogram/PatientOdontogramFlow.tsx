import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getOdontogramaPaciente,
  updateOdontogramaPieza,
  updateOdontogramaSuperficie,
} from '../../lib/api';
import { invalidatePatientWorkspaceQueries } from '../../lib/queryInvalidation';
import type { ApiPaciente, OdontogramaSurfaceName, UserRole } from '../../types/api';
import { odontogramaBackendToVisual, odontogramChangeToBackendPatch } from './adapters/backendAdapter';
import { OdontogramaTool } from './OdontogramaTool';
import { odontogramModeConfig } from './data/modeConfig';
import type { OdontogramChange, OdontogramMode, OdontogramaToolMode, ToothData, ToothSelection } from './types/odontogram.types';

type PatientOdontogramFlowProps = {
  paciente: ApiPaciente | null;
  mode: OdontogramMode;
  title?: string;
  subtitle?: string;
  readOnly?: boolean;
  enableQuickTreatments?: boolean;
  className?: string;
  userRole?: UserRole | null;
  onSelectDentalTarget?: (selection: ToothSelection, tooth: ToothData) => void;
};

const modeToToolMode: Record<OdontogramMode, OdontogramaToolMode> = {
  summary: 'lectura',
  initialVisit: 'diagnostico',
  diagnosis: 'diagnostico',
  budget: 'presupuesto',
  pending: 'pendiente',
  completed: 'realizado',
  current: 'lectura',
  history: 'historial',
  documents: 'documentos',
  reading: 'lectura',
};

export function PatientOdontogramFlow({
  paciente,
  mode,
  title,
  subtitle,
  readOnly,
  enableQuickTreatments,
  className,
  userRole,
  onSelectDentalTarget,
}: PatientOdontogramFlowProps) {
  const modeConfig = odontogramModeConfig[mode];
  const toolMode = modeToToolMode[mode];
  const usesDirectBaseData = toolMode === 'diagnostico';
  const effectiveReadOnly = readOnly ?? modeConfig.readOnly;
  const effectiveQuickTreatments = enableQuickTreatments ?? modeConfig.quickTreatments;
  const queryClient = useQueryClient();
  const odontogramaQuery = useQuery({
    queryKey: ['patient-odontogram-flow', paciente?.id],
    queryFn: () => getOdontogramaPaciente(paciente!.id),
    enabled: Boolean(paciente?.id) && usesDirectBaseData,
    staleTime: 30_000,
  });

  const visualData = useMemo(
    () => odontogramaBackendToVisual(odontogramaQuery.data),
    [odontogramaQuery.data],
  );

  const updateMutation = useMutation({
    mutationFn: async (change: OdontogramChange) => {
      if (!odontogramaQuery.data) throw new Error('Odontograma no disponible');
      const patch = odontogramChangeToBackendPatch(change);
      if (!patch) return null;
      if ('superficie' in patch) {
        const { piezaFdi, superficie, ...payload } = patch;
        return updateOdontogramaSuperficie(
          odontogramaQuery.data.id,
          piezaFdi,
          superficie as OdontogramaSurfaceName,
          payload,
        );
      }
      const { piezaFdi, ...payload } = patch;
      return updateOdontogramaPieza(odontogramaQuery.data.id, piezaFdi, payload);
    },
    onSuccess: () => {
      if (paciente?.id) invalidatePatientWorkspaceQueries(queryClient, paciente.id);
    },
  });

  if (!paciente) {
    return (
      <section className="desk-panel odontogram-flow-panel">
        <div className="panel-caption">
          <strong>Odontograma</strong>
          <span>Seleccione un paciente para ver el mapa clinico.</span>
        </div>
      </section>
    );
  }

  return (
    <section className={`odontogram-flow-panel ${className ?? ''}`}>
      <OdontogramaTool
        mode={toolMode}
        paciente={paciente}
        data={usesDirectBaseData ? visualData : undefined}
        title={title}
        subtitle={subtitle ?? `Historia ${paciente.num_historial} - odontograma clinico compartido`}
        totalBudget={0}
        readOnly={effectiveReadOnly || updateMutation.isPending}
        enableQuickTreatments={effectiveQuickTreatments && !effectiveReadOnly}
        userRole={userRole}
        onChange={(_, change) => {
          if (!effectiveReadOnly && usesDirectBaseData) updateMutation.mutate(change);
        }}
        onAction={(action, payload) => {
          if (action !== 'filtrar_pieza') return;
          const selection = payload.selection as ToothSelection | undefined;
          const tooth = payload.tooth as ToothData | undefined;
          if (selection && tooth) onSelectDentalTarget?.(selection, tooth);
        }}
      />
      {usesDirectBaseData && odontogramaQuery.isLoading && <div className="odontogram-flow-status">Cargando odontograma...</div>}
      {usesDirectBaseData && odontogramaQuery.isError && <div className="odontogram-flow-status error">No se pudo cargar el odontograma.</div>}
    </section>
  );
}
