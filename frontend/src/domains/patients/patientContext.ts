import type { ApiPaciente, Cita } from '../../api/types';
import { formatDate } from '../../shared/format';
import { clinicDate, clinicTime } from '../../shared/time/clinicTime';
import { getVisualStatus } from '../scheduling/agenda/appointmentStatus';

export function nextPatientAppointment<T extends Pick<Cita, 'fecha_hora' | 'estado' | 'estado_operativo' | 'observaciones'>>(citas: T[], now: number) {
  return citas.filter(cita => Date.parse(cita.fecha_hora) >= now && ['programada', 'confirmada'].includes(getVisualStatus(cita)))
    .sort((a, b) => Date.parse(a.fecha_hora) - Date.parse(b.fecha_hora))[0];
}

export function patientAppointmentLabel(instant: string) {
  return `${formatDate(clinicDate(instant))} · ${clinicTime(instant)}`;
}

export function patientAge(paciente: ApiPaciente) {
  if (!paciente.fecha_nacimiento) return null;
  const birthday = new Date(`${paciente.fecha_nacimiento.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(birthday.getTime())) return null;
  const today = new Date();
  const beforeBirthday = today.getMonth() < birthday.getMonth()
    || (today.getMonth() === birthday.getMonth() && today.getDate() < birthday.getDate());
  const years = today.getFullYear() - birthday.getFullYear() - Number(beforeBirthday);
  return years >= 0 ? years : null;
}

export function patientAllergies(paciente: ApiPaciente | null) {
  const value = paciente?.datos_salud?.alergias;
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  const negatives = ['no', 'ninguna', 'ninguno', 'sin alergias', 'sin alergias conocidas', 'sin alergias registradas', 'no conocidas'];
  return negatives.includes(clean.toLocaleLowerCase('es')) ? '' : clean;
}
