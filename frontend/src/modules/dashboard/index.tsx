import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { getCitas, getReportDashboard, getTrabajosLaboratorio } from '../../lib/api';

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function money(value: string | number) {
  return `${Number(value || 0).toFixed(2).replace('.', ',')} EUR`;
}

function hour(value: string) {
  return value.slice(11, 16);
}

function monthName(month: number) {
  return new Date(2026, month - 1, 1).toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
}

function pct(value: number) {
  return `${Number(value || 0).toFixed(1).replace('.', ',')}%`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const day = todayIso();
  const isAdmin = user?.rol === 'admin';
  const citasQuery = useQuery({
    queryKey: ['dashboard-citas', day],
    queryFn: () => getCitas({ fecha_desde: `${day}T00:00:00`, fecha_hasta: `${day}T23:59:59` }),
  });
  const dashboardQuery = useQuery({ queryKey: ['dashboard-bi'], queryFn: getReportDashboard });
  const labQuery = useQuery({ queryKey: ['dashboard-lab'], queryFn: () => getTrabajosLaboratorio({ pendientes: true }) });

  const citas = citasQuery.data ?? [];
  const dashboard = dashboardQuery.data;
  const kpis = dashboard?.kpis;
  const enClinica = citas.filter((cita) => cita.estado === 'en_clinica');
  const confirmar = citas.filter((cita) => ['programada', 'sin_confirmar'].includes(cita.estado));
  const fallidas = citas.filter((cita) => ['falta', 'anulada'].includes(cita.estado));
  const lab = labQuery.data ?? [];
  const meses = dashboard?.series.ingresos_mensuales ?? [];
  const maxMes = Math.max(...meses.map((item) => item.facturado), 1);
  const hasError = citasQuery.isError || dashboardQuery.isError || labQuery.isError;

  return (
    <section className="page dashboard-screen">
      <header className="dashboard-hero">
        <div>
          <p className="eyebrow">Inicio</p>
          <h1>Trabajo de hoy</h1>
          <span>{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} - {user?.nombre}</span>
        </div>
        <nav className="dashboard-actions">
          <Link to="/agenda">Agenda</Link>
          <Link to="/pacientes">Pacientes</Link>
          {isAdmin && <Link to="/listados">Listados</Link>}
          {isAdmin && <Link to="/configuracion">Ajustes</Link>}
        </nav>
      </header>

      {hasError && (
        <div className="inline-alert">
          No se han podido cargar todos los datos del inicio. Puedes seguir trabajando y reintentar al cambiar de pantalla.
        </div>
      )}

      {(citasQuery.isLoading || dashboardQuery.isLoading) && (
        <div className="dashboard-loading" aria-label="Cargando dashboard">
          <span />
          <span />
          <span />
        </div>
      )}

      <nav className="dashboard-flow">
        <Link to="/pacientes"><strong>Pacientes</strong><span>Ficha, primera visita, presupuestos y tratamientos</span></Link>
        <Link to="/agenda"><strong>Agenda</strong><span>Huecos, llamadas, estados y recordatorios</span></Link>
        {isAdmin && <Link to="/listados"><strong>Listados</strong><span>Caja, deuda, actividad y laboratorio</span></Link>}
        {isAdmin && <Link to="/configuracion"><strong>Ajustes</strong><span>Doctores, precios, roles, colores y horarios</span></Link>}
      </nav>

      <div className="dashboard-metrics">
        <div><span>Citas hoy</span><strong>{citas.length}</strong><small>{enClinica.length} en clinica</small></div>
        <div><span>Sin confirmar</span><strong>{confirmar.length}</strong><small>llamar o enviar aviso</small></div>
        <div><span>Facturado mes</span><strong>{money(kpis?.facturacion.total_facturado ?? 0)}</strong><small>{money(kpis?.facturacion.pendiente ?? 0)} pendiente</small></div>
        <div><span>Laboratorio</span><strong>{lab.length}</strong><small>trabajos activos</small></div>
      </div>

      <main className="dashboard-grid dashboard-grid-bi">
        <section className="dashboard-panel schedule-panel">
          <div className="panel-caption"><strong>Citas de hoy</strong><span>flujo de recepcion, auxiliar y doctor</span></div>
          <table className="euro-table">
            <thead><tr><th>Hora</th><th>Paciente</th><th>Doctor</th><th>Tratamiento</th><th>Estado</th></tr></thead>
            <tbody>
              {citas.map((cita) => (
                <tr key={cita.id}>
                  <td>{hour(cita.fecha_hora)}</td>
                  <td>{cita.paciente ? `${cita.paciente.apellidos}, ${cita.paciente.nombre}` : 'Paciente'}</td>
                  <td>{cita.doctor?.nombre ?? ''}</td>
                  <td>{cita.motivo ?? ''}</td>
                  <td><span className={`status-pill status-${cita.estado}`}>{cita.estado}</span></td>
                </tr>
              ))}
              {!citas.length && <tr><td colSpan={5}>Sin citas para hoy.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="dashboard-panel">
          <div className="panel-caption"><strong>Alertas operativas</strong><span>lo que requiere accion</span></div>
          <div className="alert-list">
            <div><strong>{dashboard?.alertas.citas_sin_confirmar ?? confirmar.length}</strong><span>citas sin confirmar</span></div>
            <div><strong>{fallidas.length}</strong><span>canceladas o no asistidas hoy</span></div>
            <div><strong>{dashboard?.alertas.pacientes_en_clinica ?? enClinica.length}</strong><span>pacientes en clinica</span></div>
            <div><strong>{dashboard?.alertas.presupuestos_pendientes ?? 0}</strong><span>presupuestos pendientes</span></div>
          </div>
        </section>

        {isAdmin && (
          <section className="dashboard-panel">
            <div className="panel-caption"><strong>Evolucion mensual</strong><span>facturado y cobrado</span></div>
            <div className="bi-bars dashboard-month-bars">
              {meses.map((mes) => (
                <div key={mes.mes}>
                  <span>{monthName(mes.mes)}</span>
                  <strong>{money(mes.facturado)}</strong>
                  <i style={{ width: `${Math.max(3, (mes.facturado / maxMes) * 100)}%` }} title={`Cobrado: ${money(mes.cobrado)}`} />
                </div>
              ))}
            </div>
          </section>
        )}

        {isAdmin && (
          <section className="dashboard-panel">
            <div className="panel-caption"><strong>Pacientes con deuda</strong><span>prioridad de caja</span></div>
            <table className="euro-table">
              <thead><tr><th>Historia</th><th>Paciente</th><th>Saldo</th></tr></thead>
              <tbody>
                {(dashboard?.pacientes_deuda ?? []).map((paciente) => (
                  <tr key={paciente.id}>
                    <td>{paciente.num_historial}</td>
                    <td>{paciente.apellidos}, {paciente.nombre}</td>
                    <td className="num">{money(paciente.saldo_pendiente)}</td>
                  </tr>
                ))}
                {!(dashboard?.pacientes_deuda ?? []).length && <tr><td colSpan={3}>Sin saldos pendientes destacados.</td></tr>}
              </tbody>
            </table>
          </section>
        )}

        {isAdmin && (
          <section className="dashboard-panel">
            <div className="panel-caption"><strong>Doctores</strong><span>actividad y ocupacion</span></div>
            <table className="euro-table">
              <thead><tr><th>Doctor</th><th>Citas</th><th>Atendidas</th><th>Faltas</th><th>Ocup.</th></tr></thead>
              <tbody>
                {(dashboard?.doctores ?? []).map((row) => (
                  <tr key={row.doctor_id ?? row.doctor}>
                    <td><span className="doctor-dot" style={{ background: row.color ?? '#6b7280' }} />{row.doctor}</td>
                    <td className="num">{row.total}</td>
                    <td className="num">{row.atendidas}</td>
                    <td className="num">{row.faltas}</td>
                    <td className="num">{pct(row.ocupacion_pct ?? 0)}</td>
                  </tr>
                ))}
                {!(dashboard?.doctores ?? []).length && <tr><td colSpan={5}>Sin actividad por doctor en el periodo.</td></tr>}
              </tbody>
            </table>
          </section>
        )}

        <section className="dashboard-panel">
          <div className="panel-caption"><strong>Tratamientos top</strong><span>produccion clinica</span></div>
          <table className="euro-table">
            <thead><tr><th>Tratamiento</th><th>Cant.</th>{isAdmin && <th>Importe</th>}</tr></thead>
            <tbody>
              {(dashboard?.tratamientos ?? []).map((row) => (
                <tr key={row.tratamiento}>
                  <td>{row.tratamiento}</td>
                  <td className="num">{row.cantidad}</td>
                  {isAdmin && <td className="num">{money(row.importe ?? 0)}</td>}
                </tr>
              ))}
              {!(dashboard?.tratamientos ?? []).length && <tr><td colSpan={isAdmin ? 3 : 2}>Sin tratamientos en el periodo.</td></tr>}
            </tbody>
          </table>
        </section>

        {isAdmin && (
          <section className="dashboard-panel">
            <div className="panel-caption"><strong>Laboratorio</strong><span>proximas entregas</span></div>
            <table className="euro-table">
              <thead><tr><th>Paciente</th><th>Trabajo</th><th>Estado</th><th>Entrega</th></tr></thead>
              <tbody>
                {lab.slice(0, 6).map((trabajo) => (
                  <tr key={trabajo.id}>
                    <td>{trabajo.paciente ? `${trabajo.paciente.apellidos}, ${trabajo.paciente.nombre}` : ''}</td>
                    <td>{trabajo.descripcion}</td>
                    <td>{trabajo.estado}</td>
                    <td>{trabajo.fecha_entrega_prevista ?? ''}</td>
                  </tr>
                ))}
                {!lab.length && <tr><td colSpan={4}>Sin trabajos pendientes.</td></tr>}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </section>
  );
}
