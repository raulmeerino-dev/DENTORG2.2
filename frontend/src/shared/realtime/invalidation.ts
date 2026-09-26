import type { QueryClient, QueryKey } from '@tanstack/react-query';

export interface ChangeEvent {
  type: 'change'; cursor: number; event: string; entity: string; id: string;
  patientId: string | null; doctorId: string | null;
}

// Only server data is invalidated. Form state and session drafts are never
// replaced here, including when reconnecting after missed events.
const patientKeys: Record<string, string[]> = {
  patient: ['paciente-detalle', 'citas-paciente', 'agenda-citas-paciente'],
  appointment: ['citas-paciente', 'agenda-citas-paciente', 'assistant-citas-paciente'],
  treatment: ['historial-paciente', 'historial-sin-facturar', 'sesion-items', 'trabajo-pendiente', 'presupuestos', 'odontograma-contexto', 'patient-odontogram-flow', 'odontograma-paciente'],
  note: ['notas-dentales', 'historial-paciente', 'odontograma-contexto', 'patient-odontogram-flow'],
  budget: ['presupuestos', 'trabajo-pendiente', 'odontograma-contexto', 'patient-odontogram-flow', 'assistant-presupuestos'],
  invoice: ['facturas', 'cuenta-paciente', 'saldo-paciente', 'historial-sin-facturar', 'historial-paciente'],
  payment: ['facturas', 'cuenta-paciente', 'saldo-paciente', 'pagos-anticipados', 'historial-paciente'],
  balance: ['cuenta-paciente', 'saldo-paciente', 'facturas', 'historial-paciente', 'assistant-saldo'],
  document: ['documentos-paciente', 'consentimientos-paciente', 'patient-file-detail', 'patient-file-content'],
  prescription: ['recetas-paciente', 'patient-file-detail', 'patient-file-content'],
  laboratory: ['laboratorio-paciente', 'presupuestos', 'trabajo-pendiente'],
  odontogram: ['odontograma-contexto', 'patient-odontogram-flow', 'odontograma-paciente'],
  communication: ['whatsapp-comunicaciones-paciente'],
};
const globalKeys: Record<string, string[]> = {
  patient: ['pacientes', 'citas', 'hoy-citas', 'checkout-queue', 'admin-report-pacientes'],
  appointment: ['citas', 'hoy-citas', 'telefonear', 'checkout-queue', 'agenda-huecos', 'assistant-huecos', 'admin-report-dashboard', 'admin-report-doctores'],
  treatment: ['checkout-queue', 'admin-report-tratamientos', 'admin-report-doctores'],
  invoice: ['facturas-global', 'caja-facturas', 'caja-kpis', 'caja-ingresos', 'cuentas-pendientes', 'checkout-queue', 'admin-report-dashboard', 'admin-report-kpis'],
  payment: ['facturas-global', 'caja-facturas', 'caja-kpis', 'caja-ingresos', 'cuentas-pendientes', 'checkout-queue', 'admin-report-dashboard', 'admin-report-kpis'],
  balance: ['cuentas-pendientes', 'checkout-queue'],
  laboratory: ['laboratorio-trabajos', 'laboratorio-alertas', 'trabajos-laboratorio-pendientes', 'citas', 'hoy-citas'],
  inventory: ['inventario', 'inventario-proveedores', 'inventario-pedidos', 'inventario-movimientos', 'inventario-alertas'],
  notification: ['doctor-notifications'],
  communication: ['whatsapp-comunicaciones', 'telefonear'],
};
const recordViews: Record<string, string[]> = {
  patient: ['pacientes', 'actividad', 'citas', 'saldos'], appointment: ['citas', 'actividad'],
  treatment: ['tratamientos', 'realizados', 'actividad'], note: ['actividad'], budget: ['planes', 'tratamientos', 'actividad'],
  invoice: ['facturas', 'saldos', 'actividad'], payment: ['cobros', 'facturas', 'saldos', 'actividad'], balance: ['saldos', 'actividad'],
  document: ['documentos', 'actividad'], prescription: ['documentos', 'actividad'], laboratory: ['laboratorio', 'actividad'], inventory: ['inventario'],
};

export function affectedQueries(event: ChangeEvent, key: QueryKey): boolean {
  const family = event.event.split('.')[0];
  const root = String(key[0]);
  if ((globalKeys[family] ?? []).includes(root)) return true;
  if (event.patientId && (patientKeys[family] ?? []).includes(root) && key[1] === event.patientId) return true;
  // Reporting pages are independent server views. Invalidate the relevant view,
  // leaving unrelated tabs and patient workspaces untouched.
  if (root === 'records-page') {
    const view = String(key[2]);
    return (recordViews[family] ?? []).includes(view);
  }
  return false;
}

export function invalidateChanges(client: QueryClient, events: ChangeEvent[]) {
  return client.invalidateQueries({ predicate: query => events.some(event => affectedQueries(event, query.queryKey)) });
}

export function resyncRealtimeQueries(client: QueryClient) {
  const roots = new Set([...Object.values(patientKeys).flat(), ...Object.values(globalKeys).flat(), 'records-page']);
  return client.invalidateQueries({ predicate: query => roots.has(String(query.queryKey[0])) });
}
