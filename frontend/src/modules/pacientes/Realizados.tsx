import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { ApiPaciente, Consentimiento, HistorialClinico, Presupuesto, PresupuestoLinea, TratamientoCatalogo, UserRole } from '../../types/api';
import { colorForTreatment, formatDate, money, normalizeText } from '../../lib/utils';
import { TreatmentBadge } from '../../components/TreatmentBadge';
import { PatientOdontogramFlow } from '../odontogram';

const CATALOGO_TRATAMIENTOS = [
  'Abrasion para obturar',
  'Abrasiones moderadas',
  'Adh-duraphat-slgh',
  'Aditamento de teflon',
  'Ajuste de protesis',
  'Ajuste funcional de ferula, por sesion',
  'Amalgama',
  'Anulo',
  'Apertura de endo',
  'Aplicacion',
  'Ataches [unidad]',
  'Atencion odontologica',
  'Blanqueamiento externo',
  'Braket',
  'Brakets metalicos',
  'Carilla de zirconio',
  'Cementado',
  'Endodoncia unirradicular',
  'Limpieza, Profilaxis y Topicacion',
  'Perno de Cuazo',
];

const TOOL_LABELS: Record<string, string> = {
  X: 'Ausencia / exodoncia',
  I: 'Implante',
  C: 'Corona',
  E: 'Endodoncia',
  P: 'Protesis',
  R: 'Reconstruccion',
  F: 'Ferula',
  O: 'Obturacion',
  B: 'Blanqueamiento',
  A: 'Atache',
  T: 'Tratamiento',
  M: 'Movilidad / mantenimiento',
};

function hasFinishedState(value?: string | null) {
  const estado = normalizeText(value);
  return estado.includes('realizado') || estado.includes('facturado') || estado.includes('cobrado') || estado.includes('atendido') || estado.includes('finalizado');
}

function TreatmentHistoryTable({ lineas, presupuestos }: { lineas: PresupuestoLinea[]; presupuestos: Presupuesto[] }) {
  const rows = lineas.length ? lineas : [];
  const fechaByPresupuesto = new Map(presupuestos.map((p) => [p.id, p.fecha]));
  return (
    <table className="euro-table treatment-table">
      <thead>
        <tr><th>Fecha</th><th>Tipo</th><th>Tratamiento</th><th>Pieza</th><th>Cuad</th><th>Doctor</th><th>Gab.</th></tr>
      </thead>
      <tbody>
        {rows.map((linea, index) => (
          <tr
            key={linea.id}
            className={index === rows.length - 1 ? 'selected-row treatment-coded-row' : 'treatment-coded-row'}
            style={{ '--treatment-color': colorForTreatment(linea.tratamiento) } as CSSProperties}
          >
            <td>{formatDate(fechaByPresupuesto.get(linea.presupuesto_id) ?? null)}</td>
            <td><TreatmentBadge tratamiento={linea.tratamiento} /></td>
            <td>{linea.tratamiento?.nombre ?? 'Tratamiento dental'}</td>
            <td>{linea.pieza_dental ?? ''}</td>
            <td>{linea.caras ?? ''}</td>
            <td>002</td>
            <td>002</td>
          </tr>
        ))}
        {!rows.length && (
          <tr><td colSpan={7}>Sin tratamientos registrados en presupuesto.</td></tr>
        )}
      </tbody>
    </table>
  );
}

