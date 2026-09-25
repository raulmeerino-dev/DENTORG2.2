import { pendingTreatments } from './pendingTreatments';
import type { CSSProperties, MouseEvent } from 'react';
import { useState } from 'react';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import type {
  ApiPaciente,
  Cita,
  Presupuesto,
  PresupuestoLinea,
  TrabajoPendiente,
  UserRole,
} from '../../api/types';
import { colorForTreatment } from '../clinical/components/treatmentVisual';
import { formatDate, money } from '../../shared/format';
import { normalizeText } from '../../shared/text';
import { TreatmentBadge } from '../clinical/components/TreatmentBadge';
import { PatientOdontogramFlow } from '../clinical/odontogram';

function findCitaForLinea(citas: Cita[], lineaId: string) {
  const linked = citas
    .filter((cita) => {
      const estado = normalizeText(cita.estado);
      if (
        estado.includes('anulada') ||
        estado.includes('falta') ||
        estado.includes('cancel') ||
        estado === 'no_presentado'
      )
        return false;
      return cita.presupuesto_linea_id === lineaId;
    })
    .sort((a, b) => Date.parse(a.fecha_hora) - Date.parse(b.fecha_hora));
  const now = Date.now();
  return linked.find((cita) => Date.parse(cita.fecha_hora) >= now) ?? linked[linked.length - 1] ?? null;
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
  focusedId,
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
  focusedId?: string | null;
}) {
  const [focusDismissed, setFocusDismissed] = useState(false);
  const rows = pendingTreatments(presupuestos, trabajosPendientes).map((row) => ({
    ...row,
    cita: findCitaForLinea(citas, row.linea.id),
  }));
  const statusClass = (value: string) => normalizeText(value).replace(/\s+/g, '-');
  const pendingCountLabel = `${rows.length} ${rows.length === 1 ? 'tratamiento' : 'tratamientos'}`;
  const focused =
    !focusDismissed && focusedId
      ? rows.find((row) => row.trabajo?.id === focusedId || row.linea.id === focusedId)
      : undefined;
  const visibleRows = focused ? [focused] : rows;

  return (
    <section className="dc-pending-workspace">
      <div className="panel-caption">
        <strong>Tratamientos pendientes</strong>
        <span>
          {rows.length
            ? `${pendingCountLabel} por realizar y su cita vinculada.`
            : 'Trabajo aceptado que todavía debe planificarse o realizarse.'}
        </span>
      </div>
      {loading && !rows.length && <p className="pending-work-status">Cargando tratamientos pendientes...</p>}
      {error && (
        <p className="pending-work-status is-error" role="alert">
          {error}
        </p>
      )}
      {focused && (
        <div className="history-record-focus">
          <strong>Tratamiento seleccionado · {focused.linea.tratamiento?.nombre}</strong>
          <button type="button" onClick={() => setFocusDismissed(true)}>
            Ver todos los pendientes
          </button>
        </div>
      )}
      {!loading && !error && !rows.length && (
        <div className={'pending-work-empty'}>
          <span className="pending-work-empty-icon" aria-hidden="true">
            <ClipboardCheck size={20} />
          </span>
          <div>
            <strong>Sin trabajo pendiente</strong>
            <span>No hay tratamientos aceptados pendientes de citar o realizar.</span>
          </div>
          {onOpenPresupuestos && (
            <button type="button" className="pending-work-empty-action" onClick={onOpenPresupuestos}>
              Abrir presupuestos
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {rows.length > 0 && (
        <>
          <div className="dc-pending-table">
            <table className="dentcore-table">
              <thead>
                <tr>
                  <th>Presupuesto</th>
                  <th>Tipo</th>
                  <th>Tratamiento</th>
                  <th>Pieza</th>
                  <th>Importe</th>
                  <th>Cita</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ presupuesto, linea, cita }) => {
                  const estado = cita ? cita.estado : 'Pendiente';
                  return (
                    <tr
                      key={linea.id}
                      className="treatment-coded-row"
                      style={{ '--treatment-color': colorForTreatment(linea.tratamiento) } as CSSProperties}
                      onContextMenu={(event) => onContextLinea(event, linea)}
                    >
                      <td>{presupuesto?.numero ?? '-'}</td>
                      <td>
                        <TreatmentBadge tratamiento={linea.tratamiento} />
                      </td>
                      <td>
                        <strong>{linea.tratamiento?.nombre ?? 'Tratamiento'}</strong>
                      </td>
                      <td>{linea.pieza_dental ?? ''}</td>
                      <td className="num">{money(linea.importe_neto)}</td>
                      <td>
                        {cita
                          ? `${formatDate(cita.fecha_hora)} ${cita.fecha_hora.slice(11, 16)}`
                          : 'Sin cita'}
                      </td>
                      <td>
                        <span className={`work-status-chip work-status-${statusClass(estado)}`}>
                          {estado}
                        </span>
                      </td>
                      <td className="trabajo-pendiente-acciones">
                        <button onClick={() => onDarCita(linea)}>Dar cita</button>
                        {onCrearPedidoLab && (
                          <button
                            type="button"
                            onClick={() => onCrearPedidoLab(linea)}
                            title="Crear pedido de laboratorio para este tratamiento"
                          >
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
          <details className="dc-pending-map">
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
