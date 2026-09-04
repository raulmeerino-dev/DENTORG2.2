import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardList, Save } from 'lucide-react';
import type { ApiPaciente, UserRole } from '../../types/api';
import { formatDate } from '../../lib/utils';
import { PatientOdontogramFlow } from '../odontogram';

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
    fecha: new Date().toISOString().slice(0, 10),
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

export function PrimeraVisitaPanel({
  paciente,
  onSave,
  saving,
  userRole,
}: {
  paciente: ApiPaciente | null;
  onSave: (data: PrimeraVisitaData) => void;
  saving: boolean;
  userRole?: UserRole | null;
}) {
  const [data, setData] = useState<PrimeraVisitaData>(() => getPrimeraVisita(paciente));
  const [editorOpen, setEditorOpen] = useState(false);
  const savedData = getSavedPrimeraVisita(paciente);
  const savedFieldCount = Object.entries(savedData ?? {}).filter(([key, value]) => (
    key !== 'fecha' && typeof value === 'string' && value.trim().length > 0
  )).length;
  const initialData = getPrimeraVisita(paciente);
  const hasUnsavedChanges = JSON.stringify(data) !== JSON.stringify(initialData);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(getPrimeraVisita(paciente));
    setEditorOpen(false);
  }, [paciente?.id, paciente?.datos_salud]); // eslint-disable-line react-hooks/exhaustive-deps

  function update<K extends keyof PrimeraVisitaData>(key: K, value: PrimeraVisitaData[K]) {
    setData((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="desk-panel first-visit-panel">
      <div className="first-visit-overview">
        <span className="first-visit-overview-icon" aria-hidden="true">
          <ClipboardList size={18} strokeWidth={2} />
        </span>
        <div>
          <span>Valoración inicial</span>
          <strong>{savedData ? `Registrada ${savedData.fecha ? formatDate(savedData.fecha) : ''}`.trim() : 'Pendiente de completar'}</strong>
          <small>{savedData ? `${savedFieldCount} apartado${savedFieldCount === 1 ? '' : 's'} clínico${savedFieldCount === 1 ? '' : 's'} informado${savedFieldCount === 1 ? '' : 's'}` : 'Antecedentes bucales y motivo de consulta'}</small>
        </div>
        <button
          type="button"
          className="first-visit-toggle"
          aria-expanded={editorOpen}
          aria-controls="first-visit-editor"
          onClick={() => setEditorOpen((current) => !current)}
          disabled={!paciente}
        >
          {editorOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          <span>{editorOpen ? 'Ocultar valoración' : savedData ? 'Editar valoración' : 'Completar valoración'}</span>
        </button>
      </div>
      {editorOpen && (
        <div id="first-visit-editor" className="first-visit-editor" aria-label="Valoración de primera visita">
          <div className="first-visit-editor-heading">
            <div>
              <strong>Datos de primera visita</strong>
              <span>Base clínica estructurada</span>
            </div>
            {hasUnsavedChanges && <small>Cambios sin guardar</small>}
          </div>
          <div className="first-visit-grid">
            <label>Fecha primera visita
              <input type="date" value={data.fecha ?? ''} onChange={(event) => update('fecha', event.target.value)} disabled={!paciente} />
            </label>
            <label>Motivo de consulta
              <input value={data.motivo ?? ''} onChange={(event) => update('motivo', event.target.value)} disabled={!paciente} />
            </label>
            <label>Dientes ausentes
              <textarea value={data.dientes_ausentes ?? ''} onChange={(event) => update('dientes_ausentes', event.target.value)} disabled={!paciente} placeholder="Ej. 18, 36, 46..." />
            </label>
            <label>Implantes ya existentes
              <textarea value={data.implantes_previos ?? ''} onChange={(event) => update('implantes_previos', event.target.value)} disabled={!paciente} placeholder="Implantes previos, coronas sobre implante, aditamentos..." />
            </label>
            <label>Prótesis, coronas o puentes previos
              <textarea value={data.protesis_previas ?? ''} onChange={(event) => update('protesis_previas', event.target.value)} disabled={!paciente} />
            </label>
            <label>Caries o reconstrucciones visibles
              <textarea value={data.caries_visibles ?? ''} onChange={(event) => update('caries_visibles', event.target.value)} disabled={!paciente} />
            </label>
            <label>Estado periodontal
              <textarea value={data.periodontal ?? ''} onChange={(event) => update('periodontal', event.target.value)} disabled={!paciente} />
            </label>
            <label>Higiene y mucosas
              <textarea value={data.higiene ?? ''} onChange={(event) => update('higiene', event.target.value)} disabled={!paciente} />
            </label>
            <label className="wide">Plan recomendado inicial
              <textarea value={data.plan_recomendado ?? ''} onChange={(event) => update('plan_recomendado', event.target.value)} disabled={!paciente} />
            </label>
            <label className="wide">Observaciones específicas de la boca
              <textarea value={data.observaciones_boca ?? ''} onChange={(event) => update('observaciones_boca', event.target.value)} disabled={!paciente} />
            </label>
          </div>
          <div className="first-visit-editor-actions">
            <button type="button" onClick={() => setEditorOpen(false)}>Cerrar edición</button>
            <button type="button" className="primary-action" onClick={() => onSave(data)} disabled={!paciente || saving}>
              <Save size={15} strokeWidth={2} aria-hidden="true" />
              <span>{saving ? 'Guardando...' : 'Guardar valoración'}</span>
            </button>
          </div>
        </div>
      )}
      <PatientOdontogramFlow
        paciente={paciente}
        mode="initialVisit"
        title="Odontograma diagnóstico"
        subtitle="Base clínica del paciente para planificar presupuestos y tratamientos."
        userRole={userRole}
      />
    </section>
  );
}
