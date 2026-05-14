import type { SurfaceKey, ToothData, ToothStatus } from '../types/odontogram.types';
import { statusConfig } from '../data/statusConfig';
import { getPrimarySurface } from '../data/toothMap';

type ToothSurfaceSelectorProps = {
  tooth: ToothData;
  selectedSurface?: SurfaceKey;
  onSelectSurface: (surface: SurfaceKey) => void;
};

type SurfaceOption = {
  key: SurfaceKey;
  label: string;
  title: string;
};

function getOptions(tooth: ToothData): SurfaceOption[] {
  const lingualKey: SurfaceKey = tooth.arch === 'upper' ? 'palatal' : 'lingual';
  return [
    { key: 'vestibular', label: 'V', title: 'Vestibular / bucal' },
    { key: 'mesial', label: 'M', title: 'Mesial' },
    { key: getPrimarySurface(tooth.type), label: tooth.type === 'incisor' || tooth.type === 'canine' ? 'I' : 'O', title: 'Oclusal / incisal' },
    { key: 'distal', label: 'D', title: 'Distal' },
    { key: lingualKey, label: tooth.arch === 'upper' ? 'P' : 'L', title: 'Lingual / palatina' },
    { key: 'root', label: 'R', title: 'Raíz' },
  ];
}

function getSurfaceStatus(tooth: ToothData, surface: SurfaceKey): ToothStatus {
  return tooth.surfaces[surface] ?? 'healthy';
}

export function ToothSurfaceSelector({ tooth, selectedSurface, onSelectSurface }: ToothSurfaceSelectorProps) {
  return (
    <div className="od-surface-selector" aria-label="Selector de superficies">
      {getOptions(tooth).map((option) => {
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
            } as React.CSSProperties}
          >
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
