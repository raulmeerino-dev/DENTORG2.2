import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarPlus,
  Clock3,
  Phone,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { getCitas } from '../../../api/scheduling';
import { enviarRecordatorioCita, getTelefonear, getWhatsAppComunicaciones } from '../../../api/communications';
import { useAuth } from '../../identity/session/AuthContext';
import { useJornada } from '../workspace/JornadaContext';
import { localAppointmentDate, localDayRange, todayIso, localAppointmentTime } from '../agenda/agendaTime';
import { getVisualStatus, statusMetaForCita } from '../agenda/appointmentStatus';
import AppointmentActions, { AppointmentStatusBadge, AppointmentTiming } from '../workspace/AppointmentActions';
import CheckoutQueue from '../workspace/CheckoutQueue';
import './operativa.css';
import { JornadaActions } from './JornadaActions';
import type { Cita, TelefonearPendiente } from '../../../api/types';

function citaHora(cita: Cita) {
  return localAppointmentTime(cita.fecha_hora);
}

function pacienteNombre(cita: Cita) {
  if (!cita.paciente) return 'Paciente';
  return [cita.paciente.apellidos, cita.paciente.nombre].filter(Boolean).join(', ');
}

function pacienteNombreWhatsApp(cita: Cita) {
  if (!cita.paciente) return 'paciente';
  return `${cita.paciente.nombre} ${cita.paciente.apellidos}`.trim();
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function citaFecha(cita: Cita) {
  const date = new Date(`${localAppointmentDate(cita.fecha_hora)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return localAppointmentDate(cita.fecha_hora);
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function renderReminderTemplate(template: string, cita: Cita) {
  return template
    .replaceAll('{paciente}', pacienteNombreWhatsApp(cita))
    .replaceAll('{fecha}', citaFecha(cita))
    .replaceAll('{hora}', citaHora(cita))
    .replaceAll('{doctor}', cita.doctor?.nombre ?? 'la clínica')
    .replaceAll('{tratamiento}', cita.motivo ?? 'su cita')
    .replaceAll('{clinica}', 'DentCore Clinic');
}

function telefonearNombre(item: TelefonearPendiente) {
  if (!item.paciente) return 'Paciente';
  return `${item.paciente.apellidos ?? ''}, ${item.paciente.nombre ?? ''}`.replace(/^,\s*/, '');
}

const REMINDER_TEMPLATES = [
  {
    id: 'confirmacion',
    nombre: 'Confirmar cita',
    texto:
      'Hola {paciente}, le recordamos su cita en {clinica} el {fecha} a las {hora} con {doctor}. Motivo: {tratamiento}. Responda CONFIRMAR si puede asistir. Gracias.',
  },
  {
    id: 'manana',
    nombre: 'Recordatorio mañana',
    texto:
      'Hola {paciente}, mañana tiene cita en {clinica} a las {hora}. Si necesita cambiarla, avísenos por este WhatsApp. Gracias.',
  },
  {
    id: 'reubicacion',
    nombre: 'Reubicar cita',
    texto:
      'Hola {paciente}, contactamos desde {clinica} para ajustar su cita de {tratamiento}. Díganos qué horario le viene mejor y le buscamos hueco.',
  },
  {
    id: 'primera_visita',
    nombre: 'Primera visita',
    texto:
      'Hola {paciente}, le esperamos en {clinica} el {fecha} a las {hora}. Traiga DNI y cualquier informe o radiografía que tenga. Gracias.',
  },
];

export default function HoyPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const jornada = useJornada();
  const { user } = useAuth();
  const canManageBilling = ['admin', 'recepcion'].includes(user?.rol ?? '');
  const today = jornada?.day ?? todayIso();
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderDesde, setReminderDesde] = useState(today);
  const [reminderHasta, setReminderHasta] = useState(addDaysIso(1));
  const [selectedTemplateId, setSelectedTemplateId] = useState(REMINDER_TEMPLATES[0].id);
  const [templateText, setTemplateText] = useState(REMINDER_TEMPLATES[0].texto);
  const [selectedReminderIds, setSelectedReminderIds] = useState<string[]>([]);
  const [sentReminderLinks, setSentReminderLinks] = useState<Array<{ citaId: string; paciente: string; url: string | null }>>([]);

  const fallbackCitasQuery = useQuery({
    queryKey: ['hoy-citas', today],
    queryFn: () => getCitas(localDayRange(today)),
    enabled: !jornada,
  });
  const citasQuery = jornada?.citasQuery ?? fallbackCitasQuery;
  const telefonearQuery = useQuery({ queryKey: ['telefonear'], queryFn: getTelefonear });
  const reminderCitasQuery = useQuery({
    queryKey: ['whatsapp-reminders', reminderDesde, reminderHasta],
    queryFn: () => getCitas({ fecha_desde: localDayRange(reminderDesde).fecha_desde, fecha_hasta: localDayRange(reminderHasta).fecha_hasta }),
    enabled: reminderOpen,
  });
  const whatsappInboxQuery = useQuery({
    queryKey: ['whatsapp-comunicaciones', 'inbound-pending'],
    queryFn: () => getWhatsAppComunicaciones({ direction: 'inbound', processed: false, limit: 100 }),
  });

  const sendReminderMutation = useMutation({
    mutationFn: async () => {
      const citasParaEnviar = (reminderCitasQuery.data ?? []).filter((cita) => selectedReminderIds.includes(cita.id));
      const results: Array<{ citaId: string; paciente: string; url: string | null }> = [];
      for (const cita of citasParaEnviar) {
        const mensaje = renderReminderTemplate(templateText, cita);
        const result = await enviarRecordatorioCita(cita.id, 'whatsapp', mensaje);
        results.push({ citaId: cita.id, paciente: pacienteNombre(cita), url: result.whatsappUrl ?? null });
      }
      return results;
    },
    onSuccess: (results) => {
      setSentReminderLinks(results);
      void queryClient.invalidateQueries({ queryKey: ['hoy-citas'] });
      void queryClient.invalidateQueries({ queryKey: ['citas'] });
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-reminders'] });
    },
  });

  const citas = jornada?.citas ?? citasQuery.data ?? [];
  const telefonear = telefonearQuery.data ?? [];
  const whatsappPendientes = whatsappInboxQuery.data ?? [];

  const agendaParams = new URLSearchParams(window.location.search);
  agendaParams.set('vista', 'agenda');
  const agendaUrl = jornada ? `/jornada?${agendaParams}` : '/agenda';
  const activas = citas.filter((c) => !['cancelada', 'no_presentado'].includes(getVisualStatus(c)));
  const sinConfirmar = activas.filter((c) => getVisualStatus(c) === 'programada');
  const solicitudesCambio = activas.filter((c) => c.estado === 'reschedule_requested');
  const enClinica = activas.filter((c) => ['en_sala', 'en_atencion'].includes(getVisualStatus(c)));
  const atendidas = citas.filter((c) => getVisualStatus(c) === 'finalizada');
  const canceladas = citas.filter((c) => ['anulada', 'falta', 'cancelled_by_patient'].includes(c.estado));
  const pendientesLlamar = telefonear.filter((item) => !item.reubicada && (!jornada?.doctorId || item.doctor_id === jornada.doctorId));
  const proximaAccion = [...activas]
    .filter((cita) => cita.estado !== 'atendida')
    .sort((a, b) => {
      const priority = (cita: Cita) => {
        if (['en_sala', 'en_atencion'].includes(getVisualStatus(cita))) return 0;
        if (cita.estado === 'reschedule_requested') return 1;
        if (sinConfirmar.some((item) => item.id === cita.id)) return 2;
        return 3;
      };
      return priority(a) - priority(b) || a.fecha_hora.localeCompare(b.fecha_hora);
    })[0] ?? null;
  const siguienteLlamada = pendientesLlamar[0] ?? null;
  const trabajoPendienteCount = enClinica.length + solicitudesCambio.length + pendientesLlamar.length;
  const proximaAccionTitulo = proximaAccion
    ? `${citaHora(proximaAccion)} · ${pacienteNombre(proximaAccion)}`
    : siguienteLlamada
      ? `Llamar · ${telefonearNombre(siguienteLlamada)}`
      : 'Jornada al día';
  const proximaAccionDetalle = proximaAccion
    ? statusMetaForCita(proximaAccion).label
    : siguienteLlamada
      ? 'Paciente pendiente de reubicar'
      : 'No hay acciones abiertas';
  const reminderCitas = useMemo(
    () => (reminderCitasQuery.data ?? [])
      .filter((cita) => !['anulada', 'falta', 'cancelled_by_patient', 'atendida'].includes(cita.estado))
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora)),
    [reminderCitasQuery.data],
  );
  const selectableReminderCitas = reminderCitas.filter((cita) => cita.paciente?.telefono);
  const selectedReminderCitas = reminderCitas.filter((cita) => selectedReminderIds.includes(cita.id));

  function irAPaciente(pacienteId: string) {
    sessionStorage.setItem('dentcore_selected_patient_id', pacienteId);
    void navigate('/pacientes');
  }

  function abrirCitaAgenda(cita: Cita) {
    sessionStorage.setItem('dentcore_agenda_focus_date', localAppointmentDate(cita.fecha_hora));
    sessionStorage.setItem('dentcore_agenda_focus_cita_id', cita.id);
    if (jornada) {
      const params = new URLSearchParams(window.location.search);
      params.set('vista', 'agenda'); params.set('cita_id', cita.id);
      params.set('fecha', localAppointmentDate(cita.fecha_hora));
      void navigate(`/jornada?${params}`);
    } else void navigate(agendaUrl);
  }

  function copiarTelefono(telefono: string) {
    void navigator.clipboard?.writeText(telefono);
  }

  function abrirRecordatorios() {
    setSentReminderLinks([]);
    setReminderOpen(true);
  }

  function seleccionarPlantilla(templateId: string) {
    setSelectedTemplateId(templateId);
    setTemplateText(REMINDER_TEMPLATES.find((template) => template.id === templateId)?.texto ?? '');
  }

  function toggleReminderCita(citaId: string) {
    setSelectedReminderIds((current) => (
      current.includes(citaId) ? current.filter((id) => id !== citaId) : [...current, citaId]
    ));
  }

  function seleccionarPendientes() {
    setSelectedReminderIds(selectableReminderCitas.filter((cita) => getVisualStatus(cita) === 'programada').map((cita) => cita.id));
  }

  function seleccionarTodas() {
    setSelectedReminderIds(selectableReminderCitas.map((cita) => cita.id));
  }

  function prepararNuevaCita() {
    sessionStorage.setItem('dentcore_agenda_action', 'new');
  }

  return (
    <section className="hoy-page">
      {citasQuery.isError && (
        <div className="inline-alert">No se han podido cargar las citas de hoy. Revisa la conexión.</div>
      )}

      <JornadaActions canPrescribe={user?.rol === 'admin' || user?.rol === 'doctor'} canUseConsents={user?.rol === 'admin' || user?.rol === 'doctor' || user?.rol === 'auxiliar'} onReminders={abrirRecordatorios} canManageBilling={canManageBilling} replies={whatsappPendientes.length} onNewAppointment={!jornada ? () => { prepararNuevaCita(); navigate(agendaUrl); } : undefined} />
      <section className="hoy-command-center" aria-label="Prioridades de hoy">
        <div className="hoy-next-action">
          <div>
            <span>Próxima acción</span>
            <strong>{proximaAccionTitulo}</strong>
            <small>{proximaAccionDetalle}</small>
          </div>
          {(proximaAccion || siguienteLlamada) && (
            <button
              type="button"
              onClick={() => proximaAccion ? abrirCitaAgenda(proximaAccion) : navigate(agendaUrl)}
            >
              <span>Gestionar</span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="hoy-command-counters" aria-label="Resumen operativo de hoy">
          <button type="button" className={sinConfirmar.length ? 'attention' : ''} onClick={() => navigate(agendaUrl)}>
            <Clock3 size={16} aria-hidden="true" />
            <span>Sin confirmar</span>
            <strong>{sinConfirmar.length}</strong>
          </button>
          <button
            type="button"
            className={enClinica.length ? 'active' : ''}
            onClick={() => enClinica[0]?.paciente_id ? irAPaciente(enClinica[0].paciente_id) : navigate(agendaUrl)}
          >
            <UserCheck size={16} aria-hidden="true" />
            <span>En clínica</span>
            <strong>{enClinica.length}</strong>
          </button>
          <button
            type="button"
            className={solicitudesCambio.length ? 'attention' : ''}
            onClick={() => solicitudesCambio[0] ? abrirCitaAgenda(solicitudesCambio[0]) : navigate(agendaUrl)}
          >
            <RefreshCw size={16} aria-hidden="true" />
            <span>Cambios</span>
            <strong>{solicitudesCambio.length}</strong>
          </button>
          <button type="button" className={pendientesLlamar.length ? 'attention' : ''} onClick={() => navigate(agendaUrl)}>
            <Phone size={16} aria-hidden="true" />
            <span>Telefonear</span>
            <strong>{pendientesLlamar.length}</strong>
          </button>
        </div>


      </section>

      <div className="hoy-layout">
        <section className="hoy-agenda">
          <div className="panel-caption">
            <div>
              <strong>Citas de la jornada</strong>
              <span>{activas.length} activas · {sinConfirmar.length} sin confirmar · {atendidas.length} finalizadas</span>
            </div>
            <Link to={agendaUrl}>Agenda completa</Link>
          </div>
          {citasQuery.isLoading && (
            <div className="patient-loading-strip" aria-label="Cargando citas"><span /><span /><span /></div>
          )}
          <div className="operativa-table-scroll"><table className="hoy-citas-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Paciente</th>
                <th>Doctor</th>
                <th>Tratamiento</th>
                <th>Estado</th>
                <th>Acción rápida</th>
              </tr>
            </thead>
            <tbody>
              {activas.sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora)).map((cita) => (
                <tr key={cita.id} data-cita-id={cita.id} aria-selected={jornada?.selectedCitaId === cita.id} onClick={() => jornada?.selectCita(cita.id)} className={`hoy-cita-row estado-${getVisualStatus(cita)}${jornada?.selectedCitaId === cita.id ? " is-selected" : ""}`}>
                  <td><strong>{citaHora(cita)}</strong><AppointmentTiming cita={cita} now={now} /></td>
                  <td>
                    <button
                      type="button"
                      className="hoy-patient-link"
                      onClick={() => cita.paciente_id && irAPaciente(cita.paciente_id)}
                    >
                      {pacienteNombre(cita)}
                    </button>
                  </td>
                  <td>{cita.doctor?.nombre ?? '—'}{cita.gabinete_nombre && <small className="jornada-time-notes">{cita.gabinete_nombre}</small>}</td>
                  <td>{cita.motivo ?? '—'}</td>
                  <td><AppointmentStatusBadge cita={cita} />{cita.recordatorio_enviado && <small className="jornada-time-notes">Recordatorio enviado</small>}</td>
                  <td>
                    <AppointmentActions cita={cita} onEdit={() => abrirCitaAgenda(cita)} />
                  </td>
                </tr>
              ))}
              {!citasQuery.isLoading && !activas.length && (
                <tr className="hoy-empty-row">
                  <td colSpan={6} className="hoy-empty-cell">
                    <div className="hoy-empty-agenda">
                      <div>
                        <strong>No hay citas activas con estos filtros</strong>
                        <span>La agenda está libre para nuevas citas o urgencias.</span>
                      </div>
                      <Link to={agendaUrl} onClick={prepararNuevaCita}>
                        <CalendarPlus size={15} aria-hidden="true" />
                        Crear cita
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table></div>

          {canceladas.length > 0 && (
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer', padding: '0.25rem 0' }}>
                {canceladas.length} cita{canceladas.length > 1 ? 's' : ''} cancelada{canceladas.length > 1 ? 's' : ''} / no asistidas
              </summary>
              <table className="dentcore-table" style={{ marginTop: '0.25rem' }}>
                <tbody>
                  {canceladas.map((cita) => (
                    <tr key={cita.id}>
                      <td>{citaHora(cita)}</td>
                      <td>{pacienteNombre(cita)}</td>
                      <td>{cita.doctor?.nombre ?? ''}</td>
                      <td><AppointmentStatusBadge cita={cita} />{cita.recordatorio_enviado && <small className="jornada-time-notes">Recordatorio enviado</small>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </section>

        <aside className="hoy-sidebar">
          <CheckoutQueue />
          <section className="desk-panel hoy-work-queue" aria-label="Trabajo operativo de hoy">
            <div className="panel-caption">
              <div>
                <strong>Trabajo pendiente</strong>
                <span>{trabajoPendienteCount} acci{trabajoPendienteCount === 1 ? 'ón' : 'ones'}</span>
              </div>
              <Link to={agendaUrl}>Gestionar agenda</Link>
            </div>

            <div className="hoy-work-group">
              <header>
                <span><UserCheck size={15} aria-hidden="true" />En clínica</span>
                <strong>{enClinica.length}</strong>
              </header>
              <div className="clinic-flow-list">
                {enClinica.slice(0, 3).map((cita) => (
                  <button type="button" key={cita.id} onClick={() => cita.paciente_id && irAPaciente(cita.paciente_id)}>
                    {citaHora(cita)} · {pacienteNombre(cita)}
                  </button>
                ))}
                {!enClinica.length && <small>Sin pacientes esperando o en gabinete.</small>}
              </div>
            </div>

            <div className="hoy-work-group">
              <header>
                <span><RefreshCw size={15} aria-hidden="true" />Cambios solicitados</span>
                <strong>{solicitudesCambio.length}</strong>
              </header>
              <div className="clinic-flow-list">
                {solicitudesCambio.slice(0, 3).map((cita) => (
                  <button type="button" key={cita.id} onClick={() => abrirCitaAgenda(cita)}>
                    {citaHora(cita)} · {pacienteNombre(cita)}
                  </button>
                ))}
                {!solicitudesCambio.length && <small>Sin reprogramaciones pendientes.</small>}
              </div>
            </div>

            <div className="hoy-work-group">
              <header>
                <span><Phone size={15} aria-hidden="true" />Telefonear</span>
                <strong>{pendientesLlamar.length}</strong>
              </header>
              {telefonearQuery.isLoading && <small>Cargando...</small>}
              {pendientesLlamar.slice(0, 10).map((item) => (
                <div key={item.id} className="telefonear-item">
                  <div>
                    <strong>{telefonearNombre(item)}</strong>
                    <span>{item.motivo ?? 'Reprogramar'}</span>
                    <small>{item.doctor?.nombre ?? ''}</small>
                  </div>
                  {item.paciente?.telefono && (
                    <button
                      type="button"
                      title={`Copiar ${item.paciente.telefono}`}
                      onClick={() => copiarTelefono(item.paciente!.telefono!)}
                    >
                      {item.paciente.telefono}
                    </button>
                  )}
                </div>
              ))}
              {!telefonearQuery.isLoading && !pendientesLlamar.length && <small>Sin llamadas pendientes.</small>}
            </div>
          </section>
        </aside>
      </div>

      {reminderOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setReminderOpen(false)}>
          <div className="document-modal whatsapp-reminder-modal" role="dialog" aria-modal="true" aria-label="Recordatorios WhatsApp" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-titlebar">
              <div>
                <strong>Recordatorios WhatsApp</strong>
                <span>Plantillas editables, rango de fechas y selección de pacientes</span>
              </div>
              <button type="button" onClick={() => setReminderOpen(false)}>Cerrar</button>
            </div>

            <div className="whatsapp-reminder-grid">
              <section className="whatsapp-template-panel">
                <label>
                  Desde
                  <input type="date" value={reminderDesde} onChange={(event) => setReminderDesde(event.target.value)} />
                </label>
                <label>
                  Hasta
                  <input type="date" value={reminderHasta} onChange={(event) => setReminderHasta(event.target.value)} />
                </label>
                <label>
                  Plantilla
                  <select value={selectedTemplateId} onChange={(event) => seleccionarPlantilla(event.target.value)}>
                    {REMINDER_TEMPLATES.map((template) => (
                      <option key={template.id} value={template.id}>{template.nombre}</option>
                    ))}
                  </select>
                </label>
                <label className="whatsapp-template-text">
                  Mensaje editable
                  <textarea value={templateText} onChange={(event) => setTemplateText(event.target.value)} />
                </label>
                <div className="whatsapp-template-help">
                  Variables: {'{paciente}'}, {'{fecha}'}, {'{hora}'}, {'{doctor}'}, {'{tratamiento}'}.
                </div>
              </section>

              <section className="whatsapp-patient-panel">
                <div className="whatsapp-patient-toolbar">
                  <div>
                    <strong>{selectedReminderCitas.length}</strong>
                    <span>seleccionadas de {selectableReminderCitas.length} con teléfono</span>
                  </div>
                  <button type="button" onClick={seleccionarPendientes}>Sin confirmar</button>
                  <button type="button" onClick={seleccionarTodas}>Todas</button>
                  <button type="button" onClick={() => setSelectedReminderIds([])}>Limpiar</button>
                </div>

                <div className="whatsapp-patient-list">
                  <table className="dentcore-table">
                    <thead>
                      <tr>
                        <th />
                        <th>Fecha</th>
                        <th>Paciente</th>
                        <th>Teléfono</th>
                        <th>Estado</th>
                        <th>Mensaje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reminderCitasQuery.isLoading && (
                        <tr><td colSpan={6}>Cargando citas...</td></tr>
                      )}
                      {!reminderCitasQuery.isLoading && reminderCitas.map((cita) => {
                        const hasPhone = Boolean(cita.paciente?.telefono);
                        return (
                          <tr key={cita.id} className={!hasPhone ? 'whatsapp-row-disabled' : undefined}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedReminderIds.includes(cita.id)}
                                disabled={!hasPhone}
                                onChange={() => toggleReminderCita(cita.id)}
                                aria-label={`Seleccionar ${pacienteNombre(cita)}`}
                              />
                            </td>
                            <td>{citaFecha(cita)} {citaHora(cita)}</td>
                            <td>{pacienteNombre(cita)}</td>
                            <td>{cita.paciente?.telefono ?? 'Sin teléfono'}</td>
                            <td><AppointmentStatusBadge cita={cita} />{cita.recordatorio_enviado && <small className="jornada-time-notes">Recordatorio enviado</small>}</td>
                            <td>{cita.recordatorio_enviado ? 'Enviado' : 'Pendiente'}</td>
                          </tr>
                        );
                      })}
                      {!reminderCitasQuery.isLoading && !reminderCitas.length && (
                        <tr><td colSpan={6}>No hay citas activas en ese rango.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {selectedReminderCitas[0] && (
                  <div className="whatsapp-preview">
                    <strong>Vista previa</strong>
                    <p>{renderReminderTemplate(templateText, selectedReminderCitas[0])}</p>
                  </div>
                )}

                {sentReminderLinks.length > 0 && (
                  <div className="sent-reminder-links">
                    <strong>Enlaces generados</strong>
                    {sentReminderLinks.map((item) => (
                      item.url ? (
                        <a key={item.citaId} href={item.url} target="_blank" rel="noreferrer">{item.paciente}</a>
                      ) : (
                        <span key={item.citaId}>{item.paciente}: sin enlace WhatsApp</span>
                      )
                    ))}
                  </div>
                )}

                <div className="whatsapp-reminder-actions">
                  {sendReminderMutation.isError && <span>No se han podido enviar algunos recordatorios.</span>}
                  <button type="button" onClick={() => setReminderOpen(false)}>Cancelar</button>
                  <button
                    type="button"
                    className="primary"
                    disabled={!selectedReminderIds.length || sendReminderMutation.isPending || !templateText.trim()}
                    onClick={() => sendReminderMutation.mutate()}
                  >
                    {sendReminderMutation.isPending ? 'Enviando...' : 'Enviar seleccionados'}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
