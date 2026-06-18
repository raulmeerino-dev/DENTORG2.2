import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Consentimiento } from '../../types/api';
import { useAuth } from '../../auth/AuthContext';
import {
  cancelarPortalCita,
  confirmarPortalCita,
  firmarPortalConsentimiento,
  getPacientes,
  getPortalCitas,
  getPortalConsentimientos,
  getPortalDocumentos,
  getPortalMe,
  openConsentimientoPdf,
  openDocumentoPaciente,
  solicitarCambioPortalCita,
} from '../../lib/api';

type PortalTab = 'citas' | 'documentos' | 'consentimientos';

function formatFecha(value: string) {
  return new Date(value).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long' });
}

function formatHora(value: string) {
  return new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

const CITA_STATE_LABELS: Record<string, string> = {
  programada: 'Pendiente de confirmar',
  pending_confirmation: 'Pendiente de confirmar',
  reminder_sent: 'Recordatorio enviado',
  confirmada: 'Confirmada',
  confirmed: 'Confirmada',
  reschedule_requested: 'Cambio solicitado',
  pending_manual_review: 'En revisión',
  rescheduled: 'Reprogramada',
};

export default function MisCitasPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const [tab, setTab] = useState<PortalTab>('citas');
  const [pacienteId, setPacienteId] = useState(() => new URLSearchParams(window.location.search).get('paciente_id') ?? '');
  const [firmaPara, setFirmaPara] = useState<Consentimiento | null>(null);

  const pacientesQuery = useQuery({
    queryKey: ['pacientes'],
    queryFn: getPacientes,
    enabled: user?.rol !== 'paciente',
  });
  const activePacienteId = user?.rol === 'paciente' ? (user.paciente_id ?? '') : (pacienteId || pacientesQuery.data?.[0]?.id || '');
  const portalPacienteParam = user?.rol === 'paciente' ? undefined : activePacienteId;
  const portalMe = useQuery({
    queryKey: ['portal-me', activePacienteId],
    queryFn: () => getPortalMe(portalPacienteParam),
    enabled: user?.rol === 'paciente' || Boolean(activePacienteId),
  });
  const citasQuery = useQuery({
    queryKey: ['portal-citas', activePacienteId],
    queryFn: () => getPortalCitas(portalPacienteParam),
    enabled: user?.rol === 'paciente' || Boolean(activePacienteId),
  });
  const documentosQuery = useQuery({
    queryKey: ['portal-documentos', activePacienteId],
    queryFn: () => getPortalDocumentos(portalPacienteParam),
    enabled: user?.rol === 'paciente' || Boolean(activePacienteId),
  });
  const consentimientosQuery = useQuery({
    queryKey: ['portal-consentimientos', activePacienteId],
    queryFn: () => getPortalConsentimientos(portalPacienteParam),
    enabled: user?.rol === 'paciente' || Boolean(activePacienteId),
  });

  const paciente = useMemo(
    () => portalMe.data?.paciente ?? pacientesQuery.data?.find((item) => item.id === activePacienteId),
    [activePacienteId, pacientesQuery.data, portalMe.data],
  );

  const refreshPortal = () => {
    void queryClient.invalidateQueries({ queryKey: ['portal-me', activePacienteId] });
    void queryClient.invalidateQueries({ queryKey: ['portal-citas', activePacienteId] });
    void queryClient.invalidateQueries({ queryKey: ['portal-documentos', activePacienteId] });
    void queryClient.invalidateQueries({ queryKey: ['portal-consentimientos', activePacienteId] });
  };

  const confirmar = useMutation({
    mutationFn: (citaId: string) => confirmarPortalCita(citaId, portalPacienteParam),
    onSuccess: refreshPortal,
  });
  const cancelar = useMutation({
    mutationFn: (citaId: string) => cancelarPortalCita(citaId, portalPacienteParam, 'Cancelada desde portal paciente'),
    onSuccess: refreshPortal,
  });
  const solicitarCambio = useMutation({
    mutationFn: (citaId: string) => solicitarCambioPortalCita(
      citaId,
      portalPacienteParam,
      'Solicita cambiar la cita desde portal paciente',
    ),
    onSuccess: refreshPortal,
  });
  const firmar = useMutation({
    mutationFn: ({ consentimientoId, firma }: { consentimientoId: string; firma: string }) =>
      firmarPortalConsentimiento(consentimientoId, portalPacienteParam, firma),
    onSuccess: () => {
      setFirmaPara(null);
      refreshPortal();
    },
  });

  useEffect(() => {
    if (!firmaPara || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#123247';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
  }, [firmaPara]);

  const startFirma = (event: PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(event.clientX - rect.left, event.clientY - rect.top);
  };

  const moveFirma = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const rect = canvasRef.current.getBoundingClientRect();
    ctx.lineTo(event.clientX - rect.left, event.clientY - rect.top);
    ctx.stroke();
  };

  const limpiarFirma = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const enviarFirma = () => {
    if (!firmaPara || !canvasRef.current) return;
    firmar.mutate({ consentimientoId: firmaPara.id, firma: canvasRef.current.toDataURL('image/png') });
  };
  const actionError = confirmar.error ?? cancelar.error ?? solicitarCambio.error ?? firmar.error;

  return (
    <section className="page mobile-portal">
      <div className="mobile-portal-head">
        <div>
          <p className="eyebrow">Portal paciente</p>
          <h1>Mis citas y documentos</h1>
        </div>
        {user?.rol !== 'paciente' && (
          <select value={activePacienteId} onChange={(event) => setPacienteId(event.target.value)}>
            {(pacientesQuery.data ?? []).map((pacienteItem) => (
              <option key={pacienteItem.id} value={pacienteItem.id}>
                {pacienteItem.nombre} {pacienteItem.apellidos}
              </option>
            ))}
          </select>
        )}
      </div>

      {!activePacienteId && (
        <p className="empty-state">Selecciona un paciente para previsualizar el portal.</p>
      )}

      <div className="mobile-patient-strip">
        <div>
          <strong>{paciente ? `${paciente.nombre} ${paciente.apellidos}` : 'Paciente'}</strong>
          <span>{paciente?.telefono || paciente?.email || 'Sin contacto registrado'}</span>
        </div>
        <div className="portal-summary">
          <span>{portalMe.data?.resumen.proximas_citas ?? 0} citas</span>
          <span>{portalMe.data?.resumen.documentos ?? 0} docs</span>
          <span>{portalMe.data?.resumen.consentimientos_pendientes ?? 0} firmas</span>
        </div>
      </div>
      {actionError && (
        <div className="inline-alert portal-action-alert">
          {actionError instanceof Error ? actionError.message : 'No se ha podido completar la acción.'}
        </div>
      )}

      <div className="mobile-portal-tabs">
        <button className={tab === 'citas' ? 'active' : ''} onClick={() => setTab('citas')}>Citas</button>
        <button className={tab === 'documentos' ? 'active' : ''} onClick={() => setTab('documentos')}>Documentos</button>
        <button className={tab === 'consentimientos' ? 'active' : ''} onClick={() => setTab('consentimientos')}>Consentimientos</button>
      </div>

      {tab === 'citas' && (
        <div className="mobile-cita-list">
          {(citasQuery.data ?? []).map((cita) => (
            <article key={cita.id} className={`mobile-cita-card status-${cita.estado}`}>
              <div>
                <strong>{formatFecha(cita.fecha_hora)}</strong>
                <span>{formatHora(cita.fecha_hora)} - {cita.duracion_min} min</span>
              </div>
              <p>{cita.motivo || 'Cita dental'}</p>
              <span className="mobile-cita-state">{CITA_STATE_LABELS[cita.estado] ?? cita.estado}</span>
              <div className="mobile-cita-actions">
                <button
                  onClick={() => confirmar.mutate(cita.id)}
                  disabled={confirmar.isPending || cita.estado === 'confirmada' || cita.estado === 'reschedule_requested'}
                >
                  Confirmar
                </button>
                <button
                  onClick={() => solicitarCambio.mutate(cita.id)}
                  disabled={solicitarCambio.isPending || cita.estado === 'reschedule_requested'}
                >
                  {cita.estado === 'reschedule_requested' ? 'Cambio solicitado' : 'Solicitar cambio'}
                </button>
                <button onClick={() => cancelar.mutate(cita.id)} disabled={cancelar.isPending || cita.estado === 'anulada' || cita.estado === 'reschedule_requested'}>
                  Cancelar
                </button>
              </div>
            </article>
          ))}
          {!citasQuery.isLoading && (citasQuery.data ?? []).length === 0 && (
            <p className="empty-state">No hay citas proximas.</p>
          )}
        </div>
      )}

      {tab === 'documentos' && (
        <div className="portal-list">
          {(documentosQuery.data ?? []).map((doc) => (
            <article key={doc.id} className="portal-list-row">
              <div>
                <strong>{doc.nombre_original}</strong>
                <span>{doc.categoria} {doc.fecha_documento ? `- ${doc.fecha_documento}` : ''}</span>
              </div>
              <button onClick={() => openDocumentoPaciente(activePacienteId, doc.id, doc.nombre_original)}>Abrir</button>
            </article>
          ))}
          {!documentosQuery.isLoading && (documentosQuery.data ?? []).length === 0 && (
            <p className="empty-state">No hay documentos publicados.</p>
          )}
        </div>
      )}

      {tab === 'consentimientos' && (
        <div className="portal-list">
          {(consentimientosQuery.data ?? []).map((consentimiento) => (
            <article key={consentimiento.id} className="portal-list-row">
              <div>
                <strong>{consentimiento.tipo}</strong>
                <span>{consentimiento.estado} - {consentimiento.fecha_firma}</span>
              </div>
              <div className="portal-row-actions">
                <button onClick={() => openConsentimientoPdf(consentimiento.id)}>PDF</button>
                <button
                  onClick={() => setFirmaPara(consentimiento)}
                  disabled={consentimiento.estado === 'firmado' || consentimiento.estado === 'revocado'}
                >
                  Firmar
                </button>
              </div>
            </article>
          ))}
          {!consentimientosQuery.isLoading && (consentimientosQuery.data ?? []).length === 0 && (
            <p className="empty-state">No hay consentimientos pendientes.</p>
          )}
        </div>
      )}

      {firmaPara && (
        <div className="modal-backdrop">
          <div className="modal-card portal-sign-modal">
            <div>
              <p className="eyebrow">Firma paciente</p>
              <h2>{firmaPara.tipo}</h2>
            </div>
            <canvas
              ref={canvasRef}
              className="portal-sign-canvas"
              width={720}
              height={220}
              onPointerDown={startFirma}
              onPointerMove={moveFirma}
              onPointerUp={() => { isDrawingRef.current = false; }}
              onPointerLeave={() => { isDrawingRef.current = false; }}
            />
            <div className="portal-sign-actions">
              <button onClick={limpiarFirma}>Limpiar</button>
              <button onClick={() => setFirmaPara(null)}>Cerrar</button>
              <button className="primary" onClick={enviarFirma} disabled={firmar.isPending}>Guardar firma</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
