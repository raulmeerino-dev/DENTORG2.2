import './agenda-workspace.css';
import { FloatingPopover } from '../../../design-system/FloatingPopover';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import {
Gauge,
Home,
Printer,
UsersRound
} from 'lucide-react';
import type { CSSProperties,MouseEvent } from 'react';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { useNavigate,useSearchParams } from 'react-router-dom';
import { cancelarCitaAvanzada, confirmarCita, createCita, getCitas, getGabinetes, getHorarios, getJornadaConfig, marcarFaltaCita, updateCita, marcarLlegadaCita, iniciarAtencionCita, finalizarVisitaCita, createPacienteProvisional } from '../../../api/scheduling';
import { getTratamientosCatalogo } from '../../../api/treatmentCatalog';
import { getPacientes } from '../../../api/patients';
import { enviarRecordatorioCita, getTelefonear, marcarTelefonearReubicada } from '../../../api/communications';
import { getDoctores } from '../../../api/identity';
import type { Cita,TelefonearPendiente } from '../../../api/types';
import { AgendaDayBrief } from './AgendaDayBrief';
import { AgendaResourceGrid } from './AgendaResourceGrid';
import { AgendaLabSummaryStrip } from './AgendaLabSummaryStrip';
import { citaMatchesQuery,shortDoctorName } from './agendaSearch';
import { buildAgendaSlots,isoDate,minutesFromTime,monthGrid,slotInHorario,todayIso,weekdayIndex,localAppointmentDate,localAppointmentTime,localDayRange,slotIso,overlaps } from './agendaTime';
import { AgendaToolbar } from './AgendaToolbar';
import type { HorariosPorDoctor,SlotDraft } from './agendaTypes';
import { getVisualStatus } from './appointmentStatus';
import { useJornada } from '../workspace/JornadaContext';
import { useAuth } from '../../identity/session/AuthContext';
import { BuscarHuecoModal } from './BuscarHuecoModal';
import { CitaModal } from './CitaModal';
import { CitasPacienteModal } from './CitasPacienteModal';
import {
agendaLabSummary,
citaMatchesLabFilter,
} from './laboratorioAgenda';
import { CancelCitaModal } from './modals/CancelCitaModal';

