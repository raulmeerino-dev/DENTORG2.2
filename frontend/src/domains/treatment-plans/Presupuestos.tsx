import { useEffect, useRef, useState } from 'react';
import { ScanLine, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ApiPaciente, Cita, Presupuesto, PresupuestoLinea, TratamientoCatalogo, UserRole } from '../../api/types';
import { openPresupuestoPdf } from '../../api/treatmentPlans';
import { getApiErrorMessage } from '../../api/errors';
import { Dialog } from '../../design-system/Dialog';
import { formatDate, money } from '../../shared/format';
import { useSessionDraft } from '../identity/session/sessionDrafts';
import { BudgetOdontogramFlow } from '../clinical/odontogram';
import { BudgetHeader } from './BudgetHeader';
import { BudgetLineEditor } from './BudgetLineEditor';
import { BudgetLines } from './BudgetLines';
import { budgetClosed, budgetTotals, draftFromLine, emptyBudgetDraft, lineEditable, parseBudgetTeeth, validateBudgetDraft, type BudgetLineDraft } from './budgetView';
import { BudgetBatchError, useBudgetMutations, type BudgetAction } from './useBudgetMutations';
import './budget-responsive.css';

type Confirmation = { kind: 'accept'; line?: PresupuestoLinea } | { kind: 'delete'; line: PresupuestoLinea } | { kind: 'invoice' | 'reject' };

