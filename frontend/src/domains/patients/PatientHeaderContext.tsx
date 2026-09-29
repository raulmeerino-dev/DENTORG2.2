import { Link } from 'react-router-dom';
import type { ApiPaciente, Cita } from '../../api/types';
import { fullName } from './patientName';
import { patientAge, patientAppointmentLabel } from './patientContext';

export function PatientHeaderContext({ paciente, proximaCita }: {
  paciente: ApiPaciente;
  proximaCita?: Pick<Cita, 'fecha_hora'>;
}) {
  const name = fullName(paciente);
  const age = patientAge(paciente);
  return (
    <div className="dc-patient-context">
      <nav className="dc-patient-breadcrumb" aria-label="Ubicación del paciente">
        <Link to="/pacientes">Pacientes</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{name}</span>
      </nav>
      <div className="dc-patient-title-row">
        <h1 className="dc-global-patient" title={name}>{name}</h1>
        <div className="dc-patient-metadata" aria-label="Paciente activo">
          <span title="Número de historia">H {paciente.num_historial}</span>
          {age !== null && <span>{age} años</span>}
          {paciente.telefono && <span>{paciente.telefono}</span>}
          {proximaCita && <span>Próxima: {patientAppointmentLabel(proximaCita.fecha_hora)}</span>}
        </div>
      </div>
    </div>
  );
}
