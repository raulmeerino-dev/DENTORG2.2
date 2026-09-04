import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarPlus,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Ellipsis,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  UserCheck,
  UserPlus,
  Wallet,
} from 'lucide-react';
import {
  confirmarCita,
  enviarRecordatorioCita,
  getCitas,
  getReportDashboard,
  getTelefonear,
  getWhatsAppComunicaciones,
  updateCita,
} from '../../lib/api';
import type { Cita, TelefonearPendiente } from '../../types/api';

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function citaHora(cita: Cita) {
  return cita.fecha_hora.slice(11, 16);
}

function pacienteNombre(cita: Cita) {
  if (!cita.paciente) return 'Paciente';
  return `${cita.paciente.apellidos}, ${cita.paciente.nombre}`;
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
  const date = new Date(cita.fecha_hora);
  if (Number.isNaN(date.getTime())) return cita.fecha_hora.slice(0, 10);
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

const ESTADO_LABEL: Record<string, string> = {
  programada: 'Sin confirmar',
  confirmada: 'Confirmada',
  pending_confirmation: 'Sin confirmar',
  reminder_sent: 'Mensaje enviado',
  confirmed: 'Confirmada',
  reschedule_requested: 'Solicita cambio',
  cancelled_by_patient: 'Cancelada paciente',
  pending_manual_review: 'Revisar',
  rescheduled: 'Reprogramada',
  en_clinica: 'En clínica',
  en_tratamiento: 'En tratamiento',
  atendida: 'Finalizada',
  anulada: 'Cancelada',
  falta: 'No asistió',
};

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

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M16.03 3.2c-7.03 0-12.74 5.62-12.74 12.55 0 2.2.59 4.34 1.7 6.23L3.2 28.8l7.02-1.78a12.95 12.95 0 0 0 5.81 1.37c7.02 0 12.73-5.63 12.73-12.56S23.05 3.2 16.03 3.2Zm0 22.9c-1.86 0-3.68-.49-5.27-1.42l-.38-.22-4.17 1.06 1.09-4.03-.25-.41a10.1 10.1 0 0 1-1.49-5.33c0-5.66 4.7-10.27 10.47-10.27 5.76 0 10.45 4.61 10.45 10.27 0 5.67-4.69 10.35-10.45 10.35Zm5.74-7.7c-.31-.15-1.85-.9-2.14-1-.28-.1-.49-.15-.7.15-.2.3-.8 1-.98 1.19-.18.2-.36.22-.67.07-.31-.15-1.31-.48-2.5-1.52a9.26 9.26 0 0 1-1.72-2.1c-.18-.31-.02-.47.13-.62.14-.13.31-.35.47-.52.15-.18.2-.3.31-.5.1-.2.05-.37-.03-.52-.08-.15-.7-1.65-.96-2.27-.25-.6-.51-.52-.7-.53h-.6c-.2 0-.52.07-.8.37-.28.3-1.06 1.02-1.06 2.48 0 1.46 1.08 2.88 1.23 3.08.15.2 2.13 3.2 5.16 4.48.72.31 1.28.49 1.72.63.72.22 1.38.19 1.9.11.58-.08 1.85-.74 2.11-1.46.26-.72.26-1.33.18-1.46-.08-.13-.28-.2-.59-.35Z" />
    </svg>
  );
}


