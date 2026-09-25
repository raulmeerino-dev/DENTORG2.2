import type { AgendaLabSummary } from './laboratorioAgenda';


export function AgendaLabOptions({
  summary,
  labOnly,
  onToggleLabOnly,
}: {
  summary: AgendaLabSummary;
  labOnly: boolean;
  onToggleLabOnly: () => void;
}) {
  const hasLabSignal = summary.total > 0 || summary.suspectedWithoutWork > 0;
  return (
    <div className="agenda-lab-options" role="group" aria-label="Resumen laboratorio agenda">
      <button type="button" role="menuitemcheckbox" aria-checked={labOnly} onClick={onToggleLabOnly}>
        <span>Solo citas con laboratorio</span>
      </button>
      <span className="dc-agenda-lab-summary-ok">Listos: {summary.ready}</span>
      <span className="dc-agenda-lab-summary-pending">Pendientes: {summary.pending}</span>
      <span className={summary.delayed ? 'dc-agenda-lab-summary-danger' : ''}>Retrasados: {summary.delayed}</span>
      {summary.suspectedWithoutWork > 0 && (
        <span className="dc-agenda-lab-summary-soft">Sin asociar: {summary.suspectedWithoutWork}</span>
      )}
      {!hasLabSignal && <em>Sin señales de laboratorio en el dia visible.</em>}
    </div>
  );
}
