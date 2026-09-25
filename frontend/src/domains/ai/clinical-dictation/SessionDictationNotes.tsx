import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { editClinicalDictationNote } from '../../../api/ai';
import type { NotaDental } from '../../../api/types';
import { Dialog } from '../../../design-system/Dialog';
import { invalidatePatientWorkspaceQueries } from '../../../shared/query/queryInvalidation';
import { clinicDate } from '../../../shared/time/clinicTime';
import { dictationError } from './dictationError';

function NoteEditor({ note, onClose }: { note: NotaDental; onClose: () => void }) {
  const queries = useQueryClient();
  const [text, setText] = useState(note.texto);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  function close() { if (text !== note.texto) setDiscard(true); else onClose(); }
  async function save() {
    if (busy || !text.trim()) return;
    setBusy(true); setError('');
    try {
      await editClinicalDictationNote(note.paciente_id, note.id, text.trim(), note.texto);
      invalidatePatientWorkspaceQueries(queries, note.paciente_id); onClose();
    } catch (err) { setError(dictationError(err, 'No se pudo guardar. Tu texto sigue disponible.')); }
    finally { setBusy(false); }
  }
  return <Dialog label="Editar nota de sesión" className="dc-dictation" onClose={close} closeDisabled={busy}>
    <header className="dc-dictation-header"><strong>Editar nota de sesión</strong></header>
    <div className="dc-dictation-body"><p className="dc-dictation-context">Los cambios conservan la transcripción original y el registro de revisiones.</p>
      <label className="dc-dictation-editor">Texto de la nota<textarea rows={10} value={text} maxLength={10000} disabled={busy} onChange={event => setText(event.target.value)} /></label>
      {error && <p role="alert" className="dc-dictation-error">{error}</p>}</div>
    <footer className="dc-dictation-footer">{discard ? <><span>Hay cambios sin guardar.</span><button type="button" className="btn btn-secondary" onClick={() => setDiscard(false)}>Seguir editando</button><button type="button" className="btn btn-danger" onClick={onClose}>Descartar cambios</button></> : <><button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>Cancelar</button><button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !text.trim() || text === note.texto}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></>}</footer>
  </Dialog>;
}

export function SessionDictationNotes({ notes, citaId, canEdit }: { notes: NotaDental[]; citaId?: string; canEdit: boolean }) {
  const [editing, setEditing] = useState<NotaDental | null>(null);
  const today = clinicDate(new Date());
  const current = notes.filter(note => ['dictado_clinico', 'asistente_confirmado'].includes(note.origen || '') &&
    (citaId ? note.cita_id === citaId || (!note.cita_id && note.fecha === today) : note.fecha === today));
  if (!current.length) return null;
  return <section className="dc-session-dictations" aria-label="Notas de sesión">
    <header><strong>{citaId ? 'Notas de sesión' : 'Notas de hoy'}</strong><span>{current.length}</span></header>
    {current.map(note => <details key={note.id}><summary>{note.texto.slice(0, 90)}{note.texto.length > 90 ? '…' : ''}</summary><p>{note.texto}</p><small>{note.doctor?.nombre || 'Nota clínica'} · {note.cita_id ? 'Vinculada a visita' : 'Sin cita asociada'}</small>{canEdit && note.origen === 'dictado_clinico' && <button type="button" className="btn btn-secondary" onClick={() => setEditing(note)}>Editar texto</button>}</details>)}
    {editing && <NoteEditor key={editing.id} note={editing} onClose={() => setEditing(null)} />}
  </section>;
}
