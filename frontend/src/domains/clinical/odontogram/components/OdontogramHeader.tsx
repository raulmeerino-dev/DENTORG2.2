import type { OdontogramMode } from '../types/odontogram.types';

type OdontogramHeaderProps = {
  patientName: string;
  mode: OdontogramMode;
  contextDate?: string;
  totalBudget?: number;
};

const modeLabels: Record<OdontogramMode, string> = {
  summary: 'Resumen',
  initialVisit: 'Primera visita',
  diagnosis: 'Diagnóstico',
  budget: 'Presupuesto',
  pending: 'Pendientes',
  completed: 'Realizados',
  current: 'Actual',
  history: 'Histórico',
  documents: 'Documentos',
  reading: 'Lectura',
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

export function OdontogramHeader({ patientName, mode, contextDate, totalBudget }: OdontogramHeaderProps) {
  return (
    <header className="od-topbar">
      <div>
        <span className="od-brand">DentCore Clinic</span>
        <span className="od-module">Módulo de odontograma</span>
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
        {contextDate && (
          <div>
            <dt>Fecha</dt>
            <dd>{contextDate}</dd>
          </div>
        )}
        {totalBudget !== undefined && (
          <div>
            <dt>Total presupuesto</dt>
            <dd>{formatCurrency(totalBudget)}</dd>
          </div>
        )}
      </dl>
    </header>
  );
}