function TreatmentBoard({
  presupuestos,
  doctorName,
  doctorColor,
  tratamientos,
}: {
  presupuestos: Presupuesto[];
  doctorName: string;
  doctorColor?: string | null;
  tratamientos: TratamientoCatalogo[];
}) {
  const lineas = presupuestos.flatMap((presupuesto) => presupuesto.lineas);
  const [selectedTool, setSelectedTool] = useState('X');

  return (
    <div className="treatments-layout">
      <div className="treatments-main">
        <div className="compact-controls">
          <label>Doctor <input readOnly value={doctorName} style={{ borderLeft: `8px solid ${doctorColor ?? '#2a7de1'}` }} /></label>
          <label>Gab. <select value="BOX 2" onChange={() => undefined}><option>BOX 2</option></select></label>
        </div>
        <TreatmentHistoryTable lineas={lineas} presupuestos={presupuestos} />
        <div className="observation-strip">
          <label>Observaciones Tratamiento</label>
          <textarea readOnly value="" />
          <label><input type="checkbox" readOnly /> Hasta hoy</label>
          <label><input type="checkbox" readOnly /> Ver Ult. Ppto</label>
          <label><input type="checkbox" readOnly /> Ver T. Pte.</label>
        </div>
      </div>
      <aside className="treatment-side">
        <div className="photo-placeholder">Fotografia</div>
        <div className="tooth-tools" aria-label="Tipos de trabajo">
          {['X', 'I', 'C', 'E', 'P', 'R', 'F', 'O', 'B', 'A', 'T', 'M'].map((item) => (
            <button
              key={item}
              className={selectedTool === item ? 'active-tool' : ''}
              onClick={() => setSelectedTool(item)}
              title={TOOL_LABELS[item]}
              aria-label={`${item}: ${TOOL_LABELS[item]}`}
            >
              {item}
            </button>
          ))}
        </div>
        <p className="tool-legend">{selectedTool}: {TOOL_LABELS[selectedTool]}</p>
        <div className="catalog-panel">
          <strong>Tratamientos</strong>
          <ul>
            {(tratamientos.length ? tratamientos : CATALOGO_TRATAMIENTOS.map((nombre, index) => ({
              id: nombre,
              codigo: `T${index + 1}`,
              nombre,
              familia: null,
              familia_id: '',
              precio: '0',
              iva_porcentaje: '0',
              requiere_pieza: false,
              requiere_caras: false,
              activo: true,
            }))).map((item) => (
              <li key={item.id} style={{ '--treatment-color': colorForTreatment(item) } as CSSProperties}>
                <TreatmentBadge tratamiento={item} />
                <span>{item.nombre}</span>
                <small>{money(item.precio)}</small>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

export function TratamientosRealizadosPanel({
  historial,
  consentimientos,
  presupuestos,
  paciente,
  doctorName,
  doctorColor,
  tratamientos,
  userRole,
}: {
  historial: HistorialClinico[];
  consentimientos: Consentimiento[];
  presupuestos: Presupuesto[];
  paciente: ApiPaciente | null;
  doctorName: string;
  doctorColor?: string | null;
  tratamientos: TratamientoCatalogo[];
  userRole?: UserRole | null;
}) {
  const realizados = historial.filter((entrada) => hasFinishedState(entrada.estado));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = realizados.find((entrada) => entrada.id === selectedId) ?? realizados[0] ?? null;

  function consentimientoFor(entrada: HistorialClinico) {
    const tratamiento = normalizeText(entrada.tratamiento?.nombre);
    return consentimientos.find((item) => (
      (entrada.tratamiento_id && item.tratamiento_id === entrada.tratamiento_id)
      || (tratamiento && normalizeText(item.tipo).includes(tratamiento))
    ));
  }

  return (
    <div className="realizados-workspace">
      <section className="desk-panel">
        <div className="panel-caption">
          <strong>Tratamientos realizados</strong>
          <span>Trabajo terminado con fecha, precio, pieza y consentimiento cuando procede.</span>
        </div>
        <div className="realizados-main-grid">
          <div className="realizados-table-wrap">
            <table className="euro-table">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Tratamiento</th><th>Pieza</th><th>Doctor</th><th>Precio</th><th>Factura</th><th>Consentimiento</th></tr></thead>
              <tbody>
                {realizados.map((entrada) => {
                  const consentimiento = consentimientoFor(entrada);
                  return (
                    <tr
                      key={entrada.id}
                      className={`treatment-coded-row ${selected?.id === entrada.id ? 'selected-row' : ''}`}
                      style={{ '--treatment-color': colorForTreatment(entrada.tratamiento) } as CSSProperties}
                      onClick={() => setSelectedId(entrada.id)}
                    >
                      <td>{formatDate(entrada.fecha)}</td>
                      <td><TreatmentBadge tratamiento={entrada.tratamiento} /></td>
                      <td><strong>{entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental'}</strong></td>
                      <td>{entrada.pieza_dental ?? ''}</td>
                      <td>{entrada.doctor?.nombre ?? ''}</td>
                      <td className="num">{entrada.importe ? money(entrada.importe) : ''}</td>
                      <td>{entrada.factura_id ? 'Vinculada' : 'Pendiente'}</td>
                      <td>{consentimiento ? consentimiento.estado : 'No adjunto'}</td>
                    </tr>
                  );
                })}
                {!realizados.length && <tr><td colSpan={8}>Sin tratamientos realizados en historial.</td></tr>}
              </tbody>
            </table>
          </div>
          <aside className="realizado-detail-panel">
            <span>Detalle seleccionado</span>
            {selected ? (
              <>
                <strong>{selected.procedimiento || selected.tratamiento?.nombre || 'Tratamiento dental'}</strong>
                <dl>
                  <div><dt>Fecha</dt><dd>{formatDate(selected.fecha)}</dd></div>
                  <div><dt>Pieza</dt><dd>{selected.pieza_dental ?? 'No indicada'} {selected.caras ? `· ${selected.caras}` : ''}</dd></div>
                  <div><dt>Doctor</dt><dd>{selected.doctor?.nombre ?? 'Sin doctor'}</dd></div>
                  <div><dt>Importe</dt><dd>{selected.importe ? money(selected.importe) : 'Sin importe'}</dd></div>
                  <div><dt>Factura</dt><dd>{selected.factura_id ? 'Vinculada' : 'Pendiente'}</dd></div>
                  <div><dt>Consentimiento</dt><dd>{consentimientoFor(selected)?.estado ?? 'No adjunto'}</dd></div>
                </dl>
                <p>{selected.observaciones || selected.diagnostico || 'Sin observaciones clinicas asociadas.'}</p>
              </>
            ) : (
              <p>Seleccione un tratamiento para ver factura, consentimiento y notas asociadas.</p>
            )}
          </aside>
        </div>
      </section>
      <details className="secondary-clinic-panel">
        <summary>Vista clinica detallada y herramientas</summary>
        <TreatmentBoard
          presupuestos={presupuestos}
          doctorName={doctorName}
          doctorColor={doctorColor}
          tratamientos={tratamientos}
        />
      </details>
      <details className="odontogram-support-panel" open>
        <summary>Odontograma actual</summary>
        <PatientOdontogramFlow
          paciente={paciente}
          mode="completed"
          title="Odontograma actual"
          subtitle="Estado real de la boca tras tratamientos realizados."
          readOnly
          enableQuickTreatments={false}
          userRole={userRole}
        />
      </details>
    </div>
  );
}
