import type { CSSProperties, MouseEvent } from 'react';
import type { Cita, Doctor } from '../../../api/types';
import type { HorariosPorDoctor, SlotDraft } from './agendaTypes';
import { addMinutes, localAppointmentTime, minutesFromTime, slotInHorario, slotIso, todayIso, weekdayIndex } from './agendaTime';
import { AGENDA_STATUS_LEGEND, appointmentFlags, getVisualStatus, STATUS_META } from './appointmentStatus';
import { appointmentConflicts, appointmentTiming } from './appointmentTiming';
import { patientName, shortDoctorName } from './agendaSearch';
import { buildLabAlerts, labShortName } from './laboratorioAgenda';
import { appointmentLanes } from './agendaLayout';
import './agenda-grid.css';

type VisitAction = 'llegada' | 'atender' | 'finalizar';

export function AgendaResourceGrid({ day, slots, doctorId, doctores, horarios, citas, allCitas, now, canTreat, busy, onOpenCita, onOpenPatient, onCreate, onConfirm, onAction, onContext, onOpenHorario }: {
  day: string; slots: string[]; doctorId: string; doctores: Doctor[]; horarios: HorariosPorDoctor;
  citas: Cita[]; allCitas: Cita[]; now: Date; canTreat: (cita: Cita) => boolean; busy: boolean;
  onOpenCita: (cita: Cita) => void; onOpenPatient: (cita: Cita) => void;
  onCreate: (draft: SlotDraft) => void; onConfirm: (cita: Cita) => void;
  onAction: (cita: Cita, action: VisitAction) => void;
  onContext: (event: MouseEvent, cita: Cita) => void; onOpenHorario?: () => void;
}) {
  const allDoctors = [...doctores];
  for (const cita of citas) {
    if (!allDoctors.some(doctor => doctor.id === cita.doctor_id)) allDoctors.push({ id: cita.doctor_id, nombre: cita.doctor?.nombre ?? 'Profesional', especialidad: null, color_agenda: cita.doctor?.color_agenda ?? null, activo: false });
  }
  const visibleDoctors = doctorId ? allDoctors.filter(doctor => doctor.id === doctorId) : allDoctors;
  const nowMinutes = minutesFromTime(localAppointmentTime(now.toISOString()));
  const columns = `52px repeat(${Math.max(1, visibleDoctors.length)}, minmax(220px, 1fr))`;
  const configuredEnds = visibleDoctors.flatMap(doctor => horarios[doctor.id]?.find(horario => horario.dia_semana === weekdayIndex(day))?.bloques.map(block => minutesFromTime(block.fin)) ?? []);
  const startMinute = slots.length ? minutesFromTime(slots[0]) : 9 * 60;
  const endMinute = Math.max(startMinute + 60, ...configuredEnds, ...allCitas.filter(cita => !doctorId || cita.doctor_id === doctorId).map(cita => minutesFromTime(localAppointmentTime(cita.fecha_hora)) + cita.duracion_min));
  const scale = 3.2;
  const minutes = new Set(slots.map(minutesFromTime));
  for (let minute = startMinute; minute < endMinute; minute += 10) minutes.add(minute);
  minutes.add(endMinute);
  const timeline = Array.from(minutes).filter(minute => minute >= startMinute && minute <= endMinute).sort((a, b) => a - b);
  const height = (endMinute - startMinute) * scale;

  return <section className="agenda-resource-workspace" aria-label="Agenda por profesional">
    <div className="dc-agenda-status-legend" aria-label="Leyenda de estados de cita">
      {AGENDA_STATUS_LEGEND.map(status => <span className={STATUS_META[status].className} key={status}><b>{STATUS_META[status].mark}</b>{STATUS_META[status].label}</span>)}
    </div>
    {!slots.length ? <div className="agenda-empty-day">
      <strong>Sin horario para este día.</strong><span>Revisa el profesional o configura sus bloques de trabajo. Puedes crear una urgencia desde Nueva cita.</span>
      {onOpenHorario && <button type="button" onClick={onOpenHorario}>Abrir horarios</button>}
    </div> : <div className="agenda-resource-scroll" tabIndex={0} aria-label="Parrilla horaria, desplazamiento por profesionales">
      <div className="agenda-resource-grid" style={{ '--agenda-columns': columns, minWidth: 52 + Math.max(1, visibleDoctors.length) * 220 } as CSSProperties}>
        <div className="agenda-resource-heading"><span>Hora</span>{visibleDoctors.map(doctor => <strong key={doctor.id} style={{ '--doctor-color': doctor.color_agenda ?? 'var(--dc-primary)' } as CSSProperties} title={doctor.nombre}>{visibleDoctors.filter(item => shortDoctorName(item.nombre) === shortDoctorName(doctor.nombre)).length > 1 ? doctor.nombre : shortDoctorName(doctor.nombre)}</strong>)}</div>
        <div className="agenda-timeline-body" style={{ height }}>
          <div className="agenda-timeline-hours">
            {timeline.filter(minute => minute === startMinute || minute % 30 === 0).map(minute => <time key={minute} style={{ top: (minute - startMinute) * scale }} dateTime={`${day}T${addMinutes('00:00', minute)}`}>{addMinutes('00:00', minute)}</time>)}
          </div>
          {visibleDoctors.map(doctor => <div className="agenda-timeline-column" key={doctor.id}>
            {timeline.slice(0, -1).map((minute, index) => {
              const slot = addMinutes('00:00', minute);
              const instant = new Date(slotIso(day, slot)).getTime();
              const occupied = allCitas.some(cita => cita.doctor_id === doctor.id && !['cancelada', 'no_presentado'].includes(getVisualStatus(cita))
                && new Date(cita.fecha_hora).getTime() <= instant && new Date(cita.fecha_hora).getTime() + cita.duracion_min * 60_000 > instant);
              const working = slotInHorario(slot, horarios[doctor.id]?.find(horario => horario.dia_semana === weekdayIndex(day)));
              return <div className={`agenda-resource-cell${minute % 60 === 0 ? ' is-hour-start' : minute % 30 === 0 ? ' is-half-hour' : ''}${!working ? ' outside-hours' : ''}${occupied ? ' has-continuation' : ''}`} key={slot}
                data-doctor-id={doctor.id} data-slot={slot} data-occupied={occupied}
                style={{ top: (minute - startMinute) * scale, height: (timeline[index + 1] - minute) * scale }}
                onDragOver={event => event.preventDefault()} onDrop={event => {
                  event.preventDefault();
                  const raw = event.dataTransfer.getData('application/dentcore-patient');
                  if (!raw) return;
                  try {
                    const item = JSON.parse(raw) as { pacienteId?: string; telefonearId?: string; motivo?: string };
                    if (item.pacienteId) onCreate({ day, slot, doctorId: doctor.id, pacienteId: item.pacienteId, telefonearId: item.telefonearId, motivo: item.motivo });
                  } catch { /* Ignore unrelated drag payloads. */ }
                }}>
                {!occupied && <button type="button" className="agenda-create-slot" disabled={!doctor.activo} aria-label={`Nueva cita ${slot} · ${doctor.nombre}`} onClick={() => onCreate({ day, slot, doctorId: doctor.id })}>{working ? '+' : ''}</button>}
              </div>;
            })}
            {appointmentLanes(citas.filter(cita => cita.doctor_id === doctor.id)).map(({ cita, lane, laneCount }) => {
              const status = getVisualStatus(cita); const visual = STATUS_META[status];
              const conflicts = appointmentConflicts(cita, allCitas); const timing = appointmentTiming(cita, now, allCitas);
              const flags = appointmentFlags(cita); const lab = cita.laboratorio?.[0]; const labAlerts = buildLabAlerts(cita, day);
              const slot = localAppointmentTime(cita.fecha_hora);
              const cardHeight = cita.duracion_min * scale - 2;
              const extended = cardHeight >= 90;
              const regular = cardHeight >= 55;
              const statusDetails = [visual.label, cita.gabinete_nombre, cita.es_urgencia ? 'Urgencia' : '', conflicts.length ? `Solape con ${conflicts.length} cita(s)` : '', ...flags,
                timing.arrivalDelay ? `Llegada ${timing.arrivalDelay} min tarde` : '', timing.overtime ? `Sobretiempo ${timing.overtime} min` : '', timing.estimatedDelay ? `Retraso estimado ${timing.estimatedDelay} min` : '',
                ...labAlerts, lab ? `Lab: ${labShortName(lab)}` : ''].filter(Boolean).join(' · ');
              const action: VisitAction | undefined = ['programada', 'confirmada'].includes(status) ? 'llegada' : canTreat(cita) && status === 'en_sala' ? 'atender' : canTreat(cita) && status === 'en_atencion' ? 'finalizar' : undefined;
              const actionLabel = action === 'llegada' ? 'Llegada' : action === 'atender' ? 'Atender' : 'Finalizar visita';
              return <article className={`agenda-resource-appointment ${visual.className}${conflicts.length ? ' has-overlap' : ''}${!regular ? ' is-short' : ''}`} key={cita.id}
                tabIndex={0} aria-label={`Cita de ${patientName(cita)}, ${slot}, ${visual.label}`}
                title={`${patientName(cita)} · ${slot}–${addMinutes(slot, cita.duracion_min)} · ${cita.motivo ?? ''} · ${statusDetails}`}
                style={{ '--doctor-color': doctor.color_agenda ?? 'var(--dc-primary)', top: (minutesFromTime(slot) - startMinute) * scale + 1, height: cardHeight, left: `calc(${lane * 100 / laneCount}% + 2px)`, width: `calc(${100 / laneCount}% - 4px)` } as CSSProperties}
                onClick={() => onOpenCita(cita)} onDoubleClick={() => onOpenPatient(cita)} onContextMenu={event => onContext(event, cita)}
                onKeyDown={event => { if (event.key === 'Enter' && event.target === event.currentTarget) onOpenCita(cita); }}>
                <div className="agenda-resource-appointment-title"><strong>{patientName(cita)}</strong><button type="button" className="agenda-appointment-more" aria-label={`Más acciones de ${patientName(cita)}`} onClick={event => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); onContext({ clientX: rect.left, clientY: rect.bottom, preventDefault() {} } as MouseEvent, cita); }}>···</button></div>
                {regular && <p><time>{slot}–{addMinutes(slot, cita.duracion_min)}</time> · <span>{cita.motivo || 'Cita dental'}</span></p>}
                {extended && lab && <span className="agenda-resource-lab">Lab: {labShortName(lab)}</span>}
                {regular && <div className="agenda-resource-appointment-state" title={statusDetails}>
                  <span className={conflicts.length || cita.es_urgencia ? 'agenda-urgency-flag' : ''}>{cita.es_urgencia ? 'Urgencia · ' : ''}{conflicts.length ? 'Solape · ' : ''}{timing.overtime ? `+${timing.overtime} min` : visual.label}{cita.gabinete_nombre && <> · <span>{cita.gabinete_nombre}</span></>}{labAlerts.length ? ' · Lab pendiente' : ''}</span>
                  {action && <button type="button" disabled={busy} aria-label={actionLabel} onClick={event => { event.stopPropagation(); onAction(cita, action); }}>{action === 'finalizar' ? 'Finalizar' : actionLabel}</button>}
                  {!action && status === 'programada' && <button type="button" disabled={busy} onClick={event => { event.stopPropagation(); onConfirm(cita); }}>Confirmar</button>}
                </div>}
              </article>;
            })}
          </div>)}
          {day === todayIso() && nowMinutes >= startMinute && nowMinutes < endMinute && <div className="agenda-current-time" style={{ top: (nowMinutes - startMinute) * scale }}><span>{localAppointmentTime(now.toISOString())}</span></div>}
        </div>
      </div>
    </div>}
  </section>;
}
