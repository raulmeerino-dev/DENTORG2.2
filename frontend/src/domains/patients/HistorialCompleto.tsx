import { Fragment, useMemo, useRef, useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  ChevronDown,
  ChevronRight,
  MessageSquareText,
} from 'lucide-react';
import type { ApiPaciente, Cita, UserRole, SaldoPaciente } from '../../api/types';
import { formatDate, money } from '../../shared/format';
import { ContextToolbar, FiltersPopover, ToolbarSearch } from '../../design-system/ContextToolbar';
import { StatusChip } from '../../design-system/StatusChip';
import { VisitDetail } from '../clinical/history/VisitDetail';
import {
  buildHistoryRows,
  filterHistoryRows,
  HISTORY_FILTERS,
  isClinicalVisit,
  isPerformedTreatment,
  type HistoryData,
  type HistoryFilter,
  type HistoryQuery,
} from './history/historyRows';
import { HistoryRowDetail, type HistoryActions } from './history/HistoryRowDetail';
import { historyBalance, historyBalanceClass } from './history/historyBalance';
import './history-workspace.css';

type Props = Omit<HistoryData, 'notasDentales'> &
  Partial<Pick<HistoryData, 'notasDentales'>> &
  Omit<HistoryActions, 'onOpenVisit'> & {
    paciente: ApiPaciente | null;
    userRole?: UserRole | null;
    canManageBilling?: boolean;
    saldo?: SaldoPaciente;
    onOpenTreatmentHistory?: () => void;
    professionals?: { id: string; nombre: string }[];
    initialFilter?: HistoryFilter;
    focusedRecordId?: string | null;
    focusedVisitId?: string | null;
    loading?: boolean;
    error?: boolean;
  };
