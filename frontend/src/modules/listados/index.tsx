import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { canRoleAccess } from '../../config/workflow';
import {
  facturaPdfUrl,
  getFacturas,
  getReportCitasDoctor,
  getReportKpis,
  getReportPacientes,
  getReportTopTratamientos,
  getTrabajosLaboratorio,
} from '../../lib/api';

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
  const facturasQuery = useQuery({ queryKey: ['facturas-global'], queryFn: () => getFacturas() });
  const kpisQuery = useQuery({ queryKey: ['report-kpis'], queryFn: getReportKpis });
  const pacientesQuery = useQuery({ queryKey: ['report-pacientes'], queryFn: getReportPacientes });
  const topTratamientosQuery = useQuery({ queryKey: ['report-top-tratamientos'], queryFn: getReportTopTratamientos });
  const citasDoctorQuery = useQuery({ queryKey: ['report-citas-doctor'], queryFn: getReportCitasDoctor });
  const laboratorioQuery = useQuery({ queryKey: ['trabajos-laboratorio-pendientes'], queryFn: () => getTrabajosLaboratorio({ pendientes: true }) });

  const facturas = facturasQuery.data ?? [];
  const kpis = kpisQuery.data;
  const canSeeCaja = canRoleAccess(user?.rol, ['admin', 'recepcion']);
  const canSeeClinica = canRoleAccess(user?.rol, ['admin', 'doctor']);

  return (
    <section className="page listados-screen">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Listados</p>
          <h1>Control diario, caja, clinica y actividad</h1>
        </div>
        <div className="metric-inline"><span>Facturado</span><strong>{money(kpis?.facturacion.total_facturado ?? 0)}</strong></div>
        <div className="metric-inline"><span>Cobrado</span><strong>{money(kpis?.facturacion.total_cobrado ?? 0)}</strong></div>
        <div className="metric-inline"><span>Pendiente</span><strong>{money(kpis?.facturacion.pendiente ?? 0)}</strong></div>
      </div>

      <nav className="file-tabs">
        {LISTADOS.map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item === 'caja' && 'Caja/Facturas'}
            {item === 'pacientes' && 'Pacientes'}
            {item === 'agenda' && 'Agenda'}
            {item === 'clinica' && 'Clinica'}
            {item === 'laboratorio' && 'Protesicos'}
            {item === 'control' && 'Control'}
          </button>
        ))}
      </nav>

      {tab === 'caja' && (
        <section className="desk-panel">
          <div className="panel-caption">
            <strong>Facturacion, cobros y saldos</strong>
            {!canSeeCaja && <span className="access-pill locked">Importes visibles segun permisos</span>}
          </div>
          <table className="euro-table">
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
                  <td><a href={facturaPdfUrl(factura.id)} target="_blank" rel="noreferrer">Abrir</a></td>
                </tr>
              ))}
              {!facturas.length && <tr><td colSpan={8}>Sin facturas en el listado.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'pacientes' && (
        <section className="desk-panel">
          <div className="panel-caption"><strong>Pacientes y saldos operativos</strong><span>Busqueda, seguimiento y prioridad de llamada</span></div>
          <table className="euro-table">
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
        <section className="desk-panel">
          <div className="panel-caption"><strong>Citas por doctor</strong><span>Actividad, asistencia y faltas</span></div>
          <table className="euro-table">
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
        <section className="desk-panel">
          <div className="panel-caption">
            <strong>Actividad clinica</strong>
            {!canSeeClinica && <span className="access-pill locked">Detalle clinico limitado para recepcion</span>}
          </div>
          <div className="metrics-strip">
            <div><span>Tratamientos realizados</span><strong>{kpis?.tratamientos_realizados ?? 0}</strong></div>
            <div><span>Presupuestos</span><strong>{kpis?.presupuestos.total ?? 0}</strong></div>
            <div><span>Pacientes nuevos</span><strong>{kpis?.pacientes_nuevos ?? 0}</strong></div>
            <div><span>Faltas</span><strong>{kpis?.citas.faltas ?? 0}</strong></div>
          </div>
          <table className="euro-table">
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
        <section className="desk-panel">
          <div className="panel-caption"><strong>Trabajos de laboratorio pendientes</strong><span>Salida, recepcion, incidencia y entrega</span></div>
          <table className="euro-table">
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
        <section className="desk-panel control-map">
          <div className="panel-caption"><strong>Cuadro de control</strong><span>Lo que una clinica necesita tener a mano</span></div>
          <div className="file-card-grid documents-map">
            <div><strong>Recepcion</strong><span>Hoy, llamadas, huecos, pacientes nuevos, avisos y cobros pendientes.</span></div>
            <div><strong>Doctor</strong><span>Agenda propia, historia clinica, planes, realizados y laboratorio.</span></div>
            <div><strong>Direccion</strong><span>Produccion, caja, pendientes, faltas, presupuestos y actividad por doctor.</span></div>
            <div><strong>Privacidad</strong><span>Acceso por rol, descarga no-cache, auditoria y separacion clinica/fiscal.</span></div>
          </div>
        </section>
      )}
    </section>
  );
}
