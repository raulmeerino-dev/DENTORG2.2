import { useQuery } from '@tanstack/react-query';
import { getAuditRecord } from '../../api/records';
import { getApiErrorMessage } from '../../api/errors';
import { Dialog } from '../../design-system';
import { getClinicTimeZone } from '../../shared/time/clinicTime';

export function AuditRecordDetail({ id, scope, onClose }: { id: string; scope: string; onClose: () => void }) {
  const detail = useQuery({ queryKey: ['records-audit-detail', scope, id], queryFn: ({ signal }) => getAuditRecord(id, signal) });
  const entry = detail.data;
  return <Dialog label="Detalle de auditoría" onClose={onClose} className="records-audit-dialog">
    <header><strong>Detalle de auditoría · #{id}</strong><button type="button" onClick={onClose}>Cerrar</button></header>
    <div className="records-audit-content">
      {detail.isLoading && <p role="status">Cargando registro…</p>}
      {detail.isError && <p role="alert">{getApiErrorMessage(detail.error, 'No se pudo cargar el registro.')} <button type="button" onClick={() => void detail.refetch()}>Reintentar</button></p>}
      {entry && <>
        <dl><dt>Fecha</dt><dd>{new Date(entry.timestamp).toLocaleString('es-ES', { timeZone: getClinicTimeZone() })}</dd><dt>Acción</dt><dd>{entry.action}</dd><dt>Entidad</dt><dd>{entry.entity_type}{entry.entity_id ? ` · ${entry.entity_id}` : ''}</dd><dt>Usuario</dt><dd>{entry.user_id ?? 'Sistema'}</dd><dt>Clínica</dt><dd>{entry.clinica_id ?? 'Sin clínica asociada'}</dd><dt>IP</dt><dd>{entry.ip_address ?? '—'}</dd></dl>
        <div className="records-audit-values"><section><h2>Antes</h2><pre>{entry.old_values ? JSON.stringify(entry.old_values, null, 2) : 'Sin valor anterior'}</pre></section><section><h2>Después</h2><pre>{entry.new_values ? JSON.stringify(entry.new_values, null, 2) : 'Sin valor posterior'}</pre></section></div>
        <details><summary>Información técnica de trazabilidad</summary><dl><dt>Huella</dt><dd>{entry.event_hash ?? '—'}</dd><dt>Agente de usuario</dt><dd>{entry.user_agent ?? '—'}</dd></dl></details>
      </>}
    </div>
  </Dialog>;
}
