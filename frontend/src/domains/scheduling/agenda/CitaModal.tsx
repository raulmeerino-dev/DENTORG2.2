import { useQuery } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useMemo,useState } from 'react';
import { getWhatsAppComunicaciones } from '../../../api/communications';
import { getCitas } from '../../../api/scheduling';
import type { ApiPaciente,Cita,Doctor,Gabinete,TratamientoCatalogo,WhatsAppInboxItem } from '../../../api/types';
import { findPaciente,patientMatchesQuery } from './agendaSearch';
import { addMinutes,dateLabel,dateTimeLabel,slotIso,todayIso,overlaps,localAppointmentDate,localAppointmentTime,localDayRange } from './agendaTime';
import type { SlotDraft } from './agendaTypes';
import { STATUS_META,getVisualStatus } from './appointmentStatus';
import { useAgendaDialog } from './useAgendaDialog';
import {
appointmentSuggestsLab,
buildLabAlerts,
labStatusMeta
} from './laboratorioAgenda';

function whatsappDirectionLabel(item: WhatsAppInboxItem) {
  return item.direction === 'outbound' ? 'Enviado' : 'Respuesta';
}

function whatsappIntentLabel(item: WhatsAppInboxItem) {
  if (item.interpreted_intent === 'affirmative') return 'Confirma';
  if (item.interpreted_intent === 'reschedule_requested') return 'Pide cambio';
  if (item.interpreted_intent === 'pending_manual_review') return 'Revisar';
  return item.processed ? 'Registrado' : 'Pendiente';
}

