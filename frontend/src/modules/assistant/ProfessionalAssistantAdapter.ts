import { getDoctores } from '../../lib/api';
import type { Doctor } from '../../types/api';
import type { AssistantProfessionalOption } from './types';
import { normalizeAssistantText } from './textUtils';

function stripDoctorPrefix(value: string) {
  return value.replace(/^dra?\.\s*/i, '').trim();
}

export function toAssistantProfessionalOption(doctor: Doctor): AssistantProfessionalOption {
  return {
    id: doctor.id,
    displayName: stripDoctorPrefix(doctor.nombre),
    specialty: doctor.especialidad,
  };
}

export async function getAssistantProfessionals() {
  const doctores = await getDoctores();
  return doctores.filter((doctor) => doctor.activo).map(toAssistantProfessionalOption);
}

function professionalSearchText(option: AssistantProfessionalOption) {
  return normalizeAssistantText([
    option.displayName,
    option.specialty,
  ].filter(Boolean).join(' '));
}

export function findProfessionalCandidates(query: string | null | undefined, professionals: AssistantProfessionalOption[]) {
  const normalizedQuery = normalizeAssistantText(query);
  if (!normalizedQuery) return [];
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  return professionals
    .filter((option) => tokens.every((token) => professionalSearchText(option).includes(token)))
    .slice(0, 6);
}

export function findMentionedProfessional(text: string, professionals: AssistantProfessionalOption[]) {
  const normalized = normalizeAssistantText(text);
  return professionals
    .sort((a, b) => b.displayName.length - a.displayName.length)
    .find((option) => normalizeAssistantText(option.displayName).split(' ').every((token) => normalized.includes(token))) ?? null;
}