export default function AgendaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const jornada = useJornada();
  const { user } = useAuth();
  const canTreat = user?.rol === 'admin' || user?.rol === 'doctor';
  const canTreatAppointment = (cita: Cita) => canTreat && (user?.rol === 'admin' || user?.doctor_id === cita.doctor_id);
  const handledFocusRef = useRef<string | null>(null);
  const [localDay, setLocalDay] = useState(() => {
    const focusDateParam = searchParams.get('fecha');
    if (focusDateParam) return focusDateParam;
    const focusDate = sessionStorage.getItem('dentcore_agenda_focus_date');
    if (focusDate) {
      sessionStorage.removeItem('dentcore_agenda_focus_date');
      return focusDate;
    }
    return todayIso();
  });
  const [localDoctorId, setLocalDoctorId] = useState<string>(() => searchParams.get('doctor_id') ?? '');
  const [localModalCita, setLocalModalCita] = useState<Cita | null>(null);
  const day = jornada?.day ?? localDay;
  const setDay = jornada?.setDay ?? setLocalDay;
  const doctorId = jornada?.doctorId ?? localDoctorId;
  const setDoctorId = jornada?.setDoctorId ?? setLocalDoctorId;
  const modalCita = jornada ? jornada.citasQuery.data?.find(cita => cita.id === jornada.selectedCitaId) ?? null : localModalCita;
  const setModalCita = useCallback((cita: Cita | null) => {
    if (jornada) jornada.selectCita(cita?.id ?? null);
    else setLocalModalCita(cita);
  }, [jornada]);
  const [slotDraft, setSlotDraft] = useState<SlotDraft | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cita: Cita } | null>(null);
  const [showBuscarHueco, setShowBuscarHueco] = useState(false);
  const [showCitasPaciente, setShowCitasPaciente] = useState(false);
  const [cancelCitaModal, setCancelCitaModal] = useState<{ cita: Cita; estado: 'anulada' | 'falta' } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const searchQuery = jornada?.searchQuery ?? localSearchQuery;
  const setSearchQuery = jornada?.setSearchQuery ?? setLocalSearchQuery;
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [labOnly, setLabOnly] = useState(false);
  const [now, setNow] = useState(new Date());

  const doctoresQuery = useQuery({ queryKey: ['doctores'], queryFn: getDoctores, enabled: !jornada });
  const gabinetesQuery = useQuery({ queryKey: ['gabinetes'], queryFn: getGabinetes });
  const configQuery = useQuery({ queryKey: ['jornada-config'], queryFn: getJornadaConfig });
  const tratamientosQuery = useQuery({ queryKey: ['tratamientos-catalogo'], queryFn: () => getTratamientosCatalogo({ solo_activos: true }) });
  const pacientesQuery = useQuery({ queryKey: ['pacientes'], queryFn: () => getPacientes() });
  const telefonearQuery = useQuery({ queryKey: ['telefonear'], queryFn: getTelefonear });

  const range = useMemo(() => ({
    ...localDayRange(day),
    ...(doctorId ? { doctor_id: doctorId } : {}),
  }), [day, doctorId]);

  const localCitasQuery = useQuery({
    queryKey: ['citas', range],
    queryFn: () => getCitas(range),
    enabled: !jornada,
  });
  const citasQuery = jornada?.citasQuery ?? localCitasQuery;

  const doctores = useMemo(() => jornada?.doctores ?? doctoresQuery.data ?? [], [jornada?.doctores, doctoresQuery.data]);
  const pacientes = useMemo(() => pacientesQuery.data ?? [], [pacientesQuery.data]);
  const rawCitas = useMemo(() => jornada?.citas ?? citasQuery.data ?? [], [jornada?.citas, citasQuery.data]);
  const labSummary = useMemo(() => agendaLabSummary(rawCitas, todayIso()), [rawCitas]);
  const citas = useMemo(
    () => (labOnly ? rawCitas.filter(citaMatchesLabFilter) : rawCitas),
    [labOnly, rawCitas],
  );

  useEffect(() => {
    if (jornada) return undefined;
    const focusDateParam = searchParams.get('fecha');
    const doctorIdParam = searchParams.get('doctor_id');
    if ((!focusDateParam || focusDateParam === day) && (doctorIdParam === null || doctorIdParam === doctorId)) return undefined;
    const timeout = window.setTimeout(() => {
      if (focusDateParam && focusDateParam !== day) {
        setDay(focusDateParam);
      }
      if (doctorIdParam !== null && doctorIdParam !== doctorId) {
        setDoctorId(doctorIdParam);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [day, doctorId, searchParams, jornada, setDay, setDoctorId]);

  useEffect(() => {
    const focusCitaId = searchParams.get('cita_id') ?? sessionStorage.getItem('dentcore_agenda_focus_cita_id');
    if (!focusCitaId || handledFocusRef.current === focusCitaId || citasQuery.isLoading) return;
    const cita = citas.find((item) => item.id === focusCitaId);
    if (!cita) return;
    const timeout = window.setTimeout(() => {
      sessionStorage.removeItem('dentcore_agenda_focus_cita_id');
      handledFocusRef.current = focusCitaId;
      setModalCita(cita);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [citas, citasQuery.isLoading, searchParams, setModalCita]);
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
      presupuesto_linea_id?: string | null;
      telefonearId?: string;
      es_urgencia?: boolean;
      motivo_solape?: string;
      forzar_fuera_horario?: boolean;
    }) => {
      const { telefonearId, citaId, estado, paciente_id, ...citaData } = data;
      if (citaId) {
        const original = citasQuery.data?.find(cita => cita.id === citaId);
        const patch = Object.fromEntries(Object.entries(citaData).filter(([key, value]) => {
          if (key === 'forzar_fuera_horario' || key === 'motivo_solape') return Boolean(value);
          const previous = original?.[key as keyof Cita];
          if (key === 'fecha_hora') return new Date(String(previous)).getTime() !== new Date(String(value)).getTime();
          return value !== previous;
        }));
        return { cita: await updateCita(citaId, patch), warning: null };
      }
      const saved = await createCita({ ...citaData, paciente_id, estado: estado === 'confirmada' ? 'confirmada' : 'programada' });
      let warning: string | null = null;
      if (telefonearId) {
        try { await marcarTelefonearReubicada(telefonearId, saved.id); }
        catch { warning = 'La cita está guardada. No se pudo cerrar la llamada pendiente en Telefonear; revisa esa entrada.'; }
      }
      return { cita: saved, warning };
    },
    onSuccess: ({ cita, warning }) => {
      setModalCita(null);
      setSlotDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['citas'] });
      void queryClient.invalidateQueries({ queryKey: ['citas-paciente', cita.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['paciente-detalle', cita.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['pacientes'] });
      void queryClient.invalidateQueries({ queryKey: ['telefonear'] });
      sessionStorage.removeItem('dentcore_selected_treatment');
      sessionStorage.removeItem('dentcore_selected_presupuesto_linea_id');
      setToastMessage(warning);
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
    onError: error => setToastMessage(error instanceof Error ? error.message : 'No se pudo actualizar la cita.'),
  });

  const operationalMutation = useMutation({
    mutationFn: ({ cita, action }: { cita: Cita; action: 'llegada' | 'atender' | 'finalizar' }) => (
      action === 'llegada' ? marcarLlegadaCita(cita.id) : action === 'atender' ? iniciarAtencionCita(cita.id) : finalizarVisitaCita(cita.id)
    ),
    onSuccess: (updated) => { setContextMenu(null); invalidatePatientCitas(updated.paciente_id); },
    onError: error => setToastMessage(error instanceof Error ? error.message : 'No se pudo cambiar el estado de la cita.'),
  });

  const confirmMutation = useMutation({
    mutationFn: (cita: Cita) => confirmarCita(cita.id),
    onSuccess: (updated) => {
      setContextMenu(null);
      invalidatePatientCitas(updated.paciente_id);
    },
    onError: error => setToastMessage(error instanceof Error ? error.message : 'No se pudo confirmar la cita.'),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ cita, motivo, tipo }: { cita: Cita; motivo: string; tipo: 'anulacion_paciente' | 'anulacion_clinica' | 'no_vino' | 'reprogramada' | 'otro' }) =>
      cancelarCitaAvanzada(cita.id, { motivo_cancelacion: motivo, tipo, crear_telefonear: tipo === 'reprogramada' }),
    onSuccess: (updated) => {
      setContextMenu(null);
      invalidatePatientCitas(updated.paciente_id);
      void telefonearQuery.refetch();
    },
    onError: error => setToastMessage(error instanceof Error ? error.message : 'No se pudo cancelar la cita.'),
  });

  const faltaMutation = useMutation({
    mutationFn: ({ cita, motivo }: { cita: Cita; motivo: string }) => marcarFaltaCita(cita.id, motivo),
    onSuccess: (updated) => {
      setContextMenu(null);
      invalidatePatientCitas(updated.paciente_id);
      void queryClient.invalidateQueries({ queryKey: ['historial-paciente', updated.paciente_id] });
    },
    onError: error => setToastMessage(error instanceof Error ? error.message : 'No se pudo registrar la ausencia.'),
  });

  const recordatorioMutation = useMutation({
    mutationFn: async ({ cita, canal }: { cita: Cita; canal: 'whatsapp' | 'email' | 'ambos' }) => {
      const response = await enviarRecordatorioCita(cita.id, canal);
      if (response.whatsappUrl) window.open(response.whatsappUrl, '_blank');
      if (response.emailUrl) window.open(response.emailUrl, '_blank');
      return response;
    },
    onSuccess: (_response, variables) => {
      setContextMenu(null);
      void queryClient.invalidateQueries({ queryKey: ['citas'] });
      void queryClient.invalidateQueries({ queryKey: ['citas-paciente', variables.cita.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['paciente-detalle', variables.cita.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-comunicaciones'] });
      void queryClient.invalidateQueries({ queryKey: ['telefonear'] });
    },
    onError: error => setToastMessage(error instanceof Error ? error.message : 'No se pudo enviar el recordatorio.'),
  });

  const createTempPatient = useMutation({
    mutationFn: async ({ nombreCompleto, telefono }: { nombreCompleto: string; telefono: string }) => {
      return createPacienteProvisional({
        nombre: nombreCompleto.trim(),
        telefono: telefono.trim() || null,
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
  const horariosByDoctor = useMemo(() => horariosAgendaQuery.data ?? {}, [horariosAgendaQuery.data]);
  const slots = useMemo(() => buildAgendaSlots({
    day,
    doctorId,
    doctores,
    horariosByDoctor,
    citas,
  }), [day, doctorId, doctores, horariosByDoctor, citas]);

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
    meta: Pick<SlotDraft, 'motivo' | 'telefonearId' | 'duration' | 'scheduleKnown'> = {},
  ) => {
    setContextMenu(null);
    if (jornada) jornada.focusSlot({ day: targetDay, doctorId: targetDoctorId });
    else setLocalModalCita(null);
    saveMutation.reset();
    setSlotDraft({
      day: targetDay,
      slot,
      doctorId: targetDoctorId,
      gabineteId: jornada?.gabineteId || undefined,
      pacienteId,
      presupuestoLineaId: sessionStorage.getItem('dentcore_selected_presupuesto_linea_id') ?? undefined,
      ...meta,
    });
  }, [day, doctorForSlot, jornada, saveMutation]);

  useEffect(() => {
    const open = () => {
      sessionStorage.removeItem('dentcore_agenda_action');
      openNew(slots.find(slot => minutesFromTime(slot) >= 9 * 60) ?? slots[0] ?? '09:00', undefined, day, undefined, { scheduleKnown: false });
    };
    window.addEventListener('dentcore:new-appointment', open);
    return () => window.removeEventListener('dentcore:new-appointment', open);
  }, [day, openNew, slots]);

  useEffect(() => {
    if (sessionStorage.getItem('dentcore_agenda_action') !== 'new') return;
    if (!doctores.length || slotDraft || modalCita) return;
    const selectedPacienteId = sessionStorage.getItem('dentcore_selected_patient_id') ?? undefined;
    const preferredSlot = slots.find((slot) => minutesFromTime(slot) >= 9 * 60) ?? slots[0] ?? '09:00';
    const timeout = window.setTimeout(() => {
      sessionStorage.removeItem('dentcore_agenda_action');
      openNew(preferredSlot, selectedPacienteId, day, doctorForSlot(preferredSlot, day), { scheduleKnown: false });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [day, doctores.length, doctorForSlot, modalCita, openNew, slotDraft, slots]);

  function openPatient(cita: Cita) {
    sessionStorage.setItem('dentcore_selected_patient_id', cita.paciente_id);
    navigate(`/pacientes?paciente_id=${cita.paciente_id}`);
  }

  function handleContext(event: MouseEvent, cita: Cita) {
    event.preventDefault();
    setContextMenu({ x: Math.max(12, Math.min(event.clientX, window.innerWidth - 260)), y: Math.max(12, Math.min(event.clientY, window.innerHeight - 510)), cita });
  }

  function setStatus(cita: Cita, estado: string) {
    quickUpdate.mutate({ cita, patch: { estado } });
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
      setShowSearchBar(false);
      if (jornada) jornada.focusCita(cita);
      else { setSearchQuery(''); setModalCita(cita); }
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
    setToastMessage(slots.length ? `${citasActivas.length} citas activas · ${freeSlotsCount} inicios disponibles de ${configQuery.data?.duracion_habitual_min ?? 30} minutos para los profesionales visibles.` : 'No hay horario visible para calcular ocupación.');
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
  const citasActivas = citas.filter((cita) => !['cancelada', 'no_presentado'].includes(getVisualStatus(cita)));
  const pendientesConfirmar = citasActivas.filter((cita) => getVisualStatus(cita) === 'programada');
  const solicitudesCambio = citasActivas.filter((cita) => cita.estado === 'reschedule_requested');
  const pacientesEnClinica = citasActivas.filter((cita) => ['en_sala', 'en_atencion'].includes(getVisualStatus(cita)));
  const nextVisibleCita = citasActivas
    .filter((cita) => ['programada', 'confirmada', 'en_sala'].includes(getVisualStatus(cita)) && new Date(cita.fecha_hora).getTime() >= now.getTime())
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0] ?? null;
  const freeSlotsCount = doctores.filter(doctor => !doctorId || doctor.id === doctorId).reduce((total, doctor) => {
    const duration = configQuery.data?.duracion_habitual_min ?? 30;
    const horario = horariosByDoctor[doctor.id]?.find(item => item.dia_semana === weekdayIndex(day));
    if (!horario || horario.tipo_dia === 'festivo') return total;
    return total + slots.filter(slot => horario.bloques.some(block => block.inicio <= slot && minutesFromTime(slot) + duration <= minutesFromTime(block.fin))
      && !(citasQuery.data ?? []).some(cita => !['cancelada', 'no_presentado'].includes(getVisualStatus(cita))
        && (cita.doctor_id === doctor.id || Boolean(jornada?.gabineteId && cita.gabinete_id === jornada.gabineteId))
        && overlaps(slotIso(day, slot), duration, cita))).length;
  }, 0);
  const hasAgendaError = doctoresQuery.isError || pacientesQuery.isError || citasQuery.isError || telefonearQuery.isError || horariosAgendaQuery.isError || gabinetesQuery.isError || configQuery.isError || tratamientosQuery.isError;
  const agendaLoading = doctoresQuery.isLoading || citasQuery.isLoading || horariosAgendaQuery.isLoading;

  return (
    <section className="agenda-dentcore" onClick={() => setContextMenu(null)}>
      <AgendaToolbar
        embedded={Boolean(jornada)}
        canManageSchedules={user?.rol === 'admin'}
        day={day}
        doctorId={doctorId}
        doctores={doctores}
        horarioLabel={horarioLabel}
        citasCount={citasActivas.length}
        pendingCount={pendientesConfirmar.length}
        clinicCount={pacientesEnClinica.length}
        onDayChange={setDay}
        onDoctorChange={setDoctorId}
        onCreateCita={() => {
          const preferredSlot = slots.find((slot) => minutesFromTime(slot) >= 9 * 60) ?? slots[0] ?? '09:00';
          openNew(preferredSlot, undefined, day, undefined, { scheduleKnown: false });
        }}
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
      <AgendaLabSummaryStrip
        summary={labSummary}
        labOnly={labOnly}
        onToggleLabOnly={() => setLabOnly((value) => !value)}
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

          <div className="dc-pending-call-panel">
            <div className="dc-calls-caption"><strong>Telefonear</strong><span>Arrastre a un hueco</span></div>
            <table className="dc-calls-list">
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
            <button onClick={() => window.print()}><Printer size={14} aria-hidden="true" />Imprimir</button>
            <button onClick={verOcupacion}><Gauge size={14} aria-hidden="true" />Ocupación</button>
            <button onClick={() => { setDoctorId(''); void citasQuery.refetch(); }}><UsersRound size={14} aria-hidden="true" />Todas</button>
            <button onClick={() => navigate('/hoy')}><Home size={14} aria-hidden="true" />Hoy</button>
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

        <AgendaResourceGrid
          day={day} slots={slots} doctorId={doctorId} doctores={doctores} horarios={horariosByDoctor}
          citas={citas} allCitas={citasQuery.data ?? []} now={now}
          canTreat={canTreatAppointment}
          busy={operationalMutation.isPending || confirmMutation.isPending}
          onOpenCita={setModalCita} onOpenPatient={openPatient}
          onCreate={draft => openNew(draft.slot, draft.pacienteId, draft.day, draft.doctorId, draft)}
          onConfirm={cita => confirmMutation.mutate(cita)}
          onAction={(cita, action) => operationalMutation.mutate({ cita, action })}
          onContext={handleContext}
          onOpenHorario={user?.rol === 'admin' ? () => navigate(`/admin-extras?tab=agenda${doctorId ? `&doctor_id=${doctorId}` : ''}`) : undefined}
        />
      </div>

      {(modalCita || slotDraft) && (
        <CitaModal
          cita={modalCita}
          draft={slotDraft}
          pacientes={pacientes}
          doctores={doctores}
          gabinetes={gabinetesQuery.data ?? []}
          citas={citasQuery.data ?? []}
          tratamientos={tratamientosQuery.data ?? []}
          defaultDuration={configQuery.data?.duracion_habitual_min ?? 30}
          canOverrideSchedule={user?.rol === 'admin'}
          busy={saveMutation.isPending}
          error={saveMutation.error instanceof Error ? saveMutation.error.message : undefined}
          onClose={() => { setModalCita(null); setSlotDraft(null); }}
          onSubmit={(data) => saveMutation.mutate(data)}
          onCreateTemporaryPaciente={(data) => createTempPatient.mutateAsync(data)}
        />
      )}

      {showBuscarHueco && (
        <BuscarHuecoModal
          day={day}
          doctorId={doctorId}
          gabineteId={jornada?.gabineteId}
          pacientes={pacientes}
          doctores={doctores}
          onClose={() => setShowBuscarHueco(false)}
          onSelect={(hueco, pacienteId) => {
            const targetDay = localAppointmentDate(hueco.fecha_hora_inicio);
            const targetSlot = localAppointmentTime(hueco.fecha_hora_inicio);
            setShowBuscarHueco(false);
            if (!jornada) { setDay(targetDay); setDoctorId(hueco.doctor_id); }
            openNew(targetSlot, pacienteId, targetDay, hueco.doctor_id, { duration: hueco.duracion_min });
          }}
        />
      )}

      {showCitasPaciente && sessionStorage.getItem('dentcore_selected_patient_id') && (
        <CitasPacienteModal
          pacienteId={sessionStorage.getItem('dentcore_selected_patient_id')!}
          pacientes={pacientes}
          onClose={() => setShowCitasPaciente(false)}
          onSelect={(cita) => {
            if (jornada) jornada.focusCita(cita);
            else { setDay(localAppointmentDate(cita.fecha_hora)); setDoctorId(cita.doctor_id); setModalCita(cita); }
            setShowCitasPaciente(false);
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
        <FloatingPopover className="context-menu" point={contextMenu} onClose={() => setContextMenu(null)} role="menu" aria-label="Acciones de cita" onClick={(event) => event.stopPropagation()}>
          <strong>Agenda</strong>
          <button onClick={() => { setModalCita(contextMenu.cita); setContextMenu(null); }}>Editar cita</button>
          <button onClick={() => openPatient(contextMenu.cita)}>Abrir ficha del paciente</button>
          <button onClick={() => reprogramarCita(contextMenu.cita)}>Reprogramar / cambiar hora</button>
          <button onClick={() => copiarTelefono(contextMenu.cita)}>Copiar telefono</button>
          <span />
          {getVisualStatus(contextMenu.cita) === 'programada' && <button onClick={() => confirmMutation.mutate(contextMenu.cita)}>Confirmar cita</button>}
          {getVisualStatus(contextMenu.cita) === 'confirmada' && <button onClick={() => setStatus(contextMenu.cita, 'programada')}>Pendiente de confirmar</button>}
          {['programada', 'confirmada'].includes(getVisualStatus(contextMenu.cita)) && <button onClick={() => operationalMutation.mutate({ cita: contextMenu.cita, action: 'llegada' })}>Registrar llegada</button>}
          {canTreatAppointment(contextMenu.cita) && getVisualStatus(contextMenu.cita) === 'en_sala' && <button onClick={() => operationalMutation.mutate({ cita: contextMenu.cita, action: 'atender' })}>Atender</button>}
          {canTreatAppointment(contextMenu.cita) && getVisualStatus(contextMenu.cita) === 'en_atencion' && <button onClick={() => operationalMutation.mutate({ cita: contextMenu.cita, action: 'finalizar' })}>Finalizar visita</button>}
          <span />
          {['programada', 'confirmada', 'en_sala'].includes(getVisualStatus(contextMenu.cita)) && <><button onClick={() => cancelCita(contextMenu.cita, 'anulada')}>Cancelar cita</button>
          <button onClick={() => cancelCita(contextMenu.cita, 'falta')}>No asistió</button></>}
          <button onClick={() => enviarRecordatorio(contextMenu.cita, 'whatsapp')}>Recordatorio WhatsApp</button>
          <button onClick={() => enviarRecordatorio(contextMenu.cita, 'email')}>Recordatorio email</button>
          <button onClick={() => enviarRecordatorio(contextMenu.cita, 'ambos')}>Recordatorio WhatsApp + email</button>
        </FloatingPopover>
      )}
    </section>
  );
}
