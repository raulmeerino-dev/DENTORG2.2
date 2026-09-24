import { formatDate } from '../../shared/format';
import type { ApiPaciente,PacienteSexo } from '../../api/types';


const SEXO_LABEL: Record<PacienteSexo, string> = {
  M: 'Hombre',
  F: 'Mujer',
  otro: 'Otro',
};

export function PatientIdentityChips({ paciente }: { paciente: ApiPaciente | null }) {
  if (!paciente) return null;
  const chips: Array<{ key: string; label: string }> = [];
  if (paciente.sexo) chips.push({ key: 'sexo', label: SEXO_LABEL[paciente.sexo] ?? paciente.sexo });
  if (paciente.profesion) chips.push({ key: 'profesion', label: paciente.profesion });
  if (paciente.num_poliza) chips.push({ key: 'poliza', label: `Póliza ${paciente.num_poliza}` });
  if (paciente.pagador_distinto) chips.push({ key: 'pagador', label: 'Pagador distinto' });
  if (paciente.fecha_primera_visita) chips.push({ key: 'primera', label: `1ª visita ${formatDate(paciente.fecha_primera_visita)}` });
  if (!chips.length) return null;
  return (
    <ul className="patient-identity-chips" aria-label="Datos administrativos del paciente">
      {chips.map((chip) => (
        <li key={chip.key}>{chip.label}</li>
      ))}
    </ul>
  );
}
