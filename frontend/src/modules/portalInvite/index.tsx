import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { PortalPublicConsentimiento } from '../../types/api';
import {
  cancelarPortalPublicCita,
  confirmarPortalPublicCita,
  firmarPortalPublicConsentimiento,
  getPortalPublicCitas,
  getPortalPublicConsentimientos,
  getPortalPublicDocumentos,
  openPortalPublicDocumento,
  solicitarCambioPortalPublicCita,
  validatePortalInvitation,
} from '../../lib/api';

type PortalTab = 'citas' | 'documentos' | 'consentimientos';

const CITA_STATE_LABELS: Record<string, string> = {
  programada: 'Pendiente de confirmar',
  pending_confirmation: 'Pendiente de confirmar',
  reminder_sent: 'Recordatorio enviado',
  confirmada: 'Confirmada',
  confirmed: 'Confirmada',
  reschedule_requested: 'Cambio solicitado',
  pending_manual_review: 'En revision',
  rescheduled: 'Reprogramada',
};

function formatFecha(value: string) {
  return new Date(value).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long' });
}

function formatHora(value: string) {
  return new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function portalTokenError(error: unknown) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  const code = typeof detail === 'object' && detail && 'code' in detail ? String((detail as { code?: unknown }).code) : '';
  if (code === 'expired') return 'La invitacion ha caducado. Solicita a la clinica un enlace nuevo.';
  if (code === 'revoked') return 'La invitacion ha sido revocada por la clinica.';
  if (code === 'invalid') return 'El enlace no es valido.';
  return error instanceof Error ? error.message : 'No se pudo abrir el portal.';
}

export default function PortalInvitePage() {
  const { token = '' } = useParams();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const [tab, setTab] = useState<PortalTab>('citas');
  const [firmaPara, setFirmaPara] = useState<PortalPublicConsentimiento | null>(null);

  const portalMe = useQuery({
    queryKey: ['portal-public-me', token],
    queryFn: () => validatePortalInvitation(token),
    enabled: Boolean(token),
    retry: false,
  });
  const citasQuery = useQuery({
    queryKey: ['portal-public-citas', token],
    queryFn: () => getPortalPublicCitas(token),
    enabled: Boolean(token) && portalMe.isSuccess,
  });
  const documentosQuery = useQuery({
    queryKey: ['portal-public-documentos', token],
    queryFn: () => getPortalPublicDocumentos(token),
    enabled: Boolean(token) && portalMe.isSuccess,
  });
  const consentimientosQuery = useQuery({
    queryKey: ['portal-public-consentimientos', token],
    queryFn: () => getPortalPublicConsentimientos(token),
    enabled: Boolean(token) && portalMe.isSuccess,
  });

  const refreshPortal = () => {
    void queryClient.invalidateQueries({ queryKey: ['portal-public-me', token] });
    void queryClient.invalidateQueries({ queryKey: ['portal-public-citas', token] });
    void queryClient.invalidateQueries({ queryKey: ['portal-public-documentos', token] });
    void queryClient.invalidateQueries({ queryKey: ['portal-public-consentimientos', token] });
  };

  const confirmar = useMutation({ mutationFn: (citaId: string) => confirmarPortalPublicCita(token, citaId), onSuccess: refreshPortal });
  const cancelar = useMutation({ mutationFn: (citaId: string) => cancelarPortalPublicCita(token, citaId, 'Cancelada desde portal paciente'), onSuccess: refreshPortal });
  const solicitarCambio = useMutation({
    mutationFn: (citaId: string) => solicitarCambioPortalPublicCita(token, citaId, 'Solicita cambiar la cita desde portal paciente'),
    onSuccess: refreshPortal,
  });
  const firmar = useMutation({
    mutationFn: ({ consentimientoId, firma }: { consentimientoId: string; firma: string }) =>
      firmarPortalPublicConsentimiento(token, consentimientoId, firma),
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

  if (!token) {
    return <section className="page mobile-portal"><p className="empty-state">El enlace no es valido.</p></section>;
  }

  if (portalMe.isError) {
    return <section className="page mobile-portal"><p className="empty-state">{portalTokenError(portalMe.error)}</p></section>;
  }

  return (
    <section className="page mobile-portal">
      <div className="mobile-portal-head">
        <div>
          <p className="eyebrow">Portal paciente</p>
          <h1>Mis citas y documentos</h1>
        </div>
      </div>

      <div className="mobile-patient-strip">
        <div>
          <strong>{portalMe.data ? `${portalMe.data.paciente.nombre} ${portalMe.data.paciente.apellidos}` : 'Paciente'}</strong>
          <span>{portalMe.data ? `Enlace valido hasta ${new Date(portalMe.data.expires_at).toLocaleDateString('es-ES')}` : 'Validando invitacion...'}</span>
        </div>
        <div className="portal-summary">
          <span>{portalMe.data?.resumen.proximas_citas ?? 0} citas</span>
          <span>{portalMe.data?.resumen.documentos ?? 0} docs</span>
          <span>{portalMe.data?.resumen.consentimientos_pendientes ?? 0} firmas</span>
        </div>
      </div>

      {actionError && <div className="inline-alert portal-action-alert">{portalTokenError(actionError)}</div>}

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
              <p>{cita.motivo || 'Cita dental'}{cita.doctor_nombre ? ` con ${cita.doctor_nombre}` : ''}</p>
              <span className="mobile-cita-state">{CITA_STATE_LABELS[cita.estado] ?? cita.estado}</span>
              <div className="mobile-cita-actions">
                <button onClick={() => confirmar.mutate(cita.id)} disabled={confirmar.isPending || cita.estado === 'confirmada' || cita.estado === 'reschedule_requested'}>Confirmar</button>
                <button onClick={() => solicitarCambio.mutate(cita.id)} disabled={solicitarCambio.isPending || cita.estado === 'reschedule_requested'}>{cita.estado === 'reschedule_requested' ? 'Cambio solicitado' : 'Solicitar cambio'}</button>
                <button onClick={() => cancelar.mutate(cita.id)} disabled={cancelar.isPending || cita.estado === 'anulada' || cita.estado === 'reschedule_requested'}>Cancelar</button>
              </div>
            </article>
          ))}
          {!citasQuery.isLoading && (citasQuery.data ?? []).length === 0 && <p className="empty-state">No hay citas proximas.</p>}
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
              <button onClick={() => void openPortalPublicDocumento(token, doc.id, doc.nombre_original)}>Abrir</button>
            </article>
          ))}
          {!documentosQuery.isLoading && (documentosQuery.data ?? []).length === 0 && <p className="empty-state">No hay documentos publicados.</p>}
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
                <button onClick={() => setFirmaPara(consentimiento)} disabled={consentimiento.estado === 'firmado' || consentimiento.revocado}>Firmar</button>
              </div>
            </article>
          ))}
          {!consentimientosQuery.isLoading && (consentimientosQuery.data ?? []).length === 0 && <p className="empty-state">No hay consentimientos pendientes.</p>}
        </div>
      )}

      {firmaPara && (
        <div className="modal-backdrop">
          <div className="modal-card portal-sign-modal">
            <div>
              <p className="eyebrow">Firma paciente</p>
              <h2>{firmaPara.tipo}</h2>
            </div>
            {firmaPara.contenido && <p className="portal-consent-copy">{firmaPara.contenido}</p>}
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
