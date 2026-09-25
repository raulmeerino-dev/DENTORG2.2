import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileAudio, Loader2, Mic, Save, X } from 'lucide-react';
import { saveClinicalDictationNote, transcribeClinicalDictation } from '../../../api/ai';
import type { DictadoNotaGuardadaResponse } from '../../../api/types';
import { Dialog } from '../../../design-system/Dialog';
import { DictationRecorder, MAX_DURATION_SECONDS } from './DictationRecorder';
import { dictationError } from './dictationError';
import './dictation.css';

export function ClinicalDictationButton({ label = 'Dictar nota', disabled, onClick, compact }: {
  label?: string; disabled?: boolean; onClick: () => void; compact?: boolean;
}) {
  return <button type="button" className={`clinical-dictation-trigger${compact ? ' compact' : ''}`} onClick={onClick} disabled={disabled} title={label}><Mic size={14} aria-hidden="true" /><span>{label}</span></button>;
}

export function ClinicalDictationModal({ pacienteId, pacienteNombre, contexto, citaId, onClose, onSaved }: {
  pacienteId: string; pacienteNombre: string; contexto: 'ficha' | 'sesion' | 'historial'; citaId?: string | null;
  onClose: () => void; onSaved: (result: DictadoNotaGuardadaResponse) => void;
}) {
  const [audio, setAudio] = useState<{ blob: Blob; duration?: number; name: string; url: string } | null>(null);
  const audioUrl = audio?.url ?? '';
  const [dictadoId, setDictadoId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<'transcribing' | 'saving' | null>(null);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const lock = useRef(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    return () => { if (audio) URL.revokeObjectURL(audio.url); };
  }, [audio]);
  function close() { if (text.trim() || audio) setDiscard(true); else onClose(); }
  function receive(blob: Blob, duration?: number, name = 'Grabación de sesión') {
    setError('');
    if (blob.size > 15 * 1024 * 1024) { setError('El audio supera el máximo de 15 MB.'); return; }
    if (!blob.size) { setError('El audio está vacío.'); return; }
    setAudio({ blob, duration, name, url: URL.createObjectURL(blob) }); setDictadoId(null);
  }
  async function transcribe() {
    if (!audio || lock.current) return;
    lock.current = true; setBusy('transcribing'); setError('');
    try {
      const result = await transcribeClinicalDictation(pacienteId, audio.blob, { durationSeconds: audio.duration, contexto });
      setDictadoId(result.dictado_id);
      setText(previous => [previous.trim(), result.transcripcion.trim()].filter(Boolean).join('\n\n'));
      window.requestAnimationFrame(() => editor.current?.focus());
    } catch (err) { setError(dictationError(err, 'No se pudo transcribir. El audio se conserva para reintentar o descargar.')); }
    finally { lock.current = false; setBusy(null); }
  }
  async function save() {
    if (!text.trim() || lock.current) return;
    lock.current = true; setBusy('saving'); setError('');
    try {
      const result = await saveClinicalDictationNote(pacienteId, { request_id: requestId, dictado_id: dictadoId, texto: text.trim(), cita_id: citaId ?? null });
      onSaved(result);
    } catch (err) { setError(dictationError(err, 'No se pudo guardar. El texto se conserva para reintentar.')); }
    finally { lock.current = false; setBusy(null); }
  }
  return <Dialog label="Dictado clínico" onClose={close} closeDisabled={Boolean(busy) || recording} className="dc-dictation">
    <header className="dc-dictation-header"><div><strong>{contexto === 'sesion' ? 'Dictado de sesión' : 'Dictado clínico'}</strong><span>{pacienteNombre}</span></div><button type="button" className="btn-icon" aria-label="Cerrar dictado clínico" onClick={close} disabled={Boolean(busy) || recording}><X size={18} /></button></header>
    <div className="dc-dictation-body">
      <p className="dc-dictation-context">{contexto === 'sesion' ? citaId ? 'El texto quedará vinculado a la visita actual.' : 'Se guardará en las notas de la sesión de hoy, sin cita asociada.' : 'Se guardará como nota clínica del paciente.'} Revisa el texto antes de guardarlo.</p>
      {!audio && <><DictationRecorder disabled={Boolean(busy)} onRecorded={(blob, duration) => receive(blob, duration)} onError={setError} onRecordingChange={setRecording} maxDurationSeconds={MAX_DURATION_SECONDS} />
        <input ref={fileInput} type="file" accept="audio/webm,audio/wav,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/m4a,.webm,.wav,.mp3,.m4a" aria-label="Archivo de audio" hidden onChange={event => { const file = event.target.files?.[0]; if (file) receive(file, undefined, file.name); event.target.value = ''; }} />
        <button type="button" className="btn btn-secondary dc-dictation-upload" disabled={recording || Boolean(busy)} onClick={() => fileInput.current?.click()}><FileAudio size={15} /> Subir audio</button></>}
      {audio && <section className="dc-dictation-audio" aria-label="Audio para transcribir"><strong>{audio.name}</strong><audio controls src={audioUrl} aria-label="Escuchar grabación" preload="metadata" />
        <div><button type="button" className="btn btn-primary" onClick={() => void transcribe()} disabled={Boolean(busy) || Boolean(dictadoId)}>{busy === 'transcribing' ? <Loader2 size={15} className="spin" /> : <FileAudio size={15} />}{busy === 'transcribing' ? 'Transcribiendo…' : dictadoId ? 'Audio transcrito' : 'Transcribir audio'}</button>
          {!dictadoId && <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => setAudio(null)}>Cambiar audio</button>}
          <a href={audioUrl} download={audio.blob instanceof File ? audio.blob.name : `dictado.${audio.blob.type.includes('mp4') ? 'm4a' : 'webm'}`}>Descargar audio</a></div></section>}
      {busy === 'transcribing' && <p role="status">Convirtiendo el audio en texto editable…</p>}
      {error && <p role="alert" className="dc-dictation-error"><AlertTriangle size={15} />{error}</p>}
      <label className="dc-dictation-editor">Texto editable<textarea ref={editor} rows={8} maxLength={10000} value={text} disabled={Boolean(busy) || recording} onChange={event => setText(event.target.value)} placeholder="La transcripción aparecerá aquí. También puedes escribir la nota directamente." /></label>
      <small>{text.length.toLocaleString('es-ES')} / 10.000 caracteres · El audio no se archiva en la ficha.</small>
    </div>
    <footer className="dc-dictation-footer">{discard ? <><span>Hay contenido sin guardar.</span><button type="button" className="btn btn-secondary" onClick={() => setDiscard(false)}>Seguir editando</button><button type="button" className="btn btn-danger" onClick={onClose}>Descartar y cerrar</button></> : <><button type="button" className="btn btn-secondary" onClick={close} disabled={Boolean(busy) || recording}>Cancelar</button><button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!text.trim() || Boolean(busy) || recording}><Save size={15} />{busy === 'saving' ? 'Guardando…' : contexto === 'sesion' ? 'Guardar en sesión' : 'Guardar nota clínica'}</button></>}</footer>
  </Dialog>;
}
