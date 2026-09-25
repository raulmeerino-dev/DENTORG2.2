import { ContextToolbar, FiltersPopover } from '../../design-system/ContextToolbar';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getReportCitasDoctor, getReportDashboard, getReportKpis, getReportPacientes, getReportTopTratamientos } from '../../api/reporting';
import { getTrabajosLaboratorio } from '../../api/laboratory';
import './reports.css';

type ReportKind = 'resumen' | 'financiero' | 'agenda' | 'pacientes' | 'doctores' | 'tratamientos' | 'laboratorio' | 'exportaciones';

const REPORT_TYPES: Array<{ id: ReportKind; label: string; description: string }> = [
  { id: 'resumen', label: 'Resumen general', description: 'KPIs principales de direccion.' },
  { id: 'financiero', label: 'Financiero', description: 'Facturado, cobrado, pendiente y ticket medio.' },
  { id: 'agenda', label: 'Agenda', description: 'Citas, faltas y estados.' },
  { id: 'pacientes', label: 'Pacientes', description: 'Pacientes con actividad, citas y saldo.' },
  { id: 'doctores', label: 'Doctores', description: 'Actividad y ocupacion por doctor.' },
  { id: 'tratamientos', label: 'Tratamientos', description: 'Produccion por tratamiento.' },
  { id: 'laboratorio', label: 'Laboratorio', description: 'Retrasos, entregas y costes pendientes.' },
  { id: 'exportaciones', label: 'Exportaciones', description: 'Informes disponibles en CSV.' },
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
    <span className="analysis-bar">
      <i style={{ width: `${width}%`, background: color || undefined }} />
      <b>{value}</b>
    </span>
  );
}

