import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Save } from 'lucide-react';
import { registrarValoracion } from '../../../api/assessments';
import { getApiErrorMessage } from '../../../api/errors';
import type { ValoracionCreate } from '../../../api/assessments';
import type { ApiPaciente, UserRole } from '../../../api/types';
import { formatDate } from '../../../shared/format';
import { useSessionDraft } from '../../identity/session/sessionDrafts';
import { hasAssessmentContent, newAssessment, patientAssessments } from './assessments';
import { ValoracionForm } from './PrimeraVisita';
import './first-visit-workspace.css';

export function DiagnosticoWorkspace({ paciente, userRole }: { paciente: ApiPaciente | null; userRole?: UserRole | null }) {
  if (!paciente) return <p className="dc-diagnosis-empty">Selecciona un paciente para consultar su diagnóstico.</p>;
  return <PatientDiagnosis key={paciente.id} paciente={paciente} userRole={userRole} />;
}

function PatientDiagnosis({ paciente, userRole }: { paciente: ApiPaciente; userRole?: UserRole | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [storedDraft, setStoredDraft] = useSessionDraft(`diagnostico:${paciente.id}`);
  const draft: ValoracionCreate | null = storedDraft ? JSON.parse(storedDraft) as ValoracionCreate : null;
  const [newOpen, setNewOpen] = useState(Boolean(draft));
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const records = patientAssessments(paciente);
  const initial = records.find(item => item.tipo === 'inicial');
  const selectedId = searchParams.get('valoracion_id');
  const selected = records.find(item => item.id === selectedId);
  const canWrite = userRole === 'admin' || userRole === 'doctor' || userRole === 'auxiliar';
  const select = (id?: string) => {
    setSearchParams(current => {
      if (current.get('paciente_id') && current.get('paciente_id') !== paciente.id) return current;
      const next = new URLSearchParams(current);
      if (id) next.set('valoracion_id', id); else next.delete('valoracion_id');
      return next;
    }, { replace: true, state: location.state });
    setNewOpen(false);
  };
  const save = useMutation({
    mutationFn: (input: ValoracionCreate) => registrarValoracion(paciente.id, input),
    onSuccess: (updated, input) => {
      queryClient.setQueryData(['paciente-detalle', paciente.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['pacientes'] });
      setStoredDraft('');
      if (mounted.current) select(input.tipo === 'inicial' ? 'inicial' : input.id);
    },
    onError: () => { void queryClient.invalidateQueries({ queryKey: ['paciente-detalle', paciente.id] }); },
  });
  const start = () => {
    save.reset();
    select();
    if (!draft) setStoredDraft(JSON.stringify(newAssessment(paciente, initial ? 'posterior' : 'inicial')));
    setNewOpen(true);
  };
  const editing = newOpen && draft && !selectedId;
  const title = editing ? draft.tipo === 'inicial' ? 'Primera visita' : 'Nueva valoración clínica'
    : selected?.tipo === 'inicial' ? 'Primera visita' : 'Valoración clínica';

  return <section className="dc-diagnosis-workspace" aria-label="Diagnóstico del paciente">
    <div className="dc-diagnosis-toolbar">
      {(editing || selectedId) ? <>
        <button type="button" className="dc-btn dc-btn-tertiary" onClick={() => select()} disabled={save.isPending}><ArrowLeft size={15} aria-hidden="true" /> Volver a diagnóstico</button>
        <h2>{title}</h2>
        {selected && <span>{selected.fecha ? formatDate(selected.fecha) : 'Sin fecha registrada'}{selected.autor ? ` · ${selected.autor}` : ''}</span>}
        {editing && <span role="status">Borrador · sin registrar</span>}
      </> : <>
        <h2>Diagnóstico</h2>
        <span>Valoración inicial y seguimiento clínico</span>
        {canWrite && <button type="button" className="primary-action" onClick={start}><Plus size={15} aria-hidden="true" />{draft ? 'Continuar borrador' : initial ? 'Nueva valoración' : 'Iniciar valoración inicial'}</button>}
      </>}
    </div>
    {editing ? <form onSubmit={event => { event.preventDefault(); if (canWrite && !save.isPending && hasAssessmentContent(draft.datos)) save.mutate(draft); }}>
      <ValoracionForm paciente={paciente} data={draft.datos} initial={draft.tipo === 'inicial'} userRole={userRole} disabled={save.isPending} onChange={datos => setStoredDraft(JSON.stringify({ ...draft, datos }))} />
      <div className="dc-assessment-save">
        <small>El borrador se conserva al cambiar de sección durante esta sesión. Guarda antes de recargar o cerrar.</small>
        {draft.revision !== paciente.revision && <p role="status">La ficha cambió. El borrador se conserva; revisa los datos actuales antes de guardar.
          <button type="button" onClick={() => setStoredDraft(JSON.stringify({ ...draft, revision: paciente.revision, tipo: initial ? 'posterior' : draft.tipo }))}>He revisado la ficha, conservar como nueva valoración</button>
        </p>}
        {save.isError && <p role="alert">{getApiErrorMessage(save.error, 'No se pudo guardar la valoración. El borrador se conserva.')}</p>}
        <button type="button" className="dc-btn dc-btn-tertiary" disabled={save.isPending} onClick={() => { setStoredDraft(''); select(); save.reset(); }}>Descartar borrador</button>
        <button type="submit" className="primary-action" disabled={!canWrite || save.isPending || !hasAssessmentContent(draft.datos) || !draft.datos.fecha}><Save size={15} aria-hidden="true" />{save.isPending ? 'Guardando…' : 'Guardar valoración'}</button>
      </div>
    </form> : selected ? <ValoracionForm key={selected.id} paciente={paciente} data={selected} initial={selected.tipo === 'inicial'} userRole={userRole} readOnly />
      : selectedId ? <p role="status" className="dc-diagnosis-empty">No se encuentra esta valoración del paciente.</p>
      : records.length ? <ul className="dc-assessment-list" aria-label="Valoraciones registradas">{records.map(record => <li key={record.id}>
        <div><strong>{record.tipo === 'inicial' ? 'Primera visita' : 'Valoración clínica'}</strong><span>{record.fecha ? formatDate(record.fecha) : 'Sin fecha registrada'}{record.autor ? ` · ${record.autor}` : ''}</span><p>{record.motivo || record.observaciones_boca || 'Valoración registrada'}</p></div>
        <button type="button" className="dc-btn dc-btn-secondary" onClick={() => select(record.id)} aria-label={`Consultar ${record.tipo === 'inicial' ? 'primera visita' : 'valoración'}${record.fecha ? ` del ${formatDate(record.fecha)}` : ''}`}>Consultar</button>
      </li>)}</ul> : <div className="dc-diagnosis-empty"><strong>Sin valoración inicial registrada</strong><p>Inicia la valoración para registrar observaciones, explorar y definir el plan clínico.</p></div>}
  </section>;
}
