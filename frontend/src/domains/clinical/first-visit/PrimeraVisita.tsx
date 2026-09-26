import { clinicDate } from '../../../shared/time/clinicTime';
import { useEffect, useRef, useState } from 'react';
import { ClipboardList, Save } from 'lucide-react';
import type { ApiPaciente, UserRole } from '../../../api/types';
import { formatDate } from '../../../shared/format';
import { PatientOdontogramFlow } from '../odontogram';
import './first-visit-workspace.css';

export type PrimeraVisitaData = {
  fecha?: string;
  motivo?: string;
  dientes_ausentes?: string;
  implantes_previos?: string;
  protesis_previas?: string;
  caries_visibles?: string;
  periodontal?: string;
  higiene?: string;
  plan_recomendado?: string;
  observaciones_boca?: string;
};

function getSavedPrimeraVisita(paciente?: ApiPaciente | null): PrimeraVisitaData | null {
  const data = paciente?.datos_salud?.primera_visita;
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as PrimeraVisitaData;
  return null;
}

function getPrimeraVisita(paciente?: ApiPaciente | null): PrimeraVisitaData {
  const saved = getSavedPrimeraVisita(paciente);
  if (saved) return saved;
  return {
    fecha: clinicDate(new Date()),
    motivo: '',
    dientes_ausentes: '',
    implantes_previos: '',
    protesis_previas: '',
    caries_visibles: '',
    periodontal: '',
    higiene: '',
    plan_recomendado: '',
    observaciones_boca: '',
  };
}

export function PrimeraVisitaPanel({ paciente, onSave, saving, userRole }: {
  paciente: ApiPaciente | null;
  onSave: (data: PrimeraVisitaData, revision?: number) => void;
  saving: boolean;
  userRole?: UserRole | null;
}) {
  const [data, setData] = useState<PrimeraVisitaData>(() => getPrimeraVisita(paciente));
  const [baseline, setBaseline] = useState(paciente);
  const edited = useRef(false);
  const owner = useRef(paciente?.id);
  const [exploring, setExploring] = useState(false);
  const assessment = useRef<HTMLElement>(null);
  const exploration = useRef<HTMLDetailsElement>(null);
  const plan = useRef<HTMLElement>(null);
  const saved = getSavedPrimeraVisita(paciente);
  const dirty = JSON.stringify(data) !== JSON.stringify(getPrimeraVisita(paciente));
  useEffect(() => {
    if (owner.current === paciente?.id && edited.current && JSON.stringify(getPrimeraVisita(paciente)) !== JSON.stringify(data)) return;
    owner.current = paciente?.id;
    edited.current = false;
    setData(current => {
      const incoming = getPrimeraVisita(paciente);
      return JSON.stringify(current) === JSON.stringify(incoming) ? current : incoming;
    });
    setBaseline(paciente);
    setExploring(false);
  }, [paciente, data]);
  const update = (key: keyof PrimeraVisitaData, value: string) => { edited.current = true; setData(current => ({ ...current, [key]: value })); };
  const field = (key: keyof PrimeraVisitaData, label: string) => <label key={key}>{label}<textarea value={data[key] ?? ''} onChange={event => update(key, event.target.value)} disabled={!paciente} /></label>;
  return <section className="dc-first-visit-panel">
    <nav className="dc-first-visit-nav" aria-label="Apartados de primera visita">
      <button type="button" onClick={() => assessment.current?.scrollIntoView({ block: 'start' })}>Valoración</button>
      <button type="button" onClick={() => { setExploring(true); requestAnimationFrame(() => exploration.current?.scrollIntoView({ block: 'start' })); }}>Exploración / Odontograma</button>
      <button type="button" onClick={() => plan.current?.scrollIntoView({ block: 'start' })}>Plan y guardar</button>
      <span>{dirty ? 'Cambios sin guardar' : saved ? `Registrada ${saved.fecha ? formatDate(saved.fecha) : ''}` : 'Pendiente de completar'}</span>
    </nav>
    <section ref={assessment} className="dc-first-visit-section" aria-label="Valoración de primera visita">
      <h2><ClipboardList size={16} aria-hidden="true" /> Valoración inicial</h2>
      <div className="dc-first-visit-grid">
        <label>Fecha primera visita<input type="date" value={data.fecha ?? ''} onChange={event => update('fecha', event.target.value)} disabled={!paciente} /></label>
        <label>Motivo de consulta<input value={data.motivo ?? ''} onChange={event => update('motivo', event.target.value)} disabled={!paciente} /></label>
        {field('dientes_ausentes', 'Dientes ausentes')}
        {field('implantes_previos', 'Implantes ya existentes')}
        {field('protesis_previas', 'Prótesis, coronas o puentes previos')}
        {field('caries_visibles', 'Caries o reconstrucciones visibles')}
        {field('periodontal', 'Estado periodontal')}
        {field('higiene', 'Higiene y mucosas')}
      </div>
    </section>
    <details ref={exploration} className="dc-first-visit-exploration" open={exploring} onToggle={event => setExploring(event.currentTarget.open)}>
      <summary>Exploración / Odontograma diagnóstico <span>Seleccionar piezas y registrar hallazgos</span></summary>
      {exploring && <PatientOdontogramFlow paciente={paciente} mode="initialVisit" title="Odontograma diagnóstico" subtitle="Registro clínico de la exploración. Los cambios en piezas se guardan de forma independiente a la valoración." userRole={userRole} />}
    </details>
    <section ref={plan} className="dc-first-visit-section" aria-label="Plan y observaciones">
      <h2>Plan y observaciones</h2>
      <div className="dc-first-visit-grid">
        {field('plan_recomendado', 'Plan recomendado inicial')}
        {field('observaciones_boca', 'Observaciones específicas de la boca')}
      </div>
      <div className="dc-first-visit-editor-actions">
        {dirty && <span>Cambios sin guardar</span>}
        {baseline?.revision !== paciente?.revision && <span role="status">La ficha cambió. Tu valoración se conserva; revisa la información antes de guardarla.</span>}
        <button type="button" className="primary-action" onClick={() => onSave(data, baseline?.revision)} disabled={!paciente || saving}><Save size={15} aria-hidden="true" />{saving ? 'Guardando...' : 'Guardar valoración'}</button>
      </div>
    </section>
  </section>;
}
