import type { ApiPaciente,Cita } from '../../../api/types';
import { STATUS_META,getVisualStatus } from './appointmentStatus';


export function patientName(cita: Cita) {
  return cita.paciente ? `${cita.paciente.nombre} ${cita.paciente.apellidos}` : 'Paciente';
}

export function findPaciente(pacientes: ApiPaciente[], id?: string) {
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

export function patientMatchesQuery(paciente: ApiPaciente, query: string) {
  const tokens = normalizePatientSearch(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const haystack = patientSearchText(paciente);
  return tokens.every((token) => haystack.includes(token));
}

export function citaMatchesQuery(cita: Cita, pacientes: ApiPaciente[], query: string) {
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
    ...(cita.laboratorio ?? []).flatMap((trabajo) => [
      trabajo.descripcion,
      trabajo.tipo_trabajo,
      trabajo.estado,
      trabajo.laboratorio?.nombre,
      trabajo.ubicacion_clinica,
    ]),
  ].filter(Boolean).join(' '));
  return tokens.every((token) => haystack.includes(token));
}

export function shortDoctorName(name: string) {
  return name
    .replace(/^Dra?\.\s*/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}
