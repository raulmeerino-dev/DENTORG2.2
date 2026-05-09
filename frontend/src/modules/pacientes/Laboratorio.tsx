import type { TrabajoLaboratorio } from '../../types/api';
import { formatDate, money } from '../../lib/utils';

export function LaboratorioPacientePanel({ trabajos }: { trabajos: TrabajoLaboratorio[] }) {
  return (
    <section className="desk-panel">
      <div className="panel-caption"><strong>Trabajos de laboratorio</strong><span>Protesicos, fechas, costes y cobros vinculados al paciente</span></div>
      <table className="euro-table">
        <thead><tr><th>Referencia</th><th>Tipo</th><th>Laboratorio</th><th>Trabajo</th><th>Pieza</th><th>Estado</th><th>Entrega</th><th>Coste</th><th>Pte. lab</th><th>Pte. paciente</th></tr></thead>
        <tbody>
          {trabajos.map((trabajo) => (
            <tr key={trabajo.id}>
              <td>{trabajo.referencia ?? ''}</td><td>{trabajo.tipo_trabajo ?? ''}</td><td>{trabajo.laboratorio?.nombre ?? ''}</td>
              <td>{trabajo.descripcion}</td><td>{trabajo.pieza_dental ?? ''}</td><td>{trabajo.estado}</td><td>{formatDate(trabajo.fecha_entrega_prevista)}</td>
              <td className="num">{money(trabajo.coste_laboratorio ?? trabajo.precio ?? 0)}</td><td>{trabajo.estado_pago_laboratorio ?? ''}</td><td>{trabajo.estado_cobro_paciente ?? ''}</td>
            </tr>
          ))}
          {!trabajos.length && <tr><td colSpan={10}>Sin trabajos de laboratorio asociados.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
