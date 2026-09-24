import type { CSSProperties,FormEvent } from 'react';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { buscarHuecosLibres } from '../../../api/scheduling';
import type { ApiPaciente,Doctor } from '../../../api/types';
import { patientMatchesQuery } from './agendaSearch';
import { addDaysIso,dateTimeLabel,localDayRange,todayIso } from './agendaTime';
import type { HuecoResultado } from './agendaTypes';
import { useAgendaDialog } from './useAgendaDialog';

export function BuscarHuecoModal({
  day,
  doctorId,
  gabineteId,
  pacientes,
  doctores,
  onClose,
  onSelect,
}: {
  day: string;
  doctorId: string;
  gabineteId?: string;
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
  const dialog = useAgendaDialog<HTMLFormElement>(onClose);

  const filteredPatients = useMemo(() => {
    if (!pacienteQuery.trim()) return pacientes.slice(0, 30);
    return pacientes.filter((paciente) => patientMatchesQuery(paciente, pacienteQuery)).slice(0, 30);
  }, [pacientes, pacienteQuery]);

  const search = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    setError('');
    setResultados([]);
    const targets = selectedDoctorId ? doctores.filter((doctor) => doctor.id === selectedDoctorId) : doctores;
    if (!targets.length) {
      setError('No hay doctores activos para buscar huecos.');
      return;
    }
    setBuscando(true);
    try {
      const hasta = addDaysIso(fechaDesde, Math.max(0, Number(dias || 1) - 1));
      const duration = Number(duracion);
      const desdeDateTime = fechaDesde === todayIso() ? new Date().toISOString() : localDayRange(fechaDesde).fecha_desde;
      const responses = await Promise.all(targets.map(async (doctor) => {
        const huecos = await buscarHuecosLibres({
          doctor_id: doctor.id,
          gabinete_id: gabineteId || undefined,
          duracion_min: duration,
          desde: desdeDateTime,
          hasta: localDayRange(hasta).fecha_hasta,
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
      const merged = responses.flat().sort((a, b) => a.fecha_hora_inicio.localeCompare(b.fecha_hora_inicio)).slice(0, 40);


      setResultados(merged);
    } catch (err) {
      setError((err as Error).message || 'No se pudieron buscar huecos.');
    } finally {
      setBuscando(false);
    }
  }, [dias, doctores, duracion, fechaDesde, gabineteId, selectedDoctorId, turno]);

  const autoSearchStartedRef = useRef(false);
  useEffect(() => {
    if (autoSearchStartedRef.current) return;
    autoSearchStartedRef.current = true;
    void search();
  }, [search]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form {...dialog} aria-label="Buscar hueco libre" className="slot-search-modal" onSubmit={search} onMouseDown={(event) => event.stopPropagation()}>
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
              {[5, 10, 15, 20, 30, 40, 45, 50, 60, 90, 120].map((value) => <option key={value} value={value}>{value} min</option>)}
            </select>
          </label>
          <button type="submit" disabled={buscando}>{buscando ? 'Buscando...' : 'Buscar'}</button>
        </div>

        <div className="slot-results">
          {error && <p className="form-error">{error}</p>}
          {!error && !resultados.length && <p>{buscando ? 'Buscando disponibilidad…' : 'No hay huecos con estos filtros. Prueba otra fecha, profesional o duración.'}</p>}
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
