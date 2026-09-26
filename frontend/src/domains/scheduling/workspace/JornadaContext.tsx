/* Context and its provider intentionally share one typed boundary. */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { getCitas } from '../../../api/scheduling';
import { getDoctores } from '../../../api/identity';
import { getVisualStatus } from '../agenda/appointmentStatus';
import { todayIso, localAppointmentDate, localDayRange, isoDate } from '../agenda/agendaTime';
import { citaMatchesQuery } from '../agenda/agendaSearch';
import type { Cita, Doctor } from '../../../api/types';

export function dayAppointmentsQuery(day: string) {
  const range = localDayRange(day);
  return { queryKey: ['citas', range], queryFn: () => getCitas(range) };
}

interface JornadaState {
  perspective: 'agenda' | 'operativa'; setPerspective: (value: 'agenda' | 'operativa') => void;
  day: string; setDay: (value: string) => void;
  doctorId: string; setDoctorId: (value: string) => void;
  gabineteId: string; setGabineteId: (value: string) => void;
  searchQuery: string; setSearchQuery: (value: string) => void;
  status: string; setStatus: (value: string) => void;
  selectedCitaId: string | null; selectCita: (value: string | null) => void;
  focusCita: (cita: Cita) => void;
  focusSlot: (slot: { day: string; doctorId: string }) => void;
  citasQuery: ReturnType<typeof useQuery<Cita[], Error>>;
  citas: Cita[];
  doctores: Doctor[];
}

const JornadaContext = createContext<JornadaState | null>(null);

export function JornadaProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const pendingParams = useRef(params);
  const pendingNavigations = useRef<string[]>([]);
  useLayoutEffect(() => {
    const committed = pendingNavigations.current.lastIndexOf(params.toString());
    if (committed >= 0) {
      pendingNavigations.current.splice(0, committed + 1);
      // An older transition can commit after a newer input event. It must not
      // replace the snapshot that already includes that newer filter.
      if (pendingNavigations.current.length) return;
    } else {
      // Back/forward and links outside this provider remain authoritative.
      pendingNavigations.current = [];
    }
    pendingParams.current = params;
  }, [params]);
  function updateParams(update: (next: URLSearchParams) => void, replace = true) {
    // Router updates do not queue like React setState. Compose rapid filter and
    // perspective changes against one pending snapshot before navigation settles.
    const next = new URLSearchParams(pendingParams.current);
    update(next);
    pendingParams.current = next;
    pendingNavigations.current.push(next.toString());
    setParams(next, { replace, state: location.state });
  }
  const requestedDay = params.get('fecha') ?? '';
  const parsedDay = new Date(`${requestedDay}T12:00:00`);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) && !Number.isNaN(parsedDay.getTime()) && isoDate(parsedDay) === requestedDay ? requestedDay : todayIso();
  const doctorId = params.get('doctor_id') ?? '';
  const gabineteId = params.get('gabinete_id') ?? '';
  const searchQuery = params.get('q') ?? '';
  const status = params.get('estado') ?? '';
  const citasQuery = useQuery(dayAppointmentsQuery(day));
  const doctorsQuery = useQuery({ queryKey: ['doctores'], queryFn: getDoctores });
  const citas = useMemo(() => (citasQuery.data ?? []).filter(cita =>
    (!doctorId || cita.doctor_id === doctorId)
    && (!gabineteId || cita.gabinete_id === gabineteId)
    && (!status || getVisualStatus(cita) === status)
    && (!searchQuery || citaMatchesQuery(cita, [], searchQuery)),
  ), [citasQuery.data, doctorId, gabineteId, searchQuery, status]);

  function change(key: string, value: string | null) {
    updateParams(next => {
      if (value) next.set(key, value); else next.delete(key);
      if (key === 'fecha') next.delete('cita_id');
    });
  }

  return <JornadaContext.Provider value={{
    perspective: params.get('vista') === 'agenda' ? 'agenda' : 'operativa',
    setPerspective: value => change('vista', value),
    day, setDay: value => change('fecha', value),
    doctorId, setDoctorId: value => change('doctor_id', value),
    gabineteId, setGabineteId: value => change('gabinete_id', value),
    searchQuery, setSearchQuery: value => change('q', value),
    status, setStatus: value => change('estado', value),
    selectedCitaId: params.get('cita_id'), selectCita: value => change('cita_id', value),
    focusCita: cita => updateParams(next => {
      next.set('fecha', localAppointmentDate(cita.fecha_hora)); next.set('doctor_id', cita.doctor_id); next.set('cita_id', cita.id);
    }, false),
    focusSlot: slot => updateParams(next => {
      next.set('fecha', slot.day); next.set('doctor_id', slot.doctorId); next.delete('cita_id');
    }, false),
    citasQuery, citas, doctores: doctorsQuery.data ?? [],
  }}>{children}</JornadaContext.Provider>;
}

export function useJornada() { return useContext(JornadaContext); }
