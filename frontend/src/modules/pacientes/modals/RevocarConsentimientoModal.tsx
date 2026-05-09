import { useState } from 'react';
import type { Consentimiento } from '../../../types/api';
import { formatDate } from '../../../lib/utils';

export function RevocarConsentimientoModal({
  consentimiento,
  onClose,
  onConfirm,
}: {
  consentimiento: Consentimiento;
  onClose: () => void;
  onConfirm: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="patient-edit-modal" style={{ maxWidth: 420 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-titlebar">
          <strong>Revocar consentimiento</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
        <div className="patient-edit-grid" style={{ padding: '1rem', gap: '0.75rem', display: 'flex', flexDirection: 'column' }}>
          <p style={{ margin: 0 }}>
            <strong>{consentimiento.tipo || 'Consentimiento'}</strong>
            {consentimiento.fecha_firma ? ` · Firmado ${formatDate(consentimiento.fecha_firma)}` : ''}
          </p>
          <label>
            Motivo de revocación
            <input
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Indique el motivo..."
            />
          </label>
        </div>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="primary-action"
            disabled={!motivo.trim()}
            onClick={() => onConfirm(motivo.trim())}
          >
            Revocar consentimiento
          </button>
        </footer>
      </section>
    </div>
  );
}
