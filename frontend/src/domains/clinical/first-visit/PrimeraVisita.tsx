import { useState } from 'react';
import type { ValoracionData } from '../../../api/assessments';
import type { ApiPaciente, UserRole } from '../../../api/types';
import { PatientOdontogramFlow } from '../odontogram';

const explorationFields: Array<[keyof ValoracionData, string]> = [
  ['dientes_ausentes', 'Dientes ausentes'],
  ['implantes_previos', 'Implantes ya existentes'],
  ['protesis_previas', 'Prótesis, coronas o puentes previos'],
  ['caries_visibles', 'Caries o reconstrucciones visibles'],
  ['periodontal', 'Estado periodontal'],
  ['higiene', 'Higiene y mucosas'],
];

/** One form for initial and subsequent assessments, without a mandatory wizard. */
export function ValoracionForm({ paciente, data, onChange, readOnly = false, disabled = false, initial, userRole }: {
  paciente: ApiPaciente;
  data: ValoracionData;
  onChange?: (data: ValoracionData) => void;
  readOnly?: boolean;
  disabled?: boolean;
  initial: boolean;
  userRole?: UserRole | null;
}) {
  const [exploring, setExploring] = useState(false);
  const update = (key: keyof ValoracionData, value: string) => onChange?.({ ...data, [key]: value });
  const field = (key: keyof ValoracionData, label: string, input = false) => readOnly
    ? <div key={key} className="dc-assessment-value"><dt>{label}</dt><dd>{data[key] || '—'}</dd></div>
    : <label key={key}>{label}{input
      ? <input value={data[key] ?? ''} onChange={event => update(key, event.target.value)} disabled={disabled} />
      : <textarea value={data[key] ?? ''} onChange={event => update(key, event.target.value)} disabled={disabled} />}</label>;
  return <div className="dc-assessment-form">
    <section className="dc-first-visit-section" aria-label="Valoración y observaciones">
      <h3>Valoración y observaciones</h3>
      {!readOnly && <label className="dc-assessment-date">Fecha de valoración<input type="date" value={data.fecha ?? ''} onInput={event => update('fecha', event.currentTarget.value)} onChange={event => update('fecha', event.target.value)} disabled={disabled} required /></label>}
      {readOnly ? <dl className="dc-first-visit-grid">{field('motivo', 'Motivo de consulta')}{field('observaciones_boca', 'Observaciones específicas de la boca')}</dl>
        : <div className="dc-first-visit-grid">{field('motivo', 'Motivo de consulta', true)}{field('observaciones_boca', 'Observaciones específicas de la boca')}</div>}
    </section>
    <section className="dc-first-visit-section" aria-label="Exploración / odontograma">
      <div className="dc-assessment-section-heading">
        <h3>Exploración / odontograma</h3>
        <button type="button" className="dc-btn dc-btn-secondary" aria-expanded={exploring} onClick={() => setExploring(value => !value)}>
          {exploring ? 'Cerrar odontograma' : readOnly ? 'Consultar odontograma actual' : 'Abrir odontograma'}
        </button>
      </div>
      {exploring && <PatientOdontogramFlow paciente={paciente} mode={initial ? 'initialVisit' : 'diagnosis'} title="Odontograma actual del paciente" subtitle={readOnly
        ? 'Vista actual de las piezas; no es una imagen histórica de esta valoración.'
        : 'Los hallazgos de las piezas se guardan de forma independiente a esta valoración.'} readOnly={readOnly} userRole={userRole} />}
      {readOnly ? <dl className="dc-first-visit-grid">{explorationFields.map(([key, label]) => field(key, label))}</dl>
        : <div className="dc-first-visit-grid">{explorationFields.map(([key, label]) => field(key, label))}</div>}
    </section>
    <section className="dc-first-visit-section" aria-label="Conclusiones y plan clínico">
      <h3>Conclusiones y plan clínico</h3>
      {readOnly ? <dl>{field('plan_recomendado', 'Plan recomendado')}</dl> : field('plan_recomendado', 'Plan recomendado')}
    </section>
  </div>;
}
