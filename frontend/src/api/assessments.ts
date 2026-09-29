import { api } from './client';
import type { ApiPaciente } from './types';

export type ValoracionData = {
  fecha?: string;
  motivo?: string;
  dientes_ausentes?: string;
  implantes_previos?: string;
  protesis_previas?: string;
  caries_visibles?: string;
  periodontal?: string;
  higiene?: string;
  plan_recomendado?: string;
  observaciones_boca?: string;
};

export type ValoracionCreate = {
  id: string;
  tipo: 'inicial' | 'posterior';
  revision?: number;
  datos: ValoracionData;
};

export async function registrarValoracion(pacienteId: string, input: ValoracionCreate) {
  const { data } = await api.post<ApiPaciente>(`/tratamientos/pacientes/${pacienteId}/valoraciones`, input);
  return data;
}
