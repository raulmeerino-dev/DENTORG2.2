import { AgendaDatePicker } from '../agenda/AgendaDatePicker';
import { lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, List } from 'lucide-react';
import { getGabinetes } from '../../../api/scheduling';
import { ContextToolbar, FiltersPopover, ActiveFilterChips, ToolbarSearch } from '../../../design-system/ContextToolbar';
import { ToolbarContribution, ToolbarSlot } from '../../../design-system/ToolbarSlots';
import HoyPage from '../day';
import { AGENDA_STATUS_LEGEND, STATUS_META } from '../agenda/appointmentStatus';
import { JornadaProvider, useJornada } from './JornadaContext';
import './jornada.css';

const AgendaPage = lazy(() => import('../agenda'));

function JornadaContent() {
  const jornada = useJornada()!;
  const gabinetes = useQuery({ queryKey: ['gabinetes'], queryFn: getGabinetes });
  const { perspective, setPerspective: changePerspective } = jornada;
  const activeFilters = [jornada.doctorId, jornada.gabineteId, jornada.status, perspective === 'operativa' ? jornada.searchQuery : ''].filter(Boolean).length;
  return <section className="jornada-workspace" aria-label="Jornada">
    <ToolbarContribution slot="module">
      <nav className="jornada-perspectives" aria-label="Perspectiva de Jornada">
        <button type="button" aria-pressed={perspective === 'operativa'} onClick={() => changePerspective('operativa')}><List size={15} />Operativa</button>
        <button type="button" aria-pressed={perspective === 'agenda'} onClick={() => changePerspective('agenda')}><CalendarDays size={15} />Agenda</button>
      </nav>
      <AgendaDatePicker day={jornada.day} onChange={jornada.setDay} />
    </ToolbarContribution>
    <ContextToolbar aria-label="Acciones de Jornada">
      {perspective === 'agenda' && <ToolbarSearch aria-label="Buscar en Jornada" placeholder="Buscar paciente o cita…" value={jornada.searchQuery} onChange={e => jornada.setSearchQuery(e.target.value)} />}
      <FiltersPopover count={activeFilters}>
        <label>Profesional<select aria-label="Profesional de Jornada" value={jornada.doctorId} onChange={e => jornada.setDoctorId(e.target.value)}><option value="">Todos los profesionales</option>{jornada.doctores.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select></label>
        {Boolean(gabinetes.data?.length) && <label>Gabinete<select aria-label="Gabinete de Jornada" value={jornada.gabineteId} onChange={e => jornada.setGabineteId(e.target.value)}><option value="">Todos los gabinetes</option>{gabinetes.data?.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}</select></label>}
        <label>Estado<select aria-label="Estado de Jornada" value={jornada.status} onChange={e => jornada.setStatus(e.target.value)}><option value="">Todos los estados</option>{AGENDA_STATUS_LEGEND.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</select></label>
        {perspective === 'operativa' && <label>Filtrar citas de la jornada<input type="search" aria-label="Buscar en Jornada" placeholder="Paciente, teléfono o tratamiento" value={jornada.searchQuery} onChange={e => jornada.setSearchQuery(e.target.value)} /></label>}
      </FiltersPopover>
      <ActiveFilterChips filters={[
        ...(jornada.doctorId ? [{ key: 'doctor', label: jornada.doctores.find(d => d.id === jornada.doctorId)?.nombre ?? 'Profesional', onRemove: () => jornada.setDoctorId('') }] : []),
        ...(jornada.gabineteId ? [{ key: 'gabinete', label: gabinetes.data?.find(g => g.id === jornada.gabineteId)?.nombre ?? 'Gabinete', onRemove: () => jornada.setGabineteId('') }] : []),
        ...(jornada.status ? [{ key: 'estado', label: STATUS_META[jornada.status as keyof typeof STATUS_META]?.label ?? jornada.status, onRemove: () => jornada.setStatus('') }] : []),
        ...(perspective === 'operativa' && jornada.searchQuery ? [{ key: 'search', label: `Citas: ${jornada.searchQuery}`, onRemove: () => jornada.setSearchQuery('') }] : []),
      ]} />
      <ToolbarSlot name="actions" />
      <button type="button" className="jornada-new dc-toolbar-primary" onClick={() => {
        sessionStorage.setItem('dentcore_agenda_action', 'new');
        changePerspective('agenda');
        window.dispatchEvent(new Event('dentcore:new-appointment'));
      }}>Nueva cita</button>
    </ContextToolbar>
    <div className="jornada-content">
      {perspective === 'agenda' ? <Suspense fallback={<p role="status">Cargando agenda…</p>}><AgendaPage /></Suspense> : <HoyPage />}
    </div>
  </section>;
}

export default function JornadaWorkspace() {
  return <JornadaProvider><JornadaContent /></JornadaProvider>;
}
