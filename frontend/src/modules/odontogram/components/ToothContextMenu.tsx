import type { SurfaceKey, ToothData } from '../types/odontogram.types';

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
}: ToothContextMenuProps) {
  return (
    <div className="od-context-scrim" role="presentation" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div
        className="od-context-menu"
        role="menu"
        aria-label={`Acciones de pieza ${tooth.number}`}
        style={{ left: x, top: y }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="od-context-menu-heading">
          <strong>Pieza {tooth.number}</strong>
          <span>{contextLabel(surface)}</span>
        </div>

        {enableQuickTreatments ? (
          <button type="button" role="menuitem" onClick={onQuickTreatment} disabled={readOnly}>
            Añadir tratamiento
          </button>
        ) : null}
        <button type="button" role="menuitem" onClick={onMarkMissing} disabled={readOnly}>
          Eliminar pieza / ausente
        </button>
        <button type="button" role="menuitem" onClick={onClearTreatments} disabled={readOnly}>
          Eliminar tratamientos
        </button>
        <button type="button" role="menuitem" onClick={onViewHistory}>
          Ver historial de la pieza
        </button>
      </div>
    </div>
  );
}
