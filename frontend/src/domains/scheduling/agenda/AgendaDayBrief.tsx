import type { Cita } from '../../../api/types';
import { patientName } from './agendaSearch';
import { localAppointmentTime } from './agendaTime';

export function AgendaDayBrief({
  nextCita,
  pendingCount,
  changeRequestCount,
  clinicCount,
  freeSlotsCount,
  totalSlots,
  onOpenNext,
  onSearchSlot,
  onSearchCita,
}: {
  nextCita: Cita | null;
  pendingCount: number;
  changeRequestCount: number;
  clinicCount: number;
  freeSlotsCount: number;
  totalSlots: number;
  onOpenNext: () => void;
  onSearchSlot: () => void;
  onSearchCita: () => void;
}) {
  return (
    <div className="dc-agenda-day-brief" aria-label="Resumen operativo de agenda">
      <button type="button" className="dc-agenda-day-brief-main" onClick={nextCita ? onOpenNext : onSearchSlot}>
        <span>Siguiente</span>
        <strong>{nextCita ? `${localAppointmentTime(nextCita.fecha_hora)} · ${patientName(nextCita)}` : 'Sin siguiente cita'}</strong>
        <em>{nextCita?.motivo || 'Buscar un hueco libre'}</em>
      </button>
      <button type="button" onClick={onSearchCita}>
        <span>Por confirmar</span>
        <strong>{pendingCount}</strong>
      </button>
      <button type="button" onClick={onSearchCita}>
        <span>Cambios</span>
        <strong>{changeRequestCount}</strong>
      </button>
      <button type="button" onClick={onSearchCita}>
        <span>En clinica</span>
        <strong>{clinicCount}</strong>
      </button>
      <button type="button" onClick={onSearchSlot}>
        <span>Huecos visibles</span>
        <strong>{freeSlotsCount}/{totalSlots}</strong>
      </button>
    </div>
  );
}
