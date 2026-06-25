import { getPacientes } from '../../lib/api';
import type { ApiPaciente } from '../../types/api';
import type { AssistantPatientOption } from './types';
import { normalizeAssistantText } from './textUtils';

export function patientDisplayName(paciente: ApiPaciente) {
  return `${paciente.nombre} ${paciente.apellidos}`.trim();
}

export function toAssistantPatientOption(paciente: ApiPaciente): AssistantPatientOption {
  return {
    id: paciente.id,
    displayName: patientDisplayName(paciente),
    historyNumber: paciente.num_historial,
    phone: paciente.telefono,
  };
}

export async function getAssistantPatients() {
  const pacientes = await getPacientes();
  return pacientes.map(toAssistantPatientOption);
}

function optionSearchText(option: AssistantPatientOption) {
  return normalizeAssistantText([
    option.displayName,
    option.phone,
    option.historyNumber,
  ].filter(Boolean).join(' '));
}

export function findPatientCandidates(query: string | null | undefined, patients: AssistantPatientOption[]) {
  const normalizedQuery = normalizeAssistantText(query);
  if (!normalizedQuery) return [];
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  return patients
    .filter((option) => {
      const haystack = optionSearchText(option);
      return tokens.every((token) => haystack.includes(token));
    })
    .slice(0, 8);
}

export function findMentionedPatient(text: string, patients: AssistantPatientOption[]) {
  const normalized = normalizeAssistantText(text);
  return patients
    .sort((a, b) => b.displayName.length - a.displayName.length)
    .find((option) => normalizeAssistantText(option.displayName).split(' ').every((token) => normalized.includes(token))) ?? null;
}
