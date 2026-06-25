import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Mic, Save, Square, Trash2, X } from 'lucide-react';
import { saveClinicalDictationNote, transcribeClinicalDictation } from '../../lib/api';
import type { DictadoNotaGuardadaResponse } from '../../types/api';

const MAX_DURATION_SECONDS = 180;

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function preferredMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
}

export function ClinicalDictationButton({
  label = 'Dictar nota',
  disabled,
  onClick,
  compact,
}: {
  label?: string;
  disabled?: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={compact ? 'clinical-dictation-trigger compact' : 'clinical-dictation-trigger'}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      <Mic size={14} strokeWidth={2} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export function DictationRecorder({
  disabled,
  maxDurationSeconds = MAX_DURATION_SECONDS,
  onRecorded,
  onError,
}: {
  disabled?: boolean;
  maxDurationSeconds?: number;
  onRecorded: (blob: Blob, durationSeconds: number) => void;
  onError: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const intervalRef = useRef<number | null>(null);
  const stopTimeoutRef = useRef<number | null>(null);

  function clearTimers() {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    if (stopTimeoutRef.current) window.clearTimeout(stopTimeoutRef.current);
    intervalRef.current = null;
    stopTimeoutRef.current = null;
  }

  function cleanupStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => () => {
    clearTimers();
    cleanupStream();
  }, []);

  async function startRecording() {
    if (disabled || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('El navegador no permite grabar audio en este equipo.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        onError('No se pudo completar la grabacion.');
        setRecording(false);
        clearTimers();
        cleanupStream();
      };
      recorder.onstop = () => {
        const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        setRecording(false);
        clearTimers();
        cleanupStream();
        if (blob.size <= 0) {
          onError('La grabacion esta vacia.');
          return;
        }
        onRecorded(blob, durationSeconds);
      };

      recorder.start();
      setElapsed(0);
      setRecording(true);
      intervalRef.current = window.setInterval(() => {
        setElapsed(Math.min(maxDurationSeconds, Math.round((Date.now() - startedAtRef.current) / 1000)));
      }, 500);
      stopTimeoutRef.current = window.setTimeout(() => {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      }, maxDurationSeconds * 1000);
    } catch (error) {
      cleanupStream();
      const name = error instanceof DOMException ? error.name : '';
      onError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Permiso de microfono denegado.'
        : 'No se pudo acceder al microfono.');
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
      return;
    }
    setRecording(false);
    clearTimers();
    cleanupStream();
  }

  return (
    <section className={`dictation-recorder ${recording ? 'is-recording' : ''}`} aria-label="Grabadora de dictado clinico">
      <div className="dictation-recorder-status">
        <span aria-hidden="true" />
        <strong>{recording ? 'Grabando' : 'Listo para grabar'}</strong>
        <time>{formatSeconds(elapsed)}</time>
      </div>
      <div className="dictation-recorder-actions">
        {!recording ? (
          <button type="button" onClick={startRecording} disabled={disabled}>
            <Mic size={15} aria-hidden="true" /> Iniciar grabacion
          </button>
        ) : (
          <button type="button" className="danger" onClick={stopRecording}>
            <Square size={14} aria-hidden="true" /> Detener
          </button>
        )}
      </div>
      <small>Maximo {Math.round(maxDurationSeconds / 60)} minutos.</small>
    </section>
  );
}

export function DictationReviewPanel({
  value,
  saving,
  onChange,
  onSave,
  onDiscard,
}: {
  value: string;
  saving?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <section className="dictation-review-panel">
      <label>
        <span>Transcripcion revisada</span>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={10}
          autoFocus
        />
      </label>
      <footer className="modal-actions">
        <button type="button" onClick={onDiscard} disabled={saving}>
          <Trash2 size={14} aria-hidden="true" /> Descartar
        </button>
        <button type="button" onClick={onSave} disabled={saving || !value.trim()}>
          {saving ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
          {saving ? 'Guardando...' : 'Guardar como nota clinica'}
        </button>
      </footer>
    </section>
  );
}

export function ClinicalDictationModal({
  pacienteId,
  pacienteNombre,
  contexto,
  onClose,
  onSaved,
}: {
  pacienteId: string;
  pacienteNombre: string;
  contexto: 'ficha' | 'sesion' | 'historial';
  onClose: () => void;
  onSaved: (result: DictadoNotaGuardadaResponse) => void;
}) {
  const [dictadoId, setDictadoId] = useState<string | null>(null);
  const [transcription, setTranscription] = useState('');
  const [reviewReady, setReviewReady] = useState(false);
  const [busy, setBusy] = useState<'transcribing' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRecorded(blob: Blob, durationSeconds: number) {
    setError(null);
    setBusy('transcribing');
    try {
      const result = await transcribeClinicalDictation(pacienteId, blob, {
        durationSeconds,
        contexto,
      });
      setDictadoId(result.dictado_id);
      setTranscription(result.transcripcion);
      setReviewReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo transcribir la grabacion.');
    } finally {
      setBusy(null);
    }
  }

  async function saveNote() {
    const texto = transcription.trim();
    if (!texto) return;
    setError(null);
    setBusy('saving');
    try {
      const result = await saveClinicalDictationNote(pacienteId, {
        dictado_id: dictadoId,
        texto,
      });
      onSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la nota clinica.');
      setBusy(null);
    }
  }

  const transcribing = busy === 'transcribing';
  const saving = busy === 'saving';
  const canClose = !transcribing && !saving;

  return (
    <div className="modal-backdrop" onMouseDown={() => canClose && onClose()}>
      <section
        className="clinical-dictation-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Dictado clinico"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-titlebar">
          <div>
            <strong>{contexto === 'sesion' ? 'Dictar nota de sesion' : 'Dictar nota clinica'}</strong>
            <span>{pacienteNombre}</span>
          </div>
          <button type="button" onClick={onClose} disabled={!canClose} aria-label="Cerrar dictado clinico">
            <X size={15} aria-hidden="true" /> Cerrar
          </button>
        </header>

        <div className="dictation-flow">
          <DictationRecorder
            disabled={transcribing || saving}
            maxDurationSeconds={MAX_DURATION_SECONDS}
            onRecorded={handleRecorded}
            onError={setError}
          />
          {transcribing && (
            <div className="dictation-processing" role="status">
              <Loader2 size={18} className="spin" aria-hidden="true" />
              <strong>Transcribiendo...</strong>
            </div>
          )}
          {error && (
            <p className="dictation-error" role="alert">
              <AlertTriangle size={15} aria-hidden="true" /> {error}
            </p>
          )}
          {reviewReady && !transcribing && (
            <DictationReviewPanel
              value={transcription}
              saving={saving}
              onChange={setTranscription}
              onSave={() => void saveNote()}
              onDiscard={onClose}
            />
          )}
        </div>
      </section>
    </div>
  );
}
