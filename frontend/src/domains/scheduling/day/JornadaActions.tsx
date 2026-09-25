import { useDeferredValue, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, MoreHorizontal, UserPlus, Wallet, MessageCircle, CalendarPlus } from 'lucide-react';
import { getPacientes } from '../../../api/patients';
import { ActionGroup } from '../../../design-system/ActionGroup';
import { FloatingPopover } from '../../../design-system/FloatingPopover';
import { PatientFinder } from '../../patients/PatientFinder';
import './jornada-actions.css';

export function JornadaActions({ onReminders, canManageBilling, replies, onNewAppointment }: { onReminders: () => void; canManageBilling: boolean; replies: number; onNewAppointment?: () => void }) {
  const navigate = useNavigate();
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
      <button type="button" ref={anchor} className="patient-actions-more" title="Más acciones" aria-label="Más acciones" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={16} aria-hidden="true" /></button>
    </ActionGroup></div>
    {patients.isError && <p role="alert">No se han podido buscar pacientes. <button type="button" onClick={() => void patients.refetch()}>Reintentar</button></p>}
    {open && <FloatingPopover anchorRef={anchor} onClose={() => setOpen(false)} className="patient-actions-menu" role="menu" aria-label="Más acciones de Jornada" width={240}>
      {onNewAppointment && <button type="button" role="menuitem" onClick={() => { setOpen(false); onNewAppointment(); }}><CalendarPlus size={14} /><span>Nueva cita</span></button>}
      <button type="button" role="menuitem" onClick={() => { sessionStorage.setItem('dentcore_patient_action', 'new'); go('/pacientes'); }}><UserPlus size={14} /><span>Nueva ficha</span></button>
      {canManageBilling && <button type="button" role="menuitem" onClick={() => go('/caja')}><Wallet size={14} /><span>Cobros</span></button>}
      <button type="button" role="menuitem" onClick={() => go('/whatsapp')}><MessageCircle size={14} /><span>Respuestas{replies > 0 ? ` (${replies})` : ''}</span></button>
    </FloatingPopover>}
  </div>;
}
