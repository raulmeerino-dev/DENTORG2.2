import { Check, Copy, Pencil, Trash2 } from 'lucide-react';
import type { Presupuesto, PresupuestoLinea } from '../../api/types';
import { useObjectMenu } from '../../design-system/useObjectMenu';
import { StatusChip } from '../../design-system/StatusChip';
import { money } from '../../shared/format';
import { budgetClosed, budgetLineStatus, budgetTotals, lineEditable } from './budgetView';

type Props = {
  budget: Presupuesto; pendingLineIds?: string[]; selectedId?: string; disabled: boolean;
  onEdit: (line: PresupuestoLinea) => void; onDuplicate: (line: PresupuestoLinea) => void;
  onDelete: (line: PresupuestoLinea) => void; onAccept: (line: PresupuestoLinea) => void;
};
export function BudgetLines({ budget, pendingLineIds = [], selectedId, disabled, onEdit, onDuplicate, onDelete, onAccept }: Props) {
  const totals = budgetTotals(budget);
  const accepted = budget.lineas.filter(line => line.aceptado).length;
  const menu = useObjectMenu({ items: budget.lineas, id: line => line.id,
    label: line => `${line.tratamiento?.nombre ?? 'Tratamiento'}${line.pieza_dental ? ` · Pieza ${line.pieza_dental}` : ''}`,
    actions: line => [
      { id: 'edit', label: 'Editar línea', icon: <Pencil size={15} />, disabled: disabled || !lineEditable(budget, line), run: () => onEdit(line) },
      { id: 'accept', label: 'Aceptar línea', icon: <Check size={15} />, disabled: disabled || !lineEditable(budget, line), run: () => onAccept(line) },
      { id: 'duplicate', label: 'Duplicar en otra pieza', icon: <Copy size={15} />, disabled: disabled || budgetClosed(budget), run: () => onDuplicate(line) },
      { id: 'delete', label: 'Eliminar línea', icon: <Trash2 size={15} />, danger: true, disabled: disabled || !lineEditable(budget, line), run: () => onDelete(line) },
    ] });
  return <section className="dc-budget-lines" aria-label="Líneas del presupuesto">
    <div className="dc-budget-section-title"><h3>Líneas del presupuesto <span>{budget.lineas.length}</span></h3><small>{accepted} {accepted === 1 ? 'aceptada' : 'aceptadas'} · {budget.lineas.length - accepted} sin aceptar</small></div>
    {!budget.lineas.length ? <div className="dc-budget-empty"><strong>Empieza por un tratamiento</strong><p>Búscalo por nombre o código, o selecciona una pieza en el odontograma.</p></div>
      : <div className="dc-budget-table-scroll" tabIndex={0} aria-label="Tabla de líneas"><table className="dc-budget-table">
        <thead><tr><th scope="col">Código</th><th scope="col">Tratamiento</th><th scope="col">Pieza</th><th scope="col">Caras</th><th scope="col" className="num">Dto %</th><th scope="col" className="num">Importe</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
        <tbody>{budget.lineas.map((line, index) => {
          const status = budgetLineStatus(budget, line, pendingLineIds.includes(line.id));
          const editable = lineEditable(budget, line);
          return <tr key={line.id} {...menu.bindings(line)} className={line.id === selectedId ? 'is-editing' : undefined}>
            <td className="dc-budget-code">{line.tratamiento?.codigo ?? '—'}</td>
            <td className="dc-budget-treatment"><strong>{line.tratamiento?.nombre ?? 'Tratamiento'}</strong>{line.id === selectedId && <small>Editando esta línea</small>}</td>
            <td><span className={line.pieza_dental ? 'dc-budget-tooth' : 'dc-budget-muted'}>{line.pieza_dental ?? '—'}</span></td>
            <td>{line.caras || '—'}</td><td className="num">{Number(line.descuento_porcentaje) ? `${Number(line.descuento_porcentaje)} %` : '—'}</td>
            <td className="num dc-budget-amount">{money(line.importe_neto)}</td><td><StatusChip tone={status.tone}>{status.label}</StatusChip></td>
            <td><div className="dc-budget-row-actions"><button type="button" title={editable ? 'Editar línea' : 'Línea bloqueada'} aria-label={`Editar línea ${index + 1}`}
              disabled={disabled || !editable} onClick={() => onEdit(line)}><Pencil size={15} /></button>
              {menu.trigger(line)}</div></td>
          </tr>;
        })}</tbody>
      </table></div>}
    <footer className="dc-budget-totals"><span>Bruto <b>{money(totals.gross)} €</b></span><span>Descuentos <b>−{money(totals.discount)} €</b></span><strong>Total presupuesto <b>{money(totals.net)} €</b></strong></footer>
    {menu.menu}
  </section>;
}
