import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent, MouseEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { buscarHuecosLibres, createCita, createPaciente, getCitas, getDoctores, getPacientes, getTelefonear, iniciarVideoConsulta, updateCita } from '../../lib/api';
import type { ApiPaciente, Cita, Doctor, HuecoLibre, TelefonearPendiente } from '../../types/api';

type SlotDraft = {
  day: string;
  slot: string;
  doctorId: string;
  pacienteId?: string;
};

type HuecoResultado = HuecoLibre & {
  doctorNombre: string;
  doctorColor: string | null;
};

const ESTADOS = [
  'programada',
  'confirmada',
  'en_clinica',
  'atendida',
  'anulada',
  'falta',
];

const STATUS_META: Record<string, { label: string; mark: string; className: string }> = {
  programada: { label: 'Pendiente de confirmar', mark: 'P', className: 'state-pending' },
  mensaje_enviado: { label: 'Mensaje enviado', mark: 'M', className: 'state-message' },
  confirmada: { label: 'Confirmada', mark: 'C', className: 'state-confirmed' },
  en_clinica: { label: 'Paciente en clinica', mark: 'CL', className: 'state-clinic' },
  en_tratamiento: { label: 'En tratamiento', mark: 'T', className: 'state-treatment' },
  atendida: { label: 'Finalizada', mark: 'F', className: 'state-done' },
  anulada: { label: 'Cancelada', mark: 'X', className: 'state-cancelled' },
  falta: { label: 'No asistio', mark: 'N', className: 'state-missed' },
};

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

function getVisualStatus(cita: Cita) {
  const obs = cita.observaciones?.toLowerCase() ?? '';
  if (cita.estado === 'programada' && obs.includes('recordatorio')) return 'mensaje_enviado';
  if (cita.estado === 'en_clinica' && obs.includes('en tratamiento')) return 'en_tratamiento';
  return cita.estado;
}

function patientName(cita: Cita) {
  return cita.paciente ? `${cita.paciente.nombre} ${cita.paciente.apellidos}` : 'Paciente';
}

