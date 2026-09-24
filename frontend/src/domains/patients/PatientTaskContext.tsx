import type { ApiPaciente } from '../../api/types';
import { fullName } from './patientName';
import { patientAge, patientAllergies } from './patientContext';

export function PatientTaskContext({ paciente }: { paciente: ApiPaciente }) {
  const age = patientAge(paciente);
  const allergies = patientAllergies(paciente);
  return <span>{fullName(paciente)} · H {paciente.num_historial}{age !== null && ` · ${age} años`}{allergies && <strong className="dc-task-clinical-alert"> · Alergias: {allergies}</strong>}</span>;
}
