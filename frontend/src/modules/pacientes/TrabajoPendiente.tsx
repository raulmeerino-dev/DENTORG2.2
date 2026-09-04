import type { CSSProperties, MouseEvent } from 'react';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import type { ApiPaciente, Cita, Presupuesto, PresupuestoLinea, TrabajoPendiente, UserRole } from '../../types/api';
import { colorForTreatment, formatDate, money, normalizeText } from '../../lib/utils';
import { TreatmentBadge } from '../../components/TreatmentBadge';
import { PatientOdontogramFlow } from '../odontogram';

function findCitaForLinea(citas: Cita[], lineaId: string) {
  const linked = citas
    .filter((cita) => {
      const estado = normalizeText(cita.estado);
      if (estado.includes('anulada') || estado.includes('falta') || estado.includes('cancel')) return false;
      return cita.presupuesto_linea_id === lineaId;
    })
    .sort((a, b) => Date.parse(a.fecha_hora) - Date.parse(b.fecha_hora));
  const now = Date.now();
  return linked.find((cita) => Date.parse(cita.fecha_hora) >= now)
    ?? linked[linked.length - 1]
    ?? null;
}

export function TrabajoPendientePanel({
  trabajosPendientes,
  presupuestos,
  citas,
  loading = false,
  error = null,
  paciente,
  onDarCita,
  onContextLinea,
  onCrearPedidoLab,
  onOpenPresupuestos,
  userRole,
}: {
  trabajosPendientes: TrabajoPendiente[];
  presupuestos: Presupuesto[];
  citas: Cita[];
  loading?: boolean;
  error?: string | null;
  paciente?: ApiPaciente | null;
  onDarCita: (linea: PresupuestoLinea) => void;
  onContextLinea: (event: MouseEvent, linea: PresupuestoLinea) => void;
  onCrearPedidoLab?: (linea: PresupuestoLinea) => void;
  onOpenPresupuestos?: () => void;
  userRole?: UserRole | null;
}) {
  const rows = trabajosPendientes.map((trabajo) => {
    const linea = trabajo.presupuesto_linea;
    return {
      trabajo,
      linea,
      presupuesto: presupuestos.find((item) => item.id === linea.presupuesto_id),
      cita: findCitaForLinea(citas, linea.id),
    };
  });
  const acceptedUnpreparedLines = presupuestos.flatMap((presupuesto) => (
    presupuesto.lineas.filter((linea) => linea.aceptado && !linea.pasado_trabajo_pendiente)
  ));
  const statusClass = (value: string) => normalizeText(value).replace(/\s+/g, '-');
  const pendingCountLabel = `${rows.length} ${rows.length === 1 ? 'tratamiento' : 'tratamientos'}`;

  return (
    <section className="desk-panel pending-work-panel">
      <div className="panel-caption">
        <strong>Tratamientos pendientes</strong>
        <span>{rows.length ? `${pendingCountLabel} por realizar y su cita vinculada.` : 'Trabajo aceptado que todavía debe planificarse o realizarse.'}</span>
      </div>
      {loading && !rows.length && <p className="pending-work-status">Cargando tratamientos pendientes...</p>}
      {error && <p className="pending-work-status is-error" role="alert">{error}</p>}
      {!loading && !error && !rows.length && (
        <div className={`pending-work-empty ${acceptedUnpreparedLines.length ? 'is-actionable' : ''}`}>
          <span className="pending-work-empty-icon" aria-hidden="true"><ClipboardCheck size={20} /></span>
          <div>
            <strong>
              {acceptedUnpreparedLines.length
                ? `${acceptedUnpreparedLines.length} ${acceptedUnpreparedLines.length === 1 ? 'tratamiento aceptado pendiente' : 'tratamientos aceptados pendientes'} de preparar`
                : 'Sin trabajo pendiente'}
            </strong>
            <span>
              {acceptedUnpreparedLines.length
                ? 'Prepáralos desde el presupuesto para poder citarlos y utilizarlos en sesión.'
                : 'No hay tratamientos aceptados pendientes de citar o realizar.'}
            </span>
          </div>
          {onOpenPresupuestos && (
            <button type="button" className="pending-work-empty-action" onClick={onOpenPresupuestos}>
              {acceptedUnpreparedLines.length ? 'Revisar presupuesto' : 'Abrir presupuestos'}
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {rows.length > 0 && (
        <>
          <div className="pending-work-table-wrap">
            <table className="dentcore-table">
              <thead><tr><th>Presupuesto</th><th>Tipo</th><th>Tratamiento</th><th>Pieza</th><th>Importe</th><th>Cita</th><th>Estado</th><th>Acción</th></tr></thead>
              <tbody>
                {rows.map(({ trabajo, presupuesto, linea, cita }) => {
                  const estado = cita ? cita.estado : 'Pendiente';
                  return (
                    <tr
                      key={trabajo.id}
                      className="treatment-coded-row"
                      style={{ '--treatment-color': colorForTreatment(linea.tratamiento) } as CSSProperties}
                      onContextMenu={(event) => onContextLinea(event, linea)}
                    >
                      <td>{presupuesto?.numero ?? '-'}</td>
                      <td><TreatmentBadge tratamiento={linea.tratamiento} /></td>
                      <td><strong>{linea.tratamiento?.nombre ?? 'Tratamiento'}</strong></td>
                      <td>{linea.pieza_dental ?? ''}</td>
                      <td className="num">{money(linea.importe_neto)}</td>
                      <td>{cita ? `${formatDate(cita.fecha_hora)} ${cita.fecha_hora.slice(11, 16)}` : 'Sin cita'}</td>
                      <td><span className={`work-status-chip work-status-${statusClass(estado)}`}>{estado}</span></td>
                      <td className="trabajo-pendiente-acciones">
                        <button onClick={() => onDarCita(linea)}>Dar cita</button>
                        {onCrearPedidoLab && (
                          <button type="button" onClick={() => onCrearPedidoLab(linea)} title="Crear pedido de laboratorio para este tratamiento">
                            + Lab
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <details className="odontogram-support-panel" open>
            <summary>Mapa de pendientes por pieza</summary>
            <PatientOdontogramFlow
              paciente={paciente ?? null}
              mode="pending"
              title="Pendientes por pieza"
              subtitle="Mapa clínico compartido para ubicar trabajos aceptados y pendientes."
              readOnly
              enableQuickTreatments={false}
              userRole={userRole}
            />
          </details>
        </>
      )}
    </section>
  );
}
