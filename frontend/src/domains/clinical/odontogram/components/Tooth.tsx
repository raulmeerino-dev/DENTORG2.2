import type { SurfaceKey, ToothData } from '../types/odontogram.types';
import { ToothSvg } from './ToothSvg';

type ToothProps = {
  tooth: ToothData;
  selected: boolean;
  selectedSurface?: SurfaceKey;
  hasQuadrantGap?: boolean;
  onSelectTooth: (toothNumber: string) => void;
  onSelectSurface: (toothNumber: string, surface: SurfaceKey) => void;
  onOpenQuickTreatment: (toothNumber: string, surface?: SurfaceKey) => void;
  onOpenContextMenu: (toothNumber: string, surface: SurfaceKey | undefined, x: number, y: number) => void;
};

export function Tooth({
  tooth,
  selected,
  selectedSurface,
  hasQuadrantGap,
  onSelectTooth,
  onSelectSurface,
  onOpenQuickTreatment,
  onOpenContextMenu,
}: ToothProps) {
  return (
    <button
      className={`od-tooth od-tooth-${tooth.arch} od-tooth-type-${tooth.type} ${selected ? 'is-selected' : ''} ${hasQuadrantGap ? 'has-gap' : ''}`}
      type="button"
      onClick={() => onSelectTooth(tooth.number)}
      onDoubleClick={() => onOpenQuickTreatment(tooth.number)}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenContextMenu(tooth.number, undefined, event.clientX, event.clientY);
      }}
      aria-pressed={selected}
      aria-label={`Seleccionar pieza ${tooth.number}`}
    >
      <ToothSvg
        toothNumber={tooth.number}
        toothType={tooth.type}
        arch={tooth.arch}
        side={tooth.side}
        selected={selected}
        selectedSurface={selectedSurface}
        surfaces={tooth.surfaces}
        status={tooth.status}
        assetUrl={tooth.visualAssetUrl}
        onSelectTooth={onSelectTooth}
        onSelectSurface={onSelectSurface}
        onOpenQuickTreatment={onOpenQuickTreatment}
        onOpenContextMenu={onOpenContextMenu}
      />
    </button>
  );
}
