import { useQuery } from '@tanstack/react-query';
import { getCitas } from '../../../api/scheduling';
import type { ApiPaciente,Cita } from '../../../api/types';
import { addDaysIso,dateTimeLabel,todayIso,localDayRange } from './agendaTime';
import { getVisualStatus, statusMetaForCita } from './appointmentStatus';
import { useAgendaDialog } from './useAgendaDialog';

export function CitasPacienteModal({
  pacienteId,
  pacientes,
  onClose,
  onSelect,
}: {
  pacienteId: string;
  pacientes: ApiPaciente[];
  onClose: () => void;
  onSelect: (cita: Cita) => void;
}) {
  const paciente = pacientes.find((item) => item.id === pacienteId);
  const dialog = useAgendaDialog<HTMLElement>(onClose);
  const today = todayIso();
  const citasPacienteQuery = useQuery({
    queryKey: ['agenda-citas-paciente', pacienteId],
    queryFn: () => getCitas({
      paciente_id: pacienteId,
      fecha_desde: localDayRange(today).fecha_desde,
      fecha_hasta: localDayRange(addDaysIso(today, 365)).fecha_hasta,
    }),
    enabled: Boolean(pacienteId),
  });
  const citasPendientes = (citasPacienteQuery.data ?? [])
    .filter((cita) => !['cancelada', 'no_presentado', 'finalizada'].includes(getVisualStatus(cita)))
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section {...dialog} aria-label="Citas pendientes" className="patient-appointments-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>Citas pendientes</strong>
            <span>{paciente ? `${paciente.apellidos}, ${paciente.nombre}` : 'Paciente seleccionado'}</span>
          </div>
          <button type="button" onClick={onClose}>Cerrar</button>
        </header>
        <div className="patient-appointments-list">
          {citasPacienteQuery.isLoading && <p>Buscando proximas citas...</p>}
          {citasPacienteQuery.isError && <p role="alert">No se pudieron cargar las citas pendientes. <button type="button" onClick={() => void citasPacienteQuery.refetch()}>Reintentar</button></p>}
          {!citasPacienteQuery.isLoading && citasPendientes.map((cita) => (
            <button type="button" key={cita.id} onClick={() => onSelect(cita)}>
              <b>{dateTimeLabel(cita.fecha_hora)}</b>
              <span>{cita.doctor?.nombre ?? 'Doctor'} - {cita.motivo || 'Cita dental'}</span>
              <em className={`status-pill ${statusMetaForCita(cita).className}`}>{statusMetaForCita(cita).label}</em>
            </button>
          ))}
          {!citasPacienteQuery.isLoading && !citasPacienteQuery.isError && !citasPendientes.length && (
            <p>No hay citas pendientes para este paciente.</p>
          )}
        </div>
      </section>
    </div>
  );
}
