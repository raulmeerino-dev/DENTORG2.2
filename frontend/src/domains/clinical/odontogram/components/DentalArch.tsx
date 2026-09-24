import type { Arch, SurfaceKey, ToothData } from '../types/odontogram.types';
import { Tooth } from './Tooth';

type DentalArchProps = {
  arch: Arch;
  toothNumbers: readonly string[];
  teeth: ToothData[];
  selectedToothNumber?: string;
  selectedSurface?: SurfaceKey;
  onSelectTooth: (toothNumber: string) => void;
  onSelectSurface: (toothNumber: string, surface: SurfaceKey) => void;
  onOpenQuickTreatment: (toothNumber: string, surface?: SurfaceKey) => void;
  onOpenContextMenu: (toothNumber: string, surface: SurfaceKey | undefined, x: number, y: number) => void;
};

export function DentalArch({
  arch,
  toothNumbers,
  teeth,
  selectedToothNumber,
  selectedSurface,
  onSelectTooth,
  onSelectSurface,
  onOpenQuickTreatment,
  onOpenContextMenu,
}: DentalArchProps) {
  const numberRow = (
    <div className={`od-number-row od-number-row-${arch}`} aria-label={`Numeración ${arch === 'upper' ? 'superior' : 'inferior'}`}>
      {toothNumbers.map((toothNumber, index) => (
        <button
          key={toothNumber}
          className={`od-tooth-number-button ${selectedToothNumber === toothNumber ? 'is-selected' : ''} ${index === 8 ? 'has-gap' : ''}`}
          type="button"
          onClick={() => onSelectTooth(toothNumber)}
          onContextMenu={(event) => {
            event.preventDefault();
            onOpenContextMenu(toothNumber, undefined, event.clientX, event.clientY);
          }}
        >
          {toothNumber}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`od-arch od-arch-${arch}`} aria-label={arch === 'upper' ? 'Arcada superior' : 'Arcada inferior'}>
      {arch === 'upper' ? numberRow : null}
      <div className="od-teeth-row">
        {toothNumbers.map((toothNumber, index) => {
          const tooth = teeth.find((item) => item.number === toothNumber);
          if (!tooth) return null;

          return (
            <Tooth
              key={tooth.number}
              tooth={tooth}
              selected={selectedToothNumber === tooth.number}
              selectedSurface={selectedToothNumber === tooth.number ? selectedSurface : undefined}
              hasQuadrantGap={index === 8}
              onSelectTooth={onSelectTooth}
              onSelectSurface={onSelectSurface}
              onOpenQuickTreatment={onOpenQuickTreatment}
              onOpenContextMenu={onOpenContextMenu}
            />
          );
        })}
      </div>
      {arch === 'lower' ? numberRow : null}
    </div>
  );
}
