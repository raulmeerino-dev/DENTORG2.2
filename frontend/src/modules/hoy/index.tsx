import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  confirmarCita,
  enviarRecordatorioCita,
  getCitas,
  getReportDashboard,
  getTelefonear,
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
    .replaceAll('{clinica}', 'DentOrg2 Clinic');
}

function telefonearNombre(item: TelefonearPendiente) {
  if (!item.paciente) return 'Paciente';
  return `${item.paciente.apellidos ?? ''}, ${item.paciente.nombre ?? ''}`.replace(/^,\s*/, '');
}

const ESTADO_LABEL: Record<string, string> = {
  programada: 'Sin confirmar',
  confirmada: 'Confirmada',
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
  const dashboardQuery = useQuery({ queryKey: ['dashboard-bi'], queryFn: getReportDashboard });
  const reminderCitasQuery = useQuery({
    queryKey: ['whatsapp-reminders', reminderDesde, reminderHasta],
    queryFn: () => getCitas({ fecha_desde: `${reminderDesde}T00:00:00`, fecha_hasta: `${reminderHasta}T23:59:59` }),
    enabled: reminderOpen,
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

  const activas = citas.filter((c) => !['anulada', 'falta'].includes(c.estado));
  const sinConfirmar = activas.filter((c) => c.estado === 'programada');
  const enClinica = activas.filter((c) => ['en_clinica', 'en_tratamiento'].includes(c.estado));
  const atendidas = citas.filter((c) => c.estado === 'atendida');
  const canceladas = citas.filter((c) => ['anulada', 'falta'].includes(c.estado));
  const pendientesLlamar = telefonear.filter((item) => !item.reubicada);
  const reminderCitas = useMemo(
    () => (reminderCitasQuery.data ?? [])
      .filter((cita) => !['anulada', 'falta', 'atendida'].includes(cita.estado))
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora)),
    [reminderCitasQuery.data],
  );
  const selectableReminderCitas = reminderCitas.filter((cita) => cita.paciente?.telefono);
  const selectedReminderCitas = reminderCitas.filter((cita) => selectedReminderIds.includes(cita.id));

  function irAPaciente(pacienteId: string) {
    sessionStorage.setItem('dentorg_selected_patient_id', pacienteId);
    void navigate('/pacientes');
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
    setSelectedReminderIds(selectableReminderCitas.filter((cita) => cita.estado === 'programada').map((cita) => cita.id));
  }

  function seleccionarTodas() {
    setSelectedReminderIds(selectableReminderCitas.map((cita) => cita.id));
  }

  function prepararNuevaFicha() {
    sessionStorage.setItem('dentorg_patient_action', 'new');
  }

  function prepararNuevaCita() {
    sessionStorage.setItem('dentorg_agenda_action', 'new');
  }

  return (
    <section className="page hoy-page">
      {citasQuery.isError && (
        <div className="inline-alert">No se han podido cargar las citas de hoy. Revisa la conexión.</div>
      )}

      <div className="dashboard-metrics hoy-metrics">
        <div>
          <span>Citas hoy</span>
          <strong>{activas.length}</strong>
          <small>{canceladas.length} canceladas</small>
        </div>
        <div>
          <span>Sin confirmar</span>
          <strong>{sinConfirmar.length}</strong>
          <small>pendiente recordatorio</small>
        </div>
        <div>
          <span>En clínica ahora</span>
          <strong>{enClinica.length}</strong>
          <small>{atendidas.length} finalizadas</small>
        </div>
        <div>
          <span>Telefonear</span>
          <strong>{pendientesLlamar.length}</strong>
          <small>pacientes pendientes</small>
        </div>
        <div>
          <span>Presupuestos pend.</span>
          <strong>{dashboard?.alertas.presupuestos_pendientes ?? '—'}</strong>
          <small>por confirmar</small>
        </div>
        <div>
          <span>Deuda pendiente</span>
          <strong>{dashboard?.alertas.deuda_pendiente ? `${dashboard.alertas.deuda_pendiente.toFixed(0)} €` : '—'}</strong>
          <small>cobros sin realizar</small>
        </div>
      </div>

      <div className="hoy-layout">
        <main className="hoy-agenda">
          <div className="panel-caption">
            <strong>Agenda de hoy</strong>
            <span>Flujo de recepción — haz clic en la cita para editar</span>
            <Link to="/agenda">Abrir agenda completa</Link>
          </div>
          {citasQuery.isLoading && (
            <div className="patient-loading-strip" aria-label="Cargando citas"><span /><span /><span /></div>
          )}
          <table className="euro-table hoy-citas-table">
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
                    {cita.estado === 'programada' && (
                      <button type="button" disabled={confirmarMutation.isPending} onClick={() => confirmarMutation.mutate(cita.id)}>
                        Confirmar
                      </button>
                    )}
                    {cita.estado === 'confirmada' && (
                      <button type="button" disabled={updateEstadoMutation.isPending} onClick={() => updateEstadoMutation.mutate({ citaId: cita.id, estado: 'en_clinica' })}>
                        Ha llegado
                      </button>
                    )}
                    {cita.estado === 'en_clinica' && (
                      <button type="button" disabled={updateEstadoMutation.isPending} onClick={() => updateEstadoMutation.mutate({ citaId: cita.id, estado: 'atendida' })}>
                        Finalizar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!citasQuery.isLoading && !activas.length && (
                <tr><td colSpan={6}>No hay citas activas para hoy.</td></tr>
              )}
            </tbody>
          </table>

          {canceladas.length > 0 && (
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer', padding: '0.25rem 0' }}>
                {canceladas.length} cita{canceladas.length > 1 ? 's' : ''} cancelada{canceladas.length > 1 ? 's' : ''} / no asistidas
              </summary>
              <table className="euro-table" style={{ marginTop: '0.25rem' }}>
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
          <section className="desk-panel">
            <div className="panel-caption">
              <strong>Telefonear</strong>
              <span>{pendientesLlamar.length} pendientes</span>
              <Link to="/agenda">Ver agenda</Link>
            </div>
            {telefonearQuery.isLoading && <p style={{ padding: '0.5rem' }}>Cargando...</p>}
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
                    title={item.paciente.telefono}
                    onClick={() => copiarTelefono(item.paciente!.telefono!)}
                  >
                    {item.paciente.telefono}
                  </button>
                )}
              </div>
            ))}
            {!telefonearQuery.isLoading && !pendientesLlamar.length && (
              <p style={{ padding: '0.5rem', margin: 0 }}>Sin llamadas pendientes.</p>
            )}
          </section>

          <section className="desk-panel">
            <div className="panel-caption"><strong>Acciones rápidas</strong></div>
            <div className="agenda-button-grid">
              <Link to="/pacientes" className="euro-action-button" onClick={prepararNuevaFicha}>Nueva ficha</Link>
              <Link to="/pacientes" className="euro-action-button">Buscar paciente</Link>
              <Link to="/agenda" className="euro-action-button" onClick={prepararNuevaCita}>Nueva cita</Link>
              <Link to="/caja" className="euro-action-button">Caja / cobros</Link>
              <button type="button" className="euro-action-button whatsapp-action" onClick={abrirRecordatorios} aria-label="Enviar recordatorios por WhatsApp" title="Recordatorios WhatsApp">
                <WhatsAppIcon />
              </button>
            </div>
          </section>

          <section className="desk-panel">
            <div className="panel-caption">
              <strong>Alertas</strong>
              <span>Requieren atención</span>
            </div>
            <div className="alert-list">
              <div>
                <strong>{dashboard?.alertas.citas_sin_confirmar ?? sinConfirmar.length}</strong>
                <span>citas sin confirmar</span>
              </div>
              <div>
                <strong>{dashboard?.alertas.pacientes_en_clinica ?? enClinica.length}</strong>
                <span>pacientes en clínica ahora</span>
              </div>
              <div>
                <strong>{dashboard?.alertas.presupuestos_pendientes ?? 0}</strong>
                <span>presupuestos por aceptar</span>
              </div>
              <div>
                <strong>{dashboard?.alertas.deuda_pendiente ? `${Math.round(dashboard.alertas.deuda_pendiente)} €` : '0 €'}</strong>
                <span>deuda pendiente cobro</span>
              </div>
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
                  <table className="euro-table">
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
