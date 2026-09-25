type Recognition = {
  lang: string; interimResults: boolean; maxAlternatives: number;
  start: () => void; abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
};
type RecognitionWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
export function voiceAvailable() {
  const host = window as RecognitionWindow;
  return Boolean(host.SpeechRecognition || host.webkitSpeechRecognition);
}
/** Voice only transcribes: no fake fallback, commands or mutations. */
export function captureVoiceInput(signal: AbortSignal): Promise<string> {
  const host = window as RecognitionWindow;
  const Constructor = host.SpeechRecognition || host.webkitSpeechRecognition;
  if (!Constructor) return Promise.reject(new Error('Este navegador no dispone de dictado. Puedes escribir la petición.'));
  return new Promise((resolve, reject) => {
    const recognition = new Constructor();
    let finished = false;
    const finish = (text?: string) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      recognition.abort();
      if (text?.trim()) resolve(text.trim());
      else reject(new Error('No se pudo transcribir. Comprueba el micrófono o escribe la petición.'));
    };
    const cancel = () => finish();
    const timer = window.setTimeout(cancel, 30_000);
    recognition.lang = 'es-ES'; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onresult = event => finish(event.results[0]?.[0]?.transcript);
    recognition.onerror = cancel; recognition.onend = cancel;
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    else { try { recognition.start(); } catch { cancel(); } }
  });
}
