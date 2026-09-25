import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, Mic, Sparkles, X } from 'lucide-react';
import { askCopilot, confirmCopilot, type CopilotRequest, type CopilotResult } from '../../../api/copilot';
import { Dialog } from '../../../design-system/Dialog';
import { useAuth } from '../../identity/session/AuthContext';
import { copilotContext } from './copilotContext';
import { captureVoiceInput, voiceAvailable } from './voiceInputService';
import './copilot.css';

type Entry = { id: string; role: 'user' | 'assistant'; result: CopilotResult };
export default function AssistantFloatingButton() {
  const { user } = useAuth();
  const location = useLocation();
  const context = copilotContext(location.pathname, location.search);
  return user && user.rol !== 'paciente' ? <Copilot key={`${user.id}:${user.clinica_id}:${context.patient_id || ''}`} /> : null;
}
function Copilot() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<CopilotRequest | null>(null);
  const abort = useRef<AbortController | null>(null);
  const voiceAbort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const context = copilotContext(location.pathname, location.search);
  const clinical = ['admin', 'doctor', 'auxiliar'].includes(user?.rol || '');
  const suggestions = context.patient_id
    ? clinical ? ['Preparar próxima visita', 'Resumir historial', 'Buscar próxima cita'] : ['Consultar saldo', 'Buscar próxima cita']
    : ['jornada', 'agenda'].includes(context.module) ? ['¿Qué me queda hoy?', 'Buscar un hueco', 'Buscar paciente']
      : context.module === 'caja' ? ['Facturas pendientes', 'Pacientes con deuda superior a 500 €'] : ['Buscar paciente', 'Consultar registros'];
  useEffect(() => {
    const show = () => setOpen(true);
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.code === 'Space') { event.preventDefault(); setOpen(value => !value); }
    };
    window.addEventListener('dentcore:open-assistant', show); window.addEventListener('keydown', shortcut);
    return () => { window.removeEventListener('dentcore:open-assistant', show); window.removeEventListener('keydown', shortcut); abort.current?.abort(); voiceAbort.current?.abort(); };
  }, []);
  useEffect(() => { if (open) inputRef.current?.focus(); else voiceAbort.current?.abort(); }, [open]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [entries, busy]);
  function append(result: CopilotResult) {
    setEntries(previous => [...previous, { id: crypto.randomUUID(), role: 'assistant', result }]);
    if (result.navigation?.startsWith('/') && !result.navigation.startsWith('//')) { navigate(result.navigation); setOpen(false); }
  }
  async function send(text = input, previous?: CopilotRequest) {
    if (lock.current || !text.trim()) return;
    lock.current = true; setBusy(true); setError(''); setRetry(null);
    const request = previous || { session_id: sessionId, request_id: crypto.randomUUID(), text: text.trim(), context };
    if (!previous) {
      setEntries(items => [...items.map(item => ({ ...item, result: { ...item.result, proposal: null } })), { id: request.request_id, role: 'user', result: { message: request.text, sources: [] } }]); setInput('');
    }
    const controller = new AbortController(); abort.current = controller;
    try {
      const result = await askCopilot(request, controller.signal);
      append(result);
      if (result.unavailable) {
        setError('Puedes volver a intentarlo cuando el motor esté disponible.');
        setRetry({ ...request, request_id: crypto.randomUUID() });
      }
    }
    catch { if (!controller.signal.aborted) { setError('No se ha podido obtener respuesta. Puedes reintentar la misma petición.'); setRetry(request); } }
    finally { lock.current = false; setBusy(false); inputRef.current?.focus(); }
  }
  async function decide(entry: Entry, decision: 'confirm' | 'cancel') {
    const proposal = entry.result.proposal;
    if (!proposal || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await confirmCopilot(sessionId, proposal.id, decision);
      setEntries(items => items.map(item => item.id === entry.id ? { ...item, result: { ...item.result, proposal: null } } : item));
      append(result); if (result.saved) await queries.invalidateQueries();
    } catch { setError('No se pudo verificar el resultado. Reintenta la misma confirmación: no duplicará el cambio.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function dictate() {
    if (listening) { voiceAbort.current?.abort(); return; }
    const controller = new AbortController(); voiceAbort.current = controller;
    setListening(true); setError('');
    try { setInput(await captureVoiceInput(controller.signal)); inputRef.current?.focus(); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo transcribir.'); }
    finally { setListening(false); }
  }
  if (!open) return null;
  return <Dialog label="Asistente DentCore" onClose={() => setOpen(false)} className="dc-copilot">
    <header className="dc-copilot-header"><Sparkles size={17} /><strong>DentCore</strong><span>{context.patient_id ? 'Paciente activo' : context.module === 'otro' ? 'Asistente' : context.module}</span><kbd>Ctrl / ⌘ Espacio</kbd><button type="button" className="btn-icon" aria-label="Cerrar asistente" onClick={() => setOpen(false)}><X size={18} /></button></header>
    {entries.length > 0 && <div ref={logRef} className="dc-copilot-log" role="log" aria-label="Conversación">
      {entries.map(entry => <article key={entry.id} className={`dc-copilot-entry dc-copilot-entry--${entry.role}`}>
        <small>{entry.role === 'user' ? 'Tú' : 'DentCore'}</small><p>{entry.result.message}</p>
        {entry.result.sources.length > 0 && <nav aria-label="Fuentes"><ul>{entry.result.sources.map(source => <li key={source.path}><button type="button" className="dc-copilot-source" onClick={() => { if (source.path.startsWith('/') && !source.path.startsWith('//')) { navigate(source.path); setOpen(false); } }}>{source.label}</button></li>)}</ul></nav>}
        {entry.result.proposal && <div className="dc-copilot-proposal">
          {entry.result.proposal.steps.map((step, index) => <section key={index}><strong>{step.title}</strong><dl>{step.fields.map((field, i) => <div key={i}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></section>)}
          <footer><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void decide(entry, 'confirm')}>{entry.result.proposal.label}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void decide(entry, 'cancel')}>Cancelar</button></footer>
        </div>}
      </article>)}
    </div>}
    {busy && <p className="dc-copilot-status" role="status">Consultando y comprobando…</p>}
    {error && <div className="dc-copilot-error" role="alert">{error}{retry && <button type="button" className="btn btn-secondary" onClick={() => void send(retry.text, retry)} disabled={busy}>Reintentar</button>}</div>}
    {!entries.length && <div className="dc-copilot-suggestions">{suggestions.map(text => <button type="button" key={text} onClick={() => void send(text)}>{text}</button>)}</div>}
    <form className="dc-copilot-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      <textarea ref={inputRef} rows={2} maxLength={4000} aria-label="Petición a DentCore" placeholder="¿Qué necesitas hacer?" value={input} disabled={busy || listening} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
      {voiceAvailable() && <button type="button" className="btn-icon" aria-label={listening ? 'Detener dictado' : 'Dictar petición'} aria-pressed={listening} disabled={busy} title="Dictado del navegador · revisa el texto antes de enviarlo" onClick={() => void dictate()}><Mic size={18} /></button>}
      <button type="submit" className="btn btn-primary dc-copilot-send" aria-label="Enviar petición" disabled={busy || listening || !input.trim()}><ArrowUp size={18} /></button>
    </form>
    <footer className="dc-copilot-footer"><span>{listening ? 'Escuchando…' : 'Los cambios se revisan antes de guardar.'}</span>{entries.length > 0 && <button type="button" disabled={busy} onClick={() => { setEntries([]); setError(''); setRetry(null); setSessionId(crypto.randomUUID()); inputRef.current?.focus(); }}>Nueva conversación</button>}</footer>
  </Dialog>;
}
