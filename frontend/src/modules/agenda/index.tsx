import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, MouseEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { buscarHuecosLibres, cancelarCitaAvanzada, confirmarCita, createCita, createPaciente, enviarRecordatorioCita, getCitas, getDoctores, getHorarios, getPacientes, getTelefonear, iniciarVideoConsulta, marcarFaltaCita, marcarTelefonearReubicada, updateCita } from '../../lib/api';
import type { ApiPaciente, Cita, Doctor, HorarioDoctor, HuecoLibre, TelefonearPendiente } from '../../types/api';
import { CancelCitaModal } from './modals/CancelCitaModal';

type SlotDraft = {
  day: string;
  slot: string;
  doctorId: string;
  pacienteId?: string;
  motivo?: string;
  telefonearId?: string;
};

type HuecoResultado = HuecoLibre & {
  doctorNombre: string;
  doctorColor: string | null;
};
type HorariosPorDoctor = Record<string, HorarioDoctor[]>;

const ESTADOS = [
  'programada',
  'pending_confirmation',
  'reminder_sent',
  'confirmada',
  'confirmed',
  'reschedule_requested',
  'pending_manual_review',
  'cancelled_by_patient',
  'rescheduled',
  'en_clinica',
  'atendida',
  'anulada',
  'falta',
];

const STATUS_META: Record<string, { label: string; mark: string; className: string }> = {
  programada: { label: 'Sin confirmar', mark: '?', className: 'state-pending' },
  pending_confirmation: { label: 'Sin confirmar', mark: '?', className: 'state-pending' },
  mensaje_enviado: { label: 'Mensaje enviado', mark: 'MSG', className: 'state-message' },
  reminder_sent: { label: 'Mensaje enviado', mark: 'MSG', className: 'state-message' },
  confirmada: { label: 'Confirmada', mark: 'OK', className: 'state-confirmed' },
  confirmed: { label: 'Confirmada', mark: 'OK', className: 'state-confirmed' },
  reschedule_requested: { label: 'Solicita cambio', mark: 'REP', className: 'state-message' },
  pending_manual_review: { label: 'Revisar', mark: 'REV', className: 'state-pending' },
  cancelled_by_patient: { label: 'Cancelada paciente', mark: 'X', className: 'state-cancelled' },
  rescheduled: { label: 'Reprogramada', mark: 'REP', className: 'state-confirmed' },
  en_clinica: { label: 'En clinica', mark: 'IN', className: 'state-clinic' },
  en_tratamiento: { label: 'En tratamiento', mark: 'TR', className: 'state-treatment' },
  atendida: { label: 'Finalizada', mark: 'FIN', className: 'state-done' },
  anulada: { label: 'Cancelada', mark: 'X', className: 'state-cancelled' },
  falta: { label: 'No asistio', mark: 'NO', className: 'state-missed' },
};

const AGENDA_STATUS_LEGEND = [
  'programada',
  'mensaje_enviado',
  'confirmada',
  'reschedule_requested',
  'pending_manual_review',
  'cancelled_by_patient',
  'rescheduled',
  'en_clinica',
  'en_tratamiento',
  'atendida',
  'anulada',
  'falta',
] as const;

