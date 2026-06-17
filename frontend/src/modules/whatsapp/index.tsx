import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Check, Eye, RotateCcw, Search, UserRound, X } from 'lucide-react';
import {
  aplicarAccionWhatsApp,
  buscarHuecosLibres,
  getWhatsAppComunicaciones,
  reprogramarWhatsAppComunicacion,
} from '../../lib/api';
import type { HuecoLibre, WhatsAppInboxItem } from '../../types/api';

type InboxFilter = 'pending' | 'all' | 'processed';
type Turno = 'todo' | 'manana' | 'tarde';

const INTENT_LABEL: Record<string, string> = {
  affirmative: 'Confirmacion',
  reschedule_requested: 'Cambio / cancelacion',
  pending_manual_review: 'Revision manual',
};

const STATUS_LABEL: Record<string, string> = {
  programada: 'Sin confirmar',
  confirmada: 'Confirmada',
  pending_confirmation: 'Sin confirmar',
  reminder_sent: 'Mensaje enviado',
  confirmed: 'Confirmada',
  reschedule_requested: 'Solicita cambio',
  cancelled_by_patient: 'Cancelada paciente',
  pending_manual_review: 'Revision manual',
  rescheduled: 'Reprogramada',
  anulada: 'Cancelada',
  falta: 'No asistio',
  atendida: 'Finalizada',
};

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function addDaysIso(day: string, days: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateTimeLabel(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace('T', ' ');
  return date.toLocaleString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function patientLabel(item: WhatsAppInboxItem) {
  if (item.patient) return `${item.patient.apellidos}, ${item.patient.nombre}`;
  return item.phone ?? 'Sin paciente asociado';
}

function appointmentLabel(item: WhatsAppInboxItem) {
  if (!item.appointment) return 'Sin cita asociada';
  return `${dateTimeLabel(item.appointment.fecha_hora)} - ${item.appointment.motivo ?? 'Cita dental'}`;
}

function canReschedule(item: WhatsAppInboxItem) {
  return item.appointment?.estado === 'reschedule_requested' && Boolean(item.appointment?.doctor_id);
}

export default function WhatsAppPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<InboxFilter>('pending');
  const [rescheduleTargetId, setRescheduleTargetId] = useState<string | null>(null);
  const [slotDesde, setSlotDesde] = useState(todayIso());
  const [slotDias, setSlotDias] = useState('14');
  const [turno, setTurno] = useState<Turno>('todo');
  const [actionError, setActionError] = useState('');

  const processed = filter === 'pending' ? false : filter === 'processed' ? true : undefined;
  const inboxQuery = useQuery({
    queryKey: ['whatsapp-comunicaciones', 'inbox-page', filter],
    queryFn: () => getWhatsAppComunicaciones({ direction: 'inbound', processed, limit: 200 }),
  });

  const items = useMemo(() => inboxQuery.data ?? [], [inboxQuery.data]);
  const target = useMemo(
    () => items.find((item) => item.id === rescheduleTargetId) ?? null,
    [items, rescheduleTargetId],
  );

  const slotsQuery = useQuery({
    queryKey: ['whatsapp-reschedule-slots', target?.id, slotDesde, slotDias, turno],
    queryFn: () => buscarHuecosLibres({
      doctor_id: target!.appointment!.doctor_id!,
      duracion_min: target!.appointment!.duracion_min,
      desde: `${slotDesde}T00:00:00`,
      hasta: `${addDaysIso(slotDesde, Math.max(1, Number(slotDias)) - 1)}T23:59:59`,
      solo_manana: turno === 'manana',
      solo_tarde: turno === 'tarde',
      max_resultados: 20,
    }),
    enabled: Boolean(target?.appointment?.doctor_id),
  });

  const actionMutation = useMutation({
    mutationFn: ({ item, action }: {
      item: WhatsAppInboxItem;
      action: 'confirm' | 'cancel' | 'mark_pending' | 'manual_review' | 'mark_reviewed';
    }) => aplicarAccionWhatsApp(item.id, action),
    onSuccess: () => {
      setActionError('');
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-comunicaciones'] });
      void queryClient.invalidateQueries({ queryKey: ['citas'] });
      void queryClient.invalidateQueries({ queryKey: ['hoy-citas'] });
      void queryClient.invalidateQueries({ queryKey: ['telefonear'] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'No se pudo aplicar la accion.'),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ item, hueco }: { item: WhatsAppInboxItem; hueco: HuecoLibre }) =>
      reprogramarWhatsAppComunicacion(item.id, {
        fecha_hora: hueco.fecha_hora_inicio,
        duracion_min: item.appointment?.duracion_min ?? hueco.duracion_min,
        gabinete_id: item.appointment?.gabinete_id ?? null,
        note: 'Reprogramada manualmente desde respuestas WhatsApp',
      }),
    onSuccess: () => {
      setActionError('');
      setRescheduleTargetId(null);
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-comunicaciones'] });
      void queryClient.invalidateQueries({ queryKey: ['citas'] });
      void queryClient.invalidateQueries({ queryKey: ['hoy-citas'] });
      void queryClient.invalidateQueries({ queryKey: ['telefonear'] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'No se pudo reprogramar la cita.'),
  });

  function openPatient(item: WhatsAppInboxItem) {
    if (!item.patient_id) return;
    sessionStorage.setItem('dentcore_selected_patient_id', item.patient_id);
    navigate(`/pacientes?paciente_id=${item.patient_id}`);
  }

  function openAgenda(item: WhatsAppInboxItem) {
    if (item.appointment) {
      sessionStorage.setItem('dentcore_agenda_focus_cita_id', item.appointment.id);
      sessionStorage.setItem('dentcore_agenda_focus_date', item.appointment.fecha_hora.slice(0, 10));
    }
    navigate('/agenda');
  }

  return (
    <section className="page page-shell whatsapp-inbox-page">
      <header className="whatsapp-page-head">
        <div>
          <span>WhatsApp</span>
          <strong>Respuestas de pacientes</strong>
        </div>
        <div className="whatsapp-page-filters" role="tablist" aria-label="Filtro de respuestas WhatsApp">
          {[
            ['pending', 'Pendientes'],
            ['all', 'Todas'],
            ['processed', 'Procesadas'],
          ].map(([id, label]) => (
            <button key={id} type="button" className={filter === id ? 'active' : ''} onClick={() => setFilter(id as InboxFilter)}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {actionError && <div className="inline-alert">{actionError}</div>}

      <div className="whatsapp-inbox-layout">
        <section className="whatsapp-inbox-table-wrap">
          <table className="euro-table whatsapp-inbox-table">
            <thead>
              <tr>
                <th>Recibido</th>
                <th>Paciente</th>
                <th>Cita</th>
                <th>Mensaje</th>
                <th>Intencion</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {inboxQuery.isLoading && <tr><td colSpan={7}>Cargando respuestas...</td></tr>}
              {!inboxQuery.isLoading && items.map((item) => (
                <tr key={item.id} className={!item.processed ? 'row-pending' : undefined}>
                  <td>{dateTimeLabel(item.received_at ?? item.created_at)}</td>
                  <td>{patientLabel(item)}</td>
                  <td>{appointmentLabel(item)}</td>
                  <td className="whatsapp-message-cell">{item.message_body}</td>
                  <td>{item.interpreted_intent ? INTENT_LABEL[item.interpreted_intent] ?? item.interpreted_intent : '-'}</td>
                  <td>
                    <span className={`status-pill status-${item.appointment?.estado ?? 'sin-cita'}`}>
                      {item.appointment ? STATUS_LABEL[item.appointment.estado] ?? item.appointment.estado : 'Sin cita'}
                    </span>
                    <small>{item.processed ? 'Procesado' : 'Pendiente'}</small>
                  </td>
                  <td>
                    <div className="table-actions whatsapp-table-actions">
                      <button type="button" title="Confirmar cita" disabled={actionMutation.isPending || !item.appointment_id} onClick={() => actionMutation.mutate({ item, action: 'confirm' })}><Check size={14} /></button>
                      <button type="button" title="Pendiente de reprogramacion" disabled={actionMutation.isPending || !item.appointment_id} onClick={() => actionMutation.mutate({ item, action: 'mark_pending' })}><RotateCcw size={14} /></button>
                      <button type="button" title="Cancelar cita" disabled={actionMutation.isPending || !item.appointment_id} onClick={() => actionMutation.mutate({ item, action: 'cancel' })}><X size={14} /></button>
                      <button type="button" title="Revision manual" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ item, action: 'manual_review' })}><Search size={14} /></button>
                      <button type="button" title="Marcar revisado" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ item, action: 'mark_reviewed' })}><Eye size={14} /></button>
                      <button type="button" title="Abrir ficha" disabled={!item.patient_id} onClick={() => openPatient(item)}><UserRound size={14} /></button>
                      <button type="button" title="Abrir en agenda" disabled={!item.appointment_id} onClick={() => openAgenda(item)}><CalendarClock size={14} /></button>
                      {canReschedule(item) && (
                        <button type="button" onClick={() => setRescheduleTargetId(item.id)}>Huecos</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!inboxQuery.isLoading && !items.length && <tr><td colSpan={7}>No hay respuestas con este filtro.</td></tr>}
            </tbody>
          </table>
        </section>

        <aside className="whatsapp-reschedule-panel">
          <header>
            <strong>Reprogramacion asistida</strong>
            <span>{target ? patientLabel(target) : 'Selecciona una respuesta con solicitud de cambio'}</span>
          </header>

          {target ? (
            <>
              <div className="whatsapp-slot-filters">
                <label>Desde<input type="date" value={slotDesde} onChange={(event) => setSlotDesde(event.target.value)} /></label>
                <label>Rango
                  <select value={slotDias} onChange={(event) => setSlotDias(event.target.value)}>
                    <option value="3">3 dias</option>
                    <option value="7">1 semana</option>
                    <option value="14">2 semanas</option>
                    <option value="30">1 mes</option>
                  </select>
                </label>
                <label>Turno
                  <select value={turno} onChange={(event) => setTurno(event.target.value as Turno)}>
                    <option value="todo">Todo</option>
                    <option value="manana">Manana</option>
                    <option value="tarde">Tarde</option>
                  </select>
                </label>
              </div>
              <div className="whatsapp-slot-list">
                {slotsQuery.isLoading && <p>Buscando huecos...</p>}
                {!slotsQuery.isLoading && (slotsQuery.data ?? []).map((hueco) => (
                  <button
                    key={`${hueco.doctor_id}-${hueco.fecha_hora_inicio}`}
                    type="button"
                    disabled={rescheduleMutation.isPending}
                    onClick={() => rescheduleMutation.mutate({ item: target, hueco })}
                  >
                    <b>{dateTimeLabel(hueco.fecha_hora_inicio)}</b>
                    <span>{target.appointment?.doctor_nombre ?? 'Mismo doctor'}</span>
                    <em>{hueco.duracion_min} min</em>
                  </button>
                ))}
                {!slotsQuery.isLoading && !(slotsQuery.data ?? []).length && <p>No hay huecos libres con esos filtros.</p>}
              </div>
            </>
          ) : (
            <p>Las respuestas con estado "Solicita cambio" permiten buscar huecos libres del mismo doctor y mover la cita manualmente.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
