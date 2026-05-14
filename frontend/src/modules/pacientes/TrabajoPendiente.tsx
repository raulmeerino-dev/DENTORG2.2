import type { CSSProperties, MouseEvent } from 'react';
import type { ApiPaciente, Cita, Presupuesto, PresupuestoLinea } from '../../types/api';
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
  paciente,
  onDarCita,
  onContextLinea,
}: {
  presupuestos: Presupuesto[];
  citas: Cita[];
  paciente?: ApiPaciente | null;
  onDarCita: (linea: PresupuestoLinea) => void;
  onContextLinea: (event: MouseEvent, linea: PresupuestoLinea) => void;
}) {
  const rows = presupuestos.flatMap((presupuesto) => (
    presupuesto.lineas
      .filter((linea) => linea.aceptado || linea.pasado_trabajo_pendiente || presupuesto.estado === 'aceptado')
      .map((linea) => ({ presupuesto, linea, cita: findCitaForTreatment(citas, linea) }))
  ));

  return (
    <section className="desk-panel">
      <div className="panel-caption">
        <strong>Tratamientos pendientes</strong>
        <span>Solo trabajos aceptados o pasados a pendiente; muestra si ya tienen cita.</span>
      </div>
      <table className="euro-table">
        <thead><tr><th>Presupuesto</th><th>Tipo</th><th>Tratamiento</th><th>Pieza</th><th>Importe</th><th>Cita</th><th>Estado</th><th>Accion</th></tr></thead>
        <tbody>
          {rows.map(({ presupuesto, linea, cita }) => (
            <tr
              key={linea.id}
              className="treatment-coded-row"
              style={{ '--treatment-color': colorForTreatment(linea.tratamiento) } as CSSProperties}
              onContextMenu={(event) => onContextLinea(event, linea)}
            >
              <td>{presupuesto.numero}</td>
              <td><TreatmentBadge tratamiento={linea.tratamiento} /></td>
              <td>{linea.tratamiento?.nombre ?? 'Tratamiento'}</td>
              <td>{linea.pieza_dental ?? ''}</td>
              <td className="num">{money(linea.importe_neto)}</td>
              <td>{cita ? `${formatDate(cita.fecha_hora)} ${cita.fecha_hora.slice(11, 16)}` : 'Sin cita'}</td>
              <td>{cita ? cita.estado : (linea.aceptado ? 'Aceptado' : 'Pendiente')}</td>
              <td><button onClick={() => onDarCita(linea)}>Dar cita</button></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={8}>Sin tratamientos pendientes aceptados.</td></tr>}
        </tbody>
      </table>
      <PatientOdontogramFlow
        paciente={paciente ?? null}
        mode="pending"
        title="Pendientes por pieza"
        subtitle="Mapa clinico compartido para ubicar trabajos aceptados y pendientes."
        readOnly
        enableQuickTreatments={false}
      />
    </section>
  );
}
