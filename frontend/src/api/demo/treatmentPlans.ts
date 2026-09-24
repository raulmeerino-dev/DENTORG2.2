import type {
  Presupuesto,
  TrabajoPendiente,
} from '../types';
import { DEMO_PRESUPUESTOS, DEMO_TRABAJOS_PENDIENTES } from './data';

export async function getPresupuestos(pacienteId: string): Promise<Presupuesto[]> {
  return DEMO_PRESUPUESTOS.filter((item) => item.paciente_id === pacienteId || pacienteId.startsWith('demo-'));
}

export async function getTrabajosPendientesPaciente(pacienteId: string, soloPendiente = true): Promise<TrabajoPendiente[]> {
  const fallback = DEMO_TRABAJOS_PENDIENTES.filter((item) => (
    (item.paciente_id === pacienteId || pacienteId.startsWith('demo-'))
    && (!soloPendiente || !item.realizado)
  ));
  return fallback;
}
