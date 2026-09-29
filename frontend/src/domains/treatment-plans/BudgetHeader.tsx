import { Check, FileDown, Send, ReceiptText } from 'lucide-react';
import type { ApiPaciente, Presupuesto, UserRole } from '../../api/types';
import { ToolbarMenu } from '../../design-system/ContextToolbar';
import { StatusChip } from '../../design-system/StatusChip';
import { formatDate, money } from '../../shared/format';
import { fullName } from '../patients/patientName';
import { budgetClosed, budgetStatus, budgetTotals } from './budgetView';

type Props = { budget: Presupuesto; patient: ApiPaciente; role?: UserRole | null; busy: boolean;
  onPresent: () => void; onAccept: () => void; onInvoice: () => void; onPdf: () => void; onDuplicate: () => void; onReject: () => void };
export function BudgetHeader({ budget, patient, role, busy, onPresent, onAccept, onInvoice, onPdf, onDuplicate, onReject }: Props) {
  const status = budgetStatus(budget.estado);
  const totals = budgetTotals(budget);
  const closed = budgetClosed(budget);
  const accepted = budget.lineas.filter(line => line.aceptado).length;
  const invoiced = budget.estado === 'facturado';
  const rejected = budget.estado === 'rechazado';
  const step = invoiced ? 4 : budget.estado === 'parcial' ? 2 : budget.estado === 'aceptado' ? 3 : budget.estado === 'presentado' ? 1 : 0;
  const steps = ['Borrador', 'Presentado', budget.estado === 'parcial' ? 'Aceptación parcial' : 'Aceptado', 'Trabajo pendiente', 'Factura'];
  return <header className="dc-budget-header">
    <div className="dc-budget-heading"><div><div className="dc-budget-title"><h2>Presupuesto #{budget.numero}</h2><StatusChip tone={status.tone}>{status.label}</StatusChip><time dateTime={budget.fecha}>{formatDate(budget.fecha)}</time></div>
      <p title={fullName(patient)}>{fullName(patient)} · H {patient.num_historial}</p></div>
      <dl className="dc-budget-metrics"><div><dt>Total bruto</dt><dd>{money(totals.gross)} €</dd></div><div className="is-total"><dt>Total presupuesto</dt><dd>{money(totals.net)} €</dd></div>
        <div><dt>Aceptado</dt><dd>{money(totals.accepted)} €</dd></div><div><dt>{rejected ? 'No aceptado' : 'Pendiente de aceptar'}</dt><dd>{money(totals.pending)} €</dd></div></dl></div>
    <div className="dc-budget-toolbar" aria-label="Acciones del presupuesto">
      <button className={budget.estado === 'borrador' ? 'primary-action' : ''} disabled={busy || budget.estado !== 'borrador' || !budget.lineas.length} onClick={onPresent}><Send size={14} />Presentar</button>
      <button className={['presentado', 'parcial'].includes(budget.estado) ? 'primary-action' : ''} disabled={busy || !budget.lineas.length || closed} onClick={onAccept}><Check size={15} />Aceptar todo</button>
      <button disabled={busy || !accepted || invoiced || rejected || !['admin', 'recepcion'].includes(role ?? '')} onClick={onInvoice}><ReceiptText size={15} />Facturar</button>
      <button onClick={onPdf}><FileDown size={15} />PDF</button>
      <ToolbarMenu label="Más acciones del presupuesto"><button disabled={busy} onClick={onDuplicate}>Duplicar como alternativa</button><button disabled={busy || closed || accepted > 0} onClick={onReject}>Rechazar presupuesto</button></ToolbarMenu>
    </div>
    {rejected ? <p className="dc-budget-state-note is-rejected">Propuesta rechazada. Conservada para consulta; puedes crear una alternativa desde Más.</p>
      : <ol className="dc-budget-progress" aria-label="Flujo de presupuesto a factura">{steps.map((label, index) => <li key={index} className={index < step ? 'is-done' : index === step ? 'is-current' : ''} aria-current={index === step ? 'step' : undefined}>
        <span>{index < step ? <Check size={12} /> : index + 1}</span><strong>{label}</strong></li>)}</ol>}
    {budget.estado === 'parcial' && <p className="dc-budget-state-note">{accepted} de {budget.lineas.length} líneas aceptadas y disponibles en Clínica · Pendientes.</p>}
    {closed && !rejected && <p className="dc-budget-state-note">{invoiced ? 'Presupuesto facturado.' : 'Trabajo aceptado disponible en Clínica · Pendientes.'} Para otra propuesta, crea un presupuesto o duplica una alternativa.</p>}
  </header>;
}
