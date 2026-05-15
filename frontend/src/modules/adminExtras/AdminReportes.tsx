import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getReportCitasDoctor,
  getReportDashboard,
  getReportKpis,
  getReportPacientes,
  getReportTopTratamientos,
} from '../../lib/api';

type ReportKind = 'resumen' | 'financiero' | 'agenda' | 'pacientes' | 'tratamientos' | 'doctores';

const REPORT_TYPES: Array<{ id: ReportKind; label: string; description: string }> = [
  { id: 'resumen', label: 'Resumen general', description: 'KPIs principales de direccion.' },
  { id: 'financiero', label: 'Financiero', description: 'Facturado, cobrado, pendiente y ticket medio.' },
  { id: 'agenda', label: 'Agenda', description: 'Citas, faltas y estados.' },
  { id: 'pacientes', label: 'Pacientes', description: 'Pacientes con actividad, citas y saldo.' },
  { id: 'tratamientos', label: 'Tratamientos', description: 'Produccion por tratamiento.' },
  { id: 'doctores', label: 'Doctores', description: 'Actividad y ocupacion por doctor.' },
];

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function monthStartIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function money(value?: number | string | null) {
  return `${Number(value || 0).toFixed(2).replace('.', ',')} EUR`;
}

function pct(value?: number | null) {
  return `${Number(value || 0).toFixed(1).replace('.', ',')}%`;
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const content = [headers.join(';'), ...rows.map((row) => headers.map((header) => escape(row[header])).join(';'))].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function BarValue({ value, max, color }: { value: number; max: number; color?: string | null }) {
  const width = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
  return (
    <span className="admin-report-bar">
      <i style={{ width: `${width}%`, background: color || undefined }} />
      <b>{value}</b>
    </span>
  );
}

export function AdminReportes() {
  const [desde, setDesde] = useState(monthStartIso());
  const [hasta, setHasta] = useState(todayIso());
  const [reportKind, setReportKind] = useState<ReportKind>('resumen');
  const params = useMemo(() => ({ fecha_desde: desde, fecha_hasta: hasta }), [desde, hasta]);

  const dashboardQuery = useQuery({ queryKey: ['admin-report-dashboard', params], queryFn: () => getReportDashboard(params) });
  const kpisQuery = useQuery({ queryKey: ['admin-report-kpis', params], queryFn: () => getReportKpis(params) });
  const pacientesQuery = useQuery({ queryKey: ['admin-report-pacientes'], queryFn: getReportPacientes, enabled: reportKind === 'pacientes' });
  const tratamientosQuery = useQuery({
    queryKey: ['admin-report-tratamientos', params],
    queryFn: () => getReportTopTratamientos({ ...params, limit: 20 }),
    enabled: reportKind === 'tratamientos' || reportKind === 'resumen',
  });
  const doctoresQuery = useQuery({
    queryKey: ['admin-report-doctores', params],
    queryFn: () => getReportCitasDoctor(params),
    enabled: reportKind === 'doctores' || reportKind === 'agenda' || reportKind === 'resumen',
  });

  const dashboard = dashboardQuery.data;
  const kpis = kpisQuery.data ?? dashboard?.kpis;
  const ingresos = dashboard?.series.ingresos_mensuales ?? [];
  const maxFacturado = Math.max(...ingresos.map((row) => row.facturado), 1);
  const topTratamientos = useMemo(
    () => tratamientosQuery.data ?? dashboard?.tratamientos ?? [],
    [dashboard?.tratamientos, tratamientosQuery.data],
  );
  const doctores = useMemo(
    () => doctoresQuery.data ?? dashboard?.doctores ?? [],
    [dashboard?.doctores, doctoresQuery.data],
  );
  const pacientes = useMemo(
    () => pacientesQuery.data ?? dashboard?.pacientes_deuda ?? [],
    [dashboard?.pacientes_deuda, pacientesQuery.data],
  );
  const maxDoctor = Math.max(...doctores.map((row) => row.total), 1);

  const customRows = useMemo(() => {
    if (reportKind === 'financiero') {
      return [
        { concepto: 'Facturado', valor: kpis?.facturacion.total_facturado ?? 0 },
        { concepto: 'Cobrado', valor: kpis?.facturacion.total_cobrado ?? 0 },
        { concepto: 'Pendiente', valor: kpis?.facturacion.pendiente ?? 0 },
        { concepto: 'Ticket medio', valor: kpis?.facturacion.ticket_medio ?? 0 },
      ];
    }
    if (reportKind === 'agenda') {
      return Object.entries(kpis?.citas.por_estado ?? {}).map(([estado, total]) => ({ estado, total }));
    }
    if (reportKind === 'pacientes') {
      return pacientes.map((row) => ({
        historia: row.num_historial,
        paciente: `${row.apellidos}, ${row.nombre}`,
        saldo: 'saldo_pendiente' in row ? row.saldo_pendiente : 0,
        citas: 'total_citas' in row ? Number(row.total_citas) : '',
      }));
    }
    if (reportKind === 'tratamientos') {
      return topTratamientos.map((row) => ({ tratamiento: row.tratamiento, cantidad: row.cantidad, importe: row.importe ?? 0 }));
    }
    if (reportKind === 'doctores') {
      return doctores.map((row) => ({
        doctor: row.doctor,
        citas: row.total,
        atendidas: row.atendidas,
        faltas: row.faltas,
        ocupacion: row.ocupacion_pct ?? 0,
      }));
    }
    return [
      { indicador: 'Citas', valor: kpis?.citas.total ?? 0 },
      { indicador: 'Pacientes nuevos', valor: kpis?.pacientes_nuevos ?? 0 },
      { indicador: 'Tratamientos realizados', valor: kpis?.tratamientos_realizados ?? 0 },
      { indicador: 'Presupuestos', valor: kpis?.presupuestos.total ?? 0 },
    ];
  }, [doctores, kpis, pacientes, reportKind, topTratamientos]);

  const loading = dashboardQuery.isLoading || kpisQuery.isLoading;
  const hasError = dashboardQuery.isError || kpisQuery.isError;

  return (
    <section className="admin-reportes">
      {hasError && <div className="inline-alert">No se han podido cargar todos los reportes. Revisa la conexion o usa modo demo explicitamente.</div>}

      <div className="admin-report-header">
        <div>
          <div className="panel-caption">
            <strong>Reportes</strong>
            <span>Generales y personalizados</span>
          </div>
          <h2>Control visual de clinica</h2>
        </div>
        <div className="admin-report-filters">
          <label>Desde<input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} /></label>
          <button type="button" onClick={() => downloadCsv(`reporte-${reportKind}-${desde}-${hasta}.csv`, customRows)}>
            Exportar CSV
          </button>
        </div>
      </div>

      {loading && <div className="patient-loading-strip" aria-label="Cargando reportes"><span /><span /><span /></div>}

      <div className="admin-report-kpis">
        <article>
          <span>Facturado</span>
          <strong>{money(kpis?.facturacion.total_facturado)}</strong>
          <small>{kpis?.facturacion.num_facturas ?? 0} facturas</small>
        </article>
        <article>
          <span>Cobrado</span>
          <strong>{money(kpis?.facturacion.total_cobrado)}</strong>
          <small>Pendiente {money(kpis?.facturacion.pendiente)}</small>
        </article>
        <article>
          <span>Presupuestos</span>
          <strong>{kpis?.presupuestos.total ?? 0}</strong>
          <small>Aceptacion {pct(kpis?.presupuestos.aceptacion_rate)}</small>
        </article>
        <article>
          <span>Agenda</span>
          <strong>{kpis?.citas.total ?? 0}</strong>
          <small>No-show {pct(kpis?.citas.no_show_rate)}</small>
        </article>
      </div>

      <div className="admin-report-layout">
        <section className="desk-panel admin-report-main">
          <div className="panel-caption"><strong>Generales</strong><span>Vistas rapidas de direccion</span></div>
          <div className="admin-general-report-grid">
            {REPORT_TYPES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={reportKind === item.id ? 'active' : ''}
                onClick={() => setReportKind(item.id)}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>

          <div className="admin-report-chart">
            <div className="panel-caption"><strong>Evolucion mensual</strong><span>Facturado y cobrado</span></div>
            <div className="admin-month-bars">
              {ingresos.map((row) => (
                <div key={row.mes}>
                  <span>{row.mes}</span>
                  <i style={{ height: `${Math.max(4, (row.facturado / maxFacturado) * 100)}%` }} />
                  <em>{money(row.facturado)}</em>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="desk-panel admin-report-side">
          <div className="panel-caption"><strong>Doctores</strong><span>Actividad del periodo</span></div>
          <div className="admin-doctor-bars">
            {doctores.slice(0, 6).map((doctor) => (
              <p key={doctor.doctor_id ?? doctor.doctor}>
                <span><i style={{ background: doctor.color ?? '#0f8ea0' }} />{doctor.doctor}</span>
                <BarValue value={doctor.total} max={maxDoctor} color={doctor.color} />
              </p>
            ))}
          </div>
        </aside>
      </div>

      <section className="desk-panel admin-custom-report">
        <div className="panel-caption"><strong>Reporte personalizado</strong><span>Elige tipo, fechas y exporta</span></div>
        <div className="admin-report-builder">
          <label>Tipo de reporte
            <select value={reportKind} onChange={(event) => setReportKind(event.target.value as ReportKind)}>
              {REPORT_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label>Formato
            <select defaultValue="tabla">
              <option value="tabla">Tabla</option>
              <option value="resumen">Resumen visual</option>
              <option value="csv">CSV</option>
            </select>
          </label>
          <label>Segmento
            <select defaultValue="todos">
              <option value="todos">Toda la clinica</option>
              <option value="doctor">Por doctor</option>
              <option value="tratamiento">Por tratamiento</option>
              <option value="paciente">Por paciente</option>
            </select>
          </label>
        </div>

        <table className="euro-table">
          <thead>
            <tr>
              {Object.keys(customRows[0] ?? { resultado: '' }).map((header) => <th key={header}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {customRows.map((row, index) => (
              <tr key={index}>
                {Object.values(row).map((value, cellIndex) => <td key={cellIndex}>{typeof value === 'number' ? String(value).replace('.', ',') : value}</td>)}
              </tr>
            ))}
            {!customRows.length && <tr><td>Sin datos para ese reporte.</td></tr>}
          </tbody>
        </table>
      </section>
    </section>
  );
}
