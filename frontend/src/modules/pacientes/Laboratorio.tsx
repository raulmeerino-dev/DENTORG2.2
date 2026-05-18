import { useState } from 'react';
import type { FormEvent } from 'react';
import type {
  ApiPaciente,
  Doctor,
  Laboratorio,
  PresupuestoLinea,
  TrabajoLaboratorio,
  TrabajoLaboratorioCreateInput,
  TrabajoLaboratorioUpdateInput,
} from '../../types/api';
import { formatDate, fullName, money } from '../../lib/utils';

const ESTADO_BADGE: Record<string, string> = {
  pendiente: 'estado-pendiente',
  pendiente_enviar: 'estado-pendiente',
  enviado: 'estado-enviado',
  en_proceso: 'estado-proceso',
  en_fabricacion: 'estado-proceso',
  recibido: 'estado-recibido',
  probado: 'estado-recibido',
  finalizado: 'estado-recibido',
  entregado: 'estado-entregado',
  repetir_corregir: 'estado-incidencia',
  incidencia: 'estado-incidencia',
  cancelado: 'estado-cancelado',
};

function isVencido(trabajo: TrabajoLaboratorio): boolean {
  if (!trabajo.fecha_entrega_prevista) return false;
  if (trabajo.fecha_recepcion) return false;
  if (['entregado', 'cancelado'].includes(trabajo.estado)) return false;
  return trabajo.fecha_entrega_prevista < new Date().toISOString().slice(0, 10);
}

export function contarLaboratorioVencidos(trabajos: TrabajoLaboratorio[]): number {
  return trabajos.filter(isVencido).length;
}

