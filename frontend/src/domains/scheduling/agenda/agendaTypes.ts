import type { HorarioDoctor,HuecoLibre } from '../../../api/types';


export type SlotDraft = {
  day: string;
  slot: string;
  doctorId: string;
  gabineteId?: string;
  duration?: number;
  scheduleKnown?: boolean;
  pacienteId?: string;
  motivo?: string;
  telefonearId?: string;
  presupuestoLineaId?: string;
};

export type HuecoResultado = HuecoLibre & {
  doctorNombre: string;
  doctorColor: string | null;
};

export type HorariosPorDoctor = Record<string, HorarioDoctor[]>;
