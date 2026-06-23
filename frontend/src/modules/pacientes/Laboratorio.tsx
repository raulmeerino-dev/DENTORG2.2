import { useState } from 'react';
import type { FormEvent } from 'react';
import type {
  ApiPaciente,
  Doctor,
  Laboratorio,
  PresupuestoLinea,
  TrabajoLaboratorioCreateInput,
} from '../../types/api';
import { fullName } from '../../lib/utils';

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
          <strong>Nuevo pedido de laboratorio - {fullName(paciente)}</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </header>

        {presupuestoLinea && (
          <p className="laboratorio-context-hint">
            Vinculado al tratamiento del presupuesto: <strong>{presupuestoLinea.tratamiento?.nombre ?? 'Tratamiento'}</strong>
            {presupuestoLinea.pieza_dental ? ` - pieza ${presupuestoLinea.pieza_dental}` : ''}
          </p>
        )}

        <div className="laboratorio-grid">
          <label className="wide">Descripcion *
            <input
              autoFocus
              value={form.descripcion}
              onChange={(event) => setField('descripcion', event.target.value)}
              required
              placeholder="Corona zirconio pieza 16"
            />
          </label>
          <label>Tipo de trabajo
            <input value={form.tipo_trabajo} onChange={(event) => setField('tipo_trabajo', event.target.value)} placeholder="Corona, protesis..." />
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
              <option value="">-</option>
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
              <option value="">-</option>
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