export function LaboratorioPacientePanel({
  trabajos,
  onCrearPedido,
  onActualizar,
}: {
  trabajos: TrabajoLaboratorio[];
  onCrearPedido?: () => void;
  onActualizar?: (trabajoId: string, cambios: TrabajoLaboratorioUpdateInput) => void;
}) {
  return (
    <section className="desk-panel laboratorio-panel">
      <div className="panel-caption">
        <strong>Trabajos de laboratorio</strong>
        <span>Pedidos prot&eacute;sicos, estados, fechas y acciones operativas</span>
      </div>
      {onCrearPedido && (
        <div className="laboratorio-actions-top">
          <button type="button" className="primary-action" onClick={onCrearPedido}>+ Nuevo pedido</button>
        </div>
      )}
      <table className="euro-table laboratorio-table">
        <thead>
          <tr>
            <th>N&deg;</th>
            <th>Trabajo</th>
            <th>Lab.</th>
            <th>Pieza</th>
            <th>Estado</th>
            <th>Prevista</th>
            <th>Recepci&oacute;n</th>
            <th>Coste</th>
            <th>Flags</th>
            <th>Acci&oacute;n</th>
          </tr>
        </thead>
        <tbody>
          {trabajos.map((trabajo) => {
            const vencido = isVencido(trabajo);
            const badge = ESTADO_BADGE[trabajo.estado] ?? 'estado-pendiente';
            return (
              <tr key={trabajo.id} className={vencido ? 'trabajo-vencido' : ''}>
                <td>{trabajo.numero_orden ?? '-'}</td>
                <td>
                  <strong>{trabajo.descripcion}</strong>
                  {trabajo.tipo_trabajo && <em>{trabajo.tipo_trabajo}</em>}
                  {(trabajo.referencia_proveedor || trabajo.referencia) && (
                    <small>Ref. {trabajo.referencia_proveedor ?? trabajo.referencia}</small>
                  )}
                </td>
                <td>{trabajo.laboratorio?.nombre ?? ''}</td>
                <td>{trabajo.pieza_dental ?? ''}{trabajo.color ? ` · ${trabajo.color}` : ''}</td>
                <td>
                  <span className={`laboratorio-badge ${badge}`}>{trabajo.estado.replace(/_/g, ' ')}</span>
                  {vencido && <span className="laboratorio-vencido-chip">Vencido</span>}
                </td>
                <td>{formatDate(trabajo.fecha_entrega_prevista)}</td>
                <td>{formatDate(trabajo.fecha_recepcion)}</td>
                <td className="num">{money(trabajo.coste_laboratorio ?? trabajo.precio ?? 0)}</td>
                <td className="laboratorio-flags">
                  {trabajo.material_enviado && <span title="Material enviado al lab">ME</span>}
                  {trabajo.material_devuelto && <span title="Material devuelto">MD</span>}
                  {trabajo.colocado && <span title="Colocado al paciente">COL</span>}
                </td>
                <td>
                  {onActualizar && trabajo.estado !== 'entregado' && (
                    <div className="laboratorio-row-actions">
                      {!trabajo.fecha_recepcion && (
                        <button
                          type="button"
                          onClick={() => onActualizar(trabajo.id, {
                            estado: 'recibido',
                            fecha_recepcion: new Date().toISOString().slice(0, 10),
                            material_devuelto: true,
                          })}
                        >
                          Marcar recibido
                        </button>
                      )}
                      {!trabajo.colocado && trabajo.fecha_recepcion && (
                        <button
                          type="button"
                          onClick={() => onActualizar(trabajo.id, { colocado: true, estado: 'entregado', fecha_entrega_paciente: new Date().toISOString().slice(0, 10) })}
                        >
                          Marcar colocado
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
          {!trabajos.length && (
            <tr><td colSpan={10} className="laboratorio-empty">Sin trabajos de laboratorio asociados.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

interface PedidoFormState {
  doctor_id: string;
  laboratorio_id: string;
  descripcion: string;
  tipo_trabajo: string;
  pieza_dental: string;
  color: string;
  observaciones: string;
  fecha_entrega_prevista: string;
  referencia_interna: string;
  material_enviado: boolean;
}

function emptyForm(defaultDoctorId: string): PedidoFormState {
  return {
    doctor_id: defaultDoctorId,
    laboratorio_id: '',
    descripcion: '',
    tipo_trabajo: '',
    pieza_dental: '',
    color: '',
    observaciones: '',
    fecha_entrega_prevista: '',
    referencia_interna: '',
    material_enviado: false,
  };
}

export function NuevoPedidoLaboratorioModal({
  paciente,
  doctores,
  laboratorios,
  presupuestoLinea,
  saving = false,
  errorMessage,
  onClose,
  onSubmit,
}: {
  paciente: ApiPaciente;
  doctores: Doctor[];
  laboratorios: Laboratorio[];
  presupuestoLinea?: PresupuestoLinea | null;
  saving?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (data: TrabajoLaboratorioCreateInput) => void;
}) {
  const defaultDoctor = paciente.doctor_habitual_id ?? doctores[0]?.id ?? '';
  const [form, setForm] = useState<PedidoFormState>(() => {
    const base = emptyForm(defaultDoctor);
    if (presupuestoLinea) {
      base.descripcion = presupuestoLinea.tratamiento?.nombre ?? '';
      base.tipo_trabajo = presupuestoLinea.tratamiento?.nombre ?? '';
      if (presupuestoLinea.pieza_dental) base.pieza_dental = String(presupuestoLinea.pieza_dental);
    }
    return base;
  });

  function setField<K extends keyof PedidoFormState>(field: K, value: PedidoFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.descripcion.trim() || !form.doctor_id || !form.laboratorio_id) return;
    const piezaParsed = form.pieza_dental ? Number(form.pieza_dental) : null;
    const payload: TrabajoLaboratorioCreateInput = {
      paciente_id: paciente.id,
      doctor_id: form.doctor_id,
      laboratorio_id: form.laboratorio_id,
      descripcion: form.descripcion.trim(),
      tipo_trabajo: form.tipo_trabajo.trim() || null,
      pieza_dental: piezaParsed && Number.isFinite(piezaParsed) ? piezaParsed : null,
      color: form.color.trim() || null,
      observaciones: form.observaciones.trim() || null,
      fecha_entrega_prevista: form.fecha_entrega_prevista || null,
      referencia_interna: form.referencia_interna.trim() || null,
      presupuesto_linea_id: presupuestoLinea?.id ?? null,
      presupuesto_id: presupuestoLinea?.presupuesto_id ?? null,
      tratamiento_id: presupuestoLinea?.tratamiento_id ?? null,
      material_enviado: form.material_enviado,
    };
    onSubmit(payload);
  }

  const canSubmit = Boolean(form.descripcion.trim() && form.doctor_id && form.laboratorio_id) && !saving;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="laboratorio-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal-titlebar">
          <strong>Nuevo pedido de laboratorio — {fullName(paciente)}</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </header>

        {presupuestoLinea && (
          <p className="laboratorio-context-hint">
            Vinculado al tratamiento del presupuesto: <strong>{presupuestoLinea.tratamiento?.nombre ?? 'Tratamiento'}</strong>
            {presupuestoLinea.pieza_dental ? ` · pieza ${presupuestoLinea.pieza_dental}` : ''}
          </p>
        )}

        <div className="laboratorio-grid">
          <label className="wide">Descripci&oacute;n *
            <input
              autoFocus
              value={form.descripcion}
              onChange={(event) => setField('descripcion', event.target.value)}
              required
              placeholder="Corona zirconio pieza 16"
            />
          </label>
          <label>Tipo de trabajo
            <input value={form.tipo_trabajo} onChange={(event) => setField('tipo_trabajo', event.target.value)} placeholder="Corona, prótesis..." />
          </label>
          <label>Pieza dental
            <input type="number" min="11" max="48" value={form.pieza_dental} onChange={(event) => setField('pieza_dental', event.target.value)} />
          </label>
          <label>Color
            <input value={form.color} onChange={(event) => setField('color', event.target.value)} placeholder="A2, B1..." />
          </label>
          <label>Laboratorio *
            <select
              value={form.laboratorio_id}
              onChange={(event) => setField('laboratorio_id', event.target.value)}
              required
            >
              <option value="">—</option>
              {laboratorios.map((lab) => (
                <option key={lab.id} value={lab.id}>{lab.nombre}</option>
              ))}
            </select>
          </label>
          <label>Doctor *
            <select
              value={form.doctor_id}
              onChange={(event) => setField('doctor_id', event.target.value)}
              required
            >
              <option value="">—</option>
              {doctores.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>{doctor.nombre}</option>
              ))}
            </select>
          </label>
          <label>Fecha entrega prevista
            <input type="date" value={form.fecha_entrega_prevista} onChange={(event) => setField('fecha_entrega_prevista', event.target.value)} />
          </label>
          <label>Referencia interna
            <input value={form.referencia_interna} onChange={(event) => setField('referencia_interna', event.target.value)} />
          </label>
          <label className="wide">Observaciones
            <textarea value={form.observaciones} onChange={(event) => setField('observaciones', event.target.value)} rows={2} />
          </label>
          <label className="wide checkbox-line">
            <input
              type="checkbox"
              checked={form.material_enviado}
              onChange={(event) => setField('material_enviado', event.target.checked)}
            />
            <span>Material enviado al laboratorio</span>
          </label>
        </div>

        {errorMessage && <div className="inline-alert" role="alert">{errorMessage}</div>}

        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={!canSubmit}>{saving ? 'Creando...' : 'Crear pedido'}</button>
        </footer>
      </form>
    </div>
  );
}