export function PresupuestoPanel({ presupuesto, paciente, tratamientos, userRole, onOpenBudget, pendingLineIds }: {
  presupuesto: Presupuesto; paciente: ApiPaciente; tratamientos: TratamientoCatalogo[];
  pendingLineIds?: string[]; userRole?: UserRole | null; onOpenBudget?: (budget: Presupuesto) => void;
}) {
  const [draftText, setDraftText] = useSessionDraft(`budget-line:${presupuesto.id}`);
  const draft: BudgetLineDraft = draftText ? JSON.parse(draftText) : emptyBudgetDraft();
  const setDraft = (value: BudgetLineDraft) => setDraftText(JSON.stringify(value));
  const [mapOpen, setMapOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [reason, setReason] = useState('');
  const [replaceDraft, setReplaceDraft] = useState<BudgetLineDraft | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const mutation = useBudgetMutations(presupuesto);
  const closed = budgetClosed(presupuesto);
  const totals = budgetTotals(presupuesto);
  const selected = presupuesto.lineas.find(line => line.id === draft.lineId);
  const editUnavailable = Boolean(draft.lineId && (!selected || !lineEditable(presupuesto, selected)));
  const dirty = Boolean(draft.treatmentId || draft.query || draft.teeth || draft.faces || draft.price);

  function loadDraft(next: BudgetLineDraft) {
    if (dirty) { setReplaceDraft(next); return; }
    setDraft(next);
    editor.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  async function execute(action: BudgetAction) {
    if (mutation.isPending) return;
    try {
      const next = await mutation.mutateAsync(action);
      if (action.kind === 'add' || action.kind === 'edit') {
        setDraftText('');
        toast.success(action.kind === 'edit' ? 'Línea actualizada.' : `${action.lines.length === 1 ? 'Tratamiento añadido' : `${action.lines.length} líneas añadidas`}.`);
      }
      if (action.kind === 'delete' && draft.lineId === action.id) setDraftText('');
      if (action.kind === 'duplicate' && next && mounted.current) onOpenBudget?.(next);
      if (action.kind === 'accept') toast.success('Líneas aceptadas disponibles en Pendientes.');
      if (action.kind === 'invoice') toast.success('Factura creada. El cobro se registra por separado.');
      setConfirmation(null);
    } catch (error) {
      if (error instanceof BudgetBatchError && error.saved > 0) setDraft({ ...draft, teeth: error.remaining.map(line => line.pieza_dental).filter(Boolean).join(', ') });
    }
  }
  function saveLine() {
    if (closed || editUnavailable || validateBudgetDraft(draft)) return;
    const pieces = parseBudgetTeeth(draft.teeth)!;
    const common = { caras: draft.faces || null, precio_unitario: draft.price, descuento_porcentaje: draft.discount };
    if (draft.lineId) void execute({ kind: 'edit', id: draft.lineId, patch: { ...common, pieza_dental: pieces[0] ?? null, revision: draft.revision } });
    else void execute({ kind: 'add', lines: (pieces.length ? pieces : [null]).map(piece => ({ ...common, tratamiento_id: draft.treatmentId, pieza_dental: piece })) });
  }
  function confirmAction() {
    if (!confirmation) return;
    if (confirmation.kind === 'accept') void execute({ kind: 'accept', ids: confirmation.line ? [confirmation.line.id] : undefined });
    else if (confirmation.kind === 'delete') void execute({ kind: 'delete', id: confirmation.line.id });
    else if (confirmation.kind === 'reject') void execute({ kind: 'reject', reason });
    else void execute({ kind: 'invoice' });
  }
  const confirmTitle = confirmation?.kind === 'accept' ? 'Confirmar aceptación' : confirmation?.kind === 'invoice' ? 'Confirmar facturación' : confirmation?.kind === 'delete' ? 'Eliminar línea' : 'Rechazar presupuesto';
  const error = mutation.isError ? getApiErrorMessage(mutation.error, 'No se pudo completar la acción.') : null;
  return <section className="dc-budget-panel">
    <BudgetHeader budget={presupuesto} patient={paciente} role={userRole} busy={mutation.isPending || dirty}
      onPresent={() => void execute({ kind: 'present' })} onAccept={() => setConfirmation({ kind: 'accept' })}
      onInvoice={() => setConfirmation({ kind: 'invoice' })} onDuplicate={() => void execute({ kind: 'duplicate' })}
      onReject={() => { setReason(''); setConfirmation({ kind: 'reject' }); }}
      onPdf={() => { void openPresupuestoPdf(presupuesto.id).catch(error => toast.error(getApiErrorMessage(error, 'No se pudo abrir el PDF.'))); }} />
    {dirty && <p className="dc-budget-draft-note">{closed ? 'El presupuesto se ha cerrado. Este borrador no se ha guardado.' : `${draft.lineId ? 'Edición' : 'Línea'} sin guardar. Guarda o cancela antes de cambiar el estado del presupuesto.`}
      {closed && <button disabled={mutation.isPending} onClick={() => setDraftText('')}>Descartar borrador</button>}</p>}
    {error && !confirmation && <p className="inline-alert" role="alert">{error}</p>}
    <div className="dc-budget-planning-toolbar"><div><strong>Planificación por piezas</strong><span>Selecciona una o varias piezas</span></div>
      <button type="button" aria-expanded={mapOpen} aria-controls="budget-odontogram" onClick={() => setMapOpen(!mapOpen)}><ScanLine size={16} />{mapOpen ? 'Ocultar odontograma' : closed ? 'Ver odontograma' : 'Abrir odontograma'}</button></div>
    <div className={`dc-budget-workbench${closed ? ' is-readonly' : ''}`}>
      {!closed && <div ref={editor} className="dc-budget-editor-column">
        <BudgetLineEditor draft={draft} treatments={tratamientos} disabled={mutation.isPending || editUnavailable} saving={mutation.isPending} onChange={setDraft} onSave={saveLine}
          onCancel={() => { setDraftText(''); mutation.reset(); }} />
        {editUnavailable && <p role="alert">La línea ya no admite cambios. <button onClick={() => setDraftText('')}>Cerrar edición</button></p>}
        <small className="dc-budget-help dc-budget-draft-help">El borrador se conserva al cambiar de sección. Guarda antes de recargar o cerrar.</small>
      </div>}
      <div className="dc-budget-detail-column">
        {mapOpen && <section id="budget-odontogram" className="dc-budget-map" aria-label="Planificación en odontograma">
          <BudgetOdontogramFlow paciente={paciente} presupuesto={presupuesto} userRole={userRole}
            disabled={mutation.isPending || closed || editUnavailable}
            onSelectPiece={(piece, faces) => {
              if (closed || mutation.isPending || editUnavailable) return;
              const pieces = parseBudgetTeeth(draft.teeth) ?? [];
              setDraft({ ...draft, teeth: draft.lineId ? String(piece) : [...new Set([...pieces, piece])].join(', '), faces: faces ?? draft.faces });
            }} />
        </section>}
        <BudgetLines budget={presupuesto} pendingLineIds={pendingLineIds} selectedId={draft.lineId} disabled={mutation.isPending}
          onEdit={line => { if (line.id !== draft.lineId) loadDraft(draftFromLine(line)); }}
          onDuplicate={line => loadDraft(draftFromLine(line, true))}
          onDelete={line => setConfirmation({ kind: 'delete', line })}
          onAccept={line => { if (dirty) toast.info('Guarda o cancela la edición antes de aceptar una línea.'); else setConfirmation({ kind: 'accept', line }); }} />
      </div>
    </div>
    {replaceDraft && <Dialog label="Cambiar línea en edición" onClose={() => setReplaceDraft(null)} className="dc-budget-dialog">
      <h3>Cambiar línea en edición</h3><p>Hay cambios sin guardar. Puedes seguir editando o descartarlos para abrir la otra línea.</p>
      <footer><button onClick={() => setReplaceDraft(null)}>Seguir editando</button><button className="primary-action" onClick={() => { setDraft(replaceDraft); setReplaceDraft(null); editor.current?.scrollIntoView({ block: 'nearest' }); }}>Descartar y cambiar</button></footer>
    </Dialog>}
    {confirmation && <Dialog label={confirmTitle} onClose={() => { if (!mutation.isPending) setConfirmation(null); }} closeDisabled={mutation.isPending} className="dc-budget-dialog">
      <div className="dc-budget-section-title"><h3>{confirmTitle}</h3><button aria-label="Cerrar confirmación" disabled={mutation.isPending} onClick={() => setConfirmation(null)}><X size={16} /></button></div>
      {confirmation.kind === 'accept' && <p>Se {confirmation.line || presupuesto.lineas.filter(line => !line.aceptado).length === 1 ? 'aceptará' : 'aceptarán'} {confirmation.line ? '1 línea' : `${presupuesto.lineas.filter(line => !line.aceptado).length} líneas`} por {money(confirmation.line ? confirmation.line.importe_neto : totals.pending)} €. Quedarán disponibles en Pendientes y no podrán editarse como propuesta.</p>}
      {confirmation.kind === 'invoice' && <p>Se facturarán {presupuesto.lineas.filter(line => line.aceptado).length} líneas aceptadas por {money(totals.accepted)} €. El cobro se registra por separado.</p>}
      {confirmation.kind === 'delete' && <p>Se eliminará «{confirmation.line.tratamiento?.nombre ?? 'Tratamiento'}»{confirmation.line.pieza_dental ? ` de la pieza ${confirmation.line.pieza_dental}` : ''} de este presupuesto.</p>}
      {confirmation.kind === 'reject' && <label>Motivo (opcional)<textarea value={reason} maxLength={500} onChange={event => setReason(event.target.value)} disabled={mutation.isPending} /></label>}
      {error && <p className="inline-alert" role="alert">{error}</p>}
      <footer><button disabled={mutation.isPending} onClick={() => setConfirmation(null)}>Cancelar</button><button className="primary-action" disabled={mutation.isPending} onClick={confirmAction}>{mutation.isPending ? 'Guardando…' : confirmation.kind === 'invoice' ? 'Confirmar factura' : confirmation.kind === 'accept' ? 'Confirmar aceptación' : confirmation.kind === 'delete' ? 'Eliminar línea' : 'Rechazar presupuesto'}</button></footer>
    </Dialog>}
  </section>;
}

export function CitasPacientePanel({ citas }: { citas: Cita[] }) {
  return (
    <section className="desk-panel">
      <div className="panel-caption">
        <strong>Citas del paciente</strong>
        <span>Confirmacion, recordatorios y asistencia</span>
      </div>
      <table className="dentcore-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Doctor</th>
            <th>Tratamiento previsto</th>
            <th>Estado</th>
            <th>Recordatorio</th>
            <th>Obs. cita</th>
          </tr>
        </thead>
        <tbody>
          {citas.map((cita) => (
            <tr key={cita.id}>
              <td>{formatDate(cita.fecha_hora)}</td>
              <td>{cita.fecha_hora.slice(11, 16)}</td>
              <td>{cita.doctor?.nombre ?? ''}</td>
              <td>{cita.motivo ?? ''}</td>
              <td>
                <span className={`status-pill status-${cita.estado}`}>{cita.estado}</span>
              </td>
              <td>
                {cita.recordatorio_enviado
                  ? `${cita.recordatorio_canal ?? ''} ${cita.recordatorio_estado ?? ''}`
                  : 'Pendiente'}
              </td>
              <td>{cita.observaciones ?? ''}</td>
            </tr>
          ))}
          {!citas.length && (
            <tr>
              <td colSpan={7}>Sin citas registradas.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
