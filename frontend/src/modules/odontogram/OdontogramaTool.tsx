import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOdontogramaContexto } from '../../lib/api';
import { fullName } from '../../lib/utils';
import type { ApiPaciente, OdontogramaContextMode, TratamientoCatalogo, UserRole } from '../../types/api';
import { Odontogram } from './components/Odontogram';
import { OdontogramaContextActions } from './components/OdontogramaContextActions';
import { treatmentCatalogToQuickTreatments } from './adapters/budgetAdapter';
import { getAvailableActions, type OdontogramaAction } from './utils/actions';
import { buildOdontogramaViewModel, mapToolModeToOdontogramMode } from './utils/viewModel';
import type {
  OdontogramChange,
  OdontogramaToolMode,
  ToothData,
  ToothSelection,
  Treatment,
} from './types/odontogram.types';

type OdontogramaToolProps = {
  paciente: ApiPaciente | null;
  mode: OdontogramaToolMode;
  contextId?: string | null;
  tratamientos?: TratamientoCatalogo[];
  data?: ToothData[];
  title?: string;
  subtitle?: string;
  totalBudget?: number;
  readOnly?: boolean;
  enableQuickTreatments?: boolean;
  onAction?: (action: OdontogramaAction, payload: Record<string, unknown>) => void;
  onChange?: (nextData: ToothData[], change: OdontogramChange) => void;
  onAddTreatment?: (treatment: Treatment, selection: ToothSelection, nextData: ToothData[]) => void;
  userRole?: UserRole | null;
};

const modeText: Record<OdontogramaToolMode, { title: string; subtitle: string }> = {
  diagnostico: {
    title: 'Odontograma diagnóstico',
    subtitle: 'Diagnóstico actual por pieza y superficie. No muestra acciones económicas.',
  },
  presupuesto: {
    title: 'Odontograma del presupuesto',
    subtitle: 'Propuesta clínica y económica de este presupuesto. No modifica el estado actual.',
  },
  pendiente: {
    title: 'Tratamientos pendientes',
    subtitle: 'Tratamientos aceptados pendientes de realizar, por pieza y superficie.',
  },
  realizado: {
    title: 'Tratamientos realizados',
    subtitle: 'Tratamientos completados y estado clínico actualizado.',
  },
  historial: {
    title: 'Historial odontológico',
    subtitle: 'Consulta temporal por pieza. Vista de lectura.',
  },
  documentos: {
    title: 'Documentos vinculados',
    subtitle: 'Radiografías, fotos y consentimientos asociados a piezas o superficies.',
  },
  lectura: {
    title: 'Odontograma actual',
    subtitle: 'Resumen clínico del paciente. Vista sin edición.',
  },
};

export function OdontogramaTool({
  paciente,
  mode,
  contextId,
  tratamientos = [],
  data,
  title,
  subtitle,
  totalBudget,
  readOnly,
  enableQuickTreatments,
  onAction,
  onChange,
  onAddTreatment,
  userRole,
}: OdontogramaToolProps) {
  const contextQuery = useQuery({
    queryKey: ['odontograma-contexto', paciente?.id, mode, contextId],
    queryFn: () => getOdontogramaContexto(paciente!.id, mode as OdontogramaContextMode, contextId),
    enabled: Boolean(paciente?.id) && !data,
    staleTime: 30_000,
  });

  const viewData = useMemo(
    () => data ?? buildOdontogramaViewModel(contextQuery.data, mode),
    [contextQuery.data, data, mode],
  );
  const quickTreatments = useMemo(() => treatmentCatalogToQuickTreatments(tratamientos), [tratamientos]);
  const role = userRole ?? undefined;
  const canEditDiagnosis = role === 'admin' || role === 'doctor';
  const canEditBudget = role === 'admin' || role === 'doctor' || role === 'recepcion';
  const canSchedule = role === 'admin' || role === 'doctor' || role === 'recepcion' || role === 'auxiliar';
  const canCompleteTreatment = role === 'admin' || role === 'doctor';
  const canAttachDocument = role === 'admin' || role === 'doctor' || role === 'auxiliar';
  const canViewBilling = role === 'admin' || role === 'recepcion';
  const actions = getAvailableActions(mode, {
    canEdit: readOnly !== true && (mode === 'diagnostico' ? canEditDiagnosis : canEditBudget),
    canSchedule,
    canCompleteTreatment,
    canAttachDocument,
    canViewBilling,
  });
  const odontogramMode = mapToolModeToOdontogramMode(mode);
  const forcedReadOnly = readOnly ?? mode === 'lectura';
  const quickTreatmentsEnabled = enableQuickTreatments ?? mode === 'presupuesto';

  if (!paciente) {
    return (
      <section className="desk-panel odontogram-flow-panel">
        <div className="panel-caption">
          <strong>Odontograma</strong>
          <span>Seleccione un paciente para ver el mapa clínico.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="odontogram-flow-panel" data-odontogram-mode={mode}>
      <Odontogram
        mode={odontogramMode}
        patientId={paciente.id}
        budgetId={contextId ?? undefined}
        data={viewData}
        patientName={fullName(paciente)}
        title={title ?? modeText[mode].title}
        subtitle={subtitle ?? modeText[mode].subtitle}
        totalBudget={totalBudget}
        readOnly={forcedReadOnly}
        enableQuickTreatments={quickTreatmentsEnabled && !forcedReadOnly}
        quickTreatments={quickTreatments}
        onChange={onChange}
        onAddTreatment={onAddTreatment}
        onSelectTooth={(selection, tooth) => {
          onAction?.('filtrar_pieza', { selection, tooth, mode, actions });
        }}
      />
      {contextQuery.isLoading && <div className="odontogram-flow-status">Cargando capa {mode}...</div>}
      {contextQuery.isError && <div className="odontogram-flow-status error">No se pudo cargar la capa {mode}.</div>}
      <OdontogramaContextActions
        actions={actions}
        mode={mode}
        paciente={paciente}
        contextId={contextId}
        onAction={onAction}
      />
    </section>
  );
}
