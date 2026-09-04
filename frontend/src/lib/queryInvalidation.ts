import type { QueryClient } from '@tanstack/react-query';

const patientScopedQueryKeys = (pacienteId: string) => [
  ['paciente-detalle', pacienteId],
  ['presupuestos', pacienteId],
  ['trabajo-pendiente', pacienteId],
  ['facturas', pacienteId],
  ['pagos-anticipados', pacienteId],
  ['saldo-paciente', pacienteId],
  ['historial-paciente', pacienteId],
  ['historial-sin-facturar', pacienteId],
  ['citas-paciente', pacienteId],
  ['agenda-citas-paciente', pacienteId],
  ['documentos-paciente', pacienteId],
  ['consentimientos-paciente', pacienteId],
  ['laboratorio-paciente', pacienteId],
  ['recetas-paciente', pacienteId],
  ['notas-dentales', pacienteId],
  ['sesion-items', pacienteId],
  ['odontograma-contexto', pacienteId],
  ['patient-odontogram-flow', pacienteId],
  ['odontograma-paciente', pacienteId],
  ['whatsapp-comunicaciones-paciente', pacienteId],
  ['assistant-citas-paciente', pacienteId],
  ['assistant-presupuestos', pacienteId],
  ['assistant-saldo', pacienteId],
] as const;

const globalOperationalQueryKeys = [
  ['pacientes'],
  ['citas'],
  ['hoy-citas'],
  ['facturas-global'],
  ['caja-facturas'],
  ['caja-kpis'],
  ['caja-ingresos'],
  ['dashboard-bi'],
  ['report-kpis'],
  ['report-pacientes'],
  ['report-top-tratamientos'],
  ['report-citas-doctor'],
  ['admin-report-dashboard'],
  ['admin-report-kpis'],
  ['admin-report-pacientes'],
  ['admin-report-tratamientos'],
  ['admin-report-doctores'],
] as const;

export function invalidatePatientWorkspaceQueries(queryClient: QueryClient, pacienteId: string) {
  for (const queryKey of patientScopedQueryKeys(pacienteId)) {
    void queryClient.invalidateQueries({ queryKey });
  }
  for (const queryKey of globalOperationalQueryKeys) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
