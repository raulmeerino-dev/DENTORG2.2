import { ToolbarContribution } from '../../../design-system/ToolbarSlots';
import { ToolbarMenu } from '../../../design-system/ContextToolbar';
import { AgendaLabOptions } from './AgendaLabOptions';
import type { AgendaLabSummary } from './laboratorioAgenda';
import {
CalendarPlus,
CalendarSearch,
Clock3,
RefreshCw,
Search
} from 'lucide-react';
import type { Doctor } from '../../../api/types';
import { AgendaDatePicker, AgendaPeriodSelectors } from './AgendaDatePicker';

export function AgendaToolbar({
  embedded = false,
  canManageSchedules = false,
  day,
  doctorId,
  doctores,
  labSummary,
  labOnly,
  onToggleLabOnly,
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
  labSummary: AgendaLabSummary;
  labOnly: boolean;
  onToggleLabOnly: () => void;
  onDayChange: (day: string) => void;
  onDoctorChange: (doctorId: string) => void;
  onCreateCita: () => void;
  onRefresh: () => void;
  onSearchCita: () => void;
  onSearchSlot: () => void;
  onOpenHorario: () => void;
}) {
  return (
    <ToolbarContribution slot={embedded ? "actions" : "module"}><div className="agenda-compact-toolbar" aria-label="Filtros y acciones de agenda" onClick={(event) => event.stopPropagation()}>
      {!embedded && <><AgendaDatePicker day={day} onChange={onDayChange} />
      <AgendaPeriodSelectors compact day={day} onChange={onDayChange} />
        <select className="agenda-professional-select" aria-label="Profesional de Agenda" value={doctorId} onChange={(event) => onDoctorChange(event.target.value)}>
          <option value="">Todos los profesionales</option>
          {doctores.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>{doctor.nombre}</option>
          ))}
        </select>
      </>}
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
        <ToolbarMenu label={labOnly ? 'Más opciones de Agenda · filtro de laboratorio activo' : 'Más opciones de Agenda'}>
          <AgendaLabOptions summary={labSummary} labOnly={labOnly} onToggleLabOnly={onToggleLabOnly} />
        </ToolbarMenu>
        {labOnly && <button type="button" className="agenda-lab-filter-active" onClick={onToggleLabOnly} aria-label="Quitar filtro de laboratorio">Laboratorio ×</button>}
      </div>
    </div></ToolbarContribution>
  );
}