export function CitaModal({
  cita,
  draft,
  pacientes,
  doctores,
  gabinetes = [],
  citas = [],
  tratamientos = [],
  defaultDuration = 30,
  canOverrideSchedule = false,
  busy = false,
  error,
  onClose,
  onSubmit,
  onCreateTemporaryPaciente,
}: {
  cita: Cita | null;
  draft: SlotDraft | null;
  pacientes: ApiPaciente[];
  doctores: Doctor[];
  gabinetes?: Gabinete[];
  citas?: Cita[];
  tratamientos?: TratamientoCatalogo[];
  defaultDuration?: number;
  canOverrideSchedule?: boolean;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (data: {
    citaId?: string;
    paciente_id: string;
    doctor_id: string;
    presupuesto_linea_id?: string | null;
    fecha_hora: string;
    duracion_min: number;
    estado: string;
    motivo: string;
    observaciones: string;
    gabinete_id: string | null;
    telefonearId?: string;
    es_urgencia: boolean;
    motivo_solape?: string;
    forzar_fuera_horario: boolean;
  }) => void;
  onCreateTemporaryPaciente: (data: { nombreCompleto: string; telefono: string }) => Promise<ApiPaciente>;
}) {
  const [query, setQuery] = useState('');
  const [patientResultsOpen, setPatientResultsOpen] = useState(false);
  const initialPacienteId = cita?.paciente_id ?? draft?.pacienteId ?? sessionStorage.getItem('dentcore_selected_patient_id') ?? '';
  const [pacienteId, setPacienteId] = useState(initialPacienteId);
  const [showPatientPicker, setShowPatientPicker] = useState(!initialPacienteId);
  const canEditSchedule = !cita || !['en_atencion', 'finalizada', 'cancelada', 'no_presentado'].includes(getVisualStatus(cita));
  const [showScheduleFields, setShowScheduleFields] = useState(!draft || draft.scheduleKnown === false);
  const [temporaryPaciente, setTemporaryPaciente] = useState<ApiPaciente | null>(null);
  const dialog = useAgendaDialog<HTMLFormElement>(onClose, busy);
  const [doctorId, setDoctorId] = useState(cita?.doctor_id ?? draft?.doctorId ?? doctores[0]?.id ?? '');
  const initialDateTime = cita?.fecha_hora ?? (draft ? slotIso(draft.day, draft.slot) : slotIso(todayIso(), '09:00'));
  const [fecha, setFecha] = useState(localAppointmentDate(initialDateTime));
  const [hora, setHora] = useState(localAppointmentTime(initialDateTime));
  const [durationOverride, setDurationOverride] = useState<number | null>(cita?.duracion_min ?? draft?.duration ?? null);
  const [estado, setEstado] = useState(cita?.estado ?? 'programada');
  const storedTreatment = !cita ? sessionStorage.getItem('dentcore_selected_treatment') : null;
  const storedPresupuestoLineaId = !cita ? sessionStorage.getItem('dentcore_selected_presupuesto_linea_id') : null;
  const [motivo, setMotivo] = useState(cita?.motivo ?? draft?.motivo ?? storedTreatment ?? '');
  const suggestedTreatment = tratamientos.find(item => item.nombre.toLocaleLowerCase() === motivo.trim().toLocaleLowerCase());
  const suggestedDuration = suggestedTreatment?.duracion_habitual_min ?? defaultDuration;
  const duracion = durationOverride ?? suggestedDuration;
  const [presupuestoLineaId] = useState(cita?.presupuesto_linea_id ?? draft?.presupuestoLineaId ?? storedPresupuestoLineaId ?? null);
  const [observaciones, setObservaciones] = useState(cita?.observaciones ?? '');
  const [gabinete, setGabinete] = useState(cita?.gabinete_id ?? draft?.gabineteId ?? '');
  const [esUrgencia, setEsUrgencia] = useState(cita?.es_urgencia ?? false);
  const [autorizaSolape, setAutorizaSolape] = useState(false);
  const [motivoSolape, setMotivoSolape] = useState('');
  const [fueraHorario, setFueraHorario] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [tempName, setTempName] = useState('');
  const [tempPhone, setTempPhone] = useState('');
  const [creatingTemp, setCreatingTemp] = useState(false);
  const [showTempPatient, setShowTempPatient] = useState(false);
  const [tempError, setTempError] = useState('');

  const filteredPatients = useMemo(() => {
    if (!query.trim()) return pacientes;
    return pacientes.filter((paciente) => patientMatchesQuery(paciente, query));
  }, [pacientes, query]);

  const selectedPaciente = temporaryPaciente?.id === pacienteId ? temporaryPaciente : findPaciente(pacientes, pacienteId);
  const patientsForSelect = selectedPaciente && !filteredPatients.some((paciente) => paciente.id === selectedPaciente.id)
    ? [selectedPaciente, ...filteredPatients]
    : filteredPatients;
  const visual = cita ? STATUS_META[getVisualStatus(cita)] : STATUS_META.programada;
  const whatsappThreadQuery = useQuery({
    queryKey: ['whatsapp-comunicaciones', 'appointment', cita?.id],
    queryFn: () => getWhatsAppComunicaciones({ appointment_id: cita!.id, limit: 6 }),
    enabled: Boolean(cita?.id),
  });
  const whatsappThread = whatsappThreadQuery.data ?? [];
  const labWorks = cita?.laboratorio ?? [];
  const labAlerts = cita ? buildLabAlerts(cita, todayIso()) : [];
  const labSuggested = cita ? appointmentSuggestsLab(cita) : false;

  const conflictRange = localDayRange(fecha || todayIso());
  const conflictsQuery = useQuery({ queryKey: ['citas', conflictRange], queryFn: () => getCitas(conflictRange), enabled: canEditSchedule && Boolean(fecha) });
  const dateChanged = fecha !== localAppointmentDate(initialDateTime);
  const conflictAppointments = conflictsQuery.data ?? (dateChanged ? [] : citas);
  const conflicts = conflictAppointments.filter(other => other.id !== cita?.id
    && !['cancelada', 'no_presentado'].includes(getVisualStatus(other))
    && (other.doctor_id === doctorId || Boolean(gabinete && other.gabinete_id === gabinete))
    && overlaps(`${fecha}T${hora}:00`, duracion, other));
  const scheduleChanged = !cita || doctorId !== cita.doctor_id || gabinete !== (cita.gabinete_id ?? '')
    || fecha !== localAppointmentDate(cita.fecha_hora) || hora !== localAppointmentTime(cita.fecha_hora)
    || duracion !== cita.duracion_min || esUrgencia !== Boolean(cita.es_urgencia);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!pacienteId || !doctorId) { setValidationError('Selecciona un paciente y un profesional.'); return; }
    if (!fecha || !hora || !Number.isInteger(duracion) || duracion < 5 || duracion > 480 || duracion % 5) { setValidationError('Indica fecha, hora y duración válida en intervalos de 5 minutos.'); return; }
    if (scheduleChanged && (conflictsQuery.isError || (dateChanged && conflictsQuery.isPending))) { setValidationError('No se ha podido comprobar la disponibilidad del día seleccionado. Vuelve a intentarlo.'); return; }
    if (scheduleChanged && conflicts.length && (!esUrgencia || !autorizaSolape || !motivoSolape.trim())) {
      setValidationError('El horario tiene solapes. Elige otro hueco o autoriza la urgencia indicando el motivo.');
      return;
    }
    setValidationError('');
    onSubmit({
      citaId: cita?.id,
      paciente_id: pacienteId,
      doctor_id: doctorId,
      presupuesto_linea_id: presupuestoLineaId,
      fecha_hora: slotIso(fecha, hora),
      duracion_min: duracion,
      estado,
      motivo,
      observaciones,
      gabinete_id: gabinete || null,
      telefonearId: draft?.telefonearId,
      es_urgencia: esUrgencia,
      motivo_solape: scheduleChanged && conflicts.length ? motivoSolape.trim() : undefined,
      forzar_fuera_horario: fueraHorario,
    });
  }

  async function createTempPatient() {
    if (!tempName.trim()) {
      setTempError('Indica el nombre del paciente provisional.');
      return;
    }
    setCreatingTemp(true);
    try {
      const paciente = await onCreateTemporaryPaciente({ nombreCompleto: tempName, telefono: tempPhone });
      setTemporaryPaciente(paciente);
      setPacienteId(paciente.id);
      setQuery(`${paciente.nombre} ${paciente.apellidos}`);
      setPatientResultsOpen(false);
      setObservaciones((prev) => `${prev}\nPaciente temporal: completar datos en clínica.`.trim());
      setTempName('');
      setTempPhone('');
      setShowTempPatient(false);
      setShowPatientPicker(false);
    } catch (error) {
      setTempError(error instanceof Error ? error.message : 'No se pudo crear el paciente provisional.');
    } finally {
      setCreatingTemp(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={busy ? undefined : onClose}>
      <form {...dialog} aria-labelledby="appointment-dialog-title" className="appointment-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong id="appointment-dialog-title">{cita ? 'Editar cita' : 'Nueva cita'}</strong>
            <span>{selectedPaciente ? `${selectedPaciente.apellidos}, ${selectedPaciente.nombre}` : 'Seleccione paciente'}</span>
          </div>
          {cita && <span className={`appointment-state ${visual.className}`}>{visual.mark} {visual.label}</span>}
        </header>

        <div className="appointment-form-grid">
          {selectedPaciente && !showPatientPicker && <div className="appointment-known-context wide">
            <strong>{selectedPaciente.nombre} {selectedPaciente.apellidos}</strong>
            <span>Historia {selectedPaciente.num_historial} · {selectedPaciente.telefono || 'Sin teléfono'}</span>
            {!cita && <button type="button" onClick={() => setShowPatientPicker(true)}>Cambiar paciente</button>}
          </div>}
          {showPatientPicker && <><div className="patient-picker-row wide">
            <label>Buscar paciente
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPatientResultsOpen(true);
                }}
                onFocus={() => setPatientResultsOpen(Boolean(query.trim()))}
                placeholder="Nombre, telefono, DNI, historia o codigo"
              />
            </label>
            <button
              type="button"
              className={`temp-patient-toggle ${showTempPatient ? 'active' : ''}`}
              title="Crear paciente provisional"
              aria-label="Crear paciente provisional"
              aria-expanded={showTempPatient}
              onClick={() => setShowTempPatient((value) => !value)}
            >
              <span className="temp-patient-icon" aria-hidden="true" />
            </button>
          </div>
          {query.trim() && patientResultsOpen && (
            <div className="patient-live-results wide">
              {filteredPatients.slice(0, 6).map((paciente) => (
                <button
                  type="button"
                  className={paciente.id === pacienteId ? 'active' : ''}
                  key={paciente.id}
                  onClick={() => {
                    setPacienteId(paciente.id);
                    setQuery(`${paciente.apellidos}, ${paciente.nombre}`);
                    setPatientResultsOpen(false);
                  }}
                >
                  <strong>{paciente.apellidos}, {paciente.nombre}</strong>
                  <span>{paciente.telefono ?? 'sin telefono'} · H{paciente.num_historial}</span>
                </button>
              ))}
              {!filteredPatients.length && !selectedPaciente && (
                <span>No hay coincidencias. Use el icono de nuevo paciente para apuntarlo temporalmente.</span>
              )}
            </div>
          )}
          <label className="wide">Paciente
            <select
              value={pacienteId}
              onChange={(event) => {
                setPacienteId(event.target.value);
                setPatientResultsOpen(false);
              }}
            >
              <option value="">Selecciona un paciente</option>
              {patientsForSelect.map((paciente) => (
                <option key={paciente.id} value={paciente.id}>
                  {paciente.num_historial} - {paciente.apellidos}, {paciente.nombre} {paciente.telefono ? `(${paciente.telefono})` : ''}
                </option>
              ))}
            </select>
          </label></>}
          {showTempPatient && (
            <div className="temporary-patient-box wide">
              <strong>Paciente provisional</strong>
              <span>Nombre y teléfono si lo tienes. Completa la ficha más tarde.</span>
              <input aria-label="Nombre del paciente provisional" value={tempName} onChange={(event) => { setTempName(event.target.value); setTempError(''); }} placeholder="Nombre y apellidos" />
              <input aria-label="Teléfono del paciente provisional" value={tempPhone} onChange={(event) => { setTempPhone(event.target.value); setTempError(''); }} placeholder="Teléfono (opcional)" />
              {tempError && <span className="inline-alert">{tempError}</span>}
              <button type="button" onClick={() => void createTempPatient()} disabled={creatingTemp}>Apuntar</button>
            </div>
          )}
          {(!showScheduleFields || !canEditSchedule) && <div className="appointment-known-context wide">
            <strong>{dateLabel(fecha)} · {hora}–{addMinutes(hora, duracion)}</strong>
            <span>{doctores.find(doctor => doctor.id === doctorId)?.nombre ?? 'Profesional seleccionado'}</span>
            {canEditSchedule && <button type="button" onClick={() => setShowScheduleFields(true)}>Cambiar horario</button>}
          </div>}
          {showScheduleFields && canEditSchedule && <><label>Fecha<input required type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} /></label>
          <label>Hora inicio<input required type="time" value={hora} onChange={(event) => setHora(event.target.value)} /></label>
          <label>Profesional
            <select value={doctorId} onChange={(event) => setDoctorId(event.target.value)}>
              {doctores.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.nombre}</option>)}
            </select>
          </label></>}
          <label>Duración (minutos)<input aria-label="Duración (minutos)" type="number" min={5} max={480} step={5} required disabled={!canEditSchedule} value={duracion} onChange={event => setDurationOverride(Number(event.target.value))} />
            {canEditSchedule && durationOverride !== null && durationOverride !== suggestedDuration && <button type="button" onClick={() => setDurationOverride(null)}>Usar habitual: {suggestedDuration} min</button>}
          </label>
          {(gabinetes.length > 0 || gabinete) && <label>Gabinete (opcional)<select disabled={!canEditSchedule} value={gabinete} onChange={event => setGabinete(event.target.value)}>
            <option value="">Sin gabinete asignado</option>
            {gabinete && !gabinetes.some(item => item.id === gabinete) && <option value={gabinete}>{cita?.gabinete_nombre ?? 'Gabinete asignado'}</option>}
            {gabinetes.filter(item => item.activo || item.id === gabinete).map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
          </select></label>}
          <label className="wide">Tratamiento previsto<input maxLength={500} list="appointment-treatment-options" value={motivo} onChange={(event) => setMotivo(event.target.value)} /></label>
          <datalist id="appointment-treatment-options">{tratamientos.map(item => <option key={item.id} value={item.nombre}>{item.duracion_habitual_min ? `${item.duracion_habitual_min} min` : ''}</option>)}</datalist>
          {!cita && <label className="appointment-check"><input type="checkbox" checked={estado === 'confirmada'} onChange={event => setEstado(event.target.checked ? 'confirmada' : 'programada')} />Cita confirmada por el paciente</label>}
          <label className="wide notes">Observaciones de la cita/tratamiento<textarea maxLength={1000} value={observaciones} onChange={(event) => setObservaciones(event.target.value)} /></label>
          <label className="appointment-check"><input type="checkbox" disabled={!canEditSchedule} checked={esUrgencia} onChange={event => setEsUrgencia(event.target.checked)} />Urgencia</label>
          {canEditSchedule && canOverrideSchedule && <label className="appointment-check"><input type="checkbox" checked={fueraHorario} onChange={event => setFueraHorario(event.target.checked)} />Permitir fuera del horario habitual</label>}
          {conflicts.length > 0 && <div className="appointment-overlap-warning wide" role="alert">
            <strong>Solape con {conflicts.length} cita{conflicts.length > 1 ? 's' : ''}</strong>
            <span>{conflicts.map(other => `${localAppointmentTime(other.fecha_hora)} · ${other.paciente?.nombre ?? 'Paciente'} ${other.paciente?.apellidos ?? ''}`).join('; ')}</span>
            {esUrgencia && scheduleChanged && <><label className="appointment-check"><input type="checkbox" checked={autorizaSolape} onChange={event => setAutorizaSolape(event.target.checked)} />Autorizar solape de urgencia</label>
            <label>Motivo del solape<input maxLength={500} required value={motivoSolape} onChange={event => setMotivoSolape(event.target.value)} /></label></>}
          </div>}
          {(validationError || error) && <p className="inline-alert wide" role="alert">{validationError || error}</p>}
        </div>

        <aside className="appointment-info">
          <span>Paciente en clínica: {cita && ['en_sala', 'en_atencion'].includes(getVisualStatus(cita)) ? 'Sí' : 'No'}</span>
          <span>Recordatorio: {cita?.recordatorio_enviado ? 'Enviado' : 'No enviado'}</span>
          <span>Canal: {cita?.recordatorio_canal ?? '-'}</span>
          <span>Confirmación: {cita?.confirmado_at || ['confirmada', 'confirmed'].includes(estado) ? 'Confirmada' : 'Pendiente'}</span>
        </aside>
        {cita && (labWorks.length > 0 || labSuggested) && (
          <section className="appointment-lab-detail" aria-label="Laboratorio asociado a la cita">
            <header>
              <strong>Laboratorio</strong>
              <span>{labWorks.length ? `${labWorks.length} trabajo${labWorks.length === 1 ? '' : 's'} asociado${labWorks.length === 1 ? '' : 's'}` : 'Sin trabajo asociado'}</span>
            </header>
            {labAlerts.map((alert) => (
              <p key={alert} className="appointment-lab-alert">{alert}</p>
            ))}
            {labWorks.map((trabajo) => {
              const meta = labStatusMeta(trabajo, todayIso());
              return (
                <article key={trabajo.id} className={`appointment-lab-item lab-${meta.variant}`}>
                  <div>
                    <strong>{trabajo.descripcion}</strong>
                    <span>{[trabajo.tipo_trabajo, trabajo.laboratorio?.nombre].filter(Boolean).join(' · ')}</span>
                  </div>
                  <em>{meta.label}</em>
                  <dl>
                    <div><dt>Envio</dt><dd>{dateLabel(trabajo.fecha_salida)}</dd></div>
                    <div><dt>Prevista</dt><dd>{dateLabel(trabajo.fecha_entrega_prevista)}</dd></div>
                    <div><dt>Recepcion</dt><dd>{dateLabel(trabajo.fecha_recepcion)}</dd></div>
                    <div><dt>Revision</dt><dd>{dateLabel(trabajo.fecha_revision)}</dd></div>
                    <div><dt>Ubicacion</dt><dd>{trabajo.ubicacion_clinica || '-'}</dd></div>
                  </dl>
                  {trabajo.observaciones && <p>{trabajo.observaciones}</p>}
                </article>
              );
            })}
          </section>
        )}
        {cita && (
          <section className="appointment-whatsapp-thread" aria-label="Historial WhatsApp de la cita">
            <header>
              <strong>WhatsApp</strong>
              <span>{whatsappThread.length ? `${whatsappThread.length} comunicaciones registradas` : 'Sin comunicaciones registradas'}</span>
            </header>
            <div>
              {whatsappThreadQuery.isLoading && <p>Cargando historial WhatsApp...</p>}
              {whatsappThreadQuery.isError && <p role="alert">No se pudo cargar el historial WhatsApp.</p>}
              {!whatsappThreadQuery.isLoading && whatsappThread.slice(0, 4).map((item) => (
                <article key={item.id} className={`appointment-whatsapp-item ${item.direction}`}>
                  <b>{whatsappDirectionLabel(item)}</b>
                  <span>{dateTimeLabel(item.sent_at ?? item.received_at ?? item.created_at)}</span>
                  <em>{whatsappIntentLabel(item)}</em>
                  <p>{item.message_body}</p>
                </article>
              ))}
              {!whatsappThreadQuery.isLoading && !whatsappThreadQuery.isError && !whatsappThread.length && (
                <p>Al enviar un recordatorio WhatsApp desde Agenda quedara asociado aqui junto a las respuestas del paciente.</p>
              )}
            </div>
          </section>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>Cerrar</button>
          <button type="submit" disabled={busy || creatingTemp}>{busy ? 'Guardando…' : 'Guardar cita'}</button>
        </footer>
      </form>
    </div>
  );
}
