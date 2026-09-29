import type { ValoracionCreate, ValoracionData } from '../../../api/assessments';
import type { ApiPaciente } from '../../../api/types';
import { clinicDate } from '../../../shared/time/clinicTime';

export type Valoracion = ValoracionData & {
  id: string;
  tipo: ValoracionCreate['tipo'];
  registrada_at?: string;
  autor?: string;
};

export function patientAssessments(patient: ApiPaciente): Valoracion[] {
  const health = patient.datos_salud;
  const initial = health?.primera_visita;
  const followups = Array.isArray(health?.valoraciones) ? health.valoraciones : [];
  const records: Valoracion[] = [];
  if (initial && typeof initial === 'object' && !Array.isArray(initial)) {
    records.push({ ...initial, id: 'inicial', tipo: 'inicial' });
  }
  followups.forEach((item, index) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      records.push({ ...item, id: typeof item.id === 'string' ? item.id : `legacy-${index}`, tipo: 'posterior' });
    }
  });
  return records.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
}

export function newAssessment(patient: ApiPaciente, tipo: ValoracionCreate['tipo']): ValoracionCreate {
  return { id: crypto.randomUUID(), tipo, revision: patient.revision, datos: { fecha: clinicDate(new Date()) } };
}

export function hasAssessmentContent(data: ValoracionData) {
  return Object.entries(data).some(([key, value]) => key !== 'fecha' && value?.trim());
}
