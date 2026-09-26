import type { FormEvent } from 'react';
import { useState } from 'react';

export function ComentarioModal({
  initialValue,
  revision,
  saving = false,
  onClose,
  onConfirm,
}: {
  initialValue?: string | null;
  revision?: number;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (texto: string, revision?: number) => void;
}) {
  const [texto, setTexto] = useState(initialValue ?? '');
  const [initialRevision] = useState(revision);

  function submit(event: FormEvent) {
    event.preventDefault();
    onConfirm(texto, initialRevision);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="patient-comment-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
        <header className="modal-titlebar">
          <strong>Comentario / nota del paciente</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </header>
        <p className="patient-comment-help">
          Se guarda en el campo de observaciones del paciente. Visible en la ficha.
        </p>
        <textarea
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          placeholder="Comentario, recordatorio o nota interna..."
          rows={6}
          autoFocus
        />
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </footer>
      </form>
    </div>
  );
}
