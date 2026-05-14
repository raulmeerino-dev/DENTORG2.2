import type { SurfaceKey, ToothData, ToothStatus } from '../types/odontogram.types';
import { statusConfig } from '../data/statusConfig';
import { getPrimarySurface } from '../data/toothMap';
import { ToothSurfaceSelector } from './ToothSurfaceSelector';

type SelectedToothPanelProps = {
  tooth: ToothData;
  selectedSurface?: SurfaceKey;
  readOnly?: boolean;
  onSelectSurface: (surface: SurfaceKey) => void;
  onApplyStatus: (status: ToothStatus) => void;
  onClearSurface: () => void;
};

const typeLabels = {
  incisor: 'Incisivo',
  canine: 'Canino',
  premolar: 'Premolar',
  molar: 'Molar',
};

const surfaceLabels: Record<SurfaceKey, string> = {
  buccal: 'Bucal',
  vestibular: 'Vestibular',
  palatal: 'Palatina',
  lingual: 'Lingual',
  mesial: 'Mesial',
  distal: 'Distal',
  occlusal: 'Oclusal',
  incisal: 'Incisal',
  root: 'Raíz',
  crown: 'Corona',
};

const actionButtons: { label: string; status: ToothStatus; tone?: 'danger' | 'primary' | 'success' }[] = [
  { label: 'Caries', status: 'caries', tone: 'danger' },
  { label: 'Obturación', status: 'filling', tone: 'primary' },
  { label: 'Endodoncia', status: 'endodontics', tone: 'primary' },
  { label: 'Corona', status: 'crown' },
  { label: 'Ausente', status: 'missing', tone: 'danger' },
  { label: 'Pendiente', status: 'pending' },
  { label: 'Realizado', status: 'completed', tone: 'success' },
];

function formatSurface(surface?: SurfaceKey) {
  if (!surface) return 'Pieza completa';
  return surfaceLabels[surface];
}

export function SelectedToothPanel({
  tooth,
  selectedSurface,
  readOnly = false,
  onSelectSurface,
  onApplyStatus,
  onClearSurface,
}: SelectedToothPanelProps) {
  const effectiveSurface = selectedSurface ?? getPrimarySurface(tooth.type);
  const currentStatus = tooth.surfaces[selectedSurface ?? effectiveSurface] ?? tooth.status ?? 'healthy';
  const plannedTreatment = tooth.plannedTreatments?.find((treatment) => treatment.surface === selectedSurface) ?? tooth.plannedTreatments?.[0];

  return (
    <aside className="od-side-panel" aria-label="Panel de pieza seleccionada">
      <div className="od-panel-heading">
        <div>
          <span>Pieza seleccionada</span>
          <strong>Pieza {tooth.number}</strong>
        </div>
        <div className="od-panel-mode">{readOnly ? 'Solo lectura' : 'Editable'}</div>
      </div>

      <dl className="od-tooth-facts">
        <div>
          <dt>Tipo</dt>
          <dd>{typeLabels[tooth.type]}</dd>
        </div>
        <div>
          <dt>Arcada</dt>
          <dd>{tooth.arch === 'upper' ? 'Superior' : 'Inferior'}</dd>
        </div>
        <div>
          <dt>Lado</dt>
          <dd>{tooth.side === 'right' ? 'Derecho' : 'Izquierdo'}</dd>
        </div>
      </dl>

      <section className="od-panel-section">
        <h2>Superficies</h2>
        <ToothSurfaceSelector tooth={tooth} selectedSurface={selectedSurface} onSelectSurface={onSelectSurface} />
      </section>

      <section className="od-status-box">
        <span>Superficie activa</span>
        <strong>{formatSurface(selectedSurface)}</strong>
        <div className="od-current-status">
          <i style={{ background: statusConfig[currentStatus].color }} />
          {statusConfig[currentStatus].label}
        </div>
      </section>

      <section className="od-panel-section">
        <h2>Tratamiento planificado</h2>
        {plannedTreatment ? (
          <div className="od-treatment-card">
            <strong>{plannedTreatment.name}</strong>
            <span>{plannedTreatment.price ? `${plannedTreatment.price.toFixed(2)} €` : 'Sin precio demo'}</span>
          </div>
        ) : (
          <p className="od-muted">No hay tratamiento planificado en esta superficie.</p>
        )}
      </section>

      <section className="od-panel-section">
        <h2>Acciones clínicas</h2>
        <div className="od-action-grid">
          {actionButtons.map((action) => (
            <button
              key={action.status}
              className={`od-action-button ${action.tone ? `is-${action.tone}` : ''}`}
              type="button"
              disabled={readOnly}
              onClick={() => onApplyStatus(action.status)}
            >
              {action.label}
            </button>
          ))}
          <button className="od-action-button is-ghost" type="button" disabled={readOnly} onClick={onClearSurface}>
            Limpiar
          </button>
        </div>
      </section>
    </aside>
  );
}
