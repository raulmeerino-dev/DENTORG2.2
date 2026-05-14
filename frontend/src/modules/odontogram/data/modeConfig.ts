import type { OdontogramMode } from '../types/odontogram.types';

export type OdontogramModeConfig = {
  title: string;
  kicker: string;
  readOnly: boolean;
  quickTreatments: boolean;
  intent: 'summary' | 'base' | 'diagnosis' | 'proposal' | 'pending' | 'completed' | 'current' | 'history';
};

export const odontogramModeConfig: Record<OdontogramMode, OdontogramModeConfig> = {
  summary: {
    title: 'Odontograma actual',
    kicker: 'Resumen',
    readOnly: true,
    quickTreatments: false,
    intent: 'summary',
  },
  initialVisit: {
    title: 'Odontograma de primera visita',
    kicker: 'Base clinica',
    readOnly: false,
    quickTreatments: true,
    intent: 'base',
  },
  diagnosis: {
    title: 'Diagnostico odontologico',
    kicker: 'Exploracion',
    readOnly: false,
    quickTreatments: true,
    intent: 'diagnosis',
  },
  budget: {
    title: 'Odontograma del presupuesto',
    kicker: 'Propuesta',
    readOnly: true,
    quickTreatments: false,
    intent: 'proposal',
  },
  pending: {
    title: 'Tratamientos pendientes',
    kicker: 'Aceptado no realizado',
    readOnly: true,
    quickTreatments: false,
    intent: 'pending',
  },
  completed: {
    title: 'Tratamientos realizados',
    kicker: 'Ejecutado',
    readOnly: true,
    quickTreatments: false,
    intent: 'completed',
  },
  current: {
    title: 'Odontograma actual',
    kicker: 'Estado real hoy',
    readOnly: true,
    quickTreatments: false,
    intent: 'current',
  },
  history: {
    title: 'Historico odontologico',
    kicker: 'Solo lectura',
    readOnly: true,
    quickTreatments: false,
    intent: 'history',
  },
};
