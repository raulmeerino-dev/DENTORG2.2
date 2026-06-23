import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FileText,
  History,
  User,
  Wallet,
} from 'lucide-react';
import type { ApiPaciente, Cita, Consentimiento, Doctor, DocumentoPaciente, Factura, HistorialClinico, PacienteSexo, Presupuesto, TrabajoLaboratorio } from '../../types/api';
import { formatDate, fullName, money } from '../../lib/utils';
import type { WorkTab } from './index';
import { getBillingTotals, getFacturasPendientes, getFacturasRecientes, getPagosParciales } from './billingUtils';
import { PatientOdontogramSummary } from './PatientOdontogramSummary';
import { buildPatientStatus, type PatientStatusSeverity } from './patientStatus';

const STATUS_SEVERITY_TONE: Record<PatientStatusSeverity, 'success' | 'info' | 'warning' | 'danger'> = {
  ok: 'success',
  info: 'info',
  warning: 'warning',
  critical: 'danger',
};

function CardHead({ icon, title, status, statusTone, action }: { icon: ReactNode; title: string; status?: string; statusTone?: 'success' | 'warning' | 'danger' | 'info' | 'muted'; action?: ReactNode }) {
  return (
    <div className="patient-card-head">
      <h3>
        <span className="patient-card-head-icon" aria-hidden="true">{icon}</span>
        {title}
      </h3>
      <div className="patient-card-head-right">
        {status && <span className={`patient-card-chip patient-card-chip-${statusTone ?? 'muted'}`}>{status}</span>}
        {action}
      </div>
    </div>
  );
}

const HEALTH_LABELS: Record<string, string> = {
  alergias: 'Alergias',
  contraindicaciones: 'Contraindicaciones',
  observaciones_medicas: 'Observaciones médicas',
  observaciones: 'Observaciones médicas',
  medicacion: 'Medicación',
  medicacion_actual: 'Medicación actual',
  anticoagulantes: 'Anticoagulantes',
  ansiedad: 'Ansiedad',
  antecedentes: 'Antecedentes',
  enfermedades: 'Enfermedades',
  embarazo: 'Embarazo',
};

function healthLabel(key: string) {
  if (key === 'observaciones_medicas' || key === 'observaciones') return 'Observaciones medicas';
  if (key === 'medicacion' || key === 'medicacion_actual') return key === 'medicacion_actual' ? 'Medicacion actual' : 'Medicacion';
  if (HEALTH_LABELS[key]) return HEALTH_LABELS[key];
  const clean = key.replaceAll('_', ' ').trim();
  return clean ? `${clean.charAt(0).toUpperCase()}${clean.slice(1)}` : key;
}

function readableHealthItems(datos?: Record<string, unknown> | null) {
  if (!datos) return [];
  return Object.entries(datos)
    .filter(([key, value]) => !['temporal', 'pendiente_completar'].includes(key) && value !== null && value !== undefined && String(value).trim() !== '')
    .map(([key, value]) => ({ key, label: healthLabel(key), value: String(value).trim() }));
}

function readableHealthData(datos?: Record<string, unknown> | null) {
  if (!datos) return '';
  return readableHealthItems(datos)
    .map((item) => `${item.label}: ${item.value}`)
    .join('\n');
}

function normalizePatientFinderText(value?: string | number | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function PatientFinder({
  pacientes,
  selectedId,
  onSelect,
  onNew,
}: {
  pacientes: ApiPaciente[];
  selectedId: string | null;
  onSelect: (paciente: ApiPaciente) => void;
  onNew: () => void;
}) {
  const [query, setQuery] = useState('');
  const [resultsOpen, setResultsOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = normalizePatientFinderText(query).trim();
    if (!q) return pacientes.slice(0, 12);
    const tokens = q.split(/\s+/).filter(Boolean);
    return pacientes.filter((p) => {
      const haystack = normalizePatientFinderText([
        p.num_historial,
        p.codigo,
        p.nombre,
        p.apellidos,
        p.telefono,
        p.telefono2,
        p.dni_nie,
        p.email,
      ].filter(Boolean).join(' '));
      return tokens.every((token) => haystack.includes(token));
    }).slice(0, 10);
  }, [pacientes, query]);

  function selectPaciente(paciente: ApiPaciente) {
    onSelect(paciente);
    setResultsOpen(false);
    setQuery('');
  }

  return (
    <div className="patient-finder">
      <button
        type="button"
        className="patient-new-shortcut"
        onClick={onNew}
        title="Nueva ficha de paciente"
        aria-label="Nueva ficha de paciente"
      >
        <svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M2 19c0-3.314 3.134-6 7-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="16" y1="13" x2="16" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="17" x2="20" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <label className="patient-search-label">
        <input
          id="patient-search-input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setResultsOpen(true);
          }}
          onFocus={() => setResultsOpen(true)}
          onBlur={() => setTimeout(() => setResultsOpen(false), 160)}
          placeholder="Buscar paciente — nombre, teléfono o historia"
          autoComplete="off"
        />
      </label>
      {resultsOpen && (
        <div className="patient-live-results patient-finder-results">
          {filtered.map((paciente) => (
            <button
              type="button"
              className={paciente.id === selectedId ? 'active' : ''}
              key={paciente.id}
              onMouseDown={(e) => { e.preventDefault(); selectPaciente(paciente); }}
            >
              <strong>{paciente.apellidos}, {paciente.nombre}</strong>
              <span>{paciente.telefono ?? 'sin telefono'} · H{String(paciente.num_historial).padStart(4, '0')}</span>
            </button>
          ))}
          {!filtered.length && <span>No hay pacientes con ese criterio. Revisa telefono, DNI o crea una ficha nueva.</span>}
        </div>
      )}
    </div>
  );
}

