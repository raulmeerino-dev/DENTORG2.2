import type { RecordTarget } from '../../api/records';

/** Resolve only canonical application destinations, never an API-supplied URL. */
export function recordTargetHref(target: RecordTarget): string | null {
  const id = encodeURIComponent(target.id);
  const patient = target.patient_id;
  if (['documento', 'consentimiento', 'receta'].includes(target.kind)) {
    return patient ? `/pacientes/${encodeURIComponent(patient)}/archivo/${target.kind}/${id}` : null;
  }
  if (target.kind === 'cita') {
    const params = new URLSearchParams({ vista: 'agenda', cita_id: target.id });
    if (target.date) params.set('fecha', target.date.slice(0, 10));
    if (target.doctor_id) params.set('doctor_id', target.doctor_id);
    return `/jornada?${params}`;
  }
  if (target.kind === 'inventario') return `/administracion?tab=inventario&producto_id=${id}`;
  if (target.kind === 'auditoria') return `/registros?vista=auditoria&q=${id}`;
  if (target.kind === 'paciente') return `/pacientes?paciente_id=${encodeURIComponent(patient || target.id)}`;
  if (!patient) return null;
  const params = new URLSearchParams({ paciente_id: patient });
  if (target.kind === 'presupuesto' || target.kind === 'plan') {
    params.set('tab', 'presupuestos');
    params.set('presupuesto_id', target.id);
  } else if (['factura', 'cobro', 'saldo', 'anticipo'].includes(target.kind)) {
    params.set('tab', 'facturacion');
    params.set(`${target.kind}_id`, target.id);
  } else if (target.kind === 'laboratorio') {
    params.set('tab', 'historial');
    params.set('laboratorio_id', target.id);
  } else if (target.kind === 'tratamiento') {
    params.set('tab', 'pendiente');
    params.set('tratamiento_id', target.id);
  } else if (['historial', 'realizado', 'actividad'].includes(target.kind)) {
    params.set('tab', 'historial');
    params.set('registro_id', target.id);
  } else {
    return null;
  }
  return `/pacientes?${params}`;
}

export function recordsReturnPath(state: unknown): string | null {
  if (!state || typeof state !== 'object' || !('returnTo' in state) || typeof state.returnTo !== 'string') return null;
  return /^\/(registros|archivos)(\?|$)/.test(state.returnTo) ? state.returnTo : null;
}