function findPaciente(pacientes: ApiPaciente[], id?: string) {
  return pacientes.find((paciente) => paciente.id === id) ?? null;
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
  }) => void;
  onCreateTemporaryPaciente: (data: { nombreCompleto: string; telefono: string }) => Promise<ApiPaciente>;
  onStartVideo: (cita: Cita) => Promise<string>;
}) {
  const [query, setQuery] = useState('');
  const initialPacienteId = cita?.paciente_id ?? draft?.pacienteId ?? sessionStorage.getItem('dentorg_selected_patient_id') ?? pacientes[0]?.id ?? '';
  const [pacienteId, setPacienteId] = useState(initialPacienteId);
  const [doctorId, setDoctorId] = useState(cita?.doctor_id ?? draft?.doctorId ?? doctores[0]?.id ?? '');
  const [fecha, setFecha] = useState((cita?.fecha_hora ?? (draft ? slotIso(draft.day, draft.slot) : `${todayIso()}T09:00:00`)).slice(0, 10));
  const [hora, setHora] = useState((cita?.fecha_hora ?? (draft ? slotIso(draft.day, draft.slot) : `${todayIso()}T09:00:00`)).slice(11, 16));
  const [duracion, setDuracion] = useState(cita?.duracion_min ?? 30);
  const [estado, setEstado] = useState(cita?.estado ?? 'programada');
  const [motivo, setMotivo] = useState(cita?.motivo ?? '');
  const [observaciones, setObservaciones] = useState(cita?.observaciones ?? '');
  const [gabinete, setGabinete] = useState(cita?.gabinete_id ?? '');
  const [tempName, setTempName] = useState('');
  const [tempPhone, setTempPhone] = useState('');
  const [creatingTemp, setCreatingTemp] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  const filteredPatients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pacientes;
    return pacientes.filter((paciente) =>
      `${paciente.nombre} ${paciente.apellidos} ${paciente.telefono ?? ''} ${paciente.num_historial} ${paciente.codigo ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [pacientes, query]);

  const selectedPaciente = findPaciente(pacientes, pacienteId);
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
    });
  }

  async function createTempPatient() {
    if (!tempName.trim() || !tempPhone.trim()) {
      window.alert('Indique nombre y teléfono para el paciente temporal');
      return;
    }
    setCreatingTemp(true);
    try {
      const paciente = await onCreateTemporaryPaciente({ nombreCompleto: tempName, telefono: tempPhone });
      setPacienteId(paciente.id);
      setQuery(`${paciente.nombre} ${paciente.apellidos}`);
      setObservaciones((prev) => `${prev}\nPaciente temporal: completar datos en clínica.`.trim());
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
          <label className="wide">Buscar paciente<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, telefono, historia, codigo" /></label>
          <label className="wide">Paciente
            <select value={pacienteId} onChange={(event) => setPacienteId(event.target.value)}>
              {filteredPatients.map((paciente) => (
                <option key={paciente.id} value={paciente.id}>
                  {paciente.num_historial} - {paciente.apellidos}, {paciente.nombre} {paciente.telefono ? `(${paciente.telefono})` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="temporary-patient-box wide">
            <strong>Nuevo paciente temporal</strong>
            <input value={tempName} onChange={(event) => setTempName(event.target.value)} placeholder="Nombre y apellidos" />
            <input value={tempPhone} onChange={(event) => setTempPhone(event.target.value)} placeholder="Teléfono" />
            <button type="button" onClick={() => void createTempPatient()} disabled={creatingTemp}>Crear temporal</button>
          </div>
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
          <span>Recordatorio: {observaciones.toLowerCase().includes('recordatorio') ? 'Enviado' : 'No enviado'}</span>
          <span>Canal: {observaciones.toLowerCase().includes('whatsapp') ? 'WhatsApp' : observaciones.toLowerCase().includes('email') ? 'Email' : '-'}</span>
          <span>Confirmacion: {estado === 'confirmada' ? 'Confirmada' : 'Pendiente'}</span>
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
  const [pacienteId, setPacienteId] = useState(sessionStorage.getItem('dentorg_selected_patient_id') ?? '');
  const [turno, setTurno] = useState<'todo' | 'manana' | 'tarde'>('todo');
  const [fechaDesde, setFechaDesde] = useState(day);
  const [dias, setDias] = useState('14');
  const [duracion, setDuracion] = useState('30');
  const [resultados, setResultados] = useState<HuecoResultado[]>([]);
  const [error, setError] = useState('');
  const [buscando, setBuscando] = useState(false);

  const filteredPatients = useMemo(() => {
    const q = pacienteQuery.trim().toLowerCase();
    if (!q) return pacientes.slice(0, 30);
    return pacientes.filter((paciente) =>
      `${paciente.nombre} ${paciente.apellidos} ${paciente.telefono ?? ''} ${paciente.num_historial} ${paciente.codigo ?? ''}`
        .toLowerCase()
        .includes(q),
    ).slice(0, 30);
  }, [pacientes, pacienteQuery]);

  async function search(event?: FormEvent) {
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
      const responses = await Promise.all(targets.map(async (doctor) => {
        const huecos = await buscarHuecosLibres({
          doctor_id: doctor.id,
          duracion_min: duration,
          desde: `${fechaDesde}T00:00:00`,
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
        })).filter((hueco) => !citas.some((cita) => cita.doctor_id === doctor.id && !['anulada', 'falta'].includes(cita.estado) && overlaps(hueco.fecha_hora_inicio, duration, cita))))).slice(0, 40);
      }

      setResultados(merged);
    } catch (err) {
      setError((err as Error).message || 'No se pudieron buscar huecos.');
    } finally {
      setBuscando(false);
    }
  }

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

export default function AgendaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [day, setDay] = useState(todayIso());
  const [doctorId, setDoctorId] = useState<string>('');
  const [modalCita, setModalCita] = useState<Cita | null>(null);
  const [slotDraft, setSlotDraft] = useState<SlotDraft | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cita: Cita } | null>(null);
  const [showBuscarHueco, setShowBuscarHueco] = useState(false);
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
    }) => {
      if (data.citaId) {
        return updateCita(data.citaId, data);
      }
      const created = await createCita(data);
      if (data.estado !== 'programada') {
        return updateCita(created.id, { estado: data.estado });
      }
      return created;
    },
    onSuccess: () => {
      setModalCita(null);
      setSlotDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['citas'] });
    },
  });

  const quickUpdate = useMutation({
    mutationFn: ({ cita, patch }: { cita: Cita; patch: Parameters<typeof updateCita>[1] }) => updateCita(cita.id, patch),
    onSuccess: () => {
      setContextMenu(null);
      void queryClient.invalidateQueries({ queryKey: ['citas'] });
    },
  });

  const videoMutation = useMutation({
    mutationFn: async (cita: Cita) => {
      const response = await iniciarVideoConsulta(cita.id);
      void queryClient.invalidateQueries({ queryKey: ['citas'] });
      return response.videoUrl;
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

  const slots = Array.from({ length: 70 }, (_, i) => {
    const totalMinutes = 9 * 60 + i * 10;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  });

  const selected = new Date(`${day}T12:00:00`);
  const days = monthGrid(day);
  const monthName = selected.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const doctores = doctoresQuery.data ?? [];
  const pacientes = pacientesQuery.data ?? [];
  const doctorById = useMemo(() => new Map(doctores.map((doctor) => [doctor.id, doctor])), [doctores]);
  const nowDay = isoDate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const visibleStart = minutesFromTime(slots[0]);
  const visibleEnd = minutesFromTime(addMinutes(slots[slots.length - 1], 10));
  const showNowLine = day === nowDay && nowMinutes >= visibleStart && nowMinutes <= visibleEnd;
  const nowSlot = slots.find((slot) => {
    const start = minutesFromTime(slot);
    return nowMinutes >= start && nowMinutes < start + 10;
  });

  function openNew(slot: string, pacienteId?: string, targetDay = day, targetDoctorId = doctorId || doctores[0]?.id || '') {
    setContextMenu(null);
    setModalCita(null);
    setSlotDraft({ day: targetDay, slot, doctorId: targetDoctorId, pacienteId });
  }

  function openPatient(cita: Cita) {
    sessionStorage.setItem('dentorg_selected_patient_id', cita.paciente_id);
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
    const motivo = window.prompt('Motivo: cancelada por paciente, cancelada por clinica, no vino, reprogramada u otro', estado === 'falta' ? 'No vino' : 'Cancelada por paciente');
    if (motivo === null) return;
    setStatus(cita, estado, `Cancelacion: ${motivo}`);
  }

  function buscarCita() {
    const query = window.prompt('Buscar cita por paciente o tratamiento');
    if (!query) return;
    const q = query.toLowerCase();
    const cita = (citasQuery.data ?? []).find((item) =>
      `${patientName(item)} ${item.motivo ?? ''}`.toLowerCase().includes(q),
    );
    if (cita) {
      setModalCita(cita);
      return;
    }
    window.alert('No se ha encontrado una cita con ese texto en el dia visible.');
  }

  function buscarHuecoLibre() {
    setShowBuscarHueco(true);
  }

  function verOcupacion() {
    const total = slots.length;
    const ocupadas = (citasQuery.data ?? []).length;
    window.alert(`Ocupacion visible: ${ocupadas}/${total} huecos (${Math.round((ocupadas / total) * 100)}%).`);
  }

  return (
    <section className="page agenda-euro" onClick={() => setContextMenu(null)}>
      <div className="agenda-titlebar">Agenda</div>
      <div className="agenda-layout">
        <aside className="agenda-left-panel">
          <label className="doctor-picker">
            Doctor / Auxiliar
            <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">Todas las agendas</option>
              {doctores.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>{doctor.nombre}</option>
              ))}
            </select>
          </label>

          <div className="doctor-legend">
            {doctores.map((doctor) => (
              <span key={doctor.id} style={{ '--doctor-color': doctor.color_agenda ?? '#2a7de1' } as CSSProperties}>
                {doctor.nombre}
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
              <thead><tr><th>Nombre</th><th>Telefono</th><th>Motivo</th></tr></thead>
              <tbody>
                {(telefonearQuery.data ?? []).map((item: TelefonearPendiente) => (
                  <tr
                    key={item.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('application/dentorg-patient', item.paciente ? JSON.stringify({ pacienteId: pacientes.find((p) => p.telefono === item.paciente?.telefono)?.id, name: `${item.paciente.apellidos}, ${item.paciente.nombre}` }) : '');
                    }}
                  >
                    <td>{item.paciente ? `${item.paciente.apellidos}, ${item.paciente.nombre}` : 'Paciente'}</td>
                    <td>{item.paciente?.telefono ?? ''}</td>
                    <td>{item.motivo ?? 'Llamar'}</td>
                  </tr>
                ))}
                {!telefonearQuery.isLoading && (telefonearQuery.data ?? []).length === 0 && (
                  <tr><td colSpan={3}>No hay llamadas pendientes.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="agenda-button-grid">
            <button onClick={() => navigate('/configuracion')}>Cambiar horario</button>
            <button onClick={buscarCita}>Buscar citas</button>
            <button onClick={buscarHuecoLibre}>Buscar hueco</button>
            <button onClick={() => void citasQuery.refetch()}>Refrescar</button>
            <button onClick={() => window.print()}>Imprimir</button>
            <button onClick={verOcupacion}>Ocupacion</button>
            <button onClick={() => { setDoctorId(''); void citasQuery.refetch(); }}>Ver Todo</button>
            <button onClick={() => navigate('/dashboard')}>Salir</button>
          </div>
        </aside>

        <main className="agenda-slots">
          {slots.map((slot) => {
            const citasSlot = (citasQuery.data ?? []).filter((cita) => cita.fecha_hora.slice(11, 16) === slot);
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
                    const raw = event.dataTransfer.getData('application/dentorg-patient');
                    const parsed = raw ? JSON.parse(raw) as { pacienteId?: string } : {};
                    openNew(slot, parsed.pacienteId);
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
                    const visual = STATUS_META[getVisualStatus(cita)] ?? STATUS_META.programada;
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
                        <em>{cita.duracion_min} min</em>
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

      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button onClick={() => setModalCita(contextMenu.cita)}>Editar cita</button>
          <button onClick={() => openPatient(contextMenu.cita)}>Abrir ficha del paciente</button>
          <button onClick={() => setStatus(contextMenu.cita, 'confirmada')}>Confirmar cita</button>
          <button onClick={() => setStatus(contextMenu.cita, 'programada')}>Pendiente de confirmar</button>
          <button onClick={() => setStatus(contextMenu.cita, 'programada', `Recordatorio WhatsApp enviado ${new Date().toLocaleString()}`)}>Mensaje enviado</button>
          <button onClick={() => setStatus(contextMenu.cita, 'en_clinica')}>Paciente en clinica</button>
          <button onClick={() => setStatus(contextMenu.cita, 'en_clinica', 'En tratamiento')}>En tratamiento</button>
          <button onClick={() => setStatus(contextMenu.cita, 'atendida')}>Finalizada</button>
          <button onClick={() => cancelCita(contextMenu.cita, 'anulada')}>Cancelar cita</button>
          <button onClick={() => cancelCita(contextMenu.cita, 'falta')}>No asistio</button>
          <button onClick={() => setStatus(contextMenu.cita, contextMenu.cita.estado, `Recordatorio WhatsApp enviado ${new Date().toLocaleString()}`)}>Recordatorio WhatsApp</button>
          <button onClick={() => setStatus(contextMenu.cita, contextMenu.cita.estado, `Recordatorio email enviado ${new Date().toLocaleString()}`)}>Recordatorio email</button>
        </div>
      )}
    </section>
  );
}
