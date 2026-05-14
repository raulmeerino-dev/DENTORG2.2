import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getOdontogramaPaciente,
  updateOdontogramaPieza,
  updateOdontogramaSuperficie,
} from '../../lib/api';
import { fullName } from '../../lib/utils';
import type { ApiPaciente, OdontogramaSurfaceName } from '../../types/api';
import { odontogramaBackendToVisual, odontogramChangeToBackendPatch } from './adapters/backendAdapter';
import { Odontogram } from './components/Odontogram';
import { odontogramModeConfig } from './data/modeConfig';
import type { OdontogramChange, OdontogramMode } from './types/odontogram.types';

type PatientOdontogramFlowProps = {
  paciente: ApiPaciente | null;
  mode: OdontogramMode;
  title?: string;
  subtitle?: string;
  readOnly?: boolean;
  enableQuickTreatments?: boolean;
  className?: string;
};

export function PatientOdontogramFlow({
  paciente,
  mode,
  title,
  subtitle,
  readOnly,
  enableQuickTreatments,
  className,
}: PatientOdontogramFlowProps) {
  const modeConfig = odontogramModeConfig[mode];
  const effectiveReadOnly = readOnly ?? modeConfig.readOnly;
  const effectiveQuickTreatments = enableQuickTreatments ?? modeConfig.quickTreatments;
  const queryClient = useQueryClient();
  const odontogramaQuery = useQuery({
    queryKey: ['patient-odontogram-flow', paciente?.id],
    queryFn: () => getOdontogramaPaciente(paciente!.id),
    enabled: Boolean(paciente?.id),
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
      void queryClient.invalidateQueries({ queryKey: ['patient-odontogram-flow', paciente?.id] });
      if (paciente?.id) void queryClient.invalidateQueries({ queryKey: ['odontograma-paciente', paciente.id] });
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
      <Odontogram
        mode={mode}
        patientId={paciente.id}
        data={visualData}
        patientName={fullName(paciente)}
        title={title}
        subtitle={subtitle ?? `Historia ${paciente.num_historial} - odontograma clinico compartido`}
        totalBudget={0}
        readOnly={effectiveReadOnly || updateMutation.isPending}
        enableQuickTreatments={effectiveQuickTreatments && !effectiveReadOnly}
        onChange={(_, change) => {
          if (!effectiveReadOnly) updateMutation.mutate(change);
        }}
      />
      {odontogramaQuery.isLoading && <div className="odontogram-flow-status">Cargando odontograma...</div>}
      {odontogramaQuery.isError && <div className="odontogram-flow-status error">No se pudo cargar el odontograma.</div>}
    </section>
  );
}
