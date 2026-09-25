import { lazy, Suspense, useDeferredValue, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, MoreHorizontal, UserPlus, Wallet, MessageCircle, CalendarPlus, FileText, Pill, FileSignature } from 'lucide-react';
import { getPacientes } from '../../../api/patients';
import { ActionGroup } from '../../../design-system/ActionGroup';
import { FloatingPopover } from '../../../design-system/FloatingPopover';
import { PatientFinder } from '../../patients/PatientFinder';
import { Dialog } from '../../../design-system/Dialog';
import type { JornadaTaskMode } from './JornadaPatientTask';
const JornadaPatientTask = lazy(() => import('./JornadaPatientTask').then(module => ({ default: module.JornadaPatientTask })));
import './jornada-actions.css';

export function JornadaActions({ onReminders, canManageBilling, replies, onNewAppointment, canPrescribe = false, canUseConsents = false }: { onReminders: () => void; canManageBilling: boolean; replies: number; canPrescribe?: boolean; canUseConsents?: boolean; onNewAppointment?: () => void }) {
  const navigate = useNavigate();
  const [taskMode, setTaskMode] = useState<JornadaTaskMode | null>(null);
  const [taskPatient, setTaskPatient] = useState<string | null>(null);
  const startTask = (mode: JornadaTaskMode) => { setQuery(''); setOffset(0); setTaskPatient(null); setTaskMode(mode); };
  const closeTask = () => { setTaskMode(null); setTaskPatient(null); };
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const search = useDeferredValue(query.trim());
  const patients = useQuery({ queryKey: ['pacientes', { q: search, limit: 20, offset }], queryFn: () => getPacientes({ q: search, limit: 20, offset }) });
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const go = (path: string) => { setOpen(false); navigate(path); };
  return <div className="jornada-patient-toolbar" role="region" aria-label="Acciones rápidas de recepción">
    <PatientFinder pacientes={patients.data ?? []} selectedId={null} query={query} onQueryChange={value => { setQuery(value); setOffset(0); }} loading={patients.isFetching} onSelect={patient => go(`/pacientes?paciente_id=${patient.id}`)} hasPreviousPage={offset > 0} hasNextPage={patients.data?.length === 20} onPreviousPage={() => setOffset(value => Math.max(0, value - 20))} onNextPage={() => setOffset(value => value + 20)} />
    <div className="patient-actions"><ActionGroup aria-label="Acciones de Jornada">
      <button type="button" title="Recordatorios" aria-label="Enviar recordatorios por WhatsApp" onClick={onReminders}><Bell size={14} aria-hidden="true" /><span>Recordatorios</span></button>
      <button type="button" onClick={() => startTask('circular')}><FileText size={14} aria-hidden="true" /><span>Justificantes / circulares</span></button>
      <button type="button" disabled={!canPrescribe} title={canPrescribe ? 'Crear receta para un paciente' : 'Requiere un profesional autorizado para prescribir'} onClick={() => startTask('receta')}><Pill size={14} aria-hidden="true" /><span>Recetas médicas</span></button>
      <button type="button" disabled={!canUseConsents} title={canUseConsents ? 'Preparar consentimiento' : 'Requiere acceso a documentación clínica'} onClick={() => startTask('consentimiento')}><FileSignature size={14} aria-hidden="true" /><span>Consentimientos</span></button>
      <button type="button" ref={anchor} className="patient-actions-more" title="Más acciones" aria-label="Más acciones" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={16} aria-hidden="true" /></button>
    </ActionGroup></div>
    {taskMode && !taskPatient && <Dialog label={`Elegir paciente · ${taskMode === 'circular' ? 'Justificantes / circulares' : taskMode === 'receta' ? 'Recetas médicas' : 'Consentimientos'}`} onClose={closeTask} className="jornada-task-patient-picker">
      <h2>Elegir paciente</h2><p>Busca el paciente para preparar {taskMode === 'circular' ? 'el documento' : taskMode === 'receta' ? 'la receta' : 'el consentimiento'}.</p>
      <PatientFinder pacientes={patients.data ?? []} selectedId={null} query={query} onQueryChange={value => { setQuery(value); setOffset(0); }} loading={patients.isFetching} onSelect={patient => setTaskPatient(patient.id)} hasPreviousPage={offset > 0} hasNextPage={patients.data?.length === 20} onPreviousPage={() => setOffset(value => Math.max(0, value - 20))} onNextPage={() => setOffset(value => value + 20)} />
      {patients.isError && <p role="alert">No se pudo buscar pacientes. <button onClick={() => void patients.refetch()}>Reintentar</button></p>}
      <button type="button" onClick={closeTask}>Cancelar</button>
    </Dialog>}
    {taskMode && taskPatient && <Suspense fallback={<p role="status">Abriendo formulario…</p>}><JornadaPatientTask mode={taskMode} patientId={taskPatient} onClose={closeTask} /></Suspense>}
    {patients.isError && <p role="alert">No se han podido buscar pacientes. <button type="button" onClick={() => void patients.refetch()}>Reintentar</button></p>}
    {open && <FloatingPopover anchorRef={anchor} onClose={() => setOpen(false)} className="patient-actions-menu" role="menu" aria-label="Más acciones de Jornada" width={240}>
      {onNewAppointment && <button type="button" role="menuitem" onClick={() => { setOpen(false); onNewAppointment(); }}><CalendarPlus size={14} /><span>Nueva cita</span></button>}
      <button type="button" role="menuitem" onClick={() => { sessionStorage.setItem('dentcore_patient_action', 'new'); go('/pacientes'); }}><UserPlus size={14} /><span>Nueva ficha</span></button>
      {canManageBilling && <button type="button" role="menuitem" onClick={() => go('/caja')}><Wallet size={14} /><span>Cobros</span></button>}
      <button type="button" role="menuitem" onClick={() => go('/whatsapp')}><MessageCircle size={14} /><span>Respuestas{replies > 0 ? ` (${replies})` : ''}</span></button>
    </FloatingPopover>}
  </div>;
}