function todayIso() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const date = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function monthGrid(day: string) {
  const current = new Date(`${day}T12:00:00`);
  const first = new Date(current.getFullYear(), current.getMonth(), 1);
  const start = new Date(first);
  const offset = (first.getDay() + 6) % 7;
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysIso(day: string, days: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function slotIso(day: string, slot: string) {
  return `${day}T${slot}:00`;
}

function nowLocalDateTimeIso() {
  const now = new Date();
  const date = isoDate(now);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${date}T${hours}:${minutes}:00`;
}

function minutesFromTime(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function dateTimeLabel(value: string) {
  return new Date(value).toLocaleString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dateRangeIso(from: string, days: number) {
  return Array.from({ length: Math.max(1, days) }, (_, index) => addDaysIso(from, index));
}

function overlaps(start: string, duration: number, cita: Cita) {
  const slotStart = new Date(start).getTime();
  const slotEnd = slotStart + duration * 60_000;
  const citaStart = new Date(cita.fecha_hora).getTime();
  const citaEnd = citaStart + cita.duracion_min * 60_000;
  return slotStart < citaEnd && slotEnd > citaStart;
}

function weekdayIndex(day: string) {
  return (new Date(`${day}T12:00:00`).getDay() + 6) % 7;
}

function slotRange(inicio: string, fin: string, intervalo: number) {
  const slots: string[] = [];
  let current = minutesFromTime(inicio);
  const end = minutesFromTime(fin);
  const step = Math.max(5, intervalo || 10);
  while (current < end) {
    const hour = Math.floor(current / 60);
    const minute = current % 60;
    slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    current += step;
  }
  return slots;
}

function slotInHorario(slot: string, horario?: HorarioDoctor) {
  if (!horario || horario.tipo_dia === 'festivo') return false;
  return horario.bloques.some((bloque) => bloque.inicio <= slot && slot < bloque.fin);
}

function buildAgendaSlots({
  day,
  doctorId,
  doctores,
  horariosByDoctor,
  citas,
  horariosLoaded,
}: {
  day: string;
  doctorId: string;
  doctores: Doctor[];
  horariosByDoctor: HorariosPorDoctor;
  citas: Cita[];
  horariosLoaded: boolean;
}) {
  const weekday = weekdayIndex(day);
  const targetDoctorIds = doctorId ? [doctorId] : doctores.map((doctor) => doctor.id);
  const times = new Set<string>();
  let hasConfiguredDay = false;

  targetDoctorIds.forEach((targetDoctorId) => {
    const horario = horariosByDoctor[targetDoctorId]?.find((item) => item.dia_semana === weekday);
    if (!horario) return;
    hasConfiguredDay = true;
    if (horario.tipo_dia === 'festivo') return;
    horario.bloques.forEach((bloque) => {
      slotRange(bloque.inicio, bloque.fin, horario.intervalo_min).forEach((slot) => times.add(slot));
    });
  });

  if (!hasConfiguredDay && !horariosLoaded) {
    slotRange('09:00', '13:30', 10).forEach((slot) => times.add(slot));
    slotRange('15:00', '20:30', 10).forEach((slot) => times.add(slot));
  }

  citas.forEach((cita) => {
    if (!doctorId || cita.doctor_id === doctorId) times.add(cita.fecha_hora.slice(11, 16));
  });

  return Array.from(times).sort((a, b) => minutesFromTime(a) - minutesFromTime(b));
}

function getVisualStatus(cita: Cita) {
  const obs = cita.observaciones?.toLowerCase() ?? '';
    if (['programada', 'pending_confirmation'].includes(cita.estado) && cita.recordatorio_enviado) return 'mensaje_enviado';
    if (['programada', 'pending_confirmation'].includes(cita.estado) && obs.includes('recordatorio')) return 'mensaje_enviado';
  if (cita.estado === 'en_clinica' && obs.includes('en tratamiento')) return 'en_tratamiento';
  return cita.estado;
}

function patientName(cita: Cita) {
  return cita.paciente ? `${cita.paciente.nombre} ${cita.paciente.apellidos}` : 'Paciente';
}

function findPaciente(pacientes: ApiPaciente[], id?: string) {
  return pacientes.find((paciente) => paciente.id === id) ?? null;
}

function normalizePatientSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function patientSearchText(paciente: ApiPaciente) {
  return normalizePatientSearch([
    paciente.nombre,
    paciente.apellidos,
    `${paciente.apellidos} ${paciente.nombre}`,
    paciente.telefono,
    paciente.telefono2,
    paciente.dni_nie,
    paciente.num_historial,
    paciente.codigo,
  ].filter(Boolean).join(' '));
}

function patientMatchesQuery(paciente: ApiPaciente, query: string) {
  const tokens = normalizePatientSearch(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const haystack = patientSearchText(paciente);
  return tokens.every((token) => haystack.includes(token));
}

function citaMatchesQuery(cita: Cita, pacientes: ApiPaciente[], query: string) {
  const tokens = normalizePatientSearch(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const paciente = findPaciente(pacientes, cita.paciente_id);
  const visual = STATUS_META[getVisualStatus(cita)] ?? STATUS_META.programada;
  const haystack = normalizePatientSearch([
    patientName(cita),
    paciente ? patientSearchText(paciente) : '',
    cita.paciente?.telefono,
    cita.paciente?.telefono2,
    cita.paciente?.dni_nie,
    cita.paciente?.email,
    cita.paciente?.codigo,
    cita.paciente?.num_historial,
    cita.motivo,
    cita.observaciones,
    cita.doctor?.nombre,
    cita.estado,
    visual.label,
  ].filter(Boolean).join(' '));
  return tokens.every((token) => haystack.includes(token));
}

function shortDoctorName(name: string) {
  return name
    .replace(/^Dra?\.\s*/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

function AgendaDayBrief({
  nextCita,
  pendingCount,
  changeRequestCount,
  clinicCount,
  freeSlotsCount,
  totalSlots,
  onOpenNext,
  onSearchSlot,
  onSearchCita,
}: {
  nextCita: Cita | null;
  pendingCount: number;
  changeRequestCount: number;
  clinicCount: number;
  freeSlotsCount: number;
  totalSlots: number;
  onOpenNext: () => void;
  onSearchSlot: () => void;
  onSearchCita: () => void;
}) {
  return (
    <div className="agenda-day-brief" aria-label="Resumen operativo de agenda">
      <button type="button" className="agenda-day-brief-main" onClick={nextCita ? onOpenNext : onSearchSlot}>
        <span>Siguiente</span>
        <strong>{nextCita ? `${nextCita.fecha_hora.slice(11, 16)} · ${patientName(nextCita)}` : 'Sin siguiente cita'}</strong>
        <em>{nextCita?.motivo || 'Buscar un hueco libre'}</em>
      </button>
      <button type="button" onClick={onSearchCita}>
        <span>Por confirmar</span>
        <strong>{pendingCount}</strong>
      </button>
      <button type="button" onClick={onSearchCita}>
        <span>Cambios</span>
        <strong>{changeRequestCount}</strong>
      </button>
      <button type="button" onClick={onSearchCita}>
        <span>En clinica</span>
        <strong>{clinicCount}</strong>
      </button>
      <button type="button" onClick={onSearchSlot}>
        <span>Huecos visibles</span>
        <strong>{freeSlotsCount}/{totalSlots}</strong>
      </button>
    </div>
  );
}

function AgendaToolbar({
  day,
  doctorId,
  doctores,
  horarioLabel,
  citasCount,
  pendingCount,
  clinicCount,
  onDayChange,
  onDoctorChange,
  onRefresh,
  onSearchCita,
  onSearchSlot,
  onOpenHorario,
}: {
  day: string;
  doctorId: string;
  doctores: Doctor[];
  horarioLabel: string;
  citasCount: number;
  pendingCount: number;
  clinicCount: number;
  onDayChange: (day: string) => void;
  onDoctorChange: (doctorId: string) => void;
  onRefresh: () => void;
  onSearchCita: () => void;
  onSearchSlot: () => void;
  onOpenHorario: () => void;
}) {
  const statusTitle = horarioLabel === 'Todas las agendas' ? 'Resumen' : horarioLabel;

  return (
    <div className="agenda-compact-toolbar" aria-label="Filtros y acciones de agenda" onClick={(event) => event.stopPropagation()}>
      <label>
        <span>Fecha</span>
        <input type="date" value={day} onChange={(event) => onDayChange(event.target.value)} />
      </label>
      <label className="agenda-toolbar-doctor">
        <span>Doctor</span>
        <select value={doctorId} onChange={(event) => onDoctorChange(event.target.value)}>
          <option value="">Todas las agendas</option>
          {doctores.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>{doctor.nombre}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Vista</span>
        <select value="dia" onChange={() => undefined}>
          <option value="dia">Día</option>
        </select>
      </label>
      <div className="agenda-toolbar-status" title={horarioLabel}>
        <b>{statusTitle}</b>
        <span>{citasCount} citas · {pendingCount} confirmar · {clinicCount} en clínica</span>
      </div>
      <div className="agenda-toolbar-actions">
        <button type="button" onClick={onSearchCita}>Buscar citas</button>
        <button type="button" onClick={onSearchSlot}>Buscar hueco</button>
        <button type="button" onClick={onOpenHorario}>Horario</button>
        <button type="button" onClick={onRefresh}>Refrescar</button>
      </div>
    </div>
  );
}

function CitaModal({
  cita,
  draft,
  pacientes,
  doctores,
  onClose,
  onSubmit,
  onCreateTemporaryPaciente,
  onStartVideo,
}: {
  cita: Cita | null;
  draft: SlotDraft | null;
  pacientes: ApiPaciente[];
  doctores: Doctor[];
  onClose: () => void;
  onSubmit: (data: {
    citaId?: string;
    paciente_id: string;
    doctor_id: string;
    fecha_hora: string;
    duracion_min: number;
    estado: string;
    motivo: string;
    observaciones: string;
    gabinete_id: string | null;
    telefonearId?: string;
  }) => void;
  onCreateTemporaryPaciente: (data: { nombreCompleto: string; telefono: string }) => Promise<ApiPaciente>;
  onStartVideo: (cita: Cita) => Promise<string>;
}) {
  const [query, setQuery] = useState('');
  const [patientResultsOpen, setPatientResultsOpen] = useState(false);
  const initialPacienteId = cita?.paciente_id ?? draft?.pacienteId ?? sessionStorage.getItem('dentcore_selected_patient_id') ?? pacientes[0]?.id ?? '';
  const [pacienteId, setPacienteId] = useState(initialPacienteId);
  const [doctorId, setDoctorId] = useState(cita?.doctor_id ?? draft?.doctorId ?? doctores[0]?.id ?? '');
  const [fecha, setFecha] = useState((cita?.fecha_hora ?? (draft ? slotIso(draft.day, draft.slot) : `${todayIso()}T09:00:00`)).slice(0, 10));
  const [hora, setHora] = useState((cita?.fecha_hora ?? (draft ? slotIso(draft.day, draft.slot) : `${todayIso()}T09:00:00`)).slice(11, 16));
  const [duracion, setDuracion] = useState(cita?.duracion_min ?? 30);
  const [estado, setEstado] = useState(cita?.estado ?? 'programada');
  const storedTreatment = !cita ? sessionStorage.getItem('dentcore_selected_treatment') : null;
  const [motivo, setMotivo] = useState(cita?.motivo ?? draft?.motivo ?? storedTreatment ?? '');
  const [observaciones, setObservaciones] = useState(cita?.observaciones ?? '');
  const [gabinete, setGabinete] = useState(cita?.gabinete_id ?? '');
  const [tempName, setTempName] = useState('');
  const [tempPhone, setTempPhone] = useState('');
  const [creatingTemp, setCreatingTemp] = useState(false);
  const [showTempPatient, setShowTempPatient] = useState(false);
  const [tempError, setTempError] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  const filteredPatients = useMemo(() => {
    if (!query.trim()) return pacientes;
    return pacientes.filter((paciente) => patientMatchesQuery(paciente, query));
  }, [pacientes, query]);

  const selectedPaciente = findPaciente(pacientes, pacienteId);
  const patientsForSelect = selectedPaciente && !filteredPatients.some((paciente) => paciente.id === selectedPaciente.id)
    ? [selectedPaciente, ...filteredPatients]
    : filteredPatients;
  const visual = cita ? STATUS_META[getVisualStatus(cita)] : STATUS_META.programada;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!pacienteId || !doctorId) return;
    onSubmit({
      citaId: cita?.id,
      paciente_id: pacienteId,
      doctor_id: doctorId,
      fecha_hora: `${fecha}T${hora}:00`,
      duracion_min: duracion,
      estado,
      motivo,
      observaciones,
      gabinete_id: gabinete || null,
      telefonearId: draft?.telefonearId,
    });
  }

  async function createTempPatient() {
    if (!tempName.trim() || !tempPhone.trim()) {
      setTempError('Indique nombre y teléfono para el paciente temporal');
      return;
    }
    setCreatingTemp(true);
    try {
      const paciente = await onCreateTemporaryPaciente({ nombreCompleto: tempName, telefono: tempPhone });
      setPacienteId(paciente.id);
      setQuery(`${paciente.nombre} ${paciente.apellidos}`);
      setPatientResultsOpen(false);
      setObservaciones((prev) => `${prev}\nPaciente temporal: completar datos en clínica.`.trim());
      setTempName('');
      setTempPhone('');
      setShowTempPatient(false);
    } finally {
      setCreatingTemp(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="appointment-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>{cita ? 'Editar cita' : 'Nueva cita'}</strong>
            <span>{selectedPaciente ? `${selectedPaciente.apellidos}, ${selectedPaciente.nombre}` : 'Seleccione paciente'}</span>
          </div>
          {cita && <span className={`appointment-state ${visual.className}`}>{visual.mark} {visual.label}</span>}
        </header>

        <div className="appointment-form-grid">
          <div className="patient-picker-row wide">
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
              title="Crear paciente temporal"
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
              {patientsForSelect.map((paciente) => (
                <option key={paciente.id} value={paciente.id}>
                  {paciente.num_historial} - {paciente.apellidos}, {paciente.nombre} {paciente.telefono ? `(${paciente.telefono})` : ''}
                </option>
              ))}
            </select>
          </label>
          {showTempPatient && (
            <div className="temporary-patient-box wide">
              <strong>Paciente temporal para cita</strong>
              <span>Solo nombre y telefono. Luego se completa la ficha desde Pacientes.</span>
              <input value={tempName} onChange={(event) => { setTempName(event.target.value); setTempError(''); }} placeholder="Nombre y apellidos" />
              <input value={tempPhone} onChange={(event) => { setTempPhone(event.target.value); setTempError(''); }} placeholder="Telefono" />
              {tempError && <span className="inline-alert">{tempError}</span>}
              <button type="button" onClick={() => void createTempPatient()} disabled={creatingTemp}>Apuntar</button>
            </div>
          )}
          <label>Fecha<input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} /></label>
          <label>Hora inicio<input type="time" value={hora} onChange={(event) => setHora(event.target.value)} /></label>
          <label>Hora fin<input readOnly value={addMinutes(hora, duracion)} /></label>
          <label>Duracion
            <select value={duracion} onChange={(event) => setDuracion(Number(event.target.value))}>
              {[10, 20, 30, 40, 50, 60, 90, 120].map((value) => <option key={value} value={value}>{value} min</option>)}
            </select>
          </label>
          <label>Profesional
            <select value={doctorId} onChange={(event) => setDoctorId(event.target.value)}>
              {doctores.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.nombre}</option>)}
            </select>
          </label>
          <label>Gabinete<input value={gabinete} onChange={(event) => setGabinete(event.target.value)} placeholder="Box / sillon" /></label>
          <label>Estado
            <select value={estado} onChange={(event) => setEstado(event.target.value)}>
              {ESTADOS.map((item) => <option key={item} value={item}>{STATUS_META[item]?.label ?? item}</option>)}
            </select>
          </label>
          <label className="wide">Tratamiento previsto<input value={motivo} onChange={(event) => setMotivo(event.target.value)} /></label>
          <label className="wide notes">Observaciones de la cita/tratamiento<textarea value={observaciones} onChange={(event) => setObservaciones(event.target.value)} /></label>
        </div>

        <aside className="appointment-info">
          <span>Paciente en clinica: {estado === 'en_clinica' ? 'Si' : 'No'}</span>
          <span>Recordatorio: {cita?.recordatorio_enviado ? 'Enviado' : 'No enviado'}</span>
          <span>Canal: {cita?.recordatorio_canal ?? '-'}</span>
          <span>Confirmacion: {['confirmada', 'confirmed'].includes(estado) ? 'Confirmada' : 'Pendiente'}</span>
        </aside>
        {cita && (
          <div className="video-consult-panel">
            <button type="button" onClick={async () => setVideoUrl(await onStartVideo(cita))}>Iniciar videollamada</button>
            {videoUrl && <div><strong>Videoconsulta iniciada</strong><iframe title="Videollamada" src={videoUrl} allow="camera; microphone; fullscreen" /></div>}
          </div>
        )}

        <footer>
          <button type="button" onClick={onClose}>Cerrar</button>
          <button type="submit">Guardar cita</button>
        </footer>
      </form>
    </div>
  );
}

function BuscarHuecoModal({
  day,
  doctorId,
  pacientes,
  doctores,
  onClose,
  onSelect,
}: {
  day: string;
  doctorId: string;
  pacientes: ApiPaciente[];
  doctores: Doctor[];
  onClose: () => void;
  onSelect: (hueco: HuecoResultado, pacienteId?: string) => void;
}) {
  const [selectedDoctorId, setSelectedDoctorId] = useState(doctorId);
  const [pacienteQuery, setPacienteQuery] = useState('');
  const [pacienteId, setPacienteId] = useState(sessionStorage.getItem('dentcore_selected_patient_id') ?? '');
  const [turno, setTurno] = useState<'todo' | 'manana' | 'tarde'>('todo');
  const [fechaDesde, setFechaDesde] = useState(day);
  const [dias, setDias] = useState('14');
  const [duracion, setDuracion] = useState('30');
  const [resultados, setResultados] = useState<HuecoResultado[]>([]);
  const [error, setError] = useState('');
  const [buscando, setBuscando] = useState(false);

  const filteredPatients = useMemo(() => {
    if (!pacienteQuery.trim()) return pacientes.slice(0, 30);
    return pacientes.filter((paciente) => patientMatchesQuery(paciente, pacienteQuery)).slice(0, 30);
  }, [pacientes, pacienteQuery]);

  const search = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    setError('');
    const targets = selectedDoctorId ? doctores.filter((doctor) => doctor.id === selectedDoctorId) : doctores;
    if (!targets.length) {
      setError('No hay doctores activos para buscar huecos.');
      return;
    }
    setBuscando(true);
    try {
      const hasta = addDaysIso(fechaDesde, Math.max(0, Number(dias || 1) - 1));
      const duration = Number(duracion);
      const desdeDateTime = fechaDesde === todayIso() ? nowLocalDateTimeIso() : `${fechaDesde}T00:00:00`;
      const responses = await Promise.all(targets.map(async (doctor) => {
        const huecos = await buscarHuecosLibres({
          doctor_id: doctor.id,
          duracion_min: duration,
          desde: desdeDateTime,
          hasta: `${hasta}T23:59:59`,
          solo_manana: turno === 'manana',
          solo_tarde: turno === 'tarde',
          max_resultados: 20,
        });
        return huecos.map((hueco) => ({
          ...hueco,
          doctorNombre: doctor.nombre,
          doctorColor: doctor.color_agenda,
        }));
      }));
      let merged = responses.flat().sort((a, b) => a.fecha_hora_inicio.localeCompare(b.fecha_hora_inicio)).slice(0, 40);

      if (!merged.length) {
        const citas = await getCitas({ fecha_desde: `${fechaDesde}T00:00:00`, fecha_hasta: `${hasta}T23:59:59` });
        const baseSlots = turno === 'manana'
          ? ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30']
          : turno === 'tarde'
            ? ['15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00']
            : ['09:00', '09:30', '10:00', '10:30', '11:30', '12:30', '15:00', '15:30', '16:00', '17:00', '18:00', '19:00'];
        merged = dateRangeIso(fechaDesde, Number(dias || 1)).flatMap((date) => targets.flatMap((doctor) => baseSlots.map((slot) => ({
          doctor_id: doctor.id,
          fecha_hora_inicio: `${date}T${slot}:00`,
          fecha_hora_fin: `${date}T${addMinutes(slot, duration)}:00`,
          duracion_min: duration,
          doctorNombre: doctor.nombre,
          doctorColor: doctor.color_agenda,
    })).filter((hueco) => (
          hueco.fecha_hora_inicio >= desdeDateTime
          && !citas.some((cita) => cita.doctor_id === doctor.id && !['anulada', 'falta', 'cancelled_by_patient'].includes(cita.estado) && overlaps(hueco.fecha_hora_inicio, duration, cita))
        )))).slice(0, 40);
      }

      setResultados(merged);
    } catch (err) {
      setError((err as Error).message || 'No se pudieron buscar huecos.');
    } finally {
      setBuscando(false);
    }
  }, [dias, doctores, duracion, fechaDesde, selectedDoctorId, turno]);

  const autoSearchStartedRef = useRef(false);
  useEffect(() => {
    if (autoSearchStartedRef.current) return;
    autoSearchStartedRef.current = true;
    void search();
  }, [search]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="slot-search-modal" onSubmit={search} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>Buscar hueco libre</strong>
            <span>Filtra por doctor, paciente, turno y rango de fechas.</span>
          </div>
          <button type="button" onClick={onClose}>Cerrar</button>
        </header>

        <div className="slot-search-grid">
          <label>Doctor
            <select value={selectedDoctorId} onChange={(event) => setSelectedDoctorId(event.target.value)}>
              <option value="">General - todos</option>
              {doctores.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.nombre}</option>)}
            </select>
          </label>
          <label>Paciente
            <input value={pacienteQuery} onChange={(event) => setPacienteQuery(event.target.value)} placeholder="Nombre, teléfono o historia" />
          </label>
          <label>Seleccionar paciente
            <select value={pacienteId} onChange={(event) => setPacienteId(event.target.value)}>
              <option value="">Sin paciente cargado</option>
              {filteredPatients.map((paciente) => (
                <option key={paciente.id} value={paciente.id}>{paciente.num_historial} - {paciente.apellidos}, {paciente.nombre}</option>
              ))}
            </select>
          </label>
          <label>Turno
            <select value={turno} onChange={(event) => setTurno(event.target.value as typeof turno)}>
              <option value="todo">Todo el día</option>
              <option value="manana">Mañana</option>
              <option value="tarde">Tarde</option>
            </select>
          </label>
          <label>Desde<input type="date" value={fechaDesde} onChange={(event) => setFechaDesde(event.target.value)} /></label>
          <label>Lapso
            <select value={dias} onChange={(event) => setDias(event.target.value)}>
              <option value="1">Solo ese día</option>
              <option value="3">3 días</option>
              <option value="7">1 semana</option>
              <option value="14">2 semanas</option>
              <option value="30">1 mes</option>
            </select>
          </label>
          <label>Duración
            <select value={duracion} onChange={(event) => setDuracion(event.target.value)}>
              {[10, 20, 30, 40, 50, 60, 90, 120].map((value) => <option key={value} value={value}>{value} min</option>)}
            </select>
          </label>
          <button type="submit" disabled={buscando}>{buscando ? 'Buscando...' : 'Buscar'}</button>
        </div>

        <div className="slot-results">
          {error && <p className="form-error">{error}</p>}
          {!error && !resultados.length && <p>Elige los filtros y pulsa Buscar.</p>}
          {!error && Boolean(resultados.length) && (
            <div className="slot-results-summary">
              <strong>{resultados.length} huecos encontrados</strong>
              <span>Pulse uno para crear la cita con esos datos.</span>
            </div>
          )}
          {resultados.map((hueco) => (
            <button
              type="button"
              key={`${hueco.doctor_id}-${hueco.fecha_hora_inicio}`}
              style={{ '--doctor-color': hueco.doctorColor ?? '#0f7cad' } as CSSProperties}
              onClick={() => onSelect(hueco, pacienteId || undefined)}
            >
              <b>{dateTimeLabel(hueco.fecha_hora_inicio)}</b>
              <span>{hueco.doctorNombre}</span>
              <em>{hueco.duracion_min} min</em>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}

function CitasPacienteModal({
  pacienteId,
  pacientes,
  onClose,
  onSelect,
}: {
  pacienteId: string;
  pacientes: ApiPaciente[];
  onClose: () => void;
  onSelect: (cita: Cita) => void;
}) {
  const paciente = pacientes.find((item) => item.id === pacienteId);
  const today = todayIso();
  const citasPacienteQuery = useQuery({
    queryKey: ['agenda-citas-paciente', pacienteId],
    queryFn: () => getCitas({
      paciente_id: pacienteId,
      fecha_desde: `${today}T00:00:00`,
      fecha_hasta: `${addDaysIso(today, 365)}T23:59:59`,
    }),
    enabled: Boolean(pacienteId),
  });
  const citasPendientes = (citasPacienteQuery.data ?? [])
    .filter((cita) => !['anulada', 'falta', 'cancelled_by_patient', 'atendida'].includes(cita.estado))
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="patient-appointments-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>Citas pendientes</strong>
            <span>{paciente ? `${paciente.apellidos}, ${paciente.nombre}` : 'Paciente seleccionado'}</span>
          </div>
          <button type="button" onClick={onClose}>Cerrar</button>
        </header>
        <div className="patient-appointments-list">
          {citasPacienteQuery.isLoading && <p>Buscando proximas citas...</p>}
          {!citasPacienteQuery.isLoading && citasPendientes.map((cita) => (
            <button type="button" key={cita.id} onClick={() => onSelect(cita)}>
              <b>{dateTimeLabel(cita.fecha_hora)}</b>
              <span>{cita.doctor?.nombre ?? 'Doctor'} - {cita.motivo || 'Cita dental'}</span>
              <em className={`status-pill status-${cita.estado}`}>{cita.estado}</em>
            </button>
          ))}
          {!citasPacienteQuery.isLoading && !citasPendientes.length && (
            <p>No hay citas pendientes para este paciente.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export default function AgendaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [day, setDay] = useState(() => {
    const focusDate = sessionStorage.getItem('dentcore_agenda_focus_date');
    if (focusDate) {
      sessionStorage.removeItem('dentcore_agenda_focus_date');
      return focusDate;
    }
    return todayIso();
  });
  const [doctorId, setDoctorId] = useState<string>('');
  const [modalCita, setModalCita] = useState<Cita | null>(null);
  const [slotDraft, setSlotDraft] = useState<SlotDraft | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cita: Cita } | null>(null);
  const [showBuscarHueco, setShowBuscarHueco] = useState(false);
  const [showCitasPaciente, setShowCitasPaciente] = useState(false);
  const [cancelCitaModal, setCancelCitaModal] = useState<{ cita: Cita; estado: 'anulada' | 'falta' } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [now, setNow] = useState(new Date());

  const doctoresQuery = useQuery({ queryKey: ['doctores'], queryFn: getDoctores });
  const pacientesQuery = useQuery({ queryKey: ['pacientes'], queryFn: getPacientes });
  const telefonearQuery = useQuery({ queryKey: ['telefonear'], queryFn: getTelefonear });

  const range = useMemo(() => ({
    fecha_desde: `${day}T00:00:00`,
    fecha_hasta: `${day}T23:59:59`,
    ...(doctorId ? { doctor_id: doctorId } : {}),
  }), [day, doctorId]);

  const citasQuery = useQuery({
    queryKey: ['citas', range],
    queryFn: () => getCitas(range),
  });

  const doctores = useMemo(() => doctoresQuery.data ?? [], [doctoresQuery.data]);
  const pacientes = useMemo(() => pacientesQuery.data ?? [], [pacientesQuery.data]);
  const citas = useMemo(() => citasQuery.data ?? [], [citasQuery.data]);

  useEffect(() => {
    const focusCitaId = sessionStorage.getItem('dentcore_agenda_focus_cita_id');
    if (!focusCitaId || citasQuery.isLoading) return;
    const cita = citas.find((item) => item.id === focusCitaId);
    if (!cita) return;
    const timeout = window.setTimeout(() => {
      sessionStorage.removeItem('dentcore_agenda_focus_cita_id');
      setModalCita(cita);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [citas, citasQuery.isLoading]);
  const horariosAgendaQuery = useQuery({
    queryKey: ['agenda-horarios', doctores.map((doctor) => doctor.id).join(',')],
    queryFn: async () => {
      const entries = await Promise.all(doctores.map(async (doctor) => [doctor.id, await getHorarios(doctor.id)] as const));
      return Object.fromEntries(entries) as HorariosPorDoctor;
    },
    enabled: doctores.length > 0,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: {
      citaId?: string;
      paciente_id: string;
      doctor_id: string;
      fecha_hora: string;
      duracion_min: number;
      estado: string;
      motivo: string;
      observaciones: string;
      gabinete_id: string | null;
      telefonearId?: string;
    }) => {
      const { telefonearId, citaId, ...citaData } = data;
      if (citaId) {
        return updateCita(citaId, citaData);
      }
      const { estado, ...createPayload } = citaData;
      const created = await createCita(createPayload);
      const saved = estado !== 'programada'
        ? await updateCita(created.id, { estado })
        : created;
      if (telefonearId) {
        await marcarTelefonearReubicada(telefonearId, saved.id);
      }
      return saved;
    },
    onSuccess: (cita) => {
      setModalCita(null);
      setSlotDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['citas'] });
      void queryClient.invalidateQueries({ queryKey: ['citas-paciente', cita.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['paciente-detalle', cita.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['pacientes'] });
      void queryClient.invalidateQueries({ queryKey: ['telefonear'] });
      sessionStorage.removeItem('dentcore_selected_treatment');
      sessionStorage.removeItem('dentcore_selected_presupuesto_linea_id');
      setToastMessage(null);
    },
    onError: (error) => {
      setToastMessage(error instanceof Error ? error.message : 'No se pudo guardar la cita.');
    },
  });

  const invalidatePatientCitas = useCallback((pacienteId?: string | null) => {
    void queryClient.invalidateQueries({ queryKey: ['citas'] });
    if (pacienteId) {
      void queryClient.invalidateQueries({ queryKey: ['citas-paciente', pacienteId] });
      void queryClient.invalidateQueries({ queryKey: ['paciente-detalle', pacienteId] });
    }
  }, [queryClient]);

  const quickUpdate = useMutation({
    mutationFn: ({ cita, patch }: { cita: Cita; patch: Parameters<typeof updateCita>[1] }) => updateCita(cita.id, patch),
    onSuccess: (updated) => {
      setContextMenu(null);
      invalidatePatientCitas(updated.paciente_id);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (cita: Cita) => confirmarCita(cita.id),
    onSuccess: (updated) => {
      setContextMenu(null);
      invalidatePatientCitas(updated.paciente_id);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ cita, motivo, tipo }: { cita: Cita; motivo: string; tipo: 'anulacion_paciente' | 'anulacion_clinica' | 'no_vino' | 'reprogramada' | 'otro' }) =>
      cancelarCitaAvanzada(cita.id, { motivo_cancelacion: motivo, tipo, crear_telefonear: tipo === 'reprogramada' }),
    onSuccess: (updated) => {
      setContextMenu(null);
      invalidatePatientCitas(updated.paciente_id);
      void telefonearQuery.refetch();
    },
  });

  const faltaMutation = useMutation({
    mutationFn: ({ cita, motivo }: { cita: Cita; motivo: string }) => marcarFaltaCita(cita.id, motivo),
    onSuccess: (updated) => {
      setContextMenu(null);
      invalidatePatientCitas(updated.paciente_id);
      void queryClient.invalidateQueries({ queryKey: ['historial-paciente', updated.paciente_id] });
    },
  });

  const videoMutation = useMutation({
    mutationFn: async (cita: Cita) => {
      const response = await iniciarVideoConsulta(cita.id);
      void queryClient.invalidateQueries({ queryKey: ['citas'] });
      return response.videoUrl;
    },
  });

  const recordatorioMutation = useMutation({
    mutationFn: async ({ cita, canal }: { cita: Cita; canal: 'whatsapp' | 'email' | 'ambos' }) => {
      const response = await enviarRecordatorioCita(cita.id, canal);
      if (response.whatsappUrl) window.open(response.whatsappUrl, '_blank');
      if (response.emailUrl) window.open(response.emailUrl, '_blank');
      return response;
    },
    onSuccess: () => {
      setContextMenu(null);
      void queryClient.invalidateQueries({ queryKey: ['citas'] });
    },
  });

  const createTempPatient = useMutation({
    mutationFn: async ({ nombreCompleto, telefono }: { nombreCompleto: string; telefono: string }) => {
      const parts = nombreCompleto.trim().split(/\s+/);
      const nombre = parts.shift() ?? nombreCompleto.trim();
      const apellidos = parts.join(' ') || 'TEMPORAL';
      return createPaciente({
        nombre,
        apellidos,
        telefono,
        observaciones: 'PACIENTE TEMPORAL - completar ficha en clínica.',
        datos_salud: { temporal: true, pendiente_completar: true },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pacientes'] });
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshHorarios = () => {
      void horariosAgendaQuery.refetch();
    };
    window.addEventListener('dentcore:horarios-updated', refreshHorarios);
    return () => window.removeEventListener('dentcore:horarios-updated', refreshHorarios);
  }, [horariosAgendaQuery]);

  const selected = new Date(`${day}T12:00:00`);
  const days = monthGrid(day);
  const monthName = selected.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const doctorById = useMemo(() => new Map(doctores.map((doctor) => [doctor.id, doctor])), [doctores]);
  const horariosByDoctor = useMemo(() => horariosAgendaQuery.data ?? {}, [horariosAgendaQuery.data]);
  const slots = useMemo(() => buildAgendaSlots({
    day,
    doctorId,
    doctores,
    horariosByDoctor,
    citas,
    horariosLoaded: horariosAgendaQuery.isSuccess,
  }), [day, doctorId, doctores, horariosByDoctor, citas, horariosAgendaQuery.isSuccess]);
  const nowDay = isoDate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const visibleStart = slots.length ? minutesFromTime(slots[0]) : 0;
  const visibleEnd = slots.length ? minutesFromTime(addMinutes(slots[slots.length - 1], 10)) : 0;
  const showNowLine = slots.length > 0 && day === nowDay && nowMinutes >= visibleStart && nowMinutes <= visibleEnd;
  const nowSlot = slots.find((slot) => {
    const start = minutesFromTime(slot);
    return nowMinutes >= start && nowMinutes < start + 10;
  });

  const doctorForSlot = useCallback((slot: string, targetDay = day) => {
    if (doctorId) return doctorId;
    const weekday = weekdayIndex(targetDay);
    return doctores.find((doctor) => slotInHorario(slot, horariosByDoctor[doctor.id]?.find((horario) => horario.dia_semana === weekday)))?.id
      ?? doctores[0]?.id
      ?? '';
  }, [day, doctorId, doctores, horariosByDoctor]);

  const openNew = useCallback((
    slot: string,
    pacienteId?: string,
    targetDay = day,
    targetDoctorId = doctorForSlot(slot, targetDay),
    meta: Pick<SlotDraft, 'motivo' | 'telefonearId'> = {},
  ) => {
    setContextMenu(null);
    setModalCita(null);
    setSlotDraft({ day: targetDay, slot, doctorId: targetDoctorId, pacienteId, ...meta });
  }, [day, doctorForSlot]);

  useEffect(() => {
    if (sessionStorage.getItem('dentcore_agenda_action') !== 'new') return;
    if (!doctores.length || !slots.length || slotDraft || modalCita) return;
    const selectedPacienteId = sessionStorage.getItem('dentcore_selected_patient_id') ?? undefined;
    const preferredSlot = slots.find((slot) => minutesFromTime(slot) >= 9 * 60) ?? slots[0];
    sessionStorage.removeItem('dentcore_agenda_action');
    const timeout = window.setTimeout(() => {
      openNew(preferredSlot, selectedPacienteId, day, doctorForSlot(preferredSlot, day));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [day, doctores.length, doctorForSlot, modalCita, openNew, slotDraft, slots]);

  function openPatient(cita: Cita) {
    sessionStorage.setItem('dentcore_selected_patient_id', cita.paciente_id);
    navigate(`/pacientes?paciente_id=${cita.paciente_id}`);
  }

  function handleContext(event: MouseEvent, cita: Cita) {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, cita });
  }

  function setStatus(cita: Cita, estado: string, extraObservation?: string) {
    const nextObservaciones = extraObservation ? `${cita.observaciones ?? ''}\n${extraObservation}`.trim() : cita.observaciones ?? null;
    quickUpdate.mutate({ cita, patch: { estado, observaciones: nextObservaciones } });
  }

  function cancelCita(cita: Cita, estado: 'anulada' | 'falta') {
    setContextMenu(null);
    setCancelCitaModal({ cita, estado });
  }

  function confirmCancelCita(motivo: string, tipo: string) {
    if (!cancelCitaModal) return;
    const { cita, estado } = cancelCitaModal;
    setCancelCitaModal(null);
    if (estado === 'falta') {
      faltaMutation.mutate({ cita, motivo });
      return;
    }
    cancelMutation.mutate({ cita, motivo, tipo: tipo as 'anulacion_paciente' | 'anulacion_clinica' | 'no_vino' | 'reprogramada' | 'otro' });
  }

  function enviarRecordatorio(cita: Cita, canal: 'whatsapp' | 'email' | 'ambos') {
    recordatorioMutation.mutate({ cita, canal });
  }

  function copiarTelefono(cita: Cita) {
    const telefono = cita.paciente?.telefono;
    if (!telefono) {
      setToastMessage('Esta cita no tiene teléfono de paciente.');
      setContextMenu(null);
      return;
    }
    void navigator.clipboard?.writeText(telefono);
    setContextMenu(null);
  }

  function reprogramarCita(cita: Cita) {
    setModalCita(cita);
    setContextMenu(null);
  }

  async function iniciarVideoDesdeMenu(cita: Cita) {
    const url = await videoMutation.mutateAsync(cita);
    window.open(url, '_blank');
    setContextMenu(null);
  }

  function buscarCita() {
    const selectedPacienteId = sessionStorage.getItem('dentcore_selected_patient_id');
    if (selectedPacienteId) {
      setShowCitasPaciente(true);
      return;
    }
    setShowSearchBar((prev) => !prev);
  }

  function ejecutarBusqueda(query: string) {
    if (!query.trim()) return;
    const cita = (citasQuery.data ?? []).find((item) => citaMatchesQuery(item, pacientes, query));
    if (cita) {
      setSearchQuery('');
      setShowSearchBar(false);
      setModalCita(cita);
      return;
    }
    setToastMessage('No se ha encontrado una cita con ese texto en el día visible.');
  }

  function buscarHuecoLibre() {
    setShowBuscarHueco(true);
  }

  function darCitaDesdeTelefonear(item: TelefonearPendiente) {
    const slot = slots.find((candidate) => minutesFromTime(candidate) >= 9 * 60) ?? slots[0];
    if (!slot) {
      setToastMessage('No hay huecos visibles para crear la cita. Cambia de dia o revisa el horario.');
      return;
    }
    openNew(slot, item.paciente_id, day, item.doctor_id || doctorForSlot(slot, day), {
      telefonearId: item.id,
      motivo: item.motivo ?? item.notas ?? 'Reprogramar cita',
    });
  }

  function verOcupacion() {
    const total = slots.length;
    const ocupadas = citas.length;
    setToastMessage(total ? `Ocupación: ${ocupadas}/${total} huecos (${Math.round((ocupadas / total) * 100)}%).` : 'No hay horario visible para calcular ocupación.');
  }

  const todayHorario = doctorId
    ? horariosByDoctor[doctorId]?.find((horario) => horario.dia_semana === weekdayIndex(day))
    : null;
  const horarioLabel = todayHorario?.bloques.length
    ? todayHorario.bloques.map((bloque) => `${bloque.inicio}-${bloque.fin}`).join(' / ')
    : todayHorario?.tipo_dia === 'festivo'
      ? 'No trabaja'
      : doctorId
        ? 'Sin horario'
        : 'Todas las agendas';
  const citasActivas = citas.filter((cita) => !['anulada', 'falta', 'cancelled_by_patient'].includes(cita.estado));
  const pendientesConfirmar = citasActivas.filter((cita) => ['programada', 'pending_confirmation', 'reminder_sent', 'pending_manual_review'].includes(cita.estado));
  const solicitudesCambio = citasActivas.filter((cita) => cita.estado === 'reschedule_requested');
  const pacientesEnClinica = citasActivas.filter((cita) => cita.estado === 'en_clinica');
  const nextVisibleCita = citasActivas
    .filter((cita) => !['atendida', 'reschedule_requested', 'pending_manual_review'].includes(cita.estado) && cita.fecha_hora >= now.toISOString())
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0] ?? null;
  const freeSlotsCount = slots.filter((slot) => (
    !citasActivas.some((cita) => cita.fecha_hora.slice(11, 16) === slot && cita.estado !== 'atendida')
  )).length;
  const hasAgendaError = doctoresQuery.isError || pacientesQuery.isError || citasQuery.isError || telefonearQuery.isError || horariosAgendaQuery.isError;
  const agendaLoading = doctoresQuery.isLoading || citasQuery.isLoading || horariosAgendaQuery.isLoading;

  return (
    <section className="page page-shell agenda-euro" onClick={() => setContextMenu(null)}>
      <AgendaToolbar
        day={day}
        doctorId={doctorId}
        doctores={doctores}
        horarioLabel={horarioLabel}
        citasCount={citasActivas.length}
        pendingCount={pendientesConfirmar.length}
        clinicCount={pacientesEnClinica.length}
        onDayChange={setDay}
        onDoctorChange={setDoctorId}
        onRefresh={() => {
          void citasQuery.refetch();
          void horariosAgendaQuery.refetch();
        }}
        onSearchCita={buscarCita}
        onSearchSlot={buscarHuecoLibre}
        onOpenHorario={() => navigate(`/admin-extras?tab=agenda${doctorId ? `&doctor_id=${doctorId}` : ''}`)}
      />
      {hasAgendaError && (
        <div className="inline-alert">
          No se ha podido cargar una parte de la agenda. Refresca la pantalla o revisa la conexion antes de mover citas.
        </div>
      )}
      {agendaLoading && (
        <div className="patient-loading-strip agenda-loading-strip" aria-label="Cargando agenda">
          <span />
          <span />
          <span />
        </div>
      )}
      <AgendaDayBrief
        nextCita={nextVisibleCita}
        pendingCount={pendientesConfirmar.length}
        changeRequestCount={solicitudesCambio.length}
        clinicCount={pacientesEnClinica.length}
        freeSlotsCount={freeSlotsCount}
        totalSlots={slots.length}
        onOpenNext={() => nextVisibleCita && setModalCita(nextVisibleCita)}
        onSearchSlot={buscarHuecoLibre}
        onSearchCita={buscarCita}
      />
      <div className="agenda-layout">
        <aside className="agenda-left-panel">
          <div className="doctor-legend">
            {doctores.map((doctor) => (
              <span key={doctor.id} style={{ '--doctor-color': doctor.color_agenda ?? '#2a7de1' } as CSSProperties}>
                {shortDoctorName(doctor.nombre)}
              </span>
            ))}
          </div>

          <div className="month-caption">{monthName}</div>
          <div className="month-grid">
            {['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map((item) => <strong key={item}>{item}</strong>)}
            {days.map((date) => {
              const iso = isoDate(date);
              const inMonth = date.getMonth() === selected.getMonth();
              return (
                <button
                  key={iso}
                  className={`${iso === day ? 'active' : ''} ${inMonth ? '' : 'muted'}`}
                  onClick={() => setDay(iso)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="pending-call-panel">
            <div className="panel-caption"><strong>Telefonear</strong><span>Arrastre a un hueco</span></div>
            <table className="euro-table">
              <thead><tr><th>Nombre</th><th>Telefono</th><th>Motivo</th><th></th></tr></thead>
              <tbody>
                {(telefonearQuery.data ?? []).map((item: TelefonearPendiente) => (
                  <tr
                    key={item.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('application/dentcore-patient', JSON.stringify({
                        pacienteId: item.paciente_id,
                        telefonearId: item.id,
                        motivo: item.motivo ?? item.notas ?? 'Reprogramar cita',
                        name: item.paciente ? `${item.paciente.apellidos}, ${item.paciente.nombre}` : 'Paciente',
                      }));
                    }}
                  >
                    <td>{item.paciente ? `${item.paciente.apellidos}, ${item.paciente.nombre}` : 'Paciente'}</td>
                    <td>{item.paciente?.telefono ?? ''}</td>
                    <td>{item.motivo ?? 'Llamar'}</td>
                    <td>
                      <button type="button" onClick={() => darCitaDesdeTelefonear(item)}>
                        Dar cita
                      </button>
                    </td>
                  </tr>
                ))}
                {!telefonearQuery.isLoading && (telefonearQuery.data ?? []).length === 0 && (
                  <tr><td colSpan={4}>No hay llamadas pendientes.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="agenda-button-grid">
            <button onClick={() => window.print()}>Imprimir</button>
            <button onClick={verOcupacion}>Ocupacion</button>
            <button onClick={() => { setDoctorId(''); void citasQuery.refetch(); }}>Ver Todo</button>
            <button onClick={() => navigate('/dashboard')}>Salir</button>
          </div>
          {showSearchBar && (
            <form className="agenda-search-bar" onSubmit={(e) => { e.preventDefault(); ejecutarBusqueda(searchQuery); }}>
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nombre o tratamiento..."
              />
              <button type="submit">Buscar</button>
              <button type="button" onClick={() => { setShowSearchBar(false); setSearchQuery(''); }}>×</button>
            </form>
          )}
          {toastMessage && (
            <div className="inline-alert" role="status">
              {toastMessage}
              <button type="button" onClick={() => setToastMessage(null)}>×</button>
            </div>
          )}
        </aside>

        <main className="agenda-slots">
          <div className="agenda-status-legend" aria-label="Leyenda de estados de cita">
            {AGENDA_STATUS_LEGEND.map((estado) => {
              const visual = STATUS_META[estado] ?? STATUS_META.programada;
              return (
                <span className={visual.className} key={estado}>
                  <b>{visual.mark}</b>
                  {visual.label}
                </span>
              );
            })}
          </div>
          {!slots.length && (
            <div className="agenda-empty-day">
              <strong>Sin horario para este dia.</strong>
              <span>Configure bloques de trabajo antes de dar citas o revise el profesional seleccionado.</span>
              <button type="button" onClick={() => navigate(`/admin-extras?tab=agenda${doctorId ? `&doctor_id=${doctorId}` : ''}`)}>
                Abrir horarios
              </button>
            </div>
          )}
          {slots.map((slot) => {
            const citasSlot = citas.filter((cita) => cita.fecha_hora.slice(11, 16) === slot);
            return (
              <div className="agenda-slot-row" key={slot}>
                <time>{slot}</time>
                <div
                  className="agenda-slot-content"
                  onClick={() => {
                    if (!citasSlot.length) openNew(slot);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const raw = event.dataTransfer.getData('application/dentcore-patient');
                    let parsed: { pacienteId?: string; telefonearId?: string; motivo?: string } = {};
                    try {
                      parsed = raw ? JSON.parse(raw) as typeof parsed : {};
                    } catch {
                      parsed = {};
                    }
                    openNew(slot, parsed.pacienteId, day, doctorForSlot(slot, day), {
                      telefonearId: parsed.telefonearId,
                      motivo: parsed.motivo,
                    });
                  }}
                >
                  {showNowLine && nowSlot === slot && (
                    <div
                      className="agenda-now-line"
                      style={{ '--now-offset': `${((nowMinutes - minutesFromTime(slot)) / 10) * 100}%` } as CSSProperties}
                    >
                      <span>{now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                  {citasSlot.map((cita) => {
                    const visualStatus = getVisualStatus(cita);
                    const visual = STATUS_META[visualStatus] ?? STATUS_META.programada;
                    const canConfirm = ['programada', 'pending_confirmation', 'reminder_sent', 'pending_manual_review'].includes(cita.estado);
                    const needsReschedule = cita.estado === 'reschedule_requested';
                    const canMoveToClinic = !['en_clinica', 'atendida', 'anulada', 'falta', 'cancelled_by_patient', 'reschedule_requested', 'pending_manual_review'].includes(cita.estado);
                    const canFinish = cita.estado === 'en_clinica';
                    return (
                      <article
                        className={`agenda-appointment ${visual.className}`}
                        key={cita.id}
                        style={{ '--doctor-color': cita.doctor?.color_agenda ?? doctorById.get(cita.doctor_id)?.color_agenda ?? '#2a7de1' } as CSSProperties}
                        onClick={(event) => {
                          event.stopPropagation();
                          setModalCita(cita);
                        }}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          openPatient(cita);
                        }}
                        onContextMenu={(event) => handleContext(event, cita)}
                      >
                        <b>{visual.mark}</b>
                        <strong>{patientName(cita)}</strong>
                        <span>{cita.motivo ?? visual.label}</span>
                        <small>{visual.label}</small>
                        <em>{cita.duracion_min} min</em>
                        <div className="agenda-appointment-actions" aria-label={`Acciones rapidas de ${patientName(cita)}`}>
                          {canConfirm && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                confirmMutation.mutate(cita);
                              }}
                            >
                              OK
                            </button>
                          )}
                          {canMoveToClinic && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setStatus(cita, 'en_clinica');
                              }}
                            >
                              En clinica
                            </button>
                          )}
                          {needsReschedule && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                reprogramarCita(cita);
                              }}
                            >
                              Reubicar
                            </button>
                          )}
                          {canFinish && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setStatus(cita, 'atendida');
                              }}
                            >
                              Fin
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openPatient(cita);
                            }}
                          >
                            Ficha
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </main>
      </div>

      {(modalCita || slotDraft) && (
        <CitaModal
          cita={modalCita}
          draft={slotDraft}
          pacientes={pacientes}
          doctores={doctores}
          onClose={() => { setModalCita(null); setSlotDraft(null); }}
          onSubmit={(data) => saveMutation.mutate(data)}
          onCreateTemporaryPaciente={(data) => createTempPatient.mutateAsync(data)}
          onStartVideo={(cita) => videoMutation.mutateAsync(cita)}
        />
      )}

      {showBuscarHueco && (
        <BuscarHuecoModal
          day={day}
          doctorId={doctorId}
          pacientes={pacientes}
          doctores={doctores}
          onClose={() => setShowBuscarHueco(false)}
          onSelect={(hueco, pacienteId) => {
            const targetDay = hueco.fecha_hora_inicio.slice(0, 10);
            const targetSlot = hueco.fecha_hora_inicio.slice(11, 16);
            setDay(targetDay);
            setDoctorId(hueco.doctor_id);
            setShowBuscarHueco(false);
            openNew(targetSlot, pacienteId, targetDay, hueco.doctor_id);
          }}
        />
      )}

      {showCitasPaciente && sessionStorage.getItem('dentcore_selected_patient_id') && (
        <CitasPacienteModal
          pacienteId={sessionStorage.getItem('dentcore_selected_patient_id')!}
          pacientes={pacientes}
          onClose={() => setShowCitasPaciente(false)}
          onSelect={(cita) => {
            setDay(cita.fecha_hora.slice(0, 10));
            setDoctorId(cita.doctor_id);
            setShowCitasPaciente(false);
            setModalCita(cita);
          }}
        />
      )}

      {cancelCitaModal && (
        <CancelCitaModal
          cita={cancelCitaModal.cita}
          estado={cancelCitaModal.estado}
          onClose={() => setCancelCitaModal(null)}
          onConfirm={confirmCancelCita}
        />
      )}

      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <strong>Agenda</strong>
          <button onClick={() => { setModalCita(contextMenu.cita); setContextMenu(null); }}>Editar cita</button>
          <button onClick={() => openPatient(contextMenu.cita)}>Abrir ficha del paciente</button>
          <button onClick={() => reprogramarCita(contextMenu.cita)}>Reprogramar / cambiar hora</button>
          <button onClick={() => copiarTelefono(contextMenu.cita)}>Copiar telefono</button>
          <button onClick={() => void iniciarVideoDesdeMenu(contextMenu.cita)}>Iniciar videollamada</button>
          <span />
          <button onClick={() => confirmMutation.mutate(contextMenu.cita)}>Confirmar cita</button>
          <button onClick={() => setStatus(contextMenu.cita, 'programada')}>Pendiente de confirmar</button>
          <button onClick={() => enviarRecordatorio(contextMenu.cita, 'whatsapp')}>Mensaje enviado</button>
          <button onClick={() => setStatus(contextMenu.cita, 'en_clinica')}>Paciente en clinica</button>
          <button onClick={() => setStatus(contextMenu.cita, 'en_clinica', 'En tratamiento')}>En tratamiento</button>
          <button onClick={() => setStatus(contextMenu.cita, 'atendida')}>Finalizada</button>
          <span />
          <button onClick={() => cancelCita(contextMenu.cita, 'anulada')}>Cancelar cita</button>
          <button onClick={() => cancelCita(contextMenu.cita, 'falta')}>No asistio</button>
          <button onClick={() => enviarRecordatorio(contextMenu.cita, 'whatsapp')}>Recordatorio WhatsApp</button>
          <button onClick={() => enviarRecordatorio(contextMenu.cita, 'email')}>Recordatorio email</button>
          <button onClick={() => enviarRecordatorio(contextMenu.cita, 'ambos')}>Recordatorio WhatsApp + email</button>
        </div>
      )}
    </section>
  );
}
