import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink } from 'lucide-react';
import type { RecordColumn, RecordQuery, RecordRow } from '../../api/records';
import { recordTargetHref } from '../../app/navigation/recordTargets';
import { getClinicTimeZone } from '../../shared/time/clinicTime';

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

function recordCellText(value: RecordRow['cells'][string], type: RecordColumn['type']) {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'money' || type === 'number') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? (type === 'money' ? money.format(numeric) : number.format(numeric)) : String(value);
  }
  if (type === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
  }
  if (type === 'datetime') {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: getClinicTimeZone() });
  }
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value).replace(type === 'status' ? /_/g : /$^/, ' ');
}

export function RecordsTable({ columns, rows, query, onSort, returnTo, loading, failed, onOpenAudit }: {
  columns: RecordColumn[]; rows: RecordRow[]; query: RecordQuery; onSort: (key: string) => void;
  returnTo: string; loading: boolean; failed: boolean;
  onOpenAudit?: (id: string) => void;
}) {
  return <div className="records-table-scroll" tabIndex={0} role="region" aria-label="Resultados de consulta" aria-busy={loading}>
    <table className="records-table">
      <thead><tr>{columns.map(column => <th key={column.key} scope="col" data-column={column.key} data-type={column.type} className={['money', 'number'].includes(column.type) ? 'numeric' : undefined} aria-sort={query.sort_by === column.key ? query.sort_dir === 'asc' ? 'ascending' : 'descending' : undefined}>
        {column.sortable ? <button type="button" onClick={() => onSort(column.key)} aria-label={`Ordenar por ${column.label}`}>
          {column.label}{query.sort_by === column.key ? query.sort_dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} />}
        </button> : column.label}
      </th>)}<th scope="col" className="records-action-column"><span className="records-sr-only">Detalle</span></th></tr></thead>
      <tbody>
        {rows.map(row => {
          const target = row.target ? recordTargetHref(row.target) : null;
          return <tr key={row.id}>{columns.map(column => <td key={column.key} data-column={column.key} data-type={column.type} className={['money', 'number'].includes(column.type) ? 'numeric' : undefined}>
            {column.type === 'status' ? <span className="records-state">{recordCellText(row.cells[column.key], column.type)}</span> : recordCellText(row.cells[column.key], column.type)}
          </td>)}<td className="records-action-column">{row.target?.kind === 'auditoria' ? onOpenAudit && <button type="button" aria-label="Abrir detalle" disabled={loading} onClick={() => onOpenAudit(row.target!.id)}>Abrir</button> : target && <Link to={target} state={{ returnTo }} aria-label="Abrir detalle" aria-disabled={loading} tabIndex={loading ? -1 : undefined} onClick={event => { if (loading) event.preventDefault(); }}>Abrir<ExternalLink size={12} aria-hidden="true" /></Link>}</td></tr>;
        })}
        {!rows.length && <tr><td colSpan={columns.length + 1} className="records-table-empty">
          {loading ? 'Cargando registros…' : failed ? 'No se pudieron cargar los resultados.' : 'No hay resultados con estos filtros.'}
        </td></tr>}
      </tbody>
    </table>
  </div>;
}
