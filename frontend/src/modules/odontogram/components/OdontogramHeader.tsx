import type { OdontogramMode } from '../types/odontogram.types';

type OdontogramHeaderProps = {
  patientName: string;
  mode: OdontogramMode;
  demoDate: string;
  totalBudget: number;
};

const modeLabels: Record<OdontogramMode, string> = {
  summary: 'Resumen',
  initialVisit: 'Primera visita',
  diagnosis: 'Diagnostico',
  budget: 'Presupuesto',
  pending: 'Pendientes',
  completed: 'Realizados',
  current: 'Actual',
  history: 'Historico',
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

export function OdontogramHeader({ patientName, mode, demoDate, totalBudget }: OdontogramHeaderProps) {
  return (
    <header className="od-topbar">
      <div>
        <span className="od-brand">DentOrg2 Clinic</span>
        <span className="od-module">Modulo de odontograma</span>
      </div>
      <dl className="od-demo-meta" aria-label="Datos del odontograma">
        <div>
          <dt>Paciente</dt>
          <dd>{patientName}</dd>
        </div>
        <div>
          <dt>Modo actual</dt>
          <dd>{modeLabels[mode]}</dd>
        </div>
        <div>
          <dt>Fecha</dt>
          <dd>{demoDate}</dd>
        </div>
        <div>
          <dt>Total presupuesto</dt>
          <dd>{formatCurrency(totalBudget)}</dd>
        </div>
      </dl>
    </header>
  );
}