const SEXO_LABEL: Record<PacienteSexo, string> = {
  M: 'Hombre',
  F: 'Mujer',
  otro: 'Otro',
};

export function PatientIdentityChips({ paciente }: { paciente: ApiPaciente | null }) {
  if (!paciente) return null;
  const chips: Array<{ key: string; label: string }> = [];
  if (paciente.sexo) chips.push({ key: 'sexo', label: SEXO_LABEL[paciente.sexo] ?? paciente.sexo });
  if (paciente.profesion) chips.push({ key: 'profesion', label: paciente.profesion });
  if (paciente.num_poliza) chips.push({ key: 'poliza', label: `Póliza ${paciente.num_poliza}` });
  if (paciente.pagador_distinto) chips.push({ key: 'pagador', label: 'Pagador distinto' });
  if (paciente.fecha_primera_visita) chips.push({ key: 'primera', label: `1ª visita ${formatDate(paciente.fecha_primera_visita)}` });
  if (!chips.length) return null;
  return (
    <ul className="patient-identity-chips" aria-label="Datos administrativos del paciente">
      {chips.map((chip) => (
        <li key={chip.key}>{chip.label}</li>
      ))}
    </ul>
  );
}

export function PatientForm({
  paciente,
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
  const nowIso = new Date().toISOString();
  const nextCita = citas
    .filter((cita) => cita.fecha_hora >= nowIso && !['anulada', 'falta', 'cancelled_by_patient'].includes(cita.estado))
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0] ?? null;
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
    && !['entregado', 'cancelado'].includes(trabajo.estado)
    && trabajo.fecha_entrega_prevista < today
  ));

  const hasAlertasReales = Boolean(healthText) || (paciente?.observaciones?.trim()?.length ?? 0) > 0;
  const patientStatus = buildPatientStatus({
    paciente,
    presupuestos,
    citas,
    historial,
    saldoPendiente: totals.pendiente,
    laboratorio,
    consentimientos,
    today,
  });
  const statusTone = STATUS_SEVERITY_TONE[patientStatus.severity];

  const edad = (() => {
    if (!paciente?.fecha_nacimiento) return null;
    const nac = new Date(paciente.fecha_nacimiento);
    const diff = Date.parse(today) - nac.getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  })();
  const sexoLabel = paciente?.sexo === 'F' ? 'Mujer' : paciente?.sexo === 'M' ? 'Hombre' : paciente?.sexo === 'otro' ? 'Otro' : null;
  const direccionCompleta = [paciente?.direccion, paciente?.codigo_postal, paciente?.ciudad, paciente?.provincia].filter(Boolean).join(' · ');

  return (
    <div className="patient-form-grid patient-hub-grid patient-bento">
      {temporal && (
        <button type="button" className="patient-banner patient-banner-warning" onClick={onEdit}>
          <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
          <span>Paciente temporal: completar datos en clinica</span>
        </button>
      )}
      {laboratorioVencidos.length > 0 && (
        <button type="button" className="patient-banner patient-banner-danger" onClick={onOpenPendientes}>
          <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
          <span>{laboratorioVencidos.length} pedido{laboratorioVencidos.length === 1 ? '' : 's'} de laboratorio sin recibir con fecha de entrega vencida</span>
          <em>Revisar tratamientos</em>
        </button>
      )}

      {/* CABECERA: identidad + alertas + saldo + acciones */}
      <section className="patient-hub-head">
        <div className="patient-avatar">{initials}</div>
        <div className="patient-hub-identity">
          <span>Paciente</span>
          <strong>{fullName(paciente) || 'Sin seleccionar'}</strong>
          <em>H {paciente?.num_historial ?? '-'} · {paciente?.telefono || paciente?.telefono2 || 'sin telefono'} · {paciente?.dni_nie || 'sin DNI'}</em>
          {paciente && (
            <span
              className={`patient-card-chip patient-card-chip-${statusTone}`}
              title={patientStatus.description}
              aria-label={`Estado del paciente: ${patientStatus.label}. ${patientStatus.description}`}
            >
              {patientStatus.label}
              {patientStatus.suggestedAction && (
                <em style={{ marginLeft: 6, fontStyle: 'normal', opacity: 0.85 }}>· {patientStatus.suggestedAction}</em>
              )}
            </span>
          )}
          <PatientIdentityChips paciente={paciente} />
        </div>
        <div className={`patient-hub-alert ${hasAlertasReales ? 'has-alerts' : ''}`}>
          <span><AlertTriangle size={11} strokeWidth={2.2} aria-hidden="true" /> Alertas</span>
          <strong title={alertText}>{alertText}</strong>
        </div>
        <div className={`patient-hub-balance ${totals.pendiente > 0 ? 'has-debt' : ''}`}>
          <span><Wallet size={11} strokeWidth={2.2} aria-hidden="true" /> Saldo</span>
          <strong>{money(totals.pendiente)}</strong>
          <em>{money(totals.cobrado)} cobrado</em>
        </div>
        <div className="patient-hub-head-actions">
          <button type="button" onClick={onEdit} disabled={!paciente}>Editar datos</button>
          <button type="button" onClick={onOpenCitas} disabled={!paciente}>Nueva cita</button>
          <button type="button" onClick={onCrearReceta} disabled={!paciente}>Nueva receta</button>
          <button type="button" onClick={onOpenDocumentos} disabled={!paciente}>Documentos</button>
          <button type="button" onClick={onOpenConsentimientos} disabled={!paciente}>CI / circular</button>
          <button type="button" onClick={onNuevoPresupuesto} disabled={!paciente}>Nuevo presupuesto</button>
          {(paciente?.telefono || paciente?.telefono2) && (
            <button type="button" onClick={onWhatsApp}>WhatsApp</button>
          )}
          {totals.pendiente > 0 && (
            <button type="button" className="patient-action-danger" onClick={() => onRegistrarCobro(facturasPendientes[0] ?? null)}>Cobrar</button>
          )}
          <button type="button" onClick={onOpenFull} disabled={!paciente}>Vista completa</button>
        </div>
      </section>

      {/* FLOW STRIP: contadores rápidos */}
      <section className="patient-flow-strip" aria-label="Flujo clinico del paciente">
        <button type="button" onClick={onOpenCitas} disabled={!paciente}>Citas <strong>{citas.length}</strong></button>
        <button type="button" onClick={onOpenPresupuestos} disabled={!paciente}>Presupuestos <strong>{presupuestos.length}</strong></button>
        <button type="button" className={pendientes.length ? 'patient-flow-warning' : ''} onClick={onOpenPendientes} disabled={!paciente}>Pendientes <strong>{pendientes.length}</strong></button>
        <button type="button" onClick={onOpenRealizados} disabled={!paciente}>Realizados <strong>{realizados.length}</strong></button>
        <button type="button" className={facturasPendientes.length ? 'patient-flow-danger' : ''} onClick={onOpenFacturacion} disabled={!paciente}>Facturacion <strong>{facturasPendientes.length}</strong></button>
        <button type="button" className={consentimientosPendientes ? 'patient-flow-warning' : ''} onClick={onOpenConsentimientos} disabled={!paciente}>CI pte. <strong>{consentimientosPendientes}</strong></button>
        <button type="button" onClick={onOpenDocumentos} disabled={!paciente}>Docs <strong>{documentos.length}</strong></button>
      </section>

      {/* COL IZQ — clínica: odontograma + observaciones */}
      <div className="patient-bento-col patient-bento-col-clinica">
        <PatientOdontogramSummary
          presupuestos={presupuestos}
          historial={historial}
          onOpenDetail={onOpenOdontogramaDetail}
        />

        <section className="patient-clinical-notes-card">
          <CardHead
            icon={<ClipboardList size={14} strokeWidth={2} />}
            title="Alertas y observaciones"
            status={hasAlertasReales ? 'revisar' : 'sin alertas'}
            statusTone={hasAlertasReales ? 'warning' : 'muted'}
            action={<button type="button" onClick={onEdit} disabled={!paciente}>Editar</button>}
          />
          <div className="patient-clinical-notes-body">
            <div>
              <b>Salud</b>
              {healthItems.length > 0 ? (
                <dl className="patient-health-list">
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
      <div className="patient-bento-col patient-bento-col-operativa">
      <section className="patient-next-card">
        <CardHead
          icon={<CalendarClock size={14} strokeWidth={2} />}
          title="Proxima cita"
          status={nextCita?.estado ?? 'sin cita'}
          statusTone={nextCita ? 'info' : 'muted'}
          action={<button type="button" onClick={onOpenCitas} disabled={!paciente}>Ver citas</button>}
        />
        <strong>{nextCita ? `${formatDate(nextCita.fecha_hora)} · ${nextCita.fecha_hora.slice(11, 16)}` : 'Sin cita programada'}</strong>
        <p><b>Tratamiento:</b> {nextTreatment}</p>
        <small>{nextComment}</small>
      </section>

      <section className="patient-last-card">
        <CardHead
          icon={<History size={14} strokeWidth={2} />}
          title="Ultima visita"
          status={lastVisit?.estado ?? 'sin historial'}
          statusTone={lastVisit ? 'success' : 'muted'}
          action={<button type="button" onClick={onOpenHistorial} disabled={!paciente}>Historial</button>}
        />
        <strong>{lastVisit ? `${formatDate(lastVisit.fecha)} · ${lastTreatment}` : 'Sin historial clinico'}</strong>
        <p><b>Comentario:</b> {lastComment}</p>
        <small>{lastVisit?.doctor?.nombre ? `Doctor: ${lastVisit.doctor.nombre}` : 'Sin profesional asociado'}</small>
      </section>

      <section className="patient-billing-card">
        <CardHead
          icon={<CreditCard size={14} strokeWidth={2} />}
          title="Cobros / facturas"
          status={facturasPendientes.length ? `${facturasPendientes.length} pte.` : 'al dia'}
          statusTone={facturasPendientes.length ? 'danger' : 'success'}
          action={<button type="button" onClick={onHistorialFacturas} disabled={!paciente}>Facturas</button>}
        />
        <div className="patient-billing-totals">
          <span><b>Saldo</b><strong className={totals.pendiente > 0 ? 'debt' : ''}>{money(totals.pendiente)}</strong></span>
          <span><b>Cobrado</b><strong>{money(totals.cobrado)}</strong></span>
          <span><b>Parciales</b><strong>{pagosParciales.length}</strong></span>
        </div>
        <div className="patient-billing-actions">
          <button type="button" onClick={() => onRegistrarCobro(facturasPendientes[0] ?? null)} disabled={!paciente}>
            {facturasPendientes.length ? 'Registrar cobro' : 'Registrar anticipo'}
          </button>
          <button type="button" onClick={onEmitirFactura} disabled={!paciente}>Emitir factura</button>
        </div>
        <div className="patient-billing-list">
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
      </section>
      </div>

      {/* COL DERECHA — administrativa: ficha rica + docs/CI */}
      <div className="patient-bento-col patient-bento-col-admin">
      <section className="patient-admin-card">
        <CardHead
          icon={<User size={14} strokeWidth={2} />}
          title="Datos administrativos"
          status={paciente?.num_historial ? `H ${paciente.num_historial}` : undefined}
          statusTone="info"
          action={<button type="button" onClick={onEdit} disabled={!paciente}>Editar</button>}
        />
        <dl className="patient-admin-grid">
          <div><dt>DNI / NIF</dt><dd>{paciente?.dni_nie || '—'}</dd></div>
          <div><dt>Nacimiento</dt><dd>{paciente?.fecha_nacimiento ? `${formatDate(paciente.fecha_nacimiento)}${edad !== null ? ` · ${edad} años` : ''}` : '—'}</dd></div>
          <div><dt>Sexo</dt><dd>{sexoLabel || '—'}</dd></div>
          <div><dt>Profesion</dt><dd>{paciente?.profesion || '—'}</dd></div>
          <div className="wide"><dt>Telefonos</dt><dd>{[paciente?.telefono, paciente?.telefono2].filter(Boolean).join(' / ') || '—'}</dd></div>
          <div className="wide"><dt>Email</dt><dd>{paciente?.email || '—'}</dd></div>
          <div className="wide"><dt>Direccion</dt><dd>{direccionCompleta || '—'}</dd></div>
          <div><dt>Pais</dt><dd>{paciente?.pais || '—'}</dd></div>
          <div><dt>Poliza</dt><dd>{paciente?.num_poliza || '—'}</dd></div>
          {paciente?.pagador_distinto && (
            <div className="wide"><dt>Pagador</dt><dd>{[paciente.pagador_nombre, paciente.pagador_dni].filter(Boolean).join(' · ') || 'Pagador distinto'}</dd></div>
          )}
          <div className="wide"><dt>1ª visita / Ultima</dt><dd>{paciente?.fecha_primera_visita ? formatDate(paciente.fecha_primera_visita) : '—'} · {paciente?.fecha_ultima_visita ? formatDate(paciente.fecha_ultima_visita) : '—'}</dd></div>
        </dl>
      </section>

      <section className="patient-documents-summary-card">
        <CardHead
          icon={<FileText size={14} strokeWidth={2} />}
          title="Documentos y consentimientos"
          status={consentimientosPendientes ? `${consentimientosPendientes} CI pte.` : `${documentos.length} docs · ${consentimientos.length} CI`}
          statusTone={consentimientosPendientes ? 'warning' : 'info'}
          action={<button type="button" onClick={onOpenDocumentos} disabled={!paciente}>Ver todos</button>}
        />
        <div className="patient-documents-summary-grid">
          <div>
            <strong>Ultimos documentos</strong>
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
        <footer className="patient-documents-summary-actions">
          <button type="button" onClick={onSubirDocumento} disabled={!paciente}>Subir doc.</button>
          <button type="button" onClick={onOpenConsentimientos} disabled={!paciente}>Nuevo CI</button>
        </footer>
      </section>
      </div>
    </div>
  );
}



export function PatientEditModal({
  paciente,
  doctores = [],
  onClose,
  onSave,
}: {
  paciente: ApiPaciente;
  doctores?: Doctor[];
  onClose: () => void;
  onSave: (data: Partial<ApiPaciente>) => void;
}) {
  const [form, setForm] = useState({
    nombre: paciente.nombre ?? '',
    apellidos: paciente.apellidos ?? '',
    fecha_nacimiento: paciente.fecha_nacimiento ?? '',
    dni_nie: paciente.dni_nie ?? '',
    telefono: paciente.telefono ?? '',
    telefono2: paciente.telefono2 ?? '',
    email: paciente.email ?? '',
    direccion: paciente.direccion ?? '',
    codigo_postal: paciente.codigo_postal ?? '',
    ciudad: paciente.ciudad ?? '',
    provincia: paciente.provincia ?? '',
    observaciones: paciente.observaciones ?? '',
    alergias: typeof paciente.datos_salud?.alergias === 'string' ? paciente.datos_salud.alergias : '',
    sexo: (paciente.sexo ?? '') as PacienteSexo | '',
    profesion: paciente.profesion ?? '',
    pais: paciente.pais ?? '',
    doctor_habitual_id: paciente.doctor_habitual_id ?? '',
    num_poliza: paciente.num_poliza ?? '',
    pagador_distinto: Boolean(paciente.pagador_distinto),
    pagador_nombre: paciente.pagador_nombre ?? '',
    pagador_dni: paciente.pagador_dni ?? '',
    pagador_direccion: paciente.pagador_direccion ?? '',
  });

  function setField<K extends keyof typeof form>(field: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      fecha_nacimiento: form.fecha_nacimiento || null,
      dni_nie: form.dni_nie || null,
      telefono: form.telefono || null,
      telefono2: form.telefono2 || null,
      email: form.email || null,
      direccion: form.direccion || null,
      codigo_postal: form.codigo_postal || null,
      ciudad: form.ciudad || null,
      provincia: form.provincia || null,
      observaciones: form.observaciones || null,
      datos_salud: { ...(paciente.datos_salud ?? {}), alergias: form.alergias },
      sexo: form.sexo || null,
      profesion: form.profesion.trim() || null,
      pais: form.pais.trim() || null,
      doctor_habitual_id: form.doctor_habitual_id || null,
      num_poliza: form.num_poliza.trim() || null,
      pagador_distinto: form.pagador_distinto,
      pagador_nombre: form.pagador_distinto ? form.pagador_nombre.trim() || null : null,
      pagador_dni: form.pagador_distinto ? form.pagador_dni.trim() || null : null,
      pagador_direccion: form.pagador_distinto ? form.pagador_direccion.trim() || null : null,
    });
  }

  return (
    <div className="modal-backdrop">
      <form className="patient-edit-modal" onSubmit={submit}>
        <div className="modal-titlebar">
          <strong>Editar ficha del paciente</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
        <div className="patient-edit-grid">
          <label>Nombre<input value={form.nombre} onChange={(event) => setField('nombre', event.target.value)} required /></label>
          <label>Apellidos<input value={form.apellidos} onChange={(event) => setField('apellidos', event.target.value)} required /></label>
          <label>F. nacimiento<input type="date" value={form.fecha_nacimiento} onChange={(event) => setField('fecha_nacimiento', event.target.value)} /></label>
          <label>N.I.F.<input value={form.dni_nie} onChange={(event) => setField('dni_nie', event.target.value)} /></label>
          <label>Teléfono<input value={form.telefono} onChange={(event) => setField('telefono', event.target.value)} /></label>
          <label>Móvil<input value={form.telefono2} onChange={(event) => setField('telefono2', event.target.value)} /></label>
          <label className="wide">E-mail<input value={form.email} onChange={(event) => setField('email', event.target.value)} /></label>
          <label className="wide">Dirección<input value={form.direccion} onChange={(event) => setField('direccion', event.target.value)} /></label>
          <label>Cód. postal<input value={form.codigo_postal} onChange={(event) => setField('codigo_postal', event.target.value)} /></label>
          <label>Población<input value={form.ciudad} onChange={(event) => setField('ciudad', event.target.value)} /></label>
          <label>Provincia<input value={form.provincia} onChange={(event) => setField('provincia', event.target.value)} /></label>
          <label className="wide">Alergias / contraindicaciones<textarea value={form.alergias} onChange={(event) => setField('alergias', event.target.value)} /></label>
          <label className="wide">Observaciones generales<textarea value={form.observaciones} onChange={(event) => setField('observaciones', event.target.value)} /></label>
        </div>
        <details className="patient-edit-extras" data-testid="patient-edit-extras">
          <summary>Datos adicionales</summary>
          <div className="patient-edit-grid">
            <label>Sexo
              <select value={form.sexo} onChange={(event) => setField('sexo', event.target.value as PacienteSexo | '')}>
                <option value="">—</option>
                <option value="M">Hombre</option>
                <option value="F">Mujer</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label>Profesión<input value={form.profesion} onChange={(event) => setField('profesion', event.target.value)} /></label>
            <label>País<input value={form.pais} onChange={(event) => setField('pais', event.target.value)} /></label>
            <label>Doctor habitual
              <select value={form.doctor_habitual_id} onChange={(event) => setField('doctor_habitual_id', event.target.value)}>
                <option value="">—</option>
                {doctores.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>{doctor.nombre}</option>
                ))}
              </select>
            </label>
            <label className="wide">Número de póliza<input value={form.num_poliza} onChange={(event) => setField('num_poliza', event.target.value)} /></label>
            <label className="wide checkbox-line">
              <input type="checkbox" checked={form.pagador_distinto} onChange={(event) => setField('pagador_distinto', event.target.checked)} />
              <span>Pagador de factura distinto del paciente</span>
            </label>
            {form.pagador_distinto && (
              <>
                <label className="wide">Pagador — nombre<input value={form.pagador_nombre} onChange={(event) => setField('pagador_nombre', event.target.value)} /></label>
                <label>Pagador — DNI/NIF<input value={form.pagador_dni} onChange={(event) => setField('pagador_dni', event.target.value)} /></label>
                <label className="wide">Pagador — dirección<input value={form.pagador_direccion} onChange={(event) => setField('pagador_direccion', event.target.value)} /></label>
              </>
            )}
          </div>
        </details>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit">Guardar ficha</button>
        </footer>
      </form>
    </div>
  );
}

