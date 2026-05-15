import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { ApiPaciente, Cita, Consentimiento, DocumentoPaciente, Factura, HistorialClinico, Presupuesto, TrabajoLaboratorio } from '../../types/api';
import { formatDate, fullName, money } from '../../lib/utils';
import type { WorkTab } from './index';
import { getBillingTotals, getFacturasPendientes, getFacturasRecientes, getPagosParciales } from './billingUtils';
import { PatientOdontogramFlow } from '../odontogram';

function readableHealthData(datos?: Record<string, unknown> | null) {
  if (!datos) return '';
  return Object.entries(datos)
    .filter(([key]) => !['temporal', 'pendiente_completar'].includes(key))
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('\n');
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
    const q = query.trim().toLowerCase();
    if (!q) return pacientes.slice(0, 12);
    return pacientes.filter((p) =>
      `${p.num_historial} ${p.codigo ?? ''} ${p.nombre} ${p.apellidos} ${p.telefono ?? ''}`.toLowerCase().includes(q),
    ).slice(0, 10);
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
          {!filtered.length && <span>No hay pacientes con ese criterio.</span>}
        </div>
      )}
    </div>
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
  onOpenPresupuestos,
  onOpenPendientes,
  onOpenRealizados,
  onOpenFacturacion,
  onOpenHistorial,
  onOpenDocumentos,
  onOpenConsentimientos,
  onOpenLaboratorio,
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
  onOpenPresupuestos: () => void;
  onOpenPendientes: () => void;
  onOpenRealizados: () => void;
  onOpenFacturacion: () => void;
  onOpenHistorial: () => void;
  onOpenDocumentos: () => void;
  onOpenConsentimientos: () => void;
  onOpenLaboratorio: () => void;
  onEmitirFactura: () => void;
  onRegistrarCobro: (factura?: Factura | null) => void;
  onHistorialFacturas: () => void;
}) {
  const totals = getBillingTotals(facturas);
  const temporal = paciente?.observaciones?.toLowerCase().includes('temporal');
  const address = [paciente?.direccion, paciente?.codigo_postal, paciente?.ciudad, paciente?.provincia].filter(Boolean).join(' - ');
  const initials = paciente ? `${paciente.nombre?.[0] ?? ''}${paciente.apellidos?.[0] ?? ''}`.toUpperCase() : '--';
  const healthText = readableHealthData(paciente?.datos_salud);
  const recentHistory = historial.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const lastVisit = recentHistory[0] ?? null;
  const nowIso = new Date().toISOString();
  const nextCita = citas
    .filter((cita) => cita.fecha_hora >= nowIso && !['anulada', 'falta'].includes(cita.estado))
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0] ?? null;
  const lastTreatment = lastVisit?.procedimiento || lastVisit?.tratamiento?.nombre || 'Sin tratamiento registrado';
  const lastComment = lastVisit?.observaciones || lastVisit?.diagnostico || 'Sin comentario clinico en esta entrada.';
  const nextTreatment = nextCita?.motivo || 'Sin tratamiento indicado';
  const nextComment = nextCita?.observaciones || 'Sin observaciones para la cita.';
  const pendientes = presupuestos.flatMap((presupuesto) => presupuesto.lineas).filter((linea) => linea.aceptado && !linea.pasado_trabajo_pendiente);
  const realizados = historial.filter((item) => ['realizado', 'facturado', 'cobrado_parcial', 'cobrado_completo'].includes(item.estado));
  const alertText = healthText || paciente?.observaciones || 'Sin alertas ni observaciones generales.';
  const facturasPendientes = getFacturasPendientes(facturas);
  const ultimaFacturas = getFacturasRecientes(facturas);
  const pagosParciales = getPagosParciales(facturas);

  return (
    <div className="patient-form-grid patient-hub-grid">
      {temporal && (
        <button type="button" className="temporary-patient-banner" onClick={onEdit}>
          Paciente temporal: completar datos en clinica
        </button>
      )}
      <section className="patient-hub-head">
        <div className="patient-avatar">{initials}</div>
        <div className="patient-hub-identity">
          <span>Paciente</span>
          <strong>{fullName(paciente) || 'Sin seleccionar'}</strong>
          <em>H {paciente?.num_historial ?? '-'} - {paciente?.telefono || paciente?.telefono2 || 'sin telefono'} - {paciente?.dni_nie || 'sin DNI'}</em>
        </div>
        <div className="patient-hub-alert">
          <span>Alertas / obs.</span>
          <strong>{alertText}</strong>
        </div>
        <div className="patient-hub-balance">
          <span>Saldo</span>
          <strong className={totals.pendiente > 0 ? 'debt' : ''}>{money(totals.pendiente)}</strong>
          <em>{money(totals.cobrado)} cobrado</em>
        </div>
        <div className="patient-hub-head-actions">
          <button type="button" onClick={onOpenFull} disabled={!paciente}>Vista completa</button>
          <button type="button" onClick={onEdit} disabled={!paciente}>Editar</button>
        </div>
      </section>

      <section className="patient-flow-strip" aria-label="Flujo clinico del paciente">
        <button type="button" onClick={onOpenCitas} disabled={!paciente}>Citas <strong>{citas.length}</strong></button>
        <button type="button" onClick={onOpenPresupuestos} disabled={!paciente}>Presupuestos <strong>{presupuestos.length}</strong></button>
        <button type="button" onClick={onOpenPendientes} disabled={!paciente}>Pendientes <strong>{pendientes.length}</strong></button>
        <button type="button" onClick={onOpenRealizados} disabled={!paciente}>Realizados <strong>{realizados.length}</strong></button>
        <button type="button" onClick={onOpenFacturacion} disabled={!paciente}>Facturacion <strong>{facturasPendientes.length}</strong></button>
        <button type="button" onClick={onOpenDocumentos} disabled={!paciente}>Docs <strong>{documentos.length}</strong></button>
      </section>

      <PatientOdontogramFlow
        paciente={paciente}
        mode="reading"
        title="Odontograma actual"
        subtitle="Vista rapida de lectura del estado clinico del paciente."
        readOnly
        enableQuickTreatments={false}
        className="patient-summary-odontogram odontogram-summary-flow"
      />

      <section className="patient-next-card">
        <div className="patient-card-head">
          <h3>Proxima cita</h3>
          <div className="patient-card-head-right">
            <span>{nextCita?.estado ?? 'sin cita'}</span>
            <button type="button" onClick={onOpenCitas} disabled={!paciente}>Ver citas</button>
          </div>
        </div>
        <strong>{nextCita ? `${formatDate(nextCita.fecha_hora)} - ${nextCita.fecha_hora.slice(11, 16)}` : 'Sin cita programada'}</strong>
        <p><b>Tratamiento:</b> {nextTreatment}</p>
        <small>{nextComment}</small>
      </section>

      <section className="patient-last-card">
        <div className="patient-card-head">
          <h3>Ultima visita</h3>
          <div className="patient-card-head-right">
            <span>{lastVisit?.estado ?? 'sin historial'}</span>
            <button type="button" onClick={onOpenHistorial} disabled={!paciente}>Historial</button>
          </div>
        </div>
        <strong>{lastVisit ? `${formatDate(lastVisit.fecha)} - ${lastTreatment}` : 'Sin historial clinico'}</strong>
        <p><b>Comentario:</b> {lastComment}</p>
        <small>{lastVisit?.doctor?.nombre ? `Doctor: ${lastVisit.doctor.nombre}` : 'Sin profesional asociado'}</small>
      </section>

      <section className="patient-billing-card">
        <div className="patient-card-head">
          <h3>Cobros / facturas</h3>
          <div className="patient-card-head-right">
            <span>{facturasPendientes.length ? `${facturasPendientes.length} pendientes` : 'al dia'}</span>
            <button type="button" onClick={onHistorialFacturas} disabled={!paciente}>Facturas</button>
          </div>
        </div>
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
          {ultimaFacturas.map((factura) => (
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

      <section className="patient-side-card patient-hub-side-card">
        <div>
          <h3>Datos</h3>
          <p><b>Tel.</b> {paciente?.telefono || paciente?.telefono2 || 'Sin telefono'}</p>
          <p><b>Email</b> {paciente?.email || 'Sin email'}</p>
          <p><b>Dir.</b> {address || 'Sin direccion'}</p>
          <button type="button" onClick={onEdit} disabled={!paciente}>Editar datos</button>
        </div>
        <div>
          <h3>Observaciones / alertas</h3>
          <p>{healthText || 'Sin alertas de salud registradas.'}</p>
          <p>{paciente?.observaciones || 'Sin observaciones generales.'}</p>
          <button type="button" onClick={onOpenFull} disabled={!paciente}>Ver ficha completa</button>
        </div>
        <details className="patient-secondary-links">
          <summary>Mas secciones</summary>
          <div className="patient-hub-mini-links">
            <button type="button" onClick={onOpenConsentimientos} disabled={!paciente}>Consentimientos <span>{consentimientos.length}</span></button>
            <button type="button" onClick={onOpenLaboratorio} disabled={!paciente}>Laboratorio <span>{laboratorio.length}</span></button>
            <button type="button" onClick={onOpenHistorial} disabled={!paciente}>Historial / facturacion</button>
          </div>
        </details>
      </section>
    </div>
  );
}

export function PatientEditModal({
  paciente,
  onClose,
  onSave,
}: {
  paciente: ApiPaciente;
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
  });

  function setField(field: keyof typeof form, value: string) {
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
    .filter((cita) => cita.fecha_hora >= nowIso && !['anulada', 'falta'].includes(cita.estado))
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