export function AdminReportes() {
  const [desde, setDesde] = useState(monthStartIso());
  const [hasta, setHasta] = useState(todayIso());
  const [reportKind, setReportKind] = useState<ReportKind>('resumen');
  const params = useMemo(() => ({
    fecha_desde: desde,
    fecha_hasta: hasta,
  }), [desde, hasta]);

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

  const laboratorioQuery = useQuery({ queryKey: ['trabajos-laboratorio-pendientes'], queryFn: () => getTrabajosLaboratorio({ pendientes: true }), enabled: reportKind === 'laboratorio' });
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
    () => pacientesQuery.data ?? [],
    [pacientesQuery.data],
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
    if (reportKind === 'laboratorio') {
      return (laboratorioQuery.data ?? []).map(row => ({
        paciente: row.paciente ? `${row.paciente.apellidos}, ${row.paciente.nombre}` : '',
        laboratorio: row.laboratorio?.nombre ?? '',
        trabajo: row.descripcion,
        estado: row.estado,
        entrega_prevista: row.fecha_entrega_prevista ?? '',
        precio: row.precio ?? 0,
      }));
    }
    if (reportKind === 'exportaciones') {
      return [
        { reporte: 'Financiero', formato: 'CSV', periodo: `${desde} - ${hasta}` },
        { reporte: 'Agenda', formato: 'CSV', periodo: `${desde} - ${hasta}` },
        { reporte: 'Pacientes con deuda', formato: 'CSV', periodo: `${desde} - ${hasta}` },
      ];
    }
    return [
      { indicador: 'Citas', valor: kpis?.citas.total ?? 0 },
      { indicador: 'Pacientes nuevos', valor: kpis?.pacientes_nuevos ?? 0 },
      { indicador: 'Tratamientos realizados', valor: kpis?.tratamientos_realizados ?? 0 },
      { indicador: 'Presupuestos', valor: kpis?.presupuestos.total ?? 0 },
    ];
  }, [desde, doctores, laboratorioQuery.data, hasta, kpis, pacientes, reportKind, topTratamientos]);

  const detailQuery = reportKind === 'pacientes' ? pacientesQuery : reportKind === 'tratamientos' ? tratamientosQuery : reportKind === 'doctores' || reportKind === 'agenda' ? doctoresQuery : reportKind === 'laboratorio' ? laboratorioQuery : dashboardQuery;
  const loading = dashboardQuery.isLoading || kpisQuery.isLoading || detailQuery.isLoading;
  const hasError = dashboardQuery.isError || kpisQuery.isError || detailQuery.isError;
  const report = REPORT_TYPES.find(item => item.id === reportKind)!;

  return (
    <section className="analysis-workspace" aria-label="Reportes de clínica">
      <ContextToolbar className="analysis-toolbar" aria-label="Acciones de reportes">
        <label>Tipo de reporte
          <select value={reportKind} onChange={event => setReportKind(event.target.value as ReportKind)}>
            {REPORT_TYPES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>

      <FiltersPopover count={Number(Boolean(desde)) + Number(Boolean(hasta))}>
        <label>Desde<input type="date" value={desde} max={hasta} onChange={event => setDesde(event.target.value)} /></label>
        <label>Hasta<input type="date" value={hasta} min={desde} onChange={event => setHasta(event.target.value)} /></label>
      </FiltersPopover>
        <button type="button" className="dc-toolbar-secondary-end" disabled={loading || hasError || !customRows.length} onClick={() => downloadCsv(`reporte-${reportKind}-${desde}-${hasta}.csv`, customRows)}>Exportar CSV</button>
      </ContextToolbar>
      {hasError && <p className="inline-alert" role="alert">No se han podido cargar todos los reportes. Revisa la conexión.</p>}
      {loading && <p className="analysis-loading" role="status">Cargando reportes…</p>}
      <div className="analysis-content" aria-busy={loading}>
        {(reportKind === 'resumen' || reportKind === 'financiero') && <div className="analysis-summary">
          <div><span>Facturado</span><strong>{kpis ? money(kpis.facturacion.total_facturado) : '—'}</strong><small>{kpis?.facturacion.num_facturas ?? '—'} facturas</small></div>
          <div><span>Cobrado</span><strong>{kpis ? money(kpis.facturacion.total_cobrado) : '—'}</strong><small>Pendiente {kpis ? money(kpis.facturacion.pendiente) : '—'}</small></div>
          <div><span>Presupuestos</span><strong>{kpis?.presupuestos.total ?? '—'}</strong><small>Aceptación {pct(kpis?.presupuestos.aceptacion_rate)}</small></div>
          <div><span>Agenda</span><strong>{kpis?.citas.total ?? '—'}</strong><small>Ausencias {pct(kpis?.citas.no_show_rate)}</small></div>
        </div>}
        <section className="analysis-result">
          <div className="analysis-caption"><strong>{report.label}</strong><span>{reportKind === 'pacientes' ? 'Todos los pacientes · saldo y actividad acumulados' : reportKind === 'laboratorio' ? 'Todos los trabajos pendientes · sin filtro de periodo' : report.description}</span></div>
          <div className="analysis-table-scroll" tabIndex={0} role="region" aria-label={report.label}>
            <table className="dentcore-table">
              <thead><tr>{Object.keys(customRows[0] ?? { resultado: '' }).map(header => <th key={header}>{header.replaceAll('_', ' ')}</th>)}</tr></thead>
              <tbody>
                {customRows.map((row, index) => <tr key={index}>{Object.values(row).map((value, cellIndex) => <td key={cellIndex}>{typeof value === 'number' ? String(value).replace('.', ',') : value}</td>)}</tr>)}
                {!loading && !hasError && !customRows.length && <tr><td>Sin datos para ese reporte.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        {(reportKind === 'resumen' || reportKind === 'financiero') && <section className="analysis-section">
          <div className="analysis-caption"><strong>Evolución mensual</strong><span>Facturado y cobrado · año {hasta.slice(0, 4)}</span></div>
          <div className="analysis-months">{ingresos.map(row => <div key={row.mes}><span>Mes {row.mes}</span><BarValue value={row.facturado} max={maxFacturado} /><span>{money(row.facturado)}</span><small>Cobrado {money(row.cobrado)}</small></div>)}</div>
        </section>}
        {reportKind === 'resumen' && <details className="analysis-detail">
          <summary>Actividad, presupuestos y alertas</summary>
          <div className="analysis-columns">
            <section><div className="analysis-caption"><strong>Tratamientos top</strong><span>Volumen e importe</span></div><table className="dentcore-table"><thead><tr><th>Tratamiento</th><th>Cant.</th><th>Importe</th></tr></thead><tbody>{topTratamientos.map(row => <tr key={row.tratamiento}><td>{row.tratamiento}</td><td>{row.cantidad}</td><td>{money(row.importe ?? 0)}</td></tr>)}</tbody></table></section>
            <section><div className="analysis-caption"><strong>Presupuestos</strong></div><div className="analysis-state-list">{Object.entries(kpis?.presupuestos.por_estado ?? {}).map(([estado, total]) => <p key={estado}><span>{estado}</span><BarValue value={total} max={Math.max(kpis?.presupuestos.total ?? 1, 1)} /></p>)}</div></section>
          </div>
          <div className="analysis-summary">
            <div><span>Citas sin confirmar</span><strong>{dashboard?.alertas.citas_sin_confirmar ?? '—'}</strong></div>
            <div><span>Pacientes en clínica</span><strong>{dashboard?.alertas.pacientes_en_clinica ?? '—'}</strong></div>
            <div><span>Presupuestos pendientes</span><strong>{dashboard?.alertas.presupuestos_pendientes ?? '—'}</strong></div>
            <div><span>Deuda pendiente</span><strong>{dashboard ? money(dashboard.alertas.deuda_pendiente) : '—'}</strong></div>
          </div>
        </details>}
        {(reportKind === 'doctores' || reportKind === 'agenda' || reportKind === 'resumen') && <section className="analysis-section">
          <div className="analysis-caption"><strong>Doctores</strong><span>Actividad del periodo</span></div>
          <div className="analysis-doctors">{doctores.map(doctor => <p key={doctor.doctor_id ?? doctor.doctor}><span>{doctor.doctor}</span><BarValue value={doctor.total} max={maxDoctor} color={doctor.color} /></p>)}</div>
        </section>}
      </div>
    </section>
  );
}