export function NuevoPacienteModal({
  onClose,
  onSave,
  saving,
}: {
  onClose: () => void;
  onSave: (data: { nombre: string; apellidos: string; fecha_nacimiento?: string | null; dni_nie?: string | null; telefono?: string | null; telefono2?: string | null; email?: string | null; direccion?: string | null; codigo_postal?: string | null; ciudad?: string | null; provincia?: string | null; observaciones?: string | null }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    nombre: '',
    apellidos: '',
    fecha_nacimiento: '',
    dni_nie: '',
    telefono: '',
    telefono2: '',
    email: '',
    direccion: '',
    codigo_postal: '',
    ciudad: '',
    provincia: '',
    observaciones: '',
  });

  function setField(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.nombre.trim() || !form.apellidos.trim()) return;
    onSave({
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      fecha_nacimiento: form.fecha_nacimiento || null,
      dni_nie: form.dni_nie || null,
      telefono: form.telefono || null,
      telefono2: form.telefono2 || null,
      email: form.email || null,
      direccion: form.direccion || null,
      codigo_postal: form.codigo_postal || null,
      ciudad: form.ciudad || null,
      provincia: form.provincia || null,
      observaciones: form.observaciones || null,
    });
  }

  return (
    <div className="modal-backdrop">
      <form className="patient-edit-modal" onSubmit={submit}>
        <div className="modal-titlebar">
          <strong>Nueva ficha de paciente</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
        <div className="patient-edit-grid">
          <label>Nombre<input autoFocus value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} required /></label>
          <label>Apellidos<input value={form.apellidos} onChange={(e) => setField('apellidos', e.target.value)} required /></label>
          <label>F. nacimiento<input type="date" value={form.fecha_nacimiento} onChange={(e) => setField('fecha_nacimiento', e.target.value)} /></label>
          <label>N.I.F.<input value={form.dni_nie} onChange={(e) => setField('dni_nie', e.target.value)} /></label>
          <label>Teléfono<input value={form.telefono} onChange={(e) => setField('telefono', e.target.value)} /></label>
          <label>Móvil<input value={form.telefono2} onChange={(e) => setField('telefono2', e.target.value)} /></label>
          <label className="wide">E-mail<input value={form.email} onChange={(e) => setField('email', e.target.value)} /></label>
          <label className="wide">Dirección<input value={form.direccion} onChange={(e) => setField('direccion', e.target.value)} /></label>
          <label>Cód. postal<input value={form.codigo_postal} onChange={(e) => setField('codigo_postal', e.target.value)} /></label>
          <label>Población<input value={form.ciudad} onChange={(e) => setField('ciudad', e.target.value)} /></label>
          <label>Provincia<input value={form.provincia} onChange={(e) => setField('provincia', e.target.value)} /></label>
          <label className="wide">Observaciones<textarea value={form.observaciones} onChange={(e) => setField('observaciones', e.target.value)} /></label>
        </div>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={saving || !form.nombre.trim() || !form.apellidos.trim()}>
            {saving ? 'Creando...' : 'Crear paciente'}
          </button>
        </footer>
      </form>
    </div>
  );
}

