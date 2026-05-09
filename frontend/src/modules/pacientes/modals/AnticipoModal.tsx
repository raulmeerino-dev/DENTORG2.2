import { useState } from 'react';
import type { FormEvent } from 'react';
import type { FormaPago, PagoAnticipadoPaciente } from '../../../types/api';

export type AnticipoModalMode =
  | { kind: 'crear' }
  | { kind: 'editar'; pago: PagoAnticipadoPaciente };

export function AnticipoModal({
  pacienteNombre,
  formasPago,
  mode,
  onClose,
  onConfirm,
}: {
  pacienteNombre: string;
  formasPago: FormaPago[];
  mode: AnticipoModalMode;
  onClose: () => void;
  onConfirm: (data: { importe: number; concepto: string; notas: string | null; formaPagoId: string }) => void;
}) {
  const editando = mode.kind === 'editar';
  const pagoBase = editando ? mode.pago : null;

  const [importe, setImporte] = useState(
    pagoBase ? String(pagoBase.importe).replace('.', ',') : '',
  );
  const [concepto, setConcepto] = useState(pagoBase?.concepto ?? 'Pago anticipado');
  const [notas, setNotas] = useState(pagoBase?.notas ?? '');
  const [formaPagoId, setFormaPagoId] = useState(pagoBase?.forma_pago_id ?? formasPago[0]?.id ?? '');

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(importe.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return;
    onConfirm({
      importe: value,
      concepto: concepto.trim() || 'Pago anticipado',
      notas: notas.trim() || null,
      formaPagoId,
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="patient-edit-modal" onSubmit={submit}>
        <div className="modal-titlebar">
          <strong>{editando ? 'Editar anticipo' : 'Nuevo anticipo'}</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
        <div className="patient-edit-grid">
          <label className="wide">
            Paciente
            <input readOnly value={pacienteNombre} />
          </label>
          <label>
            Importe
            <input
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              required
              autoFocus
              placeholder="0,00"
            />
          </label>
          <label>
            Forma de pago
            <select value={formaPagoId} onChange={(e) => setFormaPagoId(e.target.value)} required>
              {formasPago.map((fp) => (
                <option key={fp.id} value={fp.id}>{fp.nombre}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            Concepto
            <input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              required
            />
          </label>
          <label className="wide">
            Notas (opcional)
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </label>
        </div>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit">{editando ? 'Guardar cambios' : 'Registrar anticipo'}</button>
        </footer>
      </form>
    </div>
  );
}
