import { useEffect, useMemo, useState } from 'react';
import type { SurfaceKey, ToothData } from '../types/odontogram.types';
import { quickTreatmentCatalog, type QuickTreatment } from '../data/treatmentCatalog';
import { statusConfig } from '../data/statusConfig';

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

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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

  const filteredTreatments = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    if (!normalizedQuery) return treatments;

    return treatments.filter((treatment) => {
      const haystack = normalize([treatment.name, treatment.category, ...treatment.keywords].join(' '));
      return haystack.includes(normalizedQuery);
    });
  }, [query, treatments]);

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

        <label className="od-quick-search-label" htmlFor="quick-treatment-search">
          Buscar tratamiento
        </label>
        <input
          id="quick-treatment-search"
          className="od-quick-search"
          type="search"
          autoFocus
          value={query}
          placeholder="Endodoncia, corona, obturación..."
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="od-quick-results" role="listbox" aria-label="Resultados de tratamientos">
          {filteredTreatments.map((treatment) => (
            <button key={treatment.id} className="od-quick-result" type="button" onClick={() => onSelectTreatment(treatment)}>
              <span className="od-quick-status-dot" style={{ background: statusConfig[treatment.status].color }} />
              <span>
                <strong>{treatment.name}</strong>
                <small>{treatment.category}</small>
              </span>
              <em>{treatment.price ? `${treatment.price.toFixed(2)} €` : 'Sin precio'}</em>
            </button>
          ))}

          {filteredTreatments.length === 0 ? <div className="od-quick-empty">No hay coincidencias en el catálogo demo.</div> : null}
        </div>
      </section>
    </div>
  );
}
