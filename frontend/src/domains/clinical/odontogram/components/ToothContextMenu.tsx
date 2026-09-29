import type { SurfaceKey, ToothData } from '../types/odontogram.types';
import { FloatingPopover } from '../../../../design-system/FloatingPopover';

type ToothContextMenuProps = {
  tooth: ToothData;
  surface?: SurfaceKey;
  x: number;
  y: number;
  readOnly?: boolean;
  enableQuickTreatments?: boolean;
  onQuickTreatment: () => void;
  onMarkMissing: () => void;
  onClearTreatments: () => void;
  onViewHistory: () => void;
  onClose: () => void;
  prepareTreatmentLabel?: string;
  onPrepareTreatment?: () => void;
  onInspect?: () => void;
};

const surfaceLabels: Partial<Record<SurfaceKey, string>> = {
  vestibular: 'Vestibular',
  buccal: 'Bucal',
  mesial: 'Mesial',
  distal: 'Distal',
  palatal: 'Palatina',
  lingual: 'Lingual',
  occlusal: 'Oclusal',
  incisal: 'Incisal',
  crown: 'Corona',
  root: 'Raíz',
};

function contextLabel(surface?: SurfaceKey) {
  if (!surface) return 'Pieza completa';
  return surfaceLabels[surface] ?? surface;
}

export function ToothContextMenu({
  tooth,
  surface,
  x,
  y,
  readOnly = false,
  enableQuickTreatments = true,
  onQuickTreatment,
  onMarkMissing,
  onClearTreatments,
  onViewHistory,
  onClose,
  onPrepareTreatment,
  prepareTreatmentLabel = 'Añadir tratamiento propuesto',
  onInspect,
}: ToothContextMenuProps) {
  return (
      <FloatingPopover
        className="dc-object-menu"
        role="menu"
        aria-label={`Acciones de pieza ${tooth.number}`}
        point={{ x, y }}
        width={260}
        onClose={onClose}
        onContextMenu={(event) => event.preventDefault()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="od-context-menu-heading">
          <strong>Pieza {tooth.number}</strong>
          <span>{contextLabel(surface)}</span>
        </div>
        {onPrepareTreatment && <button type="button" role="menuitem" onClick={onPrepareTreatment}>{prepareTreatmentLabel}</button>}
        {onInspect && <button type="button" role="menuitem" onClick={onInspect}>Registrar hallazgo</button>}

        {enableQuickTreatments ? (
          <button type="button" role="menuitem" onClick={onQuickTreatment} disabled={readOnly}>
            Añadir tratamiento
          </button>
        ) : null}
        {!readOnly && <><button type="button" role="menuitem" onClick={onMarkMissing}>
          Marcar pieza ausente
        </button>
        <button type="button" role="menuitem" className="dc-menu-danger dc-menu-divider" onClick={onClearTreatments} disabled={Boolean(tooth.completedTreatments?.length)}>
          Eliminar tratamientos
        </button></>}
        <button type="button" role="menuitem" onClick={onViewHistory}>
          Ver historial de la pieza
        </button>
      </FloatingPopover>
  );
}
