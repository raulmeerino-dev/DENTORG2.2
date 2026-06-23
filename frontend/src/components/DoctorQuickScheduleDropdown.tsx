import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronRight, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getCitas } from '../lib/api';
import { getVisualStatus, statusMetaForCita } from '../modules/agenda/appointmentStatus';
import type { Cita } from '../types/api';

const POLL_INTERVAL_MS = 6000;
const FINISHED_STATES = new Set(['anulada', 'falta', 'cancelled_by_patient', 'atendida']);
const CLINIC_STATES = new Set(['en_clinica', 'en_tratamiento']);

function localDateIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function patientName(cita: Cita) {
  return cita.paciente ? `${cita.paciente.nombre} ${cita.paciente.apellidos}`.trim() : 'Paciente sin nombre';
}

function appointmentEndTime(cita: Cita) {
  const start = Date.parse(cita.fecha_hora);
  if (Number.isNaN(start)) return Number.POSITIVE_INFINITY;
  return start + Math.max(cita.duracion_min || 0, 15) * 60_000;
}

function isClinicAppointment(cita: Cita) {
  return CLINIC_STATES.has(getVisualStatus(cita));
}

function openAppointmentUrl(cita: Cita) {
  return `/agenda?fecha=${cita.fecha_hora.slice(0, 10)}&doctor_id=${cita.doctor_id}&cita_id=${cita.id}`;
}

function buildTodayParams(doctorId: string, today: string) {
  return {
    doctor_id: doctorId,
    fecha_desde: `${today}T00:00:00`,
    fecha_hasta: `${today}T23:59:59`,
  };
}

function DoctorQuickScheduleContent({ doctorId }: { doctorId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const today = localDateIso(now);
  const nowTime = now.getTime();

  const citasQuery = useQuery({
    queryKey: ['doctor-quick-schedule', doctorId, today],
    queryFn: () => getCitas(buildTodayParams(doctorId, today)),
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const citas = useMemo(() => {
    return (citasQuery.data ?? [])
      .filter((cita) => cita.doctor_id === doctorId)
      .filter((cita) => cita.fecha_hora.slice(0, 10) === today)
      .filter((cita) => !FINISHED_STATES.has(cita.estado))
      .filter((cita) => isClinicAppointment(cita) || appointmentEndTime(cita) >= nowTime)
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));
  }, [citasQuery.data, doctorId, nowTime, today]);

  const clinicCount = useMemo(() => citas.filter(isClinicAppointment).length, [citas]);
  const badgeCount = clinicCount || citas.length;
  const countLabel = clinicCount ? `${clinicCount} en clinica` : `${citas.length} restantes`;

  const openAppointment = useCallback((cita: Cita) => {
    setOpen(false);
    navigate(openAppointmentUrl(cita));
  }, [navigate]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="doctor-quick-schedule" ref={wrapperRef}>
      <button
        type="button"
        className={`doctor-quick-schedule-trigger${clinicCount ? ' has-clinic' : ''}${citasQuery.isError ? ' has-error' : ''}`}
        aria-label={`Mi agenda de hoy: ${countLabel}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Mi agenda de hoy"
        onClick={() => setOpen((value) => !value)}
      >
        <CalendarClock size={16} strokeWidth={2.1} aria-hidden="true" />
        {badgeCount > 0 && <span aria-hidden="true">{badgeCount > 9 ? '9+' : badgeCount}</span>}
      </button>

      {open && (
        <section className="doctor-quick-schedule-popover" role="dialog" aria-label="Mi agenda de hoy">
          <header>
            <div>
              <strong>Mi agenda</strong>
              <small>{today}</small>
            </div>
            <span>{countLabel}</span>
          </header>
          <div className="doctor-quick-schedule-list" role="list">
            {citas.map((cita) => {
              const visual = statusMetaForCita(cita);
              const inClinic = isClinicAppointment(cita);
              return (
                <article
                  key={cita.id}
                  className={`doctor-quick-schedule-item ${visual.className}${inClinic ? ' is-clinic' : ''}`}
                  role="listitem"
                >
                  <time dateTime={cita.fecha_hora}>{cita.fecha_hora.slice(11, 16)}</time>
                  <div>
                    <strong>{patientName(cita)}</strong>
                    <small>{cita.motivo || 'Cita sin tratamiento previsto'}</small>
                    <span className={`appointment-state ${visual.className}`}>
                      {visual.mark} {visual.label}
                    </span>
                  </div>
                  <button type="button" onClick={() => openAppointment(cita)}>
                    <span>Ver cita</span>
                    <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </article>
              );
            })}

            {citasQuery.isLoading && (
              <p className="doctor-quick-schedule-state">
                <Loader2 size={15} strokeWidth={2} aria-hidden="true" />
                Cargando agenda...
              </p>
            )}
            {!citasQuery.isLoading && citasQuery.isError && (
              <p className="doctor-quick-schedule-state is-error">No se pudo cargar la mini agenda.</p>
            )}
            {!citasQuery.isLoading && !citasQuery.isError && !citas.length && (
              <p className="doctor-quick-schedule-state">No tienes mas pacientes programados para hoy.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default function DoctorQuickScheduleDropdown() {
  const { user } = useAuth();
  if (user?.rol !== 'doctor' || !user.doctor_id) return null;
  return <DoctorQuickScheduleContent doctorId={user.doctor_id} />;
}
