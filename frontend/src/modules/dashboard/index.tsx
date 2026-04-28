import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { getCitas, getReportKpis, getReportPacientes, getTrabajosLaboratorio } from '../../lib/api';

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

export default function DashboardPage() {
  const { user } = useAuth();
  const day = todayIso();
  const isAdmin = user?.rol === 'admin';
  const citasQuery = useQuery({
    queryKey: ['dashboard-citas', day],
    queryFn: () => getCitas({ fecha_desde: `${day}T00:00:00`, fecha_hasta: `${day}T23:59:59` }),
  });
  const kpisQuery = useQuery({ queryKey: ['dashboard-kpis'], queryFn: getReportKpis });
  const pacientesQuery = useQuery({ queryKey: ['dashboard-pacientes'], queryFn: getReportPacientes });
  const labQuery = useQuery({ queryKey: ['dashboard-lab'], queryFn: () => getTrabajosLaboratorio({ pendientes: true }) });

  const citas = citasQuery.data ?? [];
  const kpis = kpisQuery.data;
  const pacientesConSaldo = (pacientesQuery.data ?? []).filter((paciente) => paciente.saldo_pendiente > 0).slice(0, 6);
  const enClinica = citas.filter((cita) => cita.estado === 'en_clinica');
  const confirmar = citas.filter((cita) => cita.estado === 'programada');
  const fallidas = citas.filter((cita) => ['falta', 'anulada'].includes(cita.estado));
  const lab = labQuery.data ?? [];

  return (
    <section className="page dashboard-screen">
      <header className="dashboard-hero">
        <div>
          <p className="eyebrow">Inicio</p>
          <h1>Trabajo de hoy</h1>
          <span>{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} - {user?.nombre}</span>
        </div>
        <nav className="dashboard-actions">
          <Link to="/agenda">Abrir agenda</Link>
          <Link to="/pacientes">Buscar paciente</Link>
          {isAdmin && <Link to="/listados">Caja y listados</Link>}
          {isAdmin && <Link to="/ajustes">Ajustes generales</Link>}
        </nav>
      </header>

      <nav className="dashboard-flow">
        <Link to="/pacientes"><strong>Pacientes</strong><span>Ficha, primera visita, presupuestos y tratamientos</span></Link>
        <Link to="/agenda"><strong>Agenda</strong><span>Huecos, llamadas, estados y recordatorios</span></Link>
        {isAdmin && <Link to="/listados"><strong>Gestion</strong><span>Caja, reportes, deuda y laboratorio</span></Link>}
        {isAdmin && <Link to="/ajustes"><strong>Ajustes</strong><span>Doctores, precios, roles, colores y horarios</span></Link>}
      </nav>

      <div className="dashboard-metrics">
        <div><span>Citas hoy</span><strong>{citas.length}</strong><small>{enClinica.length} en clinica</small></div>
        <div><span>Pendientes confirmar</span><strong>{confirmar.length}</strong><small>llamar o enviar aviso</small></div>
        <div><span>Facturacion</span><strong>{money(kpis?.facturacion.total_facturado ?? 0)}</strong><small>{money(kpis?.facturacion.pendiente ?? 0)} pendiente</small></div>
        <div><span>Laboratorio</span><strong>{lab.length}</strong><small>trabajos activos</small></div>
      </div>

      <main className="dashboard-grid">
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

        {isAdmin && (
          <section className="dashboard-panel">
            <div className="panel-caption"><strong>Pacientes con deuda</strong><span>prioridad de caja</span></div>
            <table className="euro-table">
              <thead><tr><th>Historia</th><th>Paciente</th><th>Saldo</th></tr></thead>
              <tbody>
                {pacientesConSaldo.map((paciente) => (
                  <tr key={paciente.id}>
                    <td>{paciente.num_historial}</td>
                    <td>{paciente.apellidos}, {paciente.nombre}</td>
                    <td className="num">{money(paciente.saldo_pendiente)}</td>
                  </tr>
                ))}
                {!pacientesConSaldo.length && <tr><td colSpan={3}>Sin saldos pendientes destacados.</td></tr>}
              </tbody>
            </table>
          </section>
        )}

        <section className="dashboard-panel">
          <div className="panel-caption"><strong>Alertas</strong><span>confirmacion, asistencia y pendientes</span></div>
          <div className="alert-list">
            <div><strong>{confirmar.length}</strong><span>citas pendientes de confirmar</span></div>
            <div><strong>{fallidas.length}</strong><span>canceladas o no asistidas hoy</span></div>
            <div><strong>{enClinica.length}</strong><span>pacientes actualmente en clinica</span></div>
            <div><strong>{kpis?.citas.faltas ?? 0}</strong><span>faltas en el periodo</span></div>
          </div>
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
