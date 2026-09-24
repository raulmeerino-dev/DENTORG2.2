import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Download, Filter, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../identity/session/AuthContext';
import { exportRecordPage, getRecordCatalog, getRecordPage, type RecordExportFormat } from '../../api/records';
import { getApiErrorMessage } from '../../api/errors';
import { openOrDownloadBlob } from '../../api/downloads';
import { AdvancedRecordFilters } from './AdvancedRecordFilters';
import { RecordLookup } from './RecordLookup';
import { RecordsTable } from './RecordsTable';
import { AuditRecordDetail } from './AuditRecordDetail';
import { useRecordSearchParams } from './useRecordSearchParams';
import { ADVANCED_RECORD_FILTERS, RECORD_FILTER_KEYS, RECORD_PAGE_SIZES, recordQueryError, recordQueryFromUrl, urlForRecordView } from './recordQuery';
import './reporting.css';

export default function RecordsWorkspace({ mode = 'records' }: { mode?: 'records' | 'files' }) {
  const { user } = useAuth();
  const location = useLocation();
  const { searchParams, updateSearch } = useRecordSearchParams();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [exporting, setExporting] = useState<RecordExportFormat | 'print' | null>(null);
  const [exportError, setExportError] = useState('');
  const [auditId, setAuditId] = useState<string | null>(null);
  const scope = `${user?.id ?? ''}:${user?.rol ?? ''}:${user?.clinica_id ?? ''}`;
  const isFiles = mode === 'files';
  const title = isFiles ? 'Archivos' : 'Registros';
  const catalog = useQuery({ queryKey: ['records-catalog', scope], queryFn: ({ signal }) => getRecordCatalog(signal), enabled: Boolean(user), staleTime: 60_000 });
  const views = (catalog.data?.views ?? []).filter(view => !isFiles || view.group === 'files');
  const requestedView = searchParams.get('vista');
  const view = views.find(item => item.id === requestedView) ?? views[0];
  const query = view ? recordQueryFromUrl(searchParams, view) : null;
  const searchText = searchParams.get('q') ?? '';
  const textFilters = JSON.stringify([searchText, view?.states.length === 0 ? query?.estado ?? '' : '']);
  const [settledSearch, setSettledSearch] = useState(textFilters);
  useEffect(() => {
    const timeout = window.setTimeout(() => setSettledSearch(textFilters), 300);
    return () => window.clearTimeout(timeout);
  }, [textFilters]);
  const searchPending = settledSearch !== textFilters;
  const validationError = query ? recordQueryError(query) : '';
  const result = useQuery({
    queryKey: ['records-page', scope, view?.id, query],
    queryFn: ({ signal }) => getRecordPage(view!.id, query!, signal),
    enabled: Boolean(view && query && !searchPending && !validationError),
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === scope && previousQuery?.queryKey[2] === view?.id ? previous : undefined,
  });
  const columns = view ? (result.data?.columns ?? view.columns).filter(column => view.columns.some(allowed => allowed.key === column.key)) : [];
  const busy = result.isFetching || searchPending || result.isPlaceholderData;
  const total = result.data?.total ?? 0;
  const advancedKeys = view ? ADVANCED_RECORD_FILTERS.filter(key => view.filters.includes(key) && !(isFiles && key === 'tipo')) : [];
  const advancedCount = advancedKeys.filter(key => query?.[key]).length;
  const filterCount = RECORD_FILTER_KEYS.filter(key => query?.[key]).length;
  const exportDisabled = exporting !== null || busy || !result.data || !total || Boolean(validationError) || result.isError;

  function setFilters(values: Record<string, string | number | undefined>, replace = false) {
    updateSearch(current => {
      const next = new URLSearchParams(current);
      if (view && !next.has('vista')) next.set('vista', view.id);
      next.delete('offset');
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined || value === '') next.delete(key); else next.set(key, String(value));
      }
      return next;
    }, replace);
  }
  function clearFilters() {
    const next = new URLSearchParams();
    if (view) next.set('vista', view.id);
    if (query?.limit) next.set('limit', String(query.limit));
    updateSearch(() => next);
  }
  async function exportResults(format: RecordExportFormat, print = false) {
    if (!view || !query || exportDisabled || !view.can_export || !view.export_formats.includes(format)) return;
    setExporting(print ? 'print' : format);
    setExportError('');
    try {
      const blob = await exportRecordPage(view.id, query, format, columns.map(column => column.key));
      const filename = `dentcore-${view.id}.${format}`;
      if (print) {
        const opened = await openOrDownloadBlob(blob, filename, { requirePdf: true });
        if (opened.downloaded) toast.info('PDF descargado. Ábrelo para imprimir el resultado completo.');
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = filename; link.rel = 'noopener';
        document.body.appendChild(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (error) { setExportError(getApiErrorMessage(error, 'No se pudo exportar el resultado.')); }
    finally { setExporting(null); }
  }

  if (catalog.isLoading) return <section className="records-workspace" aria-label={title}><header className="records-toolbar"><h1>{title}</h1></header><p className="records-feedback" role="status">Cargando vistas disponibles…</p></section>;
  if (catalog.isError) return <section className="records-workspace" aria-label={title}><header className="records-toolbar"><h1>{title}</h1></header><div className="records-feedback records-feedback--error" role="alert">No se pudieron cargar las consultas disponibles. <button type="button" onClick={() => void catalog.refetch()}>Reintentar</button></div></section>;
  if (!view || !query) return <section className="records-workspace" aria-label={title}><header className="records-toolbar"><h1>{title}</h1></header><p className="records-feedback">No hay vistas disponibles para tu perfil.</p></section>;

  return <section className="records-workspace" aria-label={title}>
    <header className="records-toolbar">
      <h1>{title}</h1>
      <label className="records-view-label"><span>Vista</span><select value={view.id} onChange={event => {
        const selected = views.find(item => item.id === event.target.value);
        if (selected) { setAdvancedOpen(false); updateSearch(current => urlForRecordView(current, selected)); }
      }}>{views.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {view.filters.includes('q') && <div className="records-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label={`Buscar ${title.toLowerCase()}`} placeholder={isFiles ? 'Paciente, documento, concepto…' : 'Paciente, historia, concepto, referencia…'} value={searchText} onChange={event => setFilters({ q: event.target.value }, true)} /></div>}
      {view.can_export && <div className="records-exports" aria-label="Exportar resultado" title={`Exportar los ${total} resultados con los filtros, orden y columnas actuales`}>
        <Download size={14} aria-hidden="true" />
        {view.export_formats.includes('xlsx') && <button type="button" disabled={exportDisabled} onClick={() => void exportResults('xlsx')}>Excel</button>}
        {view.export_formats.includes('csv') && <button type="button" disabled={exportDisabled} onClick={() => void exportResults('csv')}>CSV</button>}
        {view.export_formats.includes('pdf') && <><button type="button" disabled={exportDisabled} onClick={() => void exportResults('pdf')}>PDF</button><button type="button" title="Abrir PDF para imprimir el resultado completo" disabled={exportDisabled} onClick={() => void exportResults('pdf', true)}>Imprimir</button></>}
      </div>}
    </header>
    <div className="records-filters" aria-label="Filtros de consulta">
      {view.filters.includes('fecha_desde') && <label>Desde<input type="date" aria-label="Desde" title={view.date_label} max={query.fecha_hasta} value={query.fecha_desde ?? ''} onChange={event => setFilters({ fecha_desde: event.target.value })} /></label>}
      {view.filters.includes('fecha_hasta') && <label>Hasta<input type="date" aria-label="Hasta" title={view.date_label} min={query.fecha_desde} value={query.fecha_hasta ?? ''} onChange={event => setFilters({ fecha_hasta: event.target.value })} /></label>}
      {view.filters.includes('paciente_id') && <RecordLookup label="Paciente" kind="pacientes" value={query.paciente_id ?? ''} onChange={value => setFilters({ paciente_id: value })} scope={scope} />}
      {view.filters.includes('doctor_id') && <RecordLookup label="Profesional" kind="doctores" value={query.doctor_id ?? ''} onChange={value => setFilters({ doctor_id: value })} scope={scope} />}
      {isFiles && view.filters.includes('tipo') && <label>Tipo de archivo<select value={query.tipo ?? ''} onChange={event => setFilters({ tipo: event.target.value })}><option value="">Todos</option>{view.types.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
      {view.filters.includes('estado') && <label>{view.columns.find(column => column.key === 'estado')?.label ?? 'Estado'}{view.states.length > 0 ? <select value={query.estado ?? ''} onChange={event => setFilters({ estado: event.target.value })}><option value="">Todos</option>{view.states.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type="text" placeholder="Todos" value={query.estado ?? ''} onChange={event => setFilters({ estado: event.target.value })} />}</label>}
      {advancedKeys.length > 0 && <button className="records-more-filters" type="button" onClick={() => setAdvancedOpen(true)}><Filter size={14} aria-hidden="true" />Más filtros{advancedCount ? ` (${advancedCount})` : ''}</button>}
      {filterCount > 0 && <button type="button" onClick={clearFilters}>Limpiar</button>}
    </div>
    <div className="records-result-context" role="status" aria-live="polite">
      <span>{view.label}{view.date_label ? ` · ${view.date_label}` : ''}</span>
      <span>{busy || result.isLoading ? 'Buscando…' : result.isError ? 'Consulta no disponible' : `${total.toLocaleString('es-ES')} resultados`}</span>
      {exporting && <span>Preparando exportación…</span>}
    </div>
    {requestedView && !views.some(item => item.id === requestedView) && <div className="records-feedback">La vista solicitada no está disponible para tu perfil. Se muestra {view.label}.</div>}
    {validationError && <div className="records-feedback records-feedback--error" role="alert">{validationError}</div>}
    {result.isError && <div className="records-feedback records-feedback--error" role="alert">{getApiErrorMessage(result.error, 'No se pudieron cargar los registros.')} <button type="button" onClick={() => void result.refetch()}>Reintentar</button></div>}
    {exportError && <div className="records-feedback records-feedback--error" role="alert">{exportError}</div>}
    <RecordsTable columns={columns} rows={validationError ? [] : result.data?.rows ?? []} query={query} returnTo={location.pathname + location.search} loading={busy || result.isLoading} failed={result.isError || Boolean(validationError)} onOpenAudit={views.some(item => item.id === 'auditoria') ? setAuditId : undefined} onSort={key => setFilters({ sort_by: key, sort_dir: query.sort_by === key && query.sort_dir === 'asc' ? 'desc' : 'asc' })} />
    <footer className="records-pagination">
      <label>Filas por página<select value={query.limit} onChange={event => setFilters({ limit: event.target.value })}>{RECORD_PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
      <span>{result.data && total ? `${query.offset + 1}–${Math.min(query.offset + result.data.rows.length, total)} de ${total.toLocaleString('es-ES')}` : 'Sin filas'}</span>
      <div><button type="button" disabled={query.offset === 0 || busy} onClick={() => setFilters({ offset: Math.max(0, query.offset - query.limit) })}>Anterior</button><button type="button" disabled={!result.data || query.offset + query.limit >= total || busy || Boolean(validationError)} onClick={() => setFilters({ offset: query.offset + query.limit })}>Siguiente</button></div>
    </footer>
    {advancedOpen && <AdvancedRecordFilters view={view} query={query} scope={scope} fileMode={isFiles} onClose={() => setAdvancedOpen(false)} onApply={values => {
      const updates: Record<string, string | undefined> = Object.fromEntries(advancedKeys.map(key => [key, values[key]]));
      setFilters(updates); setAdvancedOpen(false);
    }} />}
    {auditId && views.some(item => item.id === 'auditoria') && <AuditRecordDetail id={auditId} scope={scope} onClose={() => setAuditId(null)} />}
  </section>;
}
