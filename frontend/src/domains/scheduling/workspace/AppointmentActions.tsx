import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../identity/session/AuthContext';
import { confirmarCita, iniciarAtencionCita, marcarLlegadaCita } from '../../../api/scheduling';
import { getApiErrorMessage } from '../../../api/errors';
import { invalidatePatientWorkspaceQueries } from '../../../shared/query/queryInvalidation';
import { getVisualStatus } from '../agenda/appointmentStatus';
import { appointmentTiming } from './appointmentTiming';
import type { Cita } from '../../../api/types';
import { StatusChip } from '../../../design-system';
import { statusMetaForCita } from '../agenda/appointmentStatus';

export function AppointmentStatusBadge({ cita }: { cita: Cita }) {
  const state = getVisualStatus(cita);
  const tone = state === 'finalizada' ? 'success' : state === 'en_sala' ? 'warning' : state === 'no_presentado' ? 'danger' : ['confirmada', 'en_atencion'].includes(state) ? 'info' : 'neutral';
  return <StatusChip tone={tone}>{statusMetaForCita(cita).label}</StatusChip>;
}

export function AppointmentTiming({ cita, now }: { cita: Cita; now?: number }) {
  const timing = appointmentTiming(cita, now);
  const state = getVisualStatus(cita);
  return <span className="jornada-time-notes">
    {cita.es_urgencia && <span className="is-overdue">Urgencia</span>}
    {timing.lateMinutes > 0 && <span className="is-late">Llegada +{timing.lateMinutes} min</span>}
    {['en_clinica', 'en_sala'].includes(state) && timing.waitingMinutes !== null && <span>{timing.waitingMinutes} min en sala</span>}
    {['en_atencion', 'en_tratamiento'].includes(state) && timing.overtimeMinutes > 0 && <span className="is-overdue">+{timing.overtimeMinutes} min de atención</span>}
  </span>;
}

export default function AppointmentActions({ cita, onEdit }: { cita: Cita; onEdit: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const state = getVisualStatus(cita);
  const clinical = ['admin', 'doctor', 'auxiliar'].includes(user?.rol ?? '') && (user?.rol !== 'doctor' || user?.doctor_id === cita.doctor_id);
  function openSession() {
    sessionStorage.setItem('dentcore_selected_patient_id', cita.paciente_id);
    navigate(`/pacientes?paciente_id=${cita.paciente_id}&tab=sesion&cita_id=${cita.id}`);
  }
  const action = useMutation({
    mutationFn: (kind: 'confirm' | 'arrive' | 'start') => kind === 'confirm' ? confirmarCita(cita.id) : kind === 'arrive' ? marcarLlegadaCita(cita.id) : iniciarAtencionCita(cita.id),
    onSuccess: (_result, kind) => { invalidatePatientWorkspaceQueries(queryClient, cita.paciente_id); void queryClient.invalidateQueries({ queryKey: ['doctor-notifications'] }); if (kind === 'start') openSession(); },
  });
  return <div onClick={event => event.stopPropagation()}>
    <div className="jornada-inline-actions">
      {state === 'programada' && <button type="button" disabled={action.isPending} onClick={() => action.mutate('confirm')}>Confirmar</button>}
      {['programada', 'confirmada'].includes(state) && <button type="button" disabled={action.isPending} onClick={() => action.mutate('arrive')}>Ha llegado</button>}
      {['en_sala', 'en_clinica'].includes(state) && clinical && <button type="button" disabled={action.isPending} onClick={() => action.mutate('start')}>Atender</button>}
      {['en_atencion', 'en_tratamiento'].includes(state) && clinical && <button type="button" onClick={openSession}>Abrir sesión</button>}
      <button type="button" onClick={onEdit}>{cita.estado === 'reschedule_requested' ? 'Reubicar' : 'Ver cita'}</button>
    </div>
    {action.isError && <small role="alert">{getApiErrorMessage(action.error, 'No se pudo actualizar la cita.')}</small>}
  </div>;
}
