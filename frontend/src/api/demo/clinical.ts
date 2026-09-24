import type {
  HistorialClinico,
} from '../types';
import { DEMO_HISTORIAL } from './data';

export async function getHistorialPaciente(pacienteId: string): Promise<HistorialClinico[]> {
  return DEMO_HISTORIAL.filter((item) => item.paciente_id === pacienteId || pacienteId.startsWith('demo-'));
}
