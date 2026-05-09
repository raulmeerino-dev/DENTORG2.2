import { useState } from 'react';
import type { Cita } from '../../../types/api';
import { formatDate } from '../../../lib/utils';

type TipoCancelacion = 'anulacion_paciente' | 'anulacion_clinica' | 'no_vino' | 'reprogramada' | 'otro';

const TIPOS: { value: TipoCancelacion; label: string }[] = [
  { value: 'anulacion_paciente', label: 'Cancelada por paciente' },
  { value: 'anulacion_clinica', label: 'Cancelada por clínica' },
  { value: 'reprogramada', label: 'Reprogramada' },
  { value: 'no_vino', label: 'No vino (falta)' },
  { value: 'otro', label: 'Otro motivo' },
];

export function CancelCitaModal({
  cita,
  estado,
  onClose,
  onConfirm,
}: {
  cita: Cita;
  estado: 'anulada' | 'falta';
  onClose: () => void;
  onConfirm: (motivo: string, tipo: TipoCancelacion) => void;
}) {
  const defaultTipo: TipoCancelacion = estado === 'falta' ? 'no_vino' : 'anulacion_paciente';
  const [motivo, setMotivo] = useState(estado === 'falta' ? 'No vino' : '');
  const [tipo, setTipo] = useState<TipoCancelacion>(defaultTipo);

  function handleConfirm() {
    if (!motivo.trim()) return;
    onConfirm(motivo.trim(), tipo);
  }

  const pacienteNombre = cita.paciente
    ? `${cita.paciente.apellidos ?? ''}, ${cita.paciente.nombre ?? ''}`.trim().replace(/^,\s*/, '')
    : 'Paciente';

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="patient-edit-modal" style={{ maxWidth: 480 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-titlebar">
          <strong>{estado === 'falta' ? 'Registrar falta' : 'Cancelar cita'}</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
        <div className="patient-edit-grid" style={{ padding: '1rem', gap: '0.75rem', display: 'flex', flexDirection: 'column' }}>
          <p style={{ margin: 0 }}>
            <strong>{pacienteNombre}</strong> — {formatDate(cita.fecha_hora)} {cita.fecha_hora.slice(11, 16)}
            {cita.motivo ? ` · ${cita.motivo}` : ''}
          </p>
          <label>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCancelacion)}>
              {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label>
            Motivo
            <input
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Describe el motivo..."
            />
          </label>
        </div>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary-action" disabled={!motivo.trim()} onClick={handleConfirm}>
            {estado === 'falta' ? 'Registrar falta' : 'Cancelar cita'}
          </button>
        </footer>
      </section>
    </div>
  );
}
