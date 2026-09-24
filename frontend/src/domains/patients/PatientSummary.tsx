import {
AlertTriangle,
ArrowRight,
CalendarClock,
CalendarPlus,
ClipboardList,
CreditCard,
Edit3,
Eye,
FileSignature,
FileText,
History,
MessageCircle,
Mic,
MoreHorizontal,
Pill,
Receipt,
Upload,
User,
Wallet,
} from 'lucide-react';
import type { MouseEvent,ReactNode } from 'react';
import { formatDate, money } from '../../shared/format';
import { fullName } from './patientName';
import { nextPatientAppointment, patientAppointmentLabel } from './patientContext';
import { useMinuteClock } from '../../shared/time/useMinuteClock';
import type { ApiPaciente,Cita,Consentimiento,DocumentoPaciente,Factura,HistorialClinico,Presupuesto,TrabajoLaboratorio } from '../../api/types';
import { getBillingTotals,getFacturasPendientes,getFacturasRecientes,getPagosParciales } from '../billing/patient-account/billingUtils';
import { PatientOdontogramSummary } from '../clinical/odontogram/PatientOdontogramSummary';
import { readableHealthItems } from './healthDisplay';
import { PatientIdentityChips } from './PatientIdentityChips';
import { buildPatientStatus,type PatientStatusSeverity } from './patientStatus';
import './patient-workspace.css';

const STATUS_SEVERITY_TONE: Record<PatientStatusSeverity, 'success' | 'info' | 'warning' | 'danger'> = {
  ok: 'success',
  info: 'info',
  warning: 'warning',
  critical: 'danger',
};

function PanelHead({ icon, title, status, statusTone, action }: { icon: ReactNode; title: string; status?: string; statusTone?: 'success' | 'warning' | 'danger' | 'info' | 'muted'; action?: ReactNode }) {
  return (
    <div className="dc-summary-card-head">
      <h3>
        <span className="dc-summary-card-head-icon" aria-hidden="true">{icon}</span>
        {title}
      </h3>
      <div className="dc-summary-card-head-right">
        {status && <span className={`dc-summary-card-chip dc-summary-card-chip-${statusTone ?? 'muted'}`}>{status}</span>}
        {action}
      </div>
    </div>
  );
}

