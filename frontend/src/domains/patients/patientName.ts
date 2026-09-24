import type { ApiPaciente } from '../../api/types';

export function fullName(paciente?: ApiPaciente | null) {
  if (!paciente) return '';
  return `${paciente.nombre} ${paciente.apellidos}`.trim();
}
