import { useEffect, useState } from 'react';
import type { SurfaceKey, ToothData } from '../types/odontogram.types';
import { quickTreatmentCatalog, type QuickTreatment } from '../data/treatmentCatalog';
import { TreatmentSelector } from '../../treatment-selection/TreatmentSelector';
import type { TreatmentOption } from '../../treatment-selection/treatmentSearch';

type QuickTreatmentModalProps = {
  tooth: ToothData;
  surface?: SurfaceKey;
  treatments?: QuickTreatment[];
  onClose: () => void;
  onSelectTreatment: (treatment: QuickTreatment) => void;
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

function describeQuickTreatment(item: QuickTreatment): TreatmentOption {
  return { id: item.id, name: item.name, code: item.code, category: item.category, price: item.price, keywords: item.keywords };
}

function getContextLabel(surface?: SurfaceKey) {
  if (!surface) return 'Pieza completa';
  return surfaceLabels[surface] ?? surface;
}

export function QuickTreatmentModal({ tooth, surface, treatments = quickTreatmentCatalog, onClose, onSelectTreatment }: QuickTreatmentModalProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="od-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="od-quick-modal" role="dialog" aria-modal="true" aria-labelledby="quick-treatment-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="od-quick-modal-heading">
          <div>
            <span>Tratamiento rápido</span>
            <h2 id="quick-treatment-title">Pieza {tooth.number}</h2>
            <p>{getContextLabel(surface)}</p>
          </div>
          <button className="od-modal-close" type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <TreatmentSelector items={treatments} describe={describeQuickTreatment} query={query} onQueryChange={setQuery}
          onSelect={onSelectTreatment} label="Buscar tratamiento" placeholder="Endodoncia, corona, obturación…" showPrice catalogInitiallyOpen autoFocus />
      </section>
    </div>
  );
}
