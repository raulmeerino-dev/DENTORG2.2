import type { OdontogramaToolMode } from '../types/odontogram.types';

export type OdontogramaAction =
  | 'guardar_diagnostico'
  | 'guardar_superficie'
  | 'guardar_nota'
  | 'anadir_linea'
  | 'actualizar_linea'
  | 'quitar_linea'
  | 'dar_cita'
  | 'marcar_en_proceso'
  | 'marcar_realizado'
  | 'ver_detalle'
  | 'asociar_documento'
  | 'ver_factura'
  | 'filtrar_pieza'
  | 'ver_evento'
  | 'abrir_documento'
  | 'asociar_documento_pieza';

export const odontogramaActionLabels: Record<OdontogramaAction, string> = {
  guardar_diagnostico: 'Guardar diagnostico',
  guardar_superficie: 'Guardar superficie',
  guardar_nota: 'Guardar nota',
  anadir_linea: 'Anadir linea',
  actualizar_linea: 'Actualizar linea',
  quitar_linea: 'Quitar linea',
  dar_cita: 'Dar cita',
  marcar_en_proceso: 'En proceso',
  marcar_realizado: 'Marcar realizado',
  ver_detalle: 'Ver detalle',
  asociar_documento: 'Asociar documento',
  ver_factura: 'Ver factura',
  filtrar_pieza: 'Filtrar pieza',
  ver_evento: 'Ver evento',
  abrir_documento: 'Abrir documento',
  asociar_documento_pieza: 'Asociar documento',
};

export function getAvailableActions(
  mode: OdontogramaToolMode,
  permissions: {
    canEdit?: boolean;
    canSchedule?: boolean;
    canCompleteTreatment?: boolean;
    canAttachDocument?: boolean;
    canViewBilling?: boolean;
  } = {},
): OdontogramaAction[] {
  if (mode === 'lectura') return [];
  if (mode === 'diagnostico') {
    return permissions.canEdit ? ['guardar_diagnostico', 'guardar_superficie', 'guardar_nota'] : [];
  }
  if (mode === 'presupuesto') {
    return permissions.canEdit ? ['anadir_linea', 'actualizar_linea', 'quitar_linea'] : [];
  }
  if (mode === 'pendiente') {
    return [
      ...(permissions.canSchedule ? ['dar_cita' as const] : []),
      ...(permissions.canCompleteTreatment ? ['marcar_en_proceso' as const, 'marcar_realizado' as const] : []),
    ];
  }
  if (mode === 'realizado') {
    return [
      'ver_detalle',
      ...(permissions.canAttachDocument ? ['asociar_documento' as const] : []),
      ...(permissions.canViewBilling ? ['ver_factura' as const] : []),
    ];
  }
  if (mode === 'historial') return ['filtrar_pieza', 'ver_evento', 'abrir_documento'];
  if (mode === 'documentos') return ['asociar_documento_pieza', 'abrir_documento'];
  return [];
}
