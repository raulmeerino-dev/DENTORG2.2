import type { TrabajoLaboratorio } from '../../types/api';

export function isLaboratorioVencido(trabajo: TrabajoLaboratorio): boolean {
  if (!trabajo.fecha_entrega_prevista) return false;
  if (trabajo.fecha_recepcion) return false;
  if (['entregado', 'cancelado', 'cancelled', 'delivered_or_placed'].includes(trabajo.estado)) return false;
  return trabajo.fecha_entrega_prevista < new Date().toISOString().slice(0, 10);
}

export function contarLaboratorioVencidos(trabajos: TrabajoLaboratorio[]): number {
  return trabajos.filter(isLaboratorioVencido).length;
}
