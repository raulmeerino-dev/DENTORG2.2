import type { ToothData } from '../types/odontogram.types';

type ToothHistoryModalProps = {
  tooth: ToothData;
  onClose: () => void;
};

function treatmentDate(date?: string) {
  return date ?? 'Sin fecha';
}

export function ToothHistoryModal({ tooth, onClose }: ToothHistoryModalProps) {
  const planned = tooth.plannedTreatments ?? [];
  const completed = tooth.completedTreatments ?? [];
  const hasHistory = planned.length > 0 || completed.length > 0 || Boolean(tooth.notes);

  return (
    <div className="od-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="od-history-modal" role="dialog" aria-modal="true" aria-labelledby="tooth-history-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="od-quick-modal-heading">
          <div>
            <span>Historial clínico</span>
            <h2 id="tooth-history-title">Pieza {tooth.number}</h2>
            <p>{tooth.status === 'missing' ? 'Pieza ausente' : 'Registro local del prototipo'}</p>
          </div>
          <button className="od-modal-close" type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        {hasHistory ? (
          <div className="od-history-list">
            {planned.map((treatment) => (
              <article key={treatment.id} className="od-history-item">
                <span>Planificado</span>
                <strong>{treatment.name}</strong>
                <small>{treatmentDate(treatment.createdAt)}</small>
              </article>
            ))}
            {completed.map((treatment) => (
              <article key={treatment.id} className="od-history-item">
                <span>Realizado</span>
                <strong>{treatment.name}</strong>
                <small>{treatmentDate(treatment.completedAt)}</small>
              </article>
            ))}
            {tooth.notes ? <p className="od-muted">{tooth.notes}</p> : null}
          </div>
        ) : (
          <p className="od-history-empty">No hay movimientos registrados para esta pieza en los datos demo.</p>
        )}
      </section>
    </div>
  );
}