const EMPTY: never[] = [];
const PAGE_SIZE = 50;
export function HistorialCompletoPanel({
  historial,
  citas,
  presupuestos,
  facturas,
  anticipos,
  account,
  documentos,
  consentimientos,
  notasDentales = EMPTY,
  canManageBilling = false,
  initialFilter = 'todo',
  professionals = EMPTY,
  ...props
}: Props) {
  const [visit, setVisit] = useState<Cita | null>(null);
  const [focusDismissed, setFocusDismissed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [groupVisits, setGroupVisits] = useState(true);
  const [localRecord, setLocalRecord] = useState<string | null>(null);
  const [query, setQuery] = useState<HistoryQuery>({
    group: initialFilter,
    search: '',
    from: '',
    to: '',
    professional: '',
    state: '',
    piece: '',
    order: 'desc',
  });
  const tableRef = useRef<HTMLTableElement>(null);
  const data = useMemo(
    () => ({
      historial,
      citas,
      presupuestos,
      facturas,
      anticipos,
      account,
      documentos,
      consentimientos,
      notasDentales,
    }),
    [historial, citas, presupuestos, facturas, anticipos, account, documentos, consentimientos, notasDentales],
  );
  const rows = useMemo(
    () => buildHistoryRows(data, canManageBilling, professionals),
    [data, canManageBilling, professionals],
  );
  const availableFilters = HISTORY_FILTERS.filter(
    (f) => canManageBilling || !['facturacion', 'cobros'].includes(f.id),
  );
  const activeGroup = availableFilters.some((f) => f.id === query.group) ? query.group : 'todo';
  const focused =
    localRecord || (!focusDismissed && props.focusedRecordId)
      ? rows.find((r) => r.recordId === (localRecord || props.focusedRecordId))
      : undefined;
  const filtered = useMemo(
    () => filterHistoryRows(rows, { ...query, group: activeGroup }, groupVisits),
    [rows, query, activeGroup, groupVisits],
  );
  const visible = focused ? [focused] : filtered;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(visible.length / PAGE_SIZE) - 1));
  const displayed = visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const expandedId = expanded || focused?.id;
  const doctorOptions = [
    ...new Map(
      rows.filter((r) => r.professionalId && r.professional && !r.children?.length).map((r) => [r.professionalId!, r.professional!]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const states = [...new Set(rows.map((r) => r.status).filter((v): v is string => Boolean(v)))].sort();
  const pieces = [...new Set(rows.flatMap((r) => r.pieces))].sort((a, b) => a - b);
  const advancedCount = [query.from, query.to, query.professional, query.state, query.piece, query.pendingOnly].filter(
    Boolean,
  ).length;
  const activeVisit = citas.find(
    (c) =>
      isClinicalVisit(c, data) && (c.id === visit?.id || (!focusDismissed && c.id === props.focusedVisitId)),
  );
  const actions: HistoryActions = {
    onOpenDocumento: props.onOpenDocumento,
    onOpenConsentimiento: props.onOpenConsentimiento,
    onOpenFactura: props.onOpenFactura,
    onOpenPresupuesto: props.onOpenPresupuesto,
    onOpenVisit: setVisit,
    onOpenRecord: (id) => {
      setLocalRecord(id);
      setFocusDismissed(true);
      setExpanded(null);
      setPage(0);
      tableRef.current?.closest('.dc-patient-body')?.scrollTo({ top: 0 });
    },
  };
  function change(patch: Partial<HistoryQuery>) {
    setQuery((q) => ({ ...q, ...patch }));
    setFocusDismissed(true);
    setLocalRecord(null);
    setPage(0);
    setExpanded(null);
  }
  function changePage(next: number) {
    setPage(next);
    setExpanded(null);
    tableRef.current?.closest('.dc-patient-body')?.scrollTo({ top: 0 });
  }
  if (activeVisit)
    return (
      <VisitDetail
        cita={activeVisit}
        historial={historial.filter(isPerformedTreatment)}
        notas={notasDentales}
        documentos={documentos}
        consentimientos={consentimientos}
        onClose={() => {
          setVisit(null);
          setFocusDismissed(true);
        }}
        onOpenDocumento={props.onOpenDocumento}
        onOpenConsentimiento={props.onOpenConsentimiento}
      />
    );
  return (
    <section className="patient-history" aria-label="Historial clínico y económico del paciente">
      <ContextToolbar className="patient-history-toolbar" aria-label="Herramientas del historial">
        <ToolbarSearch
          aria-label="Buscar en el historial"
          placeholder="Buscar tratamiento, pieza, factura, nota…"
          value={query.search}
          onChange={(e) => change({ search: e.target.value })}
        />
        <FiltersPopover count={advancedCount}>
          <label>
            Desde
            <input
              type="date"
              aria-label="Historial desde"
              value={query.from}
              max={query.to || undefined}
              onChange={(e) => change({ from: e.target.value })}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              aria-label="Historial hasta"
              value={query.to}
              min={query.from || undefined}
              onChange={(e) => change({ to: e.target.value })}
            />
          </label>
          <label>
            Profesional
            <select value={query.professional} onChange={(e) => change({ professional: e.target.value })}>
              <option value="">Todos</option>
              {doctorOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estado
            <select value={query.state} onChange={(e) => change({ state: e.target.value })}>
              <option value="">Todos</option>
              {states.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </label>
          <label>
            Pieza
            <select value={query.piece} onChange={(e) => change({ piece: e.target.value })}>
              <option value="">Todas</option>
              {pieces.map((piece) => (
                <option key={piece}>{piece}</option>
              ))}
            </select>
          </label>
          {canManageBilling && <label className="patient-history-check">
            <input type="checkbox" checked={Boolean(query.pendingOnly)} onChange={event => change({ pendingOnly: event.target.checked })} />
            Con saldo pendiente
          </label>}
          {advancedCount > 0 && (
            <button
              type="button"
              onClick={() => change({ from: '', to: '', professional: '', state: '', piece: '', pendingOnly: false })}
            >
              Limpiar filtros avanzados
            </button>
          )}
        </FiltersPopover>
        <button
          type="button"
          className="patient-history-order"
          title={query.order === 'desc' ? 'Más recientes primero' : 'Más antiguos primero'}
          aria-label={
            query.order === 'desc'
              ? 'Ordenar de más antiguo a más reciente'
              : 'Ordenar de más reciente a más antiguo'
          }
          onClick={() => change({ order: query.order === 'desc' ? 'asc' : 'desc' })}
        >
          {query.order === 'desc' ? <ArrowDownWideNarrow size={15} /> : <ArrowUpWideNarrow size={15} />}
          <span>{query.order === 'desc' ? 'Recientes' : 'Antiguos'}</span>
        </button>
        <span className="patient-history-count" role="status">
          {visible.length} {visible.length === 1 ? 'registro' : 'registros'}
        </span>
        {props.onOpenTreatmentHistory && (
          <button type="button" onClick={props.onOpenTreatmentHistory}>
            {canManageBilling ? 'Tratamientos y facturación' : 'Tratamientos realizados'}
          </button>
        )}
      </ContextToolbar>
      <nav className="patient-history-filters" aria-label="Filtros del historial completo">
        {availableFilters.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={activeGroup === f.id}
            onClick={() => change({ group: f.id })}
          >
            {f.label}
          </button>
        ))}
        {activeGroup === 'todo' && !focused && <button type="button" className="patient-history-group" aria-pressed={groupVisits} onClick={() => { setGroupVisits(value => !value); setPage(0); setExpanded(null); }}>
          Agrupar por visita
        </button>}
        {(query.search || advancedCount > 0) && (
          <button
            type="button"
            className="patient-history-clear"
            onClick={() => change({ search: '', from: '', to: '', professional: '', state: '', piece: '', pendingOnly: false })}
          >
            Limpiar búsqueda y filtros
          </button>
        )}
      </nav>
      {canManageBilling && props.saldo && (
        <dl
          className="patient-history-account"
          aria-label="Saldo actual del paciente"
          title="Contabilidad actual del paciente, independiente de los filtros del historial"
        >
          {account && <div><dt>Cargos</dt><dd>{money(account.total_cargos)} €</dd></div>}
          <div>
            <dt>Facturado</dt>
            <dd>{money(props.saldo.total_facturado)} €</dd>
          </div>
          <div>
            <dt>Pagado, incluidos anticipos</dt>
            <dd>{money(props.saldo.total_cobrado)} €</dd>
          </div>
          <div
            className={
              Number(props.saldo.pendiente) > 0
                ? 'has-debt'
                : Number(props.saldo.pendiente) < 0
                  ? 'has-credit'
                  : 'is-settled'
            }
          >
            <dt>
              {Number(props.saldo.pendiente) < 0
                ? 'A favor'
                : Number(props.saldo.pendiente) > 0
                  ? 'Saldo pendiente'
                  : 'Saldo actual'}
            </dt>
            <dd>{historyBalance(props.saldo.pendiente)} €</dd>
          </div>
        </dl>
      )}
      {focused && (
        <div className="patient-history-focus" role="region" aria-label="Registro seleccionado">
          <span>
            {focused.type}
            {focused.invoice ? ` ${focused.invoice.serie}/${focused.invoice.numero}` : ''} · {focused.concept}
          </span>
          <button
            type="button"
            onClick={() => {
              setFocusDismissed(true);
              setLocalRecord(null);
              setExpanded(null);
            }}
          >
            Ver historial completo
          </button>
        </div>
      )}
      {props.loading && (
        <p className="patient-history-notice" role="status">
          Cargando registros del historial…
        </p>
      )}
      {props.error && (
        <p className="patient-history-notice" role="alert">
          No se han podido cargar todos los registros. El historial puede estar incompleto.
        </p>
      )}
      <table
        ref={tableRef}
        className={`patient-history-table ${canManageBilling ? 'with-billing' : ''}`}
        aria-label="Cronología del paciente"
      >
        <colgroup>
          <col className="ph-expand" />
          <col className="ph-date" />
          <col className="ph-type" />
          <col className="ph-concept" />
          <col className="ph-piece" />
          <col className="ph-professional" />
          <col className="ph-state" />
          {canManageBilling && (
            <>
              <col className="ph-invoice" />
              <col className="ph-money" />
              <col className="ph-paid" />
              <col className="ph-balance" />
            </>
          )}
        </colgroup>
        <thead>
          <tr>
            <th aria-label="Detalle" />
            <th aria-sort={query.order === 'desc' ? 'descending' : 'ascending'}>Fecha</th>
            <th>Tipo</th>
            <th>Tratamiento / concepto</th>
            <th>Pieza</th>
            <th className="ph-professional">Profesional</th>
            <th>Estado</th>
            {canManageBilling && (
              <>
                <th>Factura</th>
                <th className="ph-numeric">Importe</th>
                <th
                  className="ph-numeric ph-paid"
                  title="Cobros efectivos; en facturas, total cobrado actual"
                >
                  Cobrado
                </th>
                <th
                  className="ph-numeric ph-balance"
                  title="Negativo: pendiente de pago. Positivo: saldo a favor. En cobros, saldo de cuenta al registrar el pago."
                >
                  Saldo
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {displayed.map((row) => {
            const isExpanded = expandedId === row.id;
            const toggle = () => {
              setExpanded(isExpanded ? null : row.id);
              if (focused) setFocusDismissed(true);
            };
            const amount = (value?: string | number | null) => (value == null ? '—' : money(value));
            return (
              <Fragment key={row.id}>
                <tr
                  className={`patient-history-row ${isExpanded ? 'is-expanded' : ''}`}
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest('button, a')) toggle();
                  }}
                >
                  <td>
                    <button
                      type="button"
                      className="patient-history-expand"
                      aria-label={`${isExpanded ? 'Contraer' : 'Ver detalle'}: ${row.type} · ${row.concept}`}
                      aria-expanded={isExpanded}
                      aria-controls={`detail-${row.id}`}
                      onClick={toggle}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </td>
                  <td>
                    <time dateTime={row.date || undefined}>{row.day ? formatDate(row.day) : '—'}</time>
                  </td>
                  <td title={row.type}>{row.type}</td>
                  <td>
                    <div className="patient-history-concept">
                      <span title={row.concept}>{row.concept}</span>
                      {row.observation && (
                        <button
                          type="button"
                          className="patient-history-note"
                          title="Contiene observaciones"
                          aria-label={`Ver observación: ${row.concept}`}
                          onClick={() => setExpanded(row.id)}
                        >
                          <MessageSquareText size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td title={row.pieces.join(', ')}>{row.pieces.length ? row.pieces.join(', ') : '—'}</td>
                  <td className="ph-professional" title={row.professional}>
                    {row.professional || '—'}
                  </td>
                  <td>
                    {row.status ? (
                      <StatusChip tone={row.tone} title={row.status}>
                        {row.status}
                      </StatusChip>
                    ) : (
                      '—'
                    )}
                  </td>
                  {canManageBilling && (
                    <>
                      <td>
                        {row.invoice ? (
                          <button
                            type="button"
                            className="patient-history-invoice"
                            title={`Abrir factura ${row.invoice.serie}/${row.invoice.numero}`}
                            onClick={() => props.onOpenFactura(row.invoice!)}
                          >
                            {row.invoice.estado === 'borrador' ? 'Borrador' : `${row.invoice.serie}/${row.invoice.numero}`}
                          </button>
                        ) : row.relatedInvoices?.length ? (
                          <button type="button" className="patient-history-invoice" onClick={() => setExpanded(row.id)}>{row.relatedInvoices.length} factura{row.relatedInvoices.length > 1 ? 's' : ''}</button>
                        ) : row.treatment || row.children?.length ? (
                          <span title={Number(row.amount) === 0 && row.amount != null ? 'Cortesía · sin factura' : 'Tratamiento realizado pendiente de facturar'}>{Number(row.amount) === 0 && row.amount != null ? 'Cortesía' : 'Sin facturar'}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td
                        className="ph-numeric"
                        title={row.amount != null ? `${money(row.amount)} €` : undefined}
                      >
                        {amount(row.amount)}
                      </td>
                      <td className="ph-numeric ph-paid">{amount(row.paid)}</td>
                      <td title={row.balanceAtPayment ? 'Saldo de cuenta al registrar este pago; negativo = pendiente, positivo = a favor.' : 'Saldo de este acto o documento; negativo = pendiente de pago.'} className={`ph-numeric ph-balance ${historyBalanceClass(row.balance)}`}>
                        {historyBalance(row.balance)}
                      </td>
                    </>
                  )}
                </tr>
                {isExpanded && (
                  <tr id={`detail-${row.id}`} className="patient-history-detail-row">
                    <td colSpan={canManageBilling ? 11 : 7}>
                      <HistoryRowDetail row={row} data={data} actions={actions} billing={canManageBilling} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {!displayed.length && !props.loading && (
            <tr>
              <td colSpan={canManageBilling ? 11 : 7} className="patient-history-empty">
                {rows.length
                  ? 'No hay actos clínicos o movimientos económicos que coincidan con estos filtros.'
                  : 'Todavía no hay tratamientos realizados, visitas clínicas o movimientos económicos.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <footer className="patient-history-pagination">
        <span>
          {visible.length
            ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, visible.length)} de ${visible.length}`
            : '0 registros'}
          {canManageBilling && ' · Importes en €'}
        </span>
        {visible.length > PAGE_SIZE && (
          <div>
            <button type="button" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}>
              Anterior
            </button>
            <button
              type="button"
              disabled={(currentPage + 1) * PAGE_SIZE >= visible.length}
              onClick={() => changePage(currentPage + 1)}
            >
              Siguiente
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}
