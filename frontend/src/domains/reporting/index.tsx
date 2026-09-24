import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../identity/session/AuthContext';
import { canRoleAccess } from '../../app/navigation/workflow';
import { getFacturas, openFacturaPdf } from '../../api/billing';
import { getReportCitasDoctor, getReportKpis, getReportPacientes, getReportTopTratamientos } from '../../api/reporting';
import { getTrabajosLaboratorio } from '../../api/laboratory';
import './reporting.css';

const LISTADOS = ['caja', 'pacientes', 'agenda', 'clinica', 'laboratorio', 'control'] as const;
type ListadoTab = typeof LISTADOS[number];

function money(value: string | number) {
  return `${Number(value || 0).toFixed(2).replace('.', ',')} EUR`;
}

function dateText(value?: string | null) {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month && year ? `${day}-${month}-${year}` : value;
}

export default function ListadosPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<ListadoTab>('caja');
  const today = new Date();
  const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const monthStart = `${todayText.slice(0, 7)}-01`;
  const [desde, setDesde] = useState(monthStart);
  const [hasta, setHasta] = useState(todayText);
  const period = { fecha_desde: desde, fecha_hasta: hasta };
  const invalidPeriod = !desde || !hasta || desde > hasta;
  const facturasQuery = useQuery({ queryKey: ['facturas-global'], queryFn: () => getFacturas(), enabled: tab === 'caja' });
  const kpisQuery = useQuery({ queryKey: ['report-kpis', period], queryFn: () => getReportKpis(period), enabled: !invalidPeriod });
  const pacientesQuery = useQuery({ queryKey: ['report-pacientes'], queryFn: getReportPacientes, enabled: tab === 'pacientes' });
  const topTratamientosQuery = useQuery({ queryKey: ['report-top-tratamientos', period], queryFn: () => getReportTopTratamientos(period), enabled: tab === 'clinica' && !invalidPeriod });
  const citasDoctorQuery = useQuery({ queryKey: ['report-citas-doctor', period], queryFn: () => getReportCitasDoctor(period), enabled: tab === 'agenda' && !invalidPeriod });
  const laboratorioQuery = useQuery({ queryKey: ['trabajos-laboratorio-pendientes'], queryFn: () => getTrabajosLaboratorio({ pendientes: true }), enabled: tab === 'laboratorio' });

  const facturas = (facturasQuery.data ?? []).filter((factura) => (!desde || factura.fecha.slice(0, 10) >= desde) && (!hasta || factura.fecha.slice(0, 10) <= hasta));
  const activeQuery = tab === 'caja' ? facturasQuery : tab === 'pacientes' ? pacientesQuery : tab === 'agenda' ? citasDoctorQuery : tab === 'clinica' ? topTratamientosQuery : tab === 'laboratorio' ? laboratorioQuery : kpisQuery;
  const kpis = kpisQuery.data;
  const canSeeCaja = canRoleAccess(user?.rol, ['admin', 'recepcion']);
  const canSeeClinica = canRoleAccess(user?.rol, ['admin', 'doctor']);

  function abrirFacturaPdf(facturaId: string) {
    void openFacturaPdf(facturaId).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo abrir la factura.');
    });
  }

  return (
    <section className="reporting-workspace" aria-label="Listados">
      <header className="reporting-toolbar">
        <h1>Listados</h1>
        {tab !== 'pacientes' && tab !== 'laboratorio' && <div className="reporting-period">
          <label>Desde<input type="date" value={desde} max={hasta || undefined} onChange={event => setDesde(event.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} min={desde || undefined} onChange={event => setHasta(event.target.value)} /></label>
          <button type="button" onClick={() => { setDesde(monthStart); setHasta(todayText); }}>Este mes</button>
        </div>}
        {tab === 'pacientes' && <span>Todos los pacientes</span>}
        {tab === 'laboratorio' && <span>Todos los trabajos pendientes</span>}
      </header>
      {canSeeCaja && tab === 'caja' && <div className="reporting-totals" aria-label="Resumen del periodo">
        <div><span>Facturado</span><strong>{kpis ? money(kpis.facturacion.total_facturado) : '—'}</strong></div>
        <div><span>Cobrado</span><strong>{kpis ? money(kpis.facturacion.total_cobrado) : '—'}</strong></div>
        <div><span>Pendiente</span><strong>{kpis ? money(kpis.facturacion.pendiente) : '—'}</strong></div>
      </div>}

      <nav className="reporting-tabs" aria-label="Tipo de listado">
        {LISTADOS.map((item) => (
          <button type="button" aria-pressed={tab === item} key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item === 'caja' && 'Caja/Facturas'}
            {item === 'pacientes' && 'Pacientes'}
            {item === 'agenda' && 'Agenda'}
            {item === 'clinica' && 'Clínica'}
            {item === 'laboratorio' && 'Laboratorio'}
            {item === 'control' && 'Control'}
          </button>
        ))}
      </nav>
      {invalidPeriod && <div className="inline-alert" role="alert">Selecciona un periodo válido: inicio y fin, en ese orden.</div>}
      {(activeQuery.isError || kpisQuery.isError) && <div className="inline-alert" role="alert">No se ha podido cargar el listado. <button type="button" onClick={() => { void activeQuery.refetch(); void kpisQuery.refetch(); }}>Reintentar</button></div>}
      {activeQuery.isLoading && <div className="reporting-status" role="status">Cargando listado…</div>}
      <div className="reporting-result" aria-busy={activeQuery.isFetching}>


      {tab === 'caja' && (
        <section className="reporting-panel">
          <div className="reporting-caption">
            <strong>Facturación, cobros y saldos</strong>
            {!canSeeCaja && <span className="access-pill locked">Importes visibles segun permisos</span>}
          </div>
          <table className="dentcore-table">
            <thead>
              <tr><th>Factura</th><th>Fecha</th><th>Estado</th><th>Total</th><th>Cobrado</th><th>Pendiente</th><th>Huella</th><th>PDF</th></tr>
            </thead>
            <tbody>
              {facturas.map((factura) => (
                <tr key={factura.id}>
                  <td>{factura.serie}-{String(factura.numero).padStart(4, '0')}</td>
                  <td>{dateText(factura.fecha)}</td>
                  <td>{factura.estado}</td>
                  <td className="num">{canSeeCaja ? money(factura.total) : '***'}</td>
                  <td className="num">{canSeeCaja ? money(factura.total_cobrado) : '***'}</td>
                  <td className="num">{canSeeCaja ? money(factura.pendiente) : '***'}</td>
                  <td className="hash-cell">{factura.huella?.slice(0, 14) ?? '-'}</td>
                  <td><button type="button" onClick={() => abrirFacturaPdf(factura.id)}>Abrir</button></td>
                </tr>
              ))}
              {!facturasQuery.isLoading && !facturasQuery.isError && !facturas.length && <tr><td colSpan={8}>Sin facturas en el listado.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'pacientes' && (
        <section className="reporting-panel">
          <div className="reporting-caption"><strong>Pacientes y saldos operativos</strong><span>Seguimiento y prioridad de llamada</span></div>
          <table className="dentcore-table">
            <thead><tr><th>Historial</th><th>Paciente</th><th>F. nacimiento</th><th>Citas</th><th>Saldo</th><th>Activo</th></tr></thead>
            <tbody>
              {(pacientesQuery.data ?? []).map((paciente) => (
                <tr key={paciente.id}>
                  <td>{paciente.num_historial}</td>
                  <td>{paciente.apellidos}, {paciente.nombre}</td>
                  <td>{dateText(paciente.fecha_nacimiento)}</td>
                  <td className="num">{paciente.total_citas}</td>
                  <td className="num">{canSeeCaja ? money(paciente.saldo_pendiente) : '***'}</td>
                  <td>{paciente.activo ? 'Si' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'agenda' && (
        <section className="reporting-panel">
          <div className="reporting-caption"><strong>Citas por doctor</strong><span>Actividad, asistencia y faltas</span></div>
          <table className="dentcore-table">
            <thead><tr><th>Doctor</th><th>Total citas</th><th>Atendidas</th><th>Faltas</th><th>Color agenda</th></tr></thead>
            <tbody>
              {(citasDoctorQuery.data ?? []).map((row) => (
                <tr key={row.doctor_id ?? row.doctor}>
                  <td>{row.doctor}</td><td className="num">{row.total}</td><td className="num">{row.atendidas}</td>
                  <td className="num">{row.faltas}</td><td>{row.color ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'clinica' && (
        <section className="reporting-panel">
          <div className="reporting-caption">
            <strong>Actividad clínica</strong>
            {!canSeeClinica && <span className="access-pill locked">Detalle clinico limitado para recepcion</span>}
          </div>
          <div className="reporting-totals">
            <div><span>Tratamientos realizados</span><strong>{kpis?.tratamientos_realizados ?? 0}</strong></div>
            <div><span>Presupuestos</span><strong>{kpis?.presupuestos.total ?? 0}</strong></div>
            <div><span>Pacientes nuevos</span><strong>{kpis?.pacientes_nuevos ?? 0}</strong></div>
            <div><span>Faltas</span><strong>{kpis?.citas.faltas ?? 0}</strong></div>
          </div>
          <table className="dentcore-table">
            <thead><tr><th>Tratamiento</th><th>Cantidad</th></tr></thead>
            <tbody>
              {(topTratamientosQuery.data ?? []).map((row) => (
                <tr key={row.tratamiento}><td>{canSeeClinica ? row.tratamiento : 'Tratamiento dental'}</td><td className="num">{row.cantidad}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'laboratorio' && (
        <section className="reporting-panel">
          <div className="reporting-caption"><strong>Trabajos de laboratorio pendientes</strong><span>Salida, recepcion, incidencia y entrega</span></div>
          <table className="dentcore-table">
            <thead><tr><th>Paciente</th><th>Laboratorio</th><th>Trabajo</th><th>Pieza</th><th>Estado</th><th>Entrega prevista</th><th>Precio</th></tr></thead>
            <tbody>
              {(laboratorioQuery.data ?? []).map((trabajo) => (
                <tr key={trabajo.id}>
                  <td>{trabajo.paciente ? `${trabajo.paciente.apellidos}, ${trabajo.paciente.nombre}` : ''}</td>
                  <td>{trabajo.laboratorio?.nombre ?? ''}</td>
                  <td>{trabajo.descripcion}</td>
                  <td>{trabajo.pieza_dental ?? ''}</td>
                  <td>{trabajo.estado}</td>
                  <td>{dateText(trabajo.fecha_entrega_prevista)}</td>
                  <td className="num">{canSeeCaja ? money(trabajo.precio ?? 0) : '***'}</td>
                </tr>
              ))}
              {!laboratorioQuery.isLoading && (laboratorioQuery.data ?? []).length === 0 && (
                <tr><td colSpan={7}>Sin trabajos pendientes.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'control' && (
        <section className="reporting-panel">
          <div className="reporting-caption"><strong>Cuadro de control</strong><span>Lo que una clinica necesita tener a mano</span></div>
          <div className="reporting-help">
            <div><strong>Recepcion</strong><span>Hoy, llamadas, huecos, pacientes nuevos, avisos y cobros pendientes.</span></div>
            <div><strong>Doctor</strong><span>Agenda propia, historia clinica, planes, realizados y laboratorio.</span></div>
            <div><strong>Direccion</strong><span>Produccion, caja, pendientes, faltas, presupuestos y actividad por doctor.</span></div>
            <div><strong>Privacidad</strong><span>Acceso por rol, descarga no-cache, auditoria y separacion clinica/fiscal.</span></div>
          </div>
        </section>
      )}
      </div>
    </section>
  );
}
