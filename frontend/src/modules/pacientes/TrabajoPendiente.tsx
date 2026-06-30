import type { CSSProperties, MouseEvent } from 'react';
import type { ApiPaciente, Cita, HistorialClinico, Presupuesto, PresupuestoLinea, UserRole } from '../../types/api';
import { colorForTreatment, formatDate, money, normalizeText } from '../../lib/utils';
import { TreatmentBadge } from '../../components/TreatmentBadge';
import { PatientOdontogramFlow } from '../odontogram';

function findCitaForTreatment(citas: Cita[], linea: PresupuestoLinea) {
  const target = normalizeText(linea.tratamiento?.nombre);
  if (!target) return null;
  return citas.find((cita) => {
    const estado = normalizeText(cita.estado);
    const motivo = normalizeText(cita.motivo);
    if (estado.includes('anulada') || estado.includes('falta') || estado.includes('cancel')) return false;
    return Boolean(motivo) && (motivo.includes(target) || target.includes(motivo));
  }) ?? null;
}

export function TrabajoPendientePanel({
  presupuestos,
  citas,
  historial = [],
  paciente,
  onDarCita,
  onContextLinea,
  onCrearPedidoLab,
  userRole,
}: {
  presupuestos: Presupuesto[];
  citas: Cita[];
  historial?: HistorialClinico[];
  paciente?: ApiPaciente | null;
  onDarCita: (linea: PresupuestoLinea) => void;
  onContextLinea: (event: MouseEvent, linea: PresupuestoLinea) => void;
  onCrearPedidoLab?: (linea: PresupuestoLinea) => void;
  userRole?: UserRole | null;
}) {
  const rows = presupuestos.flatMap((presupuesto) => (
    presupuesto.lineas
      .filter((linea) => (
        !historial.some((entrada) => entrada.presupuesto_linea_id === linea.id && ['realizado', 'facturado', 'cobrado_parcial', 'cobrado_completo'].includes(entrada.estado))
        && (linea.aceptado || linea.pasado_trabajo_pendiente || presupuesto.estado === 'aceptado')
      ))
      .map((linea) => ({ presupuesto, linea, cita: findCitaForTreatment(citas, linea) }))
  ));
  const statusClass = (value: string) => normalizeText(value).replace(/\s+/g, '-');

  return (
    <section className="desk-panel">
      <div className="panel-caption">
        <strong>Tratamientos pendientes</strong>
        <span>Solo trabajos aceptados o pasados a pendiente; muestra si ya tienen cita.</span>
      </div>
      <table className="dentcore-table">
        <thead><tr><th>Presupuesto</th><th>Tipo</th><th>Tratamiento</th><th>Pieza</th><th>Importe</th><th>Cita</th><th>Estado</th><th>Accion</th></tr></thead>
        <tbody>
          {rows.map(({ presupuesto, linea, cita }) => (
            (() => {
              const estado = cita ? cita.estado : (linea.pasado_trabajo_pendiente ? 'Pendiente' : linea.aceptado ? 'Aceptado' : 'Pendiente');
              return (
            <tr
              key={linea.id}
              className="treatment-coded-row"
              style={{ '--treatment-color': colorForTreatment(linea.tratamiento) } as CSSProperties}
              onContextMenu={(event) => onContextLinea(event, linea)}
            >
              <td>{presupuesto.numero}</td>
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
            })()
          ))}
          {!rows.length && <tr><td colSpan={8}>Sin tratamientos pendientes aceptados.</td></tr>}
        </tbody>
      </table>
      <details className="odontogram-support-panel" open>
        <summary>Mapa de pendientes por pieza</summary>
        <PatientOdontogramFlow
          paciente={paciente ?? null}
          mode="pending"
          title="Pendientes por pieza"
          subtitle="Mapa clinico compartido para ubicar trabajos aceptados y pendientes."
          readOnly
          enableQuickTreatments={false}
          userRole={userRole}
        />
      </details>
    </section>
  );
}