export function PatientForm({
  paciente,
  embedded = false,
  facturas,
  historial,
  citas,
  presupuestos,
  documentos,
  consentimientos,
  laboratorio,
  onEdit,
  onOpenFull,
  onOpenCitas,
  onDictarNota = () => undefined,
  canDictarNota = false,
  canManageBilling = true,
  onComentario,
  onNuevoPresupuesto,
  onCrearReceta,
  onWhatsApp,
  onOpenPresupuestos,
  onOpenPendientes,
  onOpenRealizados,
  onOpenOdontogramaDetail,
  onOpenFacturacion,
  onOpenHistorial,
  onOpenDocumentos,
  onSubirDocumento,
  onOpenConsentimientos,
  onEmitirFactura,
  onRegistrarCobro,
  onHistorialFacturas,
}: {
  paciente: ApiPaciente | null;
  embedded?: boolean;
  facturas: Factura[];
  historial: HistorialClinico[];
  citas: Cita[];
  presupuestos: Presupuesto[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  laboratorio: TrabajoLaboratorio[];
  onEdit: () => void;
  onOpenFull: () => void;
  onOpenCitas: () => void;
  onDictarNota?: () => void;
  canDictarNota?: boolean;
  canManageBilling?: boolean;
  onComentario: () => void;
  onNuevoPresupuesto: () => void;
  onCrearReceta: () => void;
  onWhatsApp: () => void;
  onOpenPresupuestos: () => void;
  onOpenPendientes: () => void;
  onOpenRealizados: () => void;
  onOpenOdontogramaDetail: () => void;
  onOpenFacturacion: () => void;
  onOpenHistorial: () => void;
  onOpenDocumentos: () => void;
  onSubirDocumento: () => void;
  onOpenConsentimientos: () => void;
  onEmitirFactura: () => void;
  onRegistrarCobro: (factura?: Factura | null) => void;
  onHistorialFacturas: () => void;
}) {
  const totals = getBillingTotals(facturas);
  const temporal = paciente?.observaciones?.toLowerCase().includes('temporal');
  const initials = paciente ? `${paciente.nombre?.[0] ?? ''}${paciente.apellidos?.[0] ?? ''}`.toUpperCase() : '--';
  const healthItems = readableHealthItems(paciente?.datos_salud);
  const healthText = healthItems.map((item) => `${item.label}: ${item.value}`).join('\n');
  const healthAlertText = healthItems.map((item) => `${item.label}: ${item.value}`).join(' · ');
  const recentHistory = historial.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const lastVisit = recentHistory[0] ?? null;
  const now = useMinuteClock();
  const nextCita = nextPatientAppointment(citas, now);
  const lastTreatment = lastVisit?.procedimiento || lastVisit?.tratamiento?.nombre || 'Sin tratamiento registrado';
  const lastComment = lastVisit?.observaciones || lastVisit?.diagnostico || 'Sin comentario clinico en esta entrada.';
  const nextTreatment = nextCita?.motivo || 'Sin tratamiento indicado';
  const nextComment = nextCita?.observaciones || 'Sin observaciones para la cita.';
  const pendientes = presupuestos.flatMap((presupuesto) => presupuesto.lineas).filter((linea) => linea.aceptado && !linea.pasado_trabajo_pendiente);
  const realizados = historial.filter((item) => ['realizado', 'facturado', 'cobrado_parcial', 'cobrado_completo'].includes(item.estado));
  const alertText = healthAlertText || paciente?.observaciones || 'Sin alertas ni observaciones generales.';
  const facturasPendientes = getFacturasPendientes(facturas);
  const ultimaFacturas = getFacturasRecientes(facturas);
  const pagosParciales = getPagosParciales(facturas);
  const ultimosDocumentos = documentos
    .slice()
    .sort((a, b) => (b.fecha_documento || b.created_at || '').localeCompare(a.fecha_documento || a.created_at || ''))
    .slice(0, 3);
  const ultimosConsentimientos = consentimientos
    .slice()
    .sort((a, b) => (b.fecha_firma || b.created_at || '').localeCompare(a.fecha_firma || a.created_at || ''))
    .slice(0, 3);
  const consentimientosPendientes = consentimientos.filter((item) => item.estado !== 'firmado' && item.estado !== 'revocado').length;
  const today = new Date().toISOString().slice(0, 10);
  const laboratorioVencidos = laboratorio.filter((trabajo) => (
    !!trabajo.fecha_entrega_prevista
    && !trabajo.fecha_recepcion
    && !['entregado', 'cancelado', 'cancelled', 'delivered_or_placed'].includes(trabajo.estado)
    && trabajo.fecha_entrega_prevista < today
  ));

  const hasAlertasReales = Boolean(healthText) || (paciente?.observaciones?.trim()?.length ?? 0) > 0;
  const patientStatus = buildPatientStatus({
    paciente,
    presupuestos,
    citas,
    historial,
    saldoPendiente: canManageBilling ? totals.pendiente : 0,
    laboratorio,
    consentimientos,
    today,
  });
  const statusTone = STATUS_SEVERITY_TONE[patientStatus.severity];
  const patientStatusAction = (() => {
    if (!paciente || !patientStatus.suggestedAction) return null;

    switch (patientStatus.status) {
      case 'pendiente_cobro':
        return canManageBilling
          ? { label: 'Cobrar ahora', run: () => onRegistrarCobro(facturasPendientes[0] ?? null) }
          : null;
      case 'pendiente_laboratorio':
        return { label: 'Revisar pendientes', run: onOpenPendientes };
      case 'presupuesto_aceptado_sin_cita':
      case 'pendiente_cita':
      case 'revision_vencida':
        return { label: patientStatus.suggestedAction, run: onOpenCitas };
      case 'pendiente_presupuesto':
        return { label: patientStatus.suggestedAction, run: onNuevoPresupuesto };
      default:
        return null;
    }
  })();

  const edad = (() => {
    if (!paciente?.fecha_nacimiento) return null;
    const nac = new Date(paciente.fecha_nacimiento);
    const diff = Date.parse(today) - nac.getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  })();
  const sexoLabel = paciente?.sexo === 'F' ? 'Mujer' : paciente?.sexo === 'M' ? 'Hombre' : paciente?.sexo === 'otro' ? 'Otro' : null;
  const direccionCompleta = [paciente?.direccion, paciente?.codigo_postal, paciente?.ciudad, paciente?.provincia].filter(Boolean).join(' · ');

  function runHeaderAction(event: MouseEvent<HTMLButtonElement>, action: () => void) {
    event.currentTarget.closest('details')?.removeAttribute('open');
    action();
  }

  return (
    <div className="dc-patient-summary">
      {temporal && (
        <button type="button" className="dc-summary-banner dc-summary-banner-warning" onClick={onEdit}>
          <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
          <span>Paciente temporal: completar datos en clinica</span>
        </button>
      )}
      {laboratorioVencidos.length > 0 && (
        <button type="button" className="dc-summary-banner dc-summary-banner-danger" onClick={onOpenPendientes}>
          <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
          <span>{laboratorioVencidos.length} pedido{laboratorioVencidos.length === 1 ? '' : 's'} de laboratorio sin recibir con fecha de entrega vencida</span>
          <em>Revisar tratamientos</em>
        </button>
      )}

      {/* CABECERA: identidad + alertas + saldo + acciones */}
      {!embedded && <section className="dc-summary-hub-head">
        <div className="dc-summary-avatar">{initials}</div>
        <div className="dc-summary-hub-identity">
          <span>Paciente</span>
          <strong>{fullName(paciente) || 'Sin seleccionar'}</strong>
          <em>H {paciente?.num_historial ?? '-'} · {paciente?.telefono || paciente?.telefono2 || 'sin telefono'} · {paciente?.dni_nie || 'sin DNI'}</em>
          {paciente && patientStatusAction ? (
            <button
              type="button"
              className={`dc-summary-card-chip dc-summary-card-chip-${statusTone} dc-summary-status-action`}
              title={patientStatus.description}
              aria-label={`Estado del paciente: ${patientStatus.label}. ${patientStatus.description} Acción: ${patientStatusAction.label}`}
              onClick={patientStatusAction.run}
            >
              <span>{patientStatus.label}</span>
              <em>
                {patientStatusAction.label}
                <ArrowRight size={11} strokeWidth={2.2} aria-hidden="true" />
              </em>
            </button>
          ) : paciente ? (
            <span
              className={`dc-summary-card-chip dc-summary-card-chip-${statusTone}`}
              title={patientStatus.description}
              aria-label={`Estado del paciente: ${patientStatus.label}. ${patientStatus.description}`}
            >
              {patientStatus.label}
            </span>
          ) : null}
          <PatientIdentityChips paciente={paciente} />
        </div>
        <div className={`dc-summary-hub-alert ${hasAlertasReales ? 'has-alerts' : ''}`}>
          <span><AlertTriangle size={11} strokeWidth={2.2} aria-hidden="true" /> Alertas</span>
          <strong title={alertText}>{alertText}</strong>
        </div>
        {canManageBilling && (
          <div className={`dc-summary-hub-balance ${totals.pendiente > 0 ? 'has-debt' : ''}`}>
            <span><Wallet size={11} strokeWidth={2.2} aria-hidden="true" /> Saldo</span>
            <strong>{money(totals.pendiente)}</strong>
            <em>{money(totals.cobrado)} cobrado</em>
          </div>
        )}
        <div className="dc-summary-hub-head-actions">
          <button
            type="button"
            className="dc-summary-header-primary"
            onClick={onOpenCitas}
            disabled={!paciente}
          >
            <CalendarPlus size={14} strokeWidth={2} aria-hidden="true" />
            <span>Nueva cita</span>
          </button>
          {canManageBilling && (
            <button
              type="button"
              className={totals.pendiente > 0 ? 'dc-summary-header-secondary dc-summary-action-danger' : 'dc-summary-header-secondary'}
              onClick={() => onRegistrarCobro(facturasPendientes[0] ?? null)}
              disabled={!paciente}
            >
              <CreditCard size={14} strokeWidth={2} aria-hidden="true" />
              <span>Cobrar</span>
            </button>
          )}
          <details className="dc-summary-more-actions">
            <summary role="button" aria-label="Más acciones del paciente">
              <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
              <span>Más acciones</span>
            </summary>
            <div className="dc-summary-header-actions-menu" role="menu" aria-label="Más acciones del paciente">
              <button type="button" role="menuitem" onClick={(event) => runHeaderAction(event, onEdit)} disabled={!paciente}>
                <Edit3 size={14} strokeWidth={1.8} aria-hidden="true" />
                <span>Editar datos</span>
              </button>
              <button type="button" role="menuitem" onClick={(event) => runHeaderAction(event, onNuevoPresupuesto)} disabled={!paciente}>
                <Receipt size={14} strokeWidth={1.8} aria-hidden="true" />
                <span>Nuevo presupuesto</span>
              </button>
              <button type="button" role="menuitem" onClick={(event) => runHeaderAction(event, onComentario)} disabled={!paciente}>
                <Edit3 size={14} strokeWidth={1.8} aria-hidden="true" />
                <span>Editar nota</span>
              </button>
              <button type="button" role="menuitem" onClick={(event) => runHeaderAction(event, onDictarNota)} disabled={!paciente || !canDictarNota}>
                <Mic size={14} strokeWidth={1.8} aria-hidden="true" />
                <span>Dictar nota</span>
              </button>
              {canManageBilling && (
                <button type="button" role="menuitem" onClick={(event) => runHeaderAction(event, onEmitirFactura)} disabled={!paciente}>
                  <Receipt size={14} strokeWidth={1.8} aria-hidden="true" />
                  <span>Emitir factura</span>
                </button>
              )}
              <button type="button" role="menuitem" onClick={(event) => runHeaderAction(event, onOpenDocumentos)} disabled={!paciente}>
                <FileText size={14} strokeWidth={1.8} aria-hidden="true" />
                <span>Documentos</span>
              </button>
              <button type="button" role="menuitem" onClick={(event) => runHeaderAction(event, onSubirDocumento)} disabled={!paciente}>
                <Upload size={14} strokeWidth={1.8} aria-hidden="true" />
                <span>Subir documento</span>
              </button>
              <button type="button" role="menuitem" onClick={(event) => runHeaderAction(event, onOpenConsentimientos)} disabled={!paciente}>
                <FileSignature size={14} strokeWidth={1.8} aria-hidden="true" />
                <span>Consentimiento</span>
              </button>
              <button type="button" role="menuitem" onClick={(event) => runHeaderAction(event, onCrearReceta)} disabled={!paciente}>
                <Pill size={14} strokeWidth={1.8} aria-hidden="true" />
                <span>Nueva receta</span>
              </button>
              <button type="button" role="menuitem" onClick={(event) => runHeaderAction(event, onWhatsApp)} disabled={!paciente || (!paciente.telefono && !paciente.telefono2)}>
                <MessageCircle size={14} strokeWidth={1.8} aria-hidden="true" />
                <span>WhatsApp</span>
              </button>
              {canManageBilling && (
                <button type="button" role="menuitem" onClick={(event) => runHeaderAction(event, onHistorialFacturas)} disabled={!paciente}>
                  <History size={14} strokeWidth={1.8} aria-hidden="true" />
                  <span>Facturas y recibos</span>
                </button>
              )}
              <button type="button" role="menuitem" onClick={(event) => runHeaderAction(event, onOpenFull)} disabled={!paciente}>
                <Eye size={14} strokeWidth={1.8} aria-hidden="true" />
                <span>Vista completa</span>
              </button>
            </div>
          </details>
        </div>
      </section>}

      {/* FLOW STRIP: contadores rápidos */}
      <section className="dc-summary-flow-strip" aria-label="Flujo clinico del paciente">
        {embedded && (patientStatusAction ? <button type="button" className={`dc-summary-card-chip dc-summary-card-chip-${statusTone}`} title={patientStatus.description} onClick={patientStatusAction.run}>{patientStatus.label}<ArrowRight size={12} aria-hidden="true" /></button> : <span className={`dc-summary-card-chip dc-summary-card-chip-${statusTone}`} title={patientStatus.description}>{patientStatus.label}</span>)}
        <button type="button" onClick={onOpenCitas} disabled={!paciente}>Citas <strong>{citas.length}</strong></button>
        <button type="button" onClick={onOpenPresupuestos} disabled={!paciente}>Presupuestos <strong>{presupuestos.length}</strong></button>
        <button type="button" className={pendientes.length ? 'dc-summary-flow-warning' : ''} onClick={onOpenPendientes} disabled={!paciente}>Pendientes <strong>{pendientes.length}</strong></button>
        <button type="button" onClick={onOpenRealizados} disabled={!paciente}>Realizados <strong>{realizados.length}</strong></button>
        {canManageBilling && (
          <button type="button" className={facturasPendientes.length ? 'dc-summary-flow-danger' : ''} onClick={onOpenFacturacion} disabled={!paciente}>Facturación <strong>{facturasPendientes.length}</strong></button>
        )}
        <button type="button" className={consentimientosPendientes ? 'dc-summary-flow-warning' : ''} onClick={onOpenConsentimientos} disabled={!paciente}>CI pte. <strong>{consentimientosPendientes}</strong></button>
        <button type="button" onClick={onOpenDocumentos} disabled={!paciente}>Docs <strong>{documentos.length}</strong></button>
      </section>

      {/* COL IZQ — clínica: odontograma + observaciones */}
      <div className="dc-summary-bento-col dc-summary-bento-col-clinica">
        <PatientOdontogramSummary
          presupuestos={presupuestos}
          historial={historial}
          onOpenDetail={onOpenOdontogramaDetail}
        />

        <section className="dc-summary-clinical-notes-card">
          <PanelHead
            icon={<ClipboardList size={14} strokeWidth={2} />}
            title="Alertas y observaciones"
            status={hasAlertasReales ? 'revisar' : 'sin alertas'}
            statusTone={hasAlertasReales ? 'warning' : 'muted'}
            action={<>{canDictarNota && <button type="button" onClick={onDictarNota} disabled={!paciente}>Dictar nota</button>}<button type="button" onClick={onEdit} disabled={!paciente}>Editar</button></>}
          />
          <div className="dc-summary-clinical-notes-body">
            <div>
              <b>Salud</b>
              {healthItems.length > 0 ? (
                <dl className="dc-summary-health-list">
                  {healthItems.map((item) => (
                    <div key={item.key}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>Sin alergias ni contraindicaciones registradas.</p>
              )}
            </div>
            <div>
              <b>Observaciones</b>
              <p>{paciente?.observaciones || 'Sin observaciones generales.'}</p>
            </div>
          </div>
        </section>
      </div>

      {/* COL CENTRAL — operativa: cita, visita, cobros */}
      <div className="dc-summary-bento-col dc-summary-bento-col-operativa">
      <section className="dc-summary-next-card">
        <PanelHead
          icon={<CalendarClock size={14} strokeWidth={2} />}
          title="Próxima cita"
          status={nextCita?.estado ?? 'sin cita'}
          statusTone={nextCita ? 'info' : 'muted'}
          action={<button type="button" onClick={onOpenCitas} disabled={!paciente}>Ver citas</button>}
        />
        <strong>{nextCita ? patientAppointmentLabel(nextCita.fecha_hora) : 'Sin cita programada'}</strong>
        <p><b>Tratamiento:</b> {nextTreatment}</p>
        <small>{nextComment}</small>
      </section>

      <section className="dc-summary-last-card">
        <PanelHead
          icon={<History size={14} strokeWidth={2} />}
          title="Última visita"
          status={lastVisit?.estado ?? 'sin historial'}
          statusTone={lastVisit ? 'success' : 'muted'}
          action={<button type="button" onClick={onOpenHistorial} disabled={!paciente}>Historial</button>}
        />
        <strong>{lastVisit ? `${formatDate(lastVisit.fecha)} · ${lastTreatment}` : 'Sin historial clinico'}</strong>
        <p><b>Comentario:</b> {lastComment}</p>
        <small>{lastVisit?.doctor?.nombre ? `Doctor: ${lastVisit.doctor.nombre}` : 'Sin profesional asociado'}</small>
      </section>

      {canManageBilling && <section className="dc-summary-billing-card">
        <PanelHead
          icon={<CreditCard size={14} strokeWidth={2} />}
          title="Cobros / facturas"
          status={facturasPendientes.length ? `${facturasPendientes.length} pte.` : 'al día'}
          statusTone={facturasPendientes.length ? 'danger' : 'success'}
          action={<button type="button" onClick={onHistorialFacturas} disabled={!paciente}>Facturas</button>}
        />
        <div className="dc-summary-billing-totals">
          <span><b>Saldo</b><strong className={totals.pendiente > 0 ? 'debt' : ''}>{money(totals.pendiente)}</strong></span>
          <span><b>Cobrado</b><strong>{money(totals.cobrado)}</strong></span>
          <span><b>Parciales</b><strong>{pagosParciales.length}</strong></span>
        </div>
        <div className="dc-summary-billing-actions">
          <button type="button" onClick={() => onRegistrarCobro(facturasPendientes[0] ?? null)} disabled={!paciente}>
            {facturasPendientes.length ? 'Registrar cobro' : 'Registrar anticipo'}
          </button>
          <button type="button" onClick={onEmitirFactura} disabled={!paciente}>Emitir factura</button>
        </div>
        <div className="dc-summary-billing-list">
          {ultimaFacturas.slice(0, 3).map((factura) => (
            <button type="button" key={factura.id} onClick={() => Number(factura.pendiente) > 0 ? onRegistrarCobro(factura) : onOpenFacturacion()}>
              <span>{factura.serie}/{factura.numero}</span>
              <strong>{money(factura.total)}</strong>
              <em className={Number(factura.pendiente) > 0 ? 'debt' : ''}>
                {Number(factura.pendiente) > 0 ? `Pend. ${money(factura.pendiente)}` : 'Pagada'}
              </em>
            </button>
          ))}
          {!ultimaFacturas.length && <p>Sin facturas previas.</p>}
        </div>
      </section>}
      </div>

      {/* COL DERECHA — administrativa: ficha rica + docs/CI */}
      <div className="dc-summary-bento-col dc-summary-bento-col-admin">
      <section className="dc-summary-admin-card">
        <PanelHead
          icon={<User size={14} strokeWidth={2} />}
          title="Datos administrativos"
          status={paciente?.num_historial ? `H ${paciente.num_historial}` : undefined}
          statusTone="info"
          action={<button type="button" onClick={onEdit} disabled={!paciente}>Editar</button>}
        />
        <dl className="dc-summary-admin-grid">
          <div><dt>DNI / NIF</dt><dd>{paciente?.dni_nie || '—'}</dd></div>
          <div><dt>Nacimiento</dt><dd>{paciente?.fecha_nacimiento ? `${formatDate(paciente.fecha_nacimiento)}${edad !== null ? ` · ${edad} años` : ''}` : '—'}</dd></div>
          <div><dt>Sexo</dt><dd>{sexoLabel || '—'}</dd></div>
          <div><dt>Profesión</dt><dd>{paciente?.profesion || '—'}</dd></div>
          <div className="wide"><dt>Teléfonos</dt><dd>{[paciente?.telefono, paciente?.telefono2].filter(Boolean).join(' / ') || '—'}</dd></div>
          <div className="wide"><dt>Email</dt><dd>{paciente?.email || '—'}</dd></div>
          <div className="wide"><dt>Dirección</dt><dd>{direccionCompleta || '—'}</dd></div>
          <div><dt>País</dt><dd>{paciente?.pais || '—'}</dd></div>
          <div><dt>Póliza</dt><dd>{paciente?.num_poliza || '—'}</dd></div>
          {paciente?.pagador_distinto && (
            <div className="wide"><dt>Pagador</dt><dd>{[paciente.pagador_nombre, paciente.pagador_dni].filter(Boolean).join(' · ') || 'Pagador distinto'}</dd></div>
          )}
          <div className="wide"><dt>1ª visita / Ultima</dt><dd>{paciente?.fecha_primera_visita ? formatDate(paciente.fecha_primera_visita) : '—'} · {paciente?.fecha_ultima_visita ? formatDate(paciente.fecha_ultima_visita) : '—'}</dd></div>
        </dl>
      </section>

      <section className="dc-summary-documents-summary-card">
        <PanelHead
          icon={<FileText size={14} strokeWidth={2} />}
          title="Documentos y consentimientos"
          status={consentimientosPendientes ? `${consentimientosPendientes} CI pte.` : `${documentos.length} docs · ${consentimientos.length} CI`}
          statusTone={consentimientosPendientes ? 'warning' : 'info'}
          action={<button type="button" onClick={onOpenDocumentos} disabled={!paciente}>Ver todos</button>}
        />
        <div className="dc-summary-documents-summary-grid">
          <div>
            <strong>Últimos documentos</strong>
            {ultimosDocumentos.map((documento) => (
              <button type="button" key={documento.id} onClick={onOpenDocumentos}>
                <span>{documento.categoria}</span>
                <b>{documento.nombre_original}</b>
                <small>{formatDate(documento.fecha_documento || documento.created_at)}</small>
              </button>
            ))}
            {!ultimosDocumentos.length && <p>Sin documentos archivados.</p>}
          </div>
          <div>
            <strong>Consentimientos</strong>
            {ultimosConsentimientos.map((consentimiento) => (
              <button type="button" key={consentimiento.id} onClick={onOpenDocumentos}>
                <span>{consentimiento.estado}</span>
                <b>{consentimiento.tipo}</b>
                <small>{formatDate(consentimiento.fecha_firma || consentimiento.created_at)}</small>
              </button>
            ))}
            {!ultimosConsentimientos.length && <p>Sin consentimientos creados.</p>}
          </div>
        </div>
        <footer className="dc-summary-documents-summary-actions">
          <button type="button" onClick={onSubirDocumento} disabled={!paciente}>Subir doc.</button>
          <button type="button" onClick={onOpenConsentimientos} disabled={!paciente}>Nuevo CI</button>
        </footer>
      </section>
      </div>
    </div>
  );
}
