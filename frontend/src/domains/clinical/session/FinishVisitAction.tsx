import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { finalizarVisitaCita } from '../../../api/scheduling';
import { getApiErrorMessage } from '../../../api/errors';
import { invalidatePatientWorkspaceQueries } from '../../../shared/query/queryInvalidation';
import { getVisualStatus } from '../../scheduling/agenda/appointmentStatus';
import { localAppointmentDate } from '../../scheduling/agenda/agendaTime';
import { Dialog } from '../../../design-system';
import type { Cita, UserRole } from '../../../api/types';

export default function FinishVisitAction({ citas, role, doctorId, hasUnsaved }: { citas: Cita[]; role?: UserRole | null; doctorId?: string | null; hasUnsaved: boolean }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [chosen, setChosen] = useState('');
  const active = citas.filter(cita => getVisualStatus(cita) === 'en_atencion' && (role !== 'doctor' || cita.doctor_id === doctorId));
  const cita = active.find(item => item.id === (chosen || params.get('cita_id'))) ?? (active.length === 1 ? active[0] : null);
  const finish = useMutation({ mutationFn: () => finalizarVisitaCita(cita!.id), onSuccess: result => {
    invalidatePatientWorkspaceQueries(queryClient, result.paciente_id);
    setConfirm(false);
    navigate(`/jornada?fecha=${localAppointmentDate(result.fecha_hora)}&vista=operativa`);
  } });
  if (!['admin', 'doctor', 'auxiliar'].includes(role ?? '') || !active.length) return null;
  return <>
    {active.length > 1 && <select aria-label="Visita que finalizar" value={cita?.id ?? ''} onChange={event => setChosen(event.target.value)}><option value="">Selecciona la visita activa</option>{active.map(item => <option key={item.id} value={item.id}>{new Date(item.fecha_hora).toLocaleString('es-ES')} · {item.motivo}</option>)}</select>}
    <button type="button" disabled={!cita || hasUnsaved} title={hasUnsaved ? 'Guarda los cambios de la sesión antes de finalizar.' : undefined} onClick={() => setConfirm(true)}>Finalizar visita</button>
    {confirm && cita && <Dialog label="Finalizar visita clínica" className="jornada-exit-dialog" onClose={() => setConfirm(false)} closeDisabled={finish.isPending}>
        <h2>Finalizar visita clínica</h2><p>{cita.paciente?.nombre} {cita.paciente?.apellidos}</p>
        <p>Confirma que has completado el registro clínico de esta visita. El paciente pasará a Pendiente de salida para recepción.</p>
        {finish.isError && <p role="alert">{getApiErrorMessage(finish.error, 'No se pudo finalizar la visita.')}</p>}
        <div className="jornada-inline-actions"><button type="button" disabled={finish.isPending} onClick={() => setConfirm(false)}>Seguir en la sesión</button><button type="button" disabled={finish.isPending || hasUnsaved} onClick={() => finish.mutate()}>{finish.isPending ? 'Finalizando…' : 'Confirmar finalización de visita'}</button></div>
    </Dialog>}
  </>;
}
