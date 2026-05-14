import { useEffect, useState } from 'react';
import type { ApiPaciente } from '../../types/api';
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

function getPrimeraVisita(paciente?: ApiPaciente | null): PrimeraVisitaData {
  const data = paciente?.datos_salud?.primera_visita;
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as PrimeraVisitaData;
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
}: {
  paciente: ApiPaciente | null;
  onSave: (data: PrimeraVisitaData) => void;
  saving: boolean;
}) {
  const [data, setData] = useState<PrimeraVisitaData>(() => getPrimeraVisita(paciente));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(getPrimeraVisita(paciente));
  }, [paciente?.id, paciente?.datos_salud]); // eslint-disable-line react-hooks/exhaustive-deps

  function update<K extends keyof PrimeraVisitaData>(key: K, value: PrimeraVisitaData[K]) {
    setData((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="desk-panel first-visit-panel">
      <div className="panel-caption">
        <strong>Primera visita</strong>
        <span>Estado inicial de la boca. Se guarda como base clinica y no sustituye al historial diario.</span>
        <button onClick={() => onSave(data)} disabled={!paciente || saving}>Guardar base</button>
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
        <label>Protesis, coronas o puentes previos
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
        <label className="wide">Observaciones especificas de la boca
          <textarea value={data.observaciones_boca ?? ''} onChange={(event) => update('observaciones_boca', event.target.value)} disabled={!paciente} />
        </label>
      </div>
      <PatientOdontogramFlow
        paciente={paciente}
        mode="initialVisit"
        title="Odontograma base"
        subtitle="Estado inicial de la boca en primera visita. Este mapa se reutilizara despues en presupuestos, pendientes y realizados."
      />
    </section>
  );
}
