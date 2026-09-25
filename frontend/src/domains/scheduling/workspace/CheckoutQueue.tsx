import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getCheckoutQueue } from '../../../api/accounts';
import { money } from '../../../shared/format';
import { PatientCheckout } from '../../billing/checkout/PatientCheckout';
import { useAuth } from '../../identity/session/AuthContext';
import { useJornada } from './JornadaContext';

export default function CheckoutQueue() {
  const { user } = useAuth();
  const canManage = ['admin', 'recepcion'].includes(user?.rol ?? '');
  const jornada = useJornada();
  const [selected, setSelected] = useState<{ patientId: string; citaId: string | null; leavePending: boolean } | null>(null);
  const query = useQuery({ queryKey: ['checkout-queue'], queryFn: getCheckoutQueue, enabled: canManage, refetchInterval: 15_000 });
  const accounts = (query.data ?? []).filter(account => (!jornada?.doctorId || account.doctor_id === jornada.doctorId) && (!jornada?.gabineteId || account.gabinete_id === jornada.gabineteId));
  if (!canManage) return null;
  return <section className="jornada-checkout" aria-label="Pendiente de salida">
    <header><strong>Pendiente de salida</strong><span>{accounts.length}</span></header>
    {query.isError && <p role="alert">No se pudo cargar la salida. <button onClick={() => void query.refetch()}>Reintentar</button></p>}
    {query.isLoading && <p role="status">Cargando salidas…</p>}
    {accounts.map(account => <article className="jornada-checkout-item" key={account.cita_id} data-cita-id={account.cita_id}>
      <strong>{account.paciente_nombre}</strong>
      <small>{account.cargos.filter(c => c.cita_id === account.cita_id).map(c => `${c.concepto}${c.pieza_dental ? ` · ${c.pieza_dental}` : ''} · ${c.importe === null ? 'Sin valorar' : money(c.importe)}`).join(' / ') || 'Visita finalizada sin tratamientos con cargo'}</small>
      <small>Hoy {money(account.realizado_hoy)} · Anterior {money(account.saldo_anterior)}{Number(account.saldo_favor) > 0 ? ` · A favor ${money(account.saldo_favor)}` : ''}</small>
      <strong>Pendiente {money(Math.max(0, Number(account.saldo)))}</strong>
      {!!account.sin_valorar && <small role="status">{account.sin_valorar} cargos por valorar</small>}
      <div className="jornada-inline-actions">
        <button type="button" className="primary-action" onClick={() => setSelected({ patientId: account.paciente_id, citaId: account.cita_id, leavePending: false })}>Cobrar</button>
        <button type="button" onClick={() => setSelected({ patientId: account.paciente_id, citaId: account.cita_id, leavePending: true })}>Dejar pendiente</button>
        <Link to={`/pacientes?paciente_id=${account.paciente_id}`}>Ficha</Link>
      </div>
    </article>)}
    {!query.isLoading && !query.isError && !accounts.length && <small>Sin salidas pendientes.</small>}
    {selected && <PatientCheckout {...selected} onClose={() => setSelected(null)} />}
  </section>;
}
