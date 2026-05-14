import type { Arch, SurfaceKey, ToothData } from '../types/odontogram.types';
import { ToothOclusalSvg } from './ToothOclusalSvg';

type OclusalArchProps = {
  arch: Arch;
  toothNumbers: readonly string[];
  teeth: ToothData[];
  selectedToothNumber?: string;
  selectedSurface?: SurfaceKey;
  onSelectSurface: (toothNumber: string, surface: SurfaceKey) => void;
  onOpenQuickTreatment: (toothNumber: string, surface?: SurfaceKey) => void;
  onOpenContextMenu: (toothNumber: string, surface: SurfaceKey | undefined, x: number, y: number) => void;
};

export function OclusalArch({
  arch,
  toothNumbers,
  teeth,
  selectedToothNumber,
  selectedSurface,
  onSelectSurface,
  onOpenQuickTreatment,
  onOpenContextMenu,
}: OclusalArchProps) {
  return (
    <div className={`od-occlusal-row od-occlusal-row-${arch}`} aria-label={`Caras oclusales ${arch === 'upper' ? 'superiores' : 'inferiores'}`}>
      {toothNumbers.map((toothNumber, index) => {
        const tooth = teeth.find((item) => item.number === toothNumber);
        if (!tooth) return null;
        const primarySurface = tooth.type === 'incisor' || tooth.type === 'canine' ? 'incisal' : 'occlusal';

        return (
          <button
            key={tooth.number}
            className={`od-occlusal-cell od-tooth-type-${tooth.type} ${index === 8 ? 'has-gap' : ''}`}
            type="button"
            aria-label={`Seleccionar cara oclusal de pieza ${tooth.number}`}
            onClick={() => onSelectSurface(tooth.number, primarySurface)}
            onDoubleClick={() => onOpenQuickTreatment(tooth.number, primarySurface)}
            onContextMenu={(event) => {
              event.preventDefault();
              onOpenContextMenu(tooth.number, primarySurface, event.clientX, event.clientY);
            }}
          >
            <ToothOclusalSvg
              toothNumber={tooth.number}
              toothType={tooth.type}
              arch={tooth.arch}
              selected={selectedToothNumber === tooth.number}
              selectedSurface={selectedToothNumber === tooth.number ? selectedSurface : undefined}
              surfaces={tooth.surfaces}
              status={tooth.status}
              assetUrl={tooth.occlusalAssetUrl}
              onSelectSurface={onSelectSurface}
              onOpenQuickTreatment={onOpenQuickTreatment}
              onOpenContextMenu={onOpenContextMenu}
            />
          </button>
        );
      })}
    </div>
  );
}
