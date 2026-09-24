import type { Arch, SurfaceKey, ToothData } from '../types/odontogram.types';
import { dentalArches } from '../data/toothMap';
import { DentalArch } from './DentalArch';
import { OclusalArch } from './OclusalArch';

type ToothArchProps = {
  arch: Arch;
  teeth: ToothData[];
  selectedToothNumber?: string;
  selectedSurface?: SurfaceKey;
  onSelectTooth: (toothNumber: string) => void;
  onSelectSurface: (toothNumber: string, surface: SurfaceKey) => void;
  onOpenQuickTreatment: (toothNumber: string, surface?: SurfaceKey) => void;
  onOpenContextMenu: (toothNumber: string, surface: SurfaceKey | undefined, x: number, y: number) => void;
};

export function ToothArch({
  arch,
  teeth,
  selectedToothNumber,
  selectedSurface,
  onSelectTooth,
  onSelectSurface,
  onOpenQuickTreatment,
  onOpenContextMenu,
}: ToothArchProps) {
  const toothNumbers = dentalArches[arch];
  const dentalArch = (
    <DentalArch
      arch={arch}
      toothNumbers={toothNumbers}
      teeth={teeth}
      selectedToothNumber={selectedToothNumber}
      selectedSurface={selectedSurface}
      onSelectTooth={onSelectTooth}
      onSelectSurface={onSelectSurface}
      onOpenQuickTreatment={onOpenQuickTreatment}
      onOpenContextMenu={onOpenContextMenu}
    />
  );
  const occlusalArch = (
    <OclusalArch
      arch={arch}
      toothNumbers={toothNumbers}
      teeth={teeth}
      selectedToothNumber={selectedToothNumber}
      selectedSurface={selectedSurface}
      onSelectSurface={onSelectSurface}
      onOpenQuickTreatment={onOpenQuickTreatment}
      onOpenContextMenu={onOpenContextMenu}
    />
  );

  return (
    <div className={`od-arch-block od-arch-block-${arch}`}>
      <div className="od-arch-caption">{arch === 'upper' ? 'Arcada superior' : 'Arcada inferior'}</div>
      <div className="od-arch-stack">
        {arch === 'upper' ? (
          <>
            {occlusalArch}
            {dentalArch}
          </>
        ) : (
          <>
            {dentalArch}
            {occlusalArch}
          </>
        )}
      </div>
    </div>
  );
}
