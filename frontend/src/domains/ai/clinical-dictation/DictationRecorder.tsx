import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

export const MAX_DURATION_SECONDS = 180;
export function DictationRecorder({ disabled, maxDurationSeconds = MAX_DURATION_SECONDS, onRecorded, onError, onRecordingChange }: {
  disabled?: boolean; maxDurationSeconds?: number;
  onRecorded: (blob: Blob, duration: number) => void; onError: (message: string) => void;
  onRecordingChange?: (active: boolean) => void;
}) {
  const [state, setState] = useState<'idle' | 'requesting' | 'recording'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null);
  const interval = useRef<number | undefined>(undefined), timeout = useRef<number | undefined>(undefined);
  const alive = useRef(true), starting = useRef(false);
  function release() {
    window.clearInterval(interval.current); window.clearTimeout(timeout.current);
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (recorder.current) {
        recorder.current.onstop = null; recorder.current.ondataavailable = null; recorder.current.onerror = null;
        if (recorder.current.state === 'recording') recorder.current.stop();
      }
      release();
    };
  }, []);
  async function start() {
    if (disabled || state !== 'idle' || starting.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('Este navegador no permite grabar. Puedes subir un audio o escribir la nota.'); return;
    }
    starting.current = true; setState('requesting'); onRecordingChange?.(true);
    try {
      const captured = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { captured.getTracks().forEach(track => track.stop()); return; }
      stream.current = captured;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported?.(type));
      const current = new MediaRecorder(captured, mime ? { mimeType: mime } : undefined);
      recorder.current = current;
      const chunks: Blob[] = [], began = Date.now();
      current.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      current.onerror = () => {
        current.onstop = null; release(); setState('idle'); onRecordingChange?.(false);
        onError('No se pudo completar la grabación. El texto escrito se conserva.');
      };
      current.onstop = () => {
        release(); setState('idle'); onRecordingChange?.(false);
        const blob = new Blob(chunks, { type: current.mimeType || mime || 'audio/webm' });
        if (blob.size) onRecorded(blob, Math.min(maxDurationSeconds, Math.max(1, Math.round((Date.now() - began) / 1000))));
        else onError('La grabación está vacía.');
      };
      current.start(); setElapsed(0); setState('recording');
      interval.current = window.setInterval(() => setElapsed(Math.min(maxDurationSeconds, Math.round((Date.now() - began) / 1000))), 500);
      timeout.current = window.setTimeout(() => { if (current.state === 'recording') current.stop(); }, maxDurationSeconds * 1000);
    } catch (error) {
      release();
      if (alive.current) {
        setState('idle'); onRecordingChange?.(false);
        onError(error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name)
          ? 'Permiso de micrófono denegado. Puedes subir un audio o escribir la nota.' : 'No se pudo acceder al micrófono.');
      }
    } finally { starting.current = false; }
  }
  return <section className={`dictation-recorder ${state === 'recording' ? 'is-recording' : ''}`} aria-label="Grabadora de dictado clínico">
    <div className="dictation-recorder-status"><span aria-hidden="true" /><strong>{state === 'recording' ? 'Grabando' : state === 'requesting' ? 'Esperando permiso del micrófono…' : 'Grabar audio'}</strong><time>{Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}</time></div>
    <div className="dictation-recorder-actions">{state === 'recording'
      ? <button type="button" className="danger" onClick={() => recorder.current?.stop()}><Square size={14} /> Detener grabación</button>
      : <button type="button" onClick={() => void start()} disabled={disabled || state === 'requesting'}><Mic size={15} /> Iniciar grabación</button>}</div>
    <small>Máximo {Math.round(maxDurationSeconds / 60)} minutos. Sin escucha en segundo plano.</small>
  </section>;
}
