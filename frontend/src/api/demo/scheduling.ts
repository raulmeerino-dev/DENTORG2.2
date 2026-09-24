import type {
  Cita,
  CitaCambio,
  DisponibilidadDia,
  HorarioDoctor,
  HuecoLibre,
} from '../types';
import { DEMO_DOCTORES } from './data';

function addMinutesLocal(time: string, minutes: number) {
  const [hour, minute] = time.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export async function getCitas(params: Record<string, string>): Promise<Cita[]> {
  const day = params.fecha_desde?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const demoCitas: Cita[] = [
    { id: 'demo-cita-1', paciente_id: 'demo-pac-1', doctor_id: 'demo-doc-1', gabinete_id: 'gab-1', fecha_hora: `${day}T15:00:00`, duracion_min: 30, estado: 'confirmada', motivo: 'Prueba corona 24', observaciones: 'Confirmada por WhatsApp', recordatorio_enviado: true, recordatorio_canal: 'whatsapp', recordatorio_estado: 'confirmado', recordatorio_at: `${day}T09:15:00`, confirmado_at: `${day}T09:18:00`, motivo_cancelacion: null, paciente: { nombre: 'CESAR', apellidos: 'GUTIERREZ VELEZ', telefono: '942503186' }, doctor: { nombre: DEMO_DOCTORES[0].nombre, color_agenda: DEMO_DOCTORES[0].color_agenda }, laboratorio: [{ id: 'demo-labtrab-1', paciente_id: 'demo-pac-1', doctor_id: 'demo-doc-1', laboratorio_id: 'demo-lab-1', cita_id: 'demo-cita-1', tratamiento_id: 't-impl', presupuesto_linea_id: null, tipo_trabajo: 'Corona', descripcion: 'Corona zirconio 24', pieza_dental: 24, observaciones: 'Probar estructura antes de cementar', fecha_salida: `${day}T00:00:00`.slice(0, 10), fecha_entrega_prevista: `${day}T00:00:00`.slice(0, 10), fecha_recepcion: `${day}T00:00:00`.slice(0, 10), fecha_revision: null, fecha_entrega_paciente: null, ubicacion_clinica: 'Recepcion', estado: 'received_in_clinic', colocado: false, material_enviado: true, material_devuelto: false, laboratorio: { id: 'demo-lab-1', nombre: 'Laboratorio Norte', contacto: 'Laura' } }] },
    { id: 'demo-cita-2', paciente_id: 'demo-pac-2', doctor_id: 'demo-doc-2', gabinete_id: 'gab-2', fecha_hora: `${day}T16:10:00`, duracion_min: 40, estado: 'programada', motivo: 'Ortodoncia', observaciones: 'Pendiente de confirmar', recordatorio_enviado: true, recordatorio_canal: 'whatsapp_email', recordatorio_estado: 'sin_respuesta', recordatorio_at: `${day}T08:30:00`, confirmado_at: null, motivo_cancelacion: null, paciente: { nombre: 'PILAR', apellidos: 'OJEDA CALVO', telefono: '600000001' }, doctor: { nombre: DEMO_DOCTORES[1].nombre, color_agenda: DEMO_DOCTORES[1].color_agenda } },
  ];
  const filtered = demoCitas.filter((item) => {
    if (params.paciente_id && item.paciente_id !== params.paciente_id && !params.paciente_id.startsWith('demo-')) return false;
    if (params.doctor_id && item.doctor_id !== params.doctor_id) return false;
    return true;
  });
  return filtered;
}

export async function getPacienteCitas(pacienteId: string): Promise<Cita[]> {
  const day = new Date().toISOString().slice(0, 10);
  const fallback = await getCitas({ paciente_id: pacienteId, fecha_desde: day });
  return fallback;
}

export async function buscarHuecosLibres(params: {
  doctor_id: string;
  duracion_min: number;
  desde: string;
  hasta: string;
  solo_manana?: boolean;
  solo_tarde?: boolean;
  max_resultados?: number;
}): Promise<HuecoLibre[]> {
  const day = params.desde.slice(0, 10);
  const fallbackSlots = params.solo_tarde
    ? ['15:00', '15:30', '16:00', '16:30', '17:00', '18:00']
    : params.solo_manana
      ? ['09:00', '09:30', '10:00', '10:30', '11:30', '12:00']
      : ['09:00', '09:30', '10:00', '11:00', '15:00', '16:00'];
  return fallbackSlots.slice(0, params.max_resultados ?? 20).map((slot) => ({
    doctor_id: params.doctor_id,
    fecha_hora_inicio: `${day}T${slot}:00`,
    fecha_hora_fin: `${day}T${addMinutesLocal(slot, params.duracion_min)}:00`,
    duracion_min: params.duracion_min,
  }));
}

export async function getDisponibilidadDoctor(params: { doctor_id: string; desde: string; dias?: number }): Promise<DisponibilidadDia[]> {
  return [{
    doctor_id: params.doctor_id,
    fecha: params.desde,
    bloques: [{ inicio: '09:00', fin: '13:30' }, { inicio: '15:00', fin: '20:30' }],
    intervalo_min: 10,
    trabaja: true,
  }];
}

export async function getCambiosCita(): Promise<CitaCambio[]> {
  return [];
}

export async function getHorarios(doctorId: string): Promise<HorarioDoctor[]> {
  return [0, 1, 2, 3, 4].map((dia) => ({
    id: `demo-hor-${doctorId}-${dia}`,
    doctor_id: doctorId,
    dia_semana: dia,
    tipo_dia: 'laborable',
    bloques: [{ inicio: '09:00', fin: '13:30' }, { inicio: '15:00', fin: '20:30' }],
    intervalo_min: 10,
  }));
}
