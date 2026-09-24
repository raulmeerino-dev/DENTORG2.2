import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { UsersRound, X } from 'lucide-react';
import { useAuth } from '../../identity/session/AuthContext';
import { getCitas, getJornadaConfig, iniciarAtencionCita } from '../../../api/scheduling';
import { getApiErrorMessage } from '../../../api/errors';
import { getVisualStatus } from '../agenda/appointmentStatus';
import { appointmentTiming } from './appointmentTiming';
import { EmptyState } from '../../../design-system';
import type { Cita } from '../../../api/types';
import './jornada.css';

export default function EnSala() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState(Boolean(user?.doctor_id));
  const [now, setNow] = useState(Date.now);
  const ref = useRef<HTMLDivElement>(null);
  const query = useQuery({ queryKey: ['citas', 'en-sala'], queryFn: () => getCitas({ estado: 'en_clinica' }), refetchInterval: 15_000 });
  const config = useQuery({ queryKey: ['jornada-config'], queryFn: getJornadaConfig, staleTime: 300_000 });
  const waiting = (query.data ?? []).filter(cita => ['en_sala', 'en_clinica'].includes(getVisualStatus(cita)) && (!mine || cita.doctor_id === user?.doctor_id)).sort((a, b) => (a.llegada_at ?? a.fecha_hora).localeCompare(b.llegada_at ?? b.fecha_hora));
  function openPatient(cita: Cita, session = false) {
    setOpen(false);
    sessionStorage.setItem('dentcore_selected_patient_id', cita.paciente_id);
    navigate(`/pacientes?paciente_id=${cita.paciente_id}${session ? `&tab=sesion&cita_id=${cita.id}` : ''}`);
  }
  const start = useMutation({ mutationFn: iniciarAtencionCita, onSuccess: cita => {
    void queryClient.invalidateQueries({ queryKey: ['citas'] });
    void queryClient.invalidateQueries({ queryKey: ['citas-paciente', cita.paciente_id] });
    void queryClient.invalidateQueries({ queryKey: ['doctor-notifications'] });
    openPatient(cita, true);
  } });
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="waiting-room" ref={ref}>
    <button type="button" className="waiting-room-trigger" aria-expanded={open} aria-controls="waiting-room-panel" onClick={() => setOpen(value => !value)}><UsersRound size={16} aria-hidden="true" />En sala <b>{waiting.length}</b></button>
    {open && <section id="waiting-room-panel" className="waiting-room-panel" role="dialog" aria-label="En sala">
      <header className="waiting-room-header"><strong>En sala</strong><button type="button" className="dc-icon-button" aria-label="Cerrar En sala" onClick={() => setOpen(false)}><X size={16} /></button></header>
      <div className="waiting-room-filters"><button type="button" aria-pressed={mine} disabled={!user?.doctor_id} onClick={() => setMine(true)}>Mis pacientes</button><button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>Toda la clínica</button></div>
      {query.isError && <p role="alert" className="waiting-room-empty">No se pudo cargar la sala. <button onClick={() => void query.refetch()}>Reintentar</button></p>}
      {query.isLoading && <p role="status" className="waiting-room-empty">Cargando pacientes…</p>}
      {start.isError && <p role="alert" className="waiting-room-empty">{getApiErrorMessage(start.error, 'No se pudo iniciar la atención.')}</p>}
      {waiting.map(cita => {
        const timing = appointmentTiming(cita, now);
        const canStart = ['admin', 'doctor', 'auxiliar'].includes(user?.rol ?? '') && (user?.rol !== 'doctor' || user?.doctor_id === cita.doctor_id);
        return <article className="waiting-room-item" key={cita.id} data-cita-id={cita.id}>
          <time dateTime={cita.fecha_hora}>{new Date(cita.fecha_hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</time>
          <div className="waiting-room-person"><strong>{cita.paciente?.nombre} {cita.paciente?.apellidos}</strong><small>{cita.doctor?.nombre}{cita.gabinete_nombre ? ` · ${cita.gabinete_nombre}` : ''}</small><span className="jornada-time-notes"><span className={(timing.waitingMinutes ?? 0) >= (config.data?.espera_critica_min ?? 20) ? 'is-overdue' : (timing.waitingMinutes ?? 0) >= (config.data?.espera_aviso_min ?? 10) ? 'is-late' : ''}>{timing.waitingMinutes === null ? 'Llegada sin hora registrada' : `${timing.waitingMinutes} min esperando`}{(timing.waitingMinutes ?? 0) >= (config.data?.espera_critica_min ?? 20) ? ' · espera prolongada' : ''}</span></span>
            <div className="jornada-inline-actions"><button type="button" onClick={() => openPatient(cita)}>Abrir ficha</button>{canStart && <button type="button" disabled={start.isPending} onClick={() => start.mutate(cita.id)}>Atender</button>}</div>
          </div>
        </article>;
      })}
      {!query.isLoading && !query.isError && !waiting.length && <EmptyState className="waiting-room-empty" title="Sin pacientes esperando" description={mine ? 'Tu sala está al día.' : 'Las llegadas aparecerán aquí.'} />}
    </section>}
  </div>;
}
