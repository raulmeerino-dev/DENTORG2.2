import type {
  ApiPaciente,
} from '../types';
import { DEMO_PACIENTES } from './data';

export async function getPacientes(params: {
  q?: string;
  solo_activos?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<ApiPaciente[]> {
  const normalizedQuery = params.q?.trim() ?? '';
  const fallback = DEMO_PACIENTES.filter((paciente) => {
    if (params.solo_activos === true && paciente.activo === false) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      paciente.num_historial,
      paciente.codigo,
      paciente.nombre,
      paciente.apellidos,
      paciente.telefono,
      paciente.telefono2,
      paciente.dni_nie,
      paciente.email,
    ].filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return normalizedQuery
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => haystack.includes(token));
  }).slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? DEMO_PACIENTES.length));
  return fallback;
}

export async function getPaciente(pacienteId: string): Promise<ApiPaciente> {
  return DEMO_PACIENTES.find((item) => item.id === pacienteId) ?? DEMO_PACIENTES[0];
}
