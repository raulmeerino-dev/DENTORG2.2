import { AgendaDatePicker } from '../agenda/AgendaDatePicker';
import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, List, Search, SlidersHorizontal } from 'lucide-react';
import { getGabinetes } from '../../../api/scheduling';
import { Toolbar } from '../../../design-system';
import HoyPage from '../day';
import { AGENDA_STATUS_LEGEND, STATUS_META } from '../agenda/appointmentStatus';
import { JornadaProvider, useJornada } from './JornadaContext';
import './jornada.css';

const AgendaPage = lazy(() => import('../agenda'));

function JornadaContent() {
  const jornada = useJornada()!;
  const gabinetes = useQuery({ queryKey: ['gabinetes'], queryFn: getGabinetes });
  const { perspective, setPerspective: changePerspective } = jornada;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = [jornada.doctorId, jornada.gabineteId, jornada.status, jornada.searchQuery].filter(Boolean).length;
  return <section className="jornada-workspace" aria-label="Jornada">
    <Toolbar className="jornada-toolbar" title="Jornada" actions={<button type="button" className="jornada-new" onClick={() => {
        sessionStorage.setItem('dentcore_agenda_action', 'new');
        changePerspective('agenda');
        window.dispatchEvent(new Event('dentcore:new-appointment'));
      }}>Nueva cita</button>}>
      <nav className="jornada-perspectives" aria-label="Perspectiva de Jornada">
        <button type="button" aria-pressed={perspective === 'operativa'} onClick={() => changePerspective('operativa')}><List size={15} />Operativa</button>
        <button type="button" aria-pressed={perspective === 'agenda'} onClick={() => changePerspective('agenda')}><CalendarDays size={15} />Agenda</button>
      </nav>
      {perspective === 'agenda' ? <AgendaDatePicker day={jornada.day} onChange={jornada.setDay} /> : <label className="jornada-date">Fecha<input type="date" aria-label="Fecha de Jornada" value={jornada.day} onChange={e => jornada.setDay(e.target.value)} /></label>}
      <label className="jornada-header-professional">Profesional<select aria-label="Profesional de Jornada" value={jornada.doctorId} onChange={e => jornada.setDoctorId(e.target.value)}><option value="">Todos los profesionales</option>{jornada.doctores.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select></label>
    </Toolbar>
    <button type="button" className="jornada-filter-toggle" aria-expanded={filtersOpen} aria-controls="jornada-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={14} />Filtros{activeFilters ? ` · ${activeFilters} activos` : ''}<span>{jornada.citas.length} citas</span></button>
    <div id="jornada-filters" className={`jornada-filters${filtersOpen ? ' is-open' : ''}`} aria-label="Filtros de Jornada">
      {Boolean(gabinetes.data?.length) && <label>Gabinete<select aria-label="Gabinete de Jornada" value={jornada.gabineteId} onChange={e => jornada.setGabineteId(e.target.value)}><option value="">Todos los gabinetes</option>{gabinetes.data?.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}</select></label>}
      <label>Estado<select aria-label="Estado de Jornada" value={jornada.status} onChange={e => jornada.setStatus(e.target.value)}><option value="">Todos los estados</option>{AGENDA_STATUS_LEGEND.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</select></label>
      <label className="jornada-search"><Search size={15} aria-hidden="true" /><input aria-label="Buscar en Jornada" placeholder="Paciente, teléfono o tratamiento" value={jornada.searchQuery} onChange={e => jornada.setSearchQuery(e.target.value)} /></label>
      <span className="jornada-count">{jornada.citas.length} citas</span>
    </div>
    <div className="jornada-content">
      {perspective === 'agenda' ? <Suspense fallback={<p role="status">Cargando agenda…</p>}><AgendaPage /></Suspense> : <HoyPage />}
    </div>
  </section>;
}

export default function JornadaWorkspace() {
  return <JornadaProvider><JornadaContent /></JornadaProvider>;
}
