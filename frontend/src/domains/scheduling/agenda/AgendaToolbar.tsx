import {
CalendarPlus,
CalendarSearch,
Clock3,
RefreshCw,
Search
} from 'lucide-react';
import type { Doctor } from '../../../api/types';
import { AgendaDatePicker } from './AgendaDatePicker';

export function AgendaToolbar({
  embedded = false,
  canManageSchedules = false,
  day,
  doctorId,
  doctores,
  horarioLabel,
  citasCount,
  pendingCount,
  clinicCount,
  onDayChange,
  onDoctorChange,
  onCreateCita,
  onRefresh,
  onSearchCita,
  onSearchSlot,
  onOpenHorario,
}: {
  embedded?: boolean;
  canManageSchedules?: boolean;
  day: string;
  doctorId: string;
  doctores: Doctor[];
  horarioLabel: string;
  citasCount: number;
  pendingCount: number;
  clinicCount: number;
  onDayChange: (day: string) => void;
  onDoctorChange: (doctorId: string) => void;
  onCreateCita: () => void;
  onRefresh: () => void;
  onSearchCita: () => void;
  onSearchSlot: () => void;
  onOpenHorario: () => void;
}) {
  const statusTitle = horarioLabel === 'Todas las agendas' ? 'Resumen' : horarioLabel;

  return (
    <div className="agenda-compact-toolbar" aria-label="Filtros y acciones de agenda" onClick={(event) => event.stopPropagation()}>
      {!embedded && <><AgendaDatePicker day={day} onChange={onDayChange} />
      <label className="agenda-toolbar-doctor">
        <span>Doctor</span>
        <select value={doctorId} onChange={(event) => onDoctorChange(event.target.value)}>
          <option value="">Todas las agendas</option>
          {doctores.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>{doctor.nombre}</option>
          ))}
        </select>
      </label></>}
      <div className="agenda-toolbar-status" title={horarioLabel}>
        <b>{statusTitle}</b>
        <span>{citasCount} citas · {pendingCount} confirmar · {clinicCount} en clínica</span>
      </div>
      <div className="agenda-toolbar-actions">
        {!embedded && <button
          type="button"
          className="agenda-toolbar-primary primary-action"
          aria-label="Nueva cita"
          onClick={onCreateCita}
        >
          <CalendarPlus size={15} strokeWidth={2.2} aria-hidden="true" />
          <span>Crear cita</span>
        </button>}
        {!embedded && <button type="button" onClick={onSearchCita}>
          <Search size={15} aria-hidden="true" />
          <span>Buscar cita</span>
        </button>}
        <button type="button" onClick={onSearchSlot}>
          <CalendarSearch size={15} aria-hidden="true" />
          <span>Buscar hueco</span>
        </button>
        {canManageSchedules && <button type="button" onClick={onOpenHorario}>
          <Clock3 size={15} aria-hidden="true" />
          <span>Horario</span>
        </button>}
        <button type="button" className="agenda-toolbar-icon-button" aria-label="Actualizar agenda" title="Actualizar agenda" onClick={onRefresh}>
          <RefreshCw size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
