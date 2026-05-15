import type { ApiPaciente } from '../../../types/api';
import type { OdontogramaAction } from '../utils/actions';
import { odontogramaActionLabels } from '../utils/actions';
import type { OdontogramaToolMode } from '../types/odontogram.types';

type OdontogramaContextActionsProps = {
  actions: OdontogramaAction[];
  mode: OdontogramaToolMode;
  paciente: ApiPaciente;
  contextId?: string | null;
  onAction?: (action: OdontogramaAction, payload: Record<string, unknown>) => void;
};

export function OdontogramaContextActions({
  actions,
  mode,
  paciente,
  contextId,
  onAction,
}: OdontogramaContextActionsProps) {
  const visibleActions = actions.filter((action) => action !== 'filtrar_pieza');
  if (!visibleActions.length) return null;

  return (
    <div className="odontogram-context-actions" aria-label="Acciones del odontograma">
      {visibleActions.map((action) => (
        <button key={action} type="button" onClick={() => onAction?.(action, { mode, paciente, contextId })}>
          {odontogramaActionLabels[action]}
        </button>
      ))}
    </div>
  );
}
