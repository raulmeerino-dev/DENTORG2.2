import type { CSSProperties } from 'react';
import type { SurfaceKey, ToothData } from '../types/odontogram.types';
import { statusConfig } from '../data/statusConfig';
import { getSurfaceOptions, getSurfaceStatus } from '../utils/surfaceOptions';

type SurfaceMiniMapProps = {
  tooth: ToothData;
  selectedSurface?: SurfaceKey;
  onSelectSurface: (surface: SurfaceKey) => void;
};

export function SurfaceMiniMap({ tooth, selectedSurface, onSelectSurface }: SurfaceMiniMapProps) {
  return (
    <div className="od-surface-selector" aria-label="Selector de superficies">
      {getSurfaceOptions(tooth).map((option) => {
        const status = getSurfaceStatus(tooth, option.key);
        return (
          <button
            key={option.key}
            type="button"
            className={`od-surface-button ${selectedSurface === option.key ? 'is-selected' : ''}`}
            onClick={() => onSelectSurface(option.key)}
            title={option.title}
            style={{
              '--surface-color': statusConfig[status].color,
              '--surface-bg': statusConfig[status].softColor,
            } as CSSProperties}
          >
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
