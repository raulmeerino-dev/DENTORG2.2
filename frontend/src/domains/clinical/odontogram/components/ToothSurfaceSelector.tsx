import type { SurfaceKey, ToothData } from '../types/odontogram.types';
import { SurfaceMiniMap } from './SurfaceMiniMap';

type ToothSurfaceSelectorProps = {
  tooth: ToothData;
  selectedSurface?: SurfaceKey;
  onSelectSurface: (surface: SurfaceKey) => void;
};

export function ToothSurfaceSelector({ tooth, selectedSurface, onSelectSurface }: ToothSurfaceSelectorProps) {
  return <SurfaceMiniMap tooth={tooth} selectedSurface={selectedSurface} onSelectSurface={onSelectSurface} />;
}