export default function HoyPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = todayIso();
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderDesde, setReminderDesde] = useState(today);
  const [reminderHasta, setReminderHasta] = useState(addDaysIso(1));
  const [selectedTemplateId, setSelectedTemplateId] = useState(REMINDER_TEMPLATES[0].id);
  const [templateText, setTemplateText] = useState(REMINDER_TEMPLATES[0].texto);
  const [selectedReminderIds, setSelectedReminderIds] = useState<string[]>([]);
  const [sentReminderLinks, setSentReminderLinks] = useState<Array<{ citaId: string; paciente: string; url: string | null }>>([]);

  const citasQuery = useQuery({
    queryKey: ['hoy-citas', today],
    queryFn: () => getCitas({ fecha_desde: `${today}T00:00:00`, fecha_hasta: `${today}T23:59:59` }),
  });
  const telefonearQuery = useQuery({ queryKey: ['telefonear'], queryFn: getTelefonear });
  const dashboardQuery = useQuery({ queryKey: ['dashboard-bi'], queryFn: () => getReportDashboard() });
  const reminderCitasQuery = useQuery({
    queryKey: ['whatsapp-reminders', reminderDesde, reminderHasta],
    queryFn: () => getCitas({ fecha_desde: `${reminderDesde}T00:00:00`, fecha_hasta: `${reminderHasta}T23:59:59` }),
    enabled: reminderOpen,
  });
  const whatsappInboxQuery = useQuery({
    queryKey: ['whatsapp-comunicaciones', 'inbound-pending'],
    queryFn: () => getWhatsAppComunicaciones({ direction: 'inbound', processed: false, limit: 100 }),
  });

  const confirmarMutation = useMutation({
    mutationFn: (citaId: string) => confirmarCita(citaId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['hoy-citas'] }),
  });

  const updateEstadoMutation = useMutation({
    mutationFn: ({ citaId, estado }: { citaId: string; estado: string }) => updateCita(citaId, { estado }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['hoy-citas'] }),
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
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-reminders'] });
    },
  });

  const citas = citasQuery.data ?? [];
  const telefonear = telefonearQuery.data ?? [];
  const dashboard = dashboardQuery.data;
  const whatsappPendientes = whatsappInboxQuery.data ?? [];

  const activas = citas.filter((c) => !['anulada', 'falta', 'cancelled_by_patient'].includes(c.estado));
  const sinConfirmar = activas.filter((c) => ['programada', 'pending_confirmation', 'reminder_sent', 'pending_manual_review'].includes(c.estado));
  const solicitudesCambio = activas.filter((c) => c.estado === 'reschedule_requested');
  const enClinica = activas.filter((c) => ['en_clinica', 'en_tratamiento'].includes(c.estado));
  const atendidas = citas.filter((c) => c.estado === 'atendida');
  const canceladas = citas.filter((c) => ['anulada', 'falta', 'cancelled_by_patient'].includes(c.estado));
  const pendientesLlamar = telefonear.filter((item) => !item.reubicada);
  const proximaAccion = [...activas]
    .filter((cita) => cita.estado !== 'atendida')
    .sort((a, b) => {
      const priority = (cita: Cita) => {
        if (cita.estado === 'en_clinica' || cita.estado === 'en_tratamiento') return 0;
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
    ? (ESTADO_LABEL[proximaAccion.estado] ?? proximaAccion.estado)
    : siguienteLlamada
      ? 'Paciente pendiente de reubicar'
      : 'No hay acciones abiertas';
  const deudaPendiente = dashboard
    ? `${Math.round(dashboard.alertas.deuda_pendiente ?? 0)} €`
    : '—';
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
    sessionStorage.setItem('dentcore_agenda_focus_date', cita.fecha_hora.slice(0, 10));
    sessionStorage.setItem('dentcore_agenda_focus_cita_id', cita.id);
    void navigate('/agenda');
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
    setSelectedReminderIds(selectableReminderCitas.filter((cita) => ['programada', 'pending_confirmation', 'reminder_sent'].includes(cita.estado)).map((cita) => cita.id));
  }

  function seleccionarTodas() {
    setSelectedReminderIds(selectableReminderCitas.map((cita) => cita.id));
  }

  function prepararNuevaFicha() {
    sessionStorage.setItem('dentcore_patient_action', 'new');
  }

  function prepararNuevaCita() {
    sessionStorage.setItem('dentcore_agenda_action', 'new');
  }

  return (
    <section className="page hoy-page">
      {citasQuery.isError && (
        <div className="inline-alert">No se han podido cargar las citas de hoy. Revisa la conexión.</div>
      )}

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
              onClick={() => proximaAccion ? abrirCitaAgenda(proximaAccion) : navigate('/agenda')}
            >
              <span>Gestionar</span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="hoy-command-counters" aria-label="Resumen operativo de hoy">
          <button type="button" className={sinConfirmar.length ? 'attention' : ''} onClick={() => navigate('/agenda')}>
            <Clock3 size={16} aria-hidden="true" />
            <span>Sin confirmar</span>
            <strong>{sinConfirmar.length}</strong>
          </button>
          <button
            type="button"
            className={enClinica.length ? 'active' : ''}
            onClick={() => enClinica[0]?.paciente_id ? irAPaciente(enClinica[0].paciente_id) : navigate('/agenda')}
          >
            <UserCheck size={16} aria-hidden="true" />
            <span>En clínica</span>
            <strong>{enClinica.length}</strong>
          </button>
          <button
            type="button"
            className={solicitudesCambio.length ? 'attention' : ''}
            onClick={() => solicitudesCambio[0] ? abrirCitaAgenda(solicitudesCambio[0]) : navigate('/agenda')}
          >
            <RefreshCw size={16} aria-hidden="true" />
            <span>Cambios</span>
            <strong>{solicitudesCambio.length}</strong>
          </button>
          <button type="button" className={pendientesLlamar.length ? 'attention' : ''} onClick={() => navigate('/agenda')}>
            <Phone size={16} aria-hidden="true" />
            <span>Telefonear</span>
            <strong>{pendientesLlamar.length}</strong>
          </button>
          <div>
            <ClipboardList size={16} aria-hidden="true" />
            <span>Presupuestos</span>
            <strong>{dashboard?.alertas.presupuestos_pendientes ?? '—'}</strong>
          </div>
          <div>
            <CircleDollarSign size={16} aria-hidden="true" />
            <span>Deuda</span>
            <strong>{deudaPendiente}</strong>
          </div>
        </div>

        <nav className="hoy-command-actions" aria-label="Acciones rápidas de recepción">
          <Link to="/agenda" className="primary-action" onClick={prepararNuevaCita}>
            <CalendarPlus size={15} aria-hidden="true" />
            Nueva cita
          </Link>
          <Link to="/pacientes">
            <Search size={15} aria-hidden="true" />
            Buscar paciente
          </Link>
          <button type="button" onClick={abrirRecordatorios} aria-label="Enviar recordatorios por WhatsApp">
            <WhatsAppIcon />
            Recordatorios
          </button>
          <details className="hoy-more-actions">
            <summary role="button" aria-label="Más acciones">
              <Ellipsis size={16} aria-hidden="true" />
              Más
            </summary>
            <div>
              <Link to="/pacientes" onClick={prepararNuevaFicha}>
                <UserPlus size={15} aria-hidden="true" />
                Nueva ficha
              </Link>
              <Link to="/caja">
                <Wallet size={15} aria-hidden="true" />
                Cobros
              </Link>
              <Link to="/whatsapp">
                <MessageCircle size={15} aria-hidden="true" />
                Respuestas{whatsappPendientes.length > 0 ? ` (${whatsappPendientes.length})` : ''}
              </Link>
            </div>
          </details>
        </nav>
      </section>

      <div className="hoy-layout">
        <main className="hoy-agenda">
          <div className="panel-caption">
            <div>
              <strong>Agenda de hoy</strong>
              <span>{activas.length} activas · {sinConfirmar.length} sin confirmar · {atendidas.length} finalizadas</span>
            </div>
            <Link to="/agenda">Agenda completa</Link>
          </div>
          {citasQuery.isLoading && (
            <div className="patient-loading-strip" aria-label="Cargando citas"><span /><span /><span /></div>
          )}
          <table className="dentcore-table hoy-citas-table">
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
                <tr key={cita.id} className={`hoy-cita-row estado-${cita.estado}`}>
                  <td><strong>{citaHora(cita)}</strong></td>
                  <td>
                    <button
                      type="button"
                      className="hoy-patient-link"
                      onClick={() => cita.paciente_id && irAPaciente(cita.paciente_id)}
                    >
                      {pacienteNombre(cita)}
                    </button>
                  </td>
                  <td>{cita.doctor?.nombre ?? '—'}</td>
                  <td>{cita.motivo ?? '—'}</td>
                  <td><span className={`status-pill status-${cita.estado}`}>{ESTADO_LABEL[cita.estado] ?? cita.estado}</span></td>
                  <td>
                    {['programada', 'pending_confirmation', 'reminder_sent'].includes(cita.estado) && (
                      <button type="button" disabled={confirmarMutation.isPending} onClick={() => confirmarMutation.mutate(cita.id)}>
                        Confirmar
                      </button>
                    )}
                    {['confirmada', 'confirmed'].includes(cita.estado) && (
                      <button type="button" disabled={updateEstadoMutation.isPending} onClick={() => updateEstadoMutation.mutate({ citaId: cita.id, estado: 'en_clinica' })}>
                        Ha llegado
                      </button>
                    )}
                    {cita.estado === 'en_clinica' && (
                      <button type="button" disabled={updateEstadoMutation.isPending} onClick={() => updateEstadoMutation.mutate({ citaId: cita.id, estado: 'atendida' })}>
                        Finalizar
                      </button>
                    )}
                    {cita.estado === 'reschedule_requested' && (
                      <button type="button" onClick={() => abrirCitaAgenda(cita)}>
                        Reubicar
                      </button>
                    )}
                    {!['programada', 'pending_confirmation', 'reminder_sent', 'confirmada', 'confirmed', 'en_clinica', 'reschedule_requested'].includes(cita.estado) && (
                      <button type="button" onClick={() => abrirCitaAgenda(cita)}>
                        Abrir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!citasQuery.isLoading && !activas.length && (
                <tr className="hoy-empty-row">
                  <td colSpan={6} className="hoy-empty-cell">
                    <div className="hoy-empty-agenda">
                      <div>
                        <strong>Hoy no hay citas activas</strong>
                        <span>La agenda está libre para nuevas citas o urgencias.</span>
                      </div>
                      <Link to="/agenda" onClick={prepararNuevaCita}>
                        <CalendarPlus size={15} aria-hidden="true" />
                        Crear cita
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

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
                      <td><span className={`status-pill status-${cita.estado}`}>{ESTADO_LABEL[cita.estado] ?? cita.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </main>

        <aside className="hoy-sidebar">
          <section className="desk-panel hoy-work-queue" aria-label="Trabajo operativo de hoy">
            <div className="panel-caption">
              <div>
                <strong>Trabajo pendiente</strong>
                <span>{trabajoPendienteCount} acci{trabajoPendienteCount === 1 ? 'ón' : 'ones'}</span>
              </div>
              <Link to="/agenda">Gestionar agenda</Link>
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
                            <td><span className={`status-pill status-${cita.estado}`}>{ESTADO_LABEL[cita.estado] ?? cita.estado}</span></td>
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
