import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getCitas, resolverSalidaCita } from '../../../api/scheduling';
import { getApiErrorMessage } from '../../../api/errors';
import { invalidatePatientWorkspaceQueries } from '../../../shared/query/queryInvalidation';
import { useAuth } from '../../identity/session/AuthContext';
import { useJornada } from './JornadaContext';
import { Dialog, Field } from '../../../design-system';
import type { Cita } from '../../../api/types';

export default function CheckoutQueue() {
  const { user } = useAuth();
  const canManage = ['admin', 'recepcion'].includes(user?.rol ?? '');
  const jornada = useJornada();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Cita | null>(null);
  const [note, setNote] = useState('');
  const query = useQuery({ queryKey: ['citas', 'pendiente-salida'], queryFn: () => getCitas({ pendiente_salida: 'true' }), enabled: canManage, refetchInterval: 15_000 });
  const citas = (query.data ?? []).filter(cita => cita.pendiente_salida && (!jornada?.doctorId || cita.doctor_id === jornada.doctorId) && (!jornada?.gabineteId || cita.gabinete_id === jornada.gabineteId));
  const resolve = useMutation({ mutationFn: () => resolverSalidaCita(selected!.id, note.trim() || undefined), onSuccess: cita => {
    invalidatePatientWorkspaceQueries(queryClient, cita.paciente_id); setSelected(null); setNote('');
  } });
  if (!canManage) return null;
  return <section className="jornada-checkout" aria-label="Pendiente de salida">
    <header><strong>Pendiente de salida</strong><span>{citas.length}</span></header>
    {query.isError && <p role="alert">No se pudo cargar la salida. <button onClick={() => void query.refetch()}>Reintentar</button></p>}
    {query.isLoading && <p role="status">Cargando salidas…</p>}
    {citas.map(cita => <article className="jornada-checkout-item" key={cita.id} data-cita-id={cita.id}>
      <strong>{cita.paciente?.nombre} {cita.paciente?.apellidos}</strong>
      <small>{cita.motivo || 'Visita finalizada'} · {cita.doctor?.nombre}</small>
      <div className="jornada-inline-actions"><Link to={`/pacientes?paciente_id=${cita.paciente_id}`}>Ficha y cuenta</Link><button type="button" onClick={() => { setSelected(cita); setNote(''); resolve.reset(); }}>Resolver salida</button></div>
    </article>)}
    {!query.isLoading && !query.isError && !citas.length && <small>Sin salidas pendientes.</small>}
    {selected && <Dialog label="Resolver salida" className="jornada-exit-dialog" onClose={() => setSelected(null)} closeDisabled={resolve.isPending}>
        <h2>Resolver salida</h2><p>{selected.paciente?.nombre} {selected.paciente?.apellidos}</p>
        <p>Confirma que has revisado la cuenta, la próxima cita y la documentación de salida. El saldo y las facturas conservan su estado.</p>
        <Field label="Observaciones de recepción"><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000} /></Field>
        {resolve.isError && <p role="alert">{getApiErrorMessage(resolve.error, 'No se pudo resolver la salida.')}</p>}
        <div className="jornada-inline-actions"><button type="button" disabled={resolve.isPending} onClick={() => setSelected(null)}>Volver</button><button type="button" disabled={resolve.isPending} onClick={() => resolve.mutate()}>{resolve.isPending ? 'Guardando…' : 'Confirmar salida revisada'}</button></div>
    </Dialog>}
  </section>;
}
