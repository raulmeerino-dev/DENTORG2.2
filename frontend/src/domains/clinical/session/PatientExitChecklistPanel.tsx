import { AlertTriangle,CheckCircle2,Info } from 'lucide-react';
import type { PatientExitActionTarget,PatientExitChecklistItem } from './patientExitChecklist';


export function PatientExitChecklistPanel({
  title,
  ready,
  items,
  onAction,
}: {
  title: string;
  ready: boolean;
  items: PatientExitChecklistItem[];
  onAction: (target: PatientExitActionTarget) => void;
}) {
  const visibleItems = items.filter((item) => (
    item.status !== 'ok' || ['tratamientos-hoy', 'caja', 'proxima-cita'].includes(item.id)
  ));

  return (
    <section className={`desk-panel patient-exit-checklist ${ready ? 'is-ready' : 'needs-review'}`} aria-label="Checklist de salida del paciente">
      <div className="panel-caption patient-exit-head">
        <strong>
          {ready ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
          Checklist de salida
        </strong>
        <span>{title}</span>
      </div>
      <div className="patient-exit-items">
        {visibleItems.map((item) => (
          <article key={item.id} className={`patient-exit-item status-${item.status}`}>
            <span className="patient-exit-status-icon" aria-hidden="true">
              {item.status === 'critical' || item.status === 'warning' ? <AlertTriangle size={14} /> : item.status === 'info' ? <Info size={14} /> : <CheckCircle2 size={14} />}
            </span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </div>
            {item.actionLabel && item.actionTarget && (
              <button type="button" onClick={() => item.actionTarget && onAction(item.actionTarget)}>{item.actionLabel}</button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
