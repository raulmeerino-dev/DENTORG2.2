import { useState } from 'react';

export function FacturaManualModal({
  onClose,
  onConfirm,
  saving,
}: {
  onClose: () => void;
  onConfirm: (concepto: string, importe: number) => void;
  saving: boolean;
}) {
  const [concepto, setConcepto] = useState('Tratamiento dental');
  const [importeStr, setImporteStr] = useState('');
  const importe = Number(importeStr.replace(',', '.'));
  const valid = concepto.trim() && Number.isFinite(importe) && importe > 0;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="patient-edit-modal" style={{ maxWidth: 400 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-titlebar">
          <strong>Nueva factura manual</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
        <div className="patient-edit-grid" style={{ padding: '1rem', gap: '0.75rem', display: 'flex', flexDirection: 'column' }}>
          <label>
            Concepto
            <input
              autoFocus
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Descripción de la factura"
            />
          </label>
          <label>
            Importe sin IVA (€)
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={importeStr}
              onChange={(e) => setImporteStr(e.target.value)}
              placeholder="0.00"
            />
          </label>
        </div>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="primary-action"
            disabled={!valid || saving}
            onClick={() => onConfirm(concepto.trim(), importe)}
          >
            {saving ? 'Generando...' : 'Generar factura'}
          </button>
        </footer>
      </section>
    </div>
  );
}
