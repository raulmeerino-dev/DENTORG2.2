import { changeAgendaMonth } from './agendaCalendar';
import { useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { FloatingPopover } from '../../../design-system/FloatingPopover';
import { addDaysIso, isoDate, monthGrid, todayIso } from './agendaTime';
import './agenda-calendar.css';

export function AgendaMonthCalendar({ day, onChange }: { day: string; onChange: (day: string) => void }) {
  const selected = new Date(`${day}T12:00:00`);
  return <div className="agenda-month-calendar">
    <div className="agenda-month-caption">{selected.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</div>
    <div className="agenda-month-days">
      {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(label => <span key={label}>{label}</span>)}
      {monthGrid(day).map(date => {
        const value = isoDate(date);
        return <button type="button" key={value} data-date={value}
          className={date.getMonth() !== selected.getMonth() ? 'is-adjacent-month' : undefined}
          aria-label={date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
          aria-pressed={value === day} aria-current={value === todayIso() ? 'date' : undefined}
          onClick={() => onChange(value)}>{date.getDate()}</button>;
      })}
    </div>
  </div>;
}

export function AgendaPeriodSelectors({ day, onChange, compact = false }: { day: string; onChange: (day: string) => void; compact?: boolean }) {
  const latestDay = useRef(day);
  useLayoutEffect(() => { latestDay.current = day; }, [day]);
  const changePart = (part: 'month' | 'year', value: number) => {
    const current = new Date(`${latestDay.current}T12:00:00`);
    latestDay.current = changeAgendaMonth(latestDay.current, part === 'year' ? value : current.getFullYear(), part === 'month' ? value : current.getMonth());
    onChange(latestDay.current);
  };
  const date = new Date(`${day}T12:00:00`);
  const year = date.getFullYear();
  const firstYear = Math.min(1900, year);
  const lastYear = Math.max(new Date().getFullYear() + 100, year);
  return <div className={`agenda-month-selectors${compact ? ' agenda-month-selectors-inline' : ''}`}>
    <label><span>Mes</span><select aria-label="Mes de Agenda" value={date.getMonth()} onChange={event => changePart('month', Number(event.target.value))}>
      {Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{new Date(2024, month, 1).toLocaleDateString('es-ES', { month: 'long' })}</option>)}
    </select></label>
    <label><span>Año</span><select aria-label="Año de Agenda" value={year} onChange={event => changePart('year', Number(event.target.value))}>
      {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index).map(value => <option key={value}>{value}</option>)}
    </select></label>
  </div>;
}

export function AgendaDatePicker({ day, onChange, compactOnNarrowScreens = false }: { day: string; onChange: (day: string) => void; compactOnNarrowScreens?: boolean }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const date = new Date(`${day}T12:00:00`);
  const choose = (value: string) => { onChange(value); setOpen(false); anchor.current?.focus(); };
  return <div className={`agenda-date-picker${compactOnNarrowScreens ? ' agenda-date-picker-compact' : ''}`}>
    <button type="button" aria-label="Día anterior" onClick={() => onChange(addDaysIso(day, -1))}><ChevronLeft size={15} /></button>
    <button type="button" ref={anchor} aria-label="Elegir fecha de Agenda" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
      <CalendarDays size={15} /><span>{date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span><ChevronDown size={13} />
    </button>
    <button type="button" aria-label="Día siguiente" onClick={() => onChange(addDaysIso(day, 1))}><ChevronRight size={15} /></button>
    <button type="button" onClick={() => onChange(todayIso())}>Hoy</button>
    {open && <FloatingPopover anchorRef={anchor} align="start" width={300} maxHeight={410} role="dialog" aria-label="Seleccionar fecha de Agenda" className="agenda-date-popover" onClose={() => setOpen(false)}>
      <AgendaPeriodSelectors day={day} onChange={onChange} />
      <AgendaMonthCalendar day={day} onChange={choose} />
      <button type="button" className="agenda-calendar-today" onClick={() => choose(todayIso())}>Volver a hoy</button>
    </FloatingPopover>}
  </div>;
}