export function PatientFullViewModal({
  paciente,
  facturas,
  historial,
  citas,
  presupuestos,
  documentos,
  consentimientos,
  laboratorio,
  onClose,
  onEdit,
  onOpenTab,
}: {
  paciente: ApiPaciente;
  facturas: Factura[];
  historial: HistorialClinico[];
  citas: Cita[];
  presupuestos: Presupuesto[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  laboratorio: TrabajoLaboratorio[];
  onClose: () => void;
  onEdit: () => void;
  onOpenTab: (tab: WorkTab) => void;
}) {
  const address = [paciente.direccion, paciente.codigo_postal, paciente.ciudad, paciente.provincia].filter(Boolean).join(' - ');
  const healthText = readableHealthData(paciente.datos_salud);
  const recentHistory = historial.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const nowIso = new Date().toISOString();
  const nextCita = citas
    .filter((cita) => cita.fecha_hora >= nowIso && !['anulada', 'falta', 'cancelled_by_patient'].includes(cita.estado))
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0] ?? null;
  const lastVisit = recentHistory[0] ?? null;
  const billingTotals = getBillingTotals(facturas);
  const tratamientosPendientes = presupuestos.flatMap((presupuesto) => presupuesto.lineas).filter((linea) => linea.aceptado && !linea.pasado_trabajo_pendiente);
  const initials = `${paciente.nombre?.[0] ?? ''}${paciente.apellidos?.[0] ?? ''}`.toUpperCase();

  function go(tab: WorkTab) {
    onOpenTab(tab);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <section className="patient-full-modal" aria-label="Vista completa del paciente">
        <header className="patient-full-head">
          <div className="patient-full-identity">
            <span className="patient-full-avatar">{initials}</span>
            <div>
              <span>Ficha completa</span>
              <strong>{fullName(paciente)}</strong>
              <em>Historia {paciente.num_historial} - {paciente.codigo ?? `#${String(paciente.num_historial).padStart(6, '0')}`}</em>
            </div>
          </div>
          <div className="patient-full-actions">
            <button type="button" onClick={() => go('facturacion')}>Historial / fact.</button>
            <button type="button" onClick={() => go('presupuestos')}>Presupuestos</button>
            <button type="button" onClick={onEdit}>Editar ficha</button>
            <button type="button" onClick={onClose}>Cerrar</button>
          </div>
        </header>

        <div className="patient-full-kpis">
          <div><span>Proxima cita</span><strong>{nextCita ? `${formatDate(nextCita.fecha_hora)} ${nextCita.fecha_hora.slice(11, 16)}` : 'Sin cita'}</strong><small>{nextCita?.motivo ?? 'No hay tratamiento previsto'}</small></div>
          <div><span>Ultima visita</span><strong>{lastVisit ? formatDate(lastVisit.fecha) : 'Sin historial'}</strong><small>{lastVisit?.procedimiento || lastVisit?.tratamiento?.nombre || 'Sin tratamiento registrado'}</small></div>
          <div><span>Pendiente</span><strong className={billingTotals.pendiente > 0 ? 'debt' : ''}>{money(billingTotals.pendiente)}</strong><small>Facturado {money(billingTotals.facturado)} - cobrado {money(billingTotals.cobrado)}</small></div>
          <div><span>Documentos</span><strong>{documentos.length}</strong><small>{consentimientos.length} consentimientos - {laboratorio.length} trabajos lab.</small></div>
        </div>

        <div className="patient-full-grid">
          <section>
            <h3>Datos personales</h3>
            <dl>
              <div><dt>Nombre</dt><dd>{paciente.apellidos}, {paciente.nombre}</dd></div>
              <div><dt>DNI/NIE</dt><dd>{paciente.dni_nie || '-'}</dd></div>
              <div><dt>Nacimiento</dt><dd>{formatDate(paciente.fecha_nacimiento) || '-'}</dd></div>
              <div><dt>Telefono</dt><dd>{paciente.telefono || '-'}</dd></div>
              <div><dt>Movil</dt><dd>{paciente.telefono2 || '-'}</dd></div>
              <div><dt>Email</dt><dd>{paciente.email || '-'}</dd></div>
              <div className="wide"><dt>Direccion</dt><dd>{address || '-'}</dd></div>
            </dl>
          </section>

          <section>
            <h3>Clinica y avisos</h3>
            <dl>
              <div className="wide"><dt>Salud</dt><dd>{healthText || 'Sin alertas registradas.'}</dd></div>
              <div className="wide"><dt>Observaciones generales</dt><dd>{paciente.observaciones || 'Sin observaciones generales.'}</dd></div>
            </dl>
          </section>

          <section className="span-2">
            <h3>Historial reciente</h3>
            <div className="patient-full-list">
              {recentHistory.slice(0, 6).map((entrada) => (
                <article key={entrada.id}>
                  <time>{formatDate(entrada.fecha)}</time>
                  <strong>{entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental'}</strong>
                  <span>Pieza {entrada.pieza_dental ?? '-'} - {entrada.estado}</span>
                  <small>{entrada.observaciones || entrada.diagnostico || 'Sin comentario.'}</small>
                </article>
              ))}
              {!recentHistory.length && <p>Sin entradas clinicas.</p>}
            </div>
          </section>

          <section>
            <h3>Presupuestos y pendientes</h3>
            <div className="patient-full-list compact">
              {tratamientosPendientes.slice(0, 5).map((linea) => (
                <article key={linea.id}>
                  <strong>{linea.tratamiento?.nombre ?? 'Tratamiento'}</strong>
                  <span>Pieza {linea.pieza_dental ?? '-'} - {money(linea.importe_neto)}</span>
                </article>
              ))}
              {!tratamientosPendientes.length && <p>Sin tratamientos pendientes aceptados.</p>}
            </div>
          </section>

          <section>
            <h3>Facturacion</h3>
            <div className="patient-full-list compact">
              {facturas.slice(0, 5).map((factura) => (
                <article key={factura.id}>
                  <strong>{factura.serie}-{factura.numero}</strong>
                  <span>{formatDate(factura.fecha)} - {factura.estado}</span>
                  <small>Total {money(factura.total)} - pendiente {money(factura.pendiente)}</small>
                </article>
              ))}
              {!facturas.length && <p>Sin facturas.</p>}
            </div>
          </section>

          <section>
            <h3>Proximas citas</h3>
            <div className="patient-full-list compact">
              {citas.filter((cita) => cita.fecha_hora >= nowIso).slice(0, 5).map((cita) => (
                <article key={cita.id}>
                  <strong>{formatDate(cita.fecha_hora)} {cita.fecha_hora.slice(11, 16)}</strong>
                  <span>{cita.motivo || 'Cita dental'} - {cita.estado}</span>
                  <small>{cita.observaciones || 'Sin observaciones.'}</small>
                </article>
              ))}
              {!citas.filter((cita) => cita.fecha_hora >= nowIso).length && <p>Sin citas proximas.</p>}
            </div>
          </section>

          <section>
            <h3>Documentos y consentimientos</h3>
            <div className="patient-full-list compact">
              {documentos.slice(0, 4).map((documento) => (
                <article key={documento.id}>
                  <strong>{documento.nombre_original}</strong>
                  <span>{documento.categoria} - {formatDate(documento.fecha_documento ?? documento.created_at)}</span>
                </article>
              ))}
              {consentimientos.slice(0, 3).map((consentimiento) => (
                <article key={consentimiento.id}>
                  <strong>{consentimiento.tipo}</strong>
                  <span>{consentimiento.estado} - {formatDate(consentimiento.created_at)}</span>
                </article>
              ))}
              {!documentos.length && !consentimientos.length && <p>Sin documentos ni consentimientos.</p>}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
