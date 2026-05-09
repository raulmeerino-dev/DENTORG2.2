import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Factura, FormaPago } from '../../../types/api';
import { money } from '../../../lib/utils';

export function CobroModal({
  factura,
  formasPago,
  onClose,
  onConfirm,
}: {
  factura: Factura;
  formasPago: FormaPago[];
  onClose: () => void;
  onConfirm: (formaPagoId: string, importe: number) => void;
}) {
  const pendiente = Math.max(0, Number(factura.pendiente) || 0);
  const suggested = pendiente > 0 ? pendiente : Number(factura.total) || 0;
  const [importe, setImporte] = useState(String(suggested).replace('.', ','));
  const [formaPagoId, setFormaPagoId] = useState(formasPago[0]?.id ?? '');

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(importe.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return;
    onConfirm(formaPagoId, value);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="patient-edit-modal" onSubmit={submit}>
        <div className="modal-titlebar">
          <strong>Registrar cobro</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
        <div className="patient-edit-grid">
          <label className="wide">
            Factura
            <input readOnly value={`#${factura.numero} — Total: ${money(factura.total)} — Pendiente: ${money(factura.pendiente)}`} />
          </label>
          <label>
            Forma de pago
            <select value={formaPagoId} onChange={(e) => setFormaPagoId(e.target.value)} required>
              {formasPago.map((fp) => (
                <option key={fp.id} value={fp.id}>{fp.nombre}</option>
              ))}
            </select>
          </label>
          <label>
            Importe cobrado
            <input
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              required
              autoFocus
            />
          </label>
        </div>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit">Confirmar cobro</button>
        </footer>
      </form>
    </div>
  );
}
