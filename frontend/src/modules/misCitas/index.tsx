import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPacienteCitas, getPacientes, updateCita } from '../../lib/api';

export default function MisCitasPage() {
  const queryClient = useQueryClient();
  const pacientesQuery = useQuery({ queryKey: ['pacientes'], queryFn: getPacientes });
  const [pacienteId, setPacienteId] = useState('');

  const activePacienteId = pacienteId || pacientesQuery.data?.[0]?.id || '';
  const citasQuery = useQuery({
    queryKey: ['mis-citas', activePacienteId],
    queryFn: () => getPacienteCitas(activePacienteId),
    enabled: Boolean(activePacienteId),
  });

  const cancelar = useMutation({
    mutationFn: (citaId: string) => updateCita(citaId, { estado: 'anulada', motivo_cancelacion: 'Cancelada desde portal paciente' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['mis-citas', activePacienteId] }),
  });

  const paciente = useMemo(
    () => pacientesQuery.data?.find((item) => item.id === activePacienteId),
    [activePacienteId, pacientesQuery.data],
  );

  return (
    <section className="page mobile-portal">
      <div className="mobile-portal-head">
        <p className="eyebrow">Portal paciente</p>
        <h1>Mis citas</h1>
        <select value={activePacienteId} onChange={(event) => setPacienteId(event.target.value)}>
          {(pacientesQuery.data ?? []).map((pacienteItem) => (
            <option key={pacienteItem.id} value={pacienteItem.id}>
              {pacienteItem.nombre} {pacienteItem.apellidos}
            </option>
          ))}
        </select>
      </div>

      <div className="mobile-patient-strip">
        <strong>{paciente ? `${paciente.nombre} ${paciente.apellidos}` : 'Paciente'}</strong>
        <span>{paciente?.telefono || paciente?.email || 'Sin contacto registrado'}</span>
      </div>

      <div className="mobile-cita-list">
        {(citasQuery.data ?? []).map((cita) => (
          <article key={cita.id} className={`mobile-cita-card status-${cita.estado}`}>
            <div>
              <strong>{new Date(cita.fecha_hora).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long' })}</strong>
              <span>{new Date(cita.fecha_hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · {cita.duracion_min} min</span>
            </div>
            <p>{cita.motivo || 'Cita dental'}</p>
            <span className="mobile-cita-state">{cita.estado}</span>
            <div className="mobile-cita-actions">
              <button onClick={() => cancelar.mutate(cita.id)} disabled={cancelar.isPending || ['anulada', 'cancelada'].includes(cita.estado)}>
                Cancelar
              </button>
              <button onClick={() => window.location.href = `tel:${paciente?.telefono ?? ''}`} disabled={!paciente?.telefono}>
                Posponer
              </button>
            </div>
          </article>
        ))}
        {!citasQuery.isLoading && (citasQuery.data ?? []).length === 0 && (
          <p className="empty-state">No hay citas próximas.</p>
        )}
      </div>
    </section>
  );
}
