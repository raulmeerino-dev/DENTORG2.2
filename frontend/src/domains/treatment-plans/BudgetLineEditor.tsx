import { Plus, Save, X } from 'lucide-react';
import type { TratamientoCatalogo } from '../../api/types';
import { CatalogTreatmentSelector } from '../clinical/treatment-selection/TreatmentSelector';
import { money } from '../../shared/format';
import { parseBudgetTeeth, validateBudgetDraft, type BudgetLineDraft } from './budgetView';

type Props = {
  draft: BudgetLineDraft; treatments: TratamientoCatalogo[]; disabled: boolean; saving?: boolean;
  onChange: (draft: BudgetLineDraft) => void; onSave: () => void; onCancel: () => void;
};
export function BudgetLineEditor({ draft, treatments, disabled, saving, onChange, onSave, onCancel }: Props) {
  const editing = Boolean(draft.lineId);
  const pieces = parseBudgetTeeth(draft.teeth);
  const error = validateBudgetDraft(draft);
  const amount = error ? null : Number(draft.price) * (1 - Number(draft.discount) / 100) * Math.max(1, pieces?.length ?? 0);
  const change = (patch: Partial<BudgetLineDraft>) => onChange({ ...draft, ...patch });
  return <form className={`dc-budget-composer${editing ? ' is-editing' : ''}`} aria-label={editing ? 'Editar línea' : 'Añadir tratamiento'}
    onSubmit={event => { event.preventDefault(); if (!error && !disabled) onSave(); }}>
    <div className="dc-budget-section-title"><h3>{editing ? 'Editar línea' : 'Añadir tratamiento'}</h3>{editing && <span>Edición en curso</span>}</div>
    {editing ? <div className="dc-budget-edit-treatment"><strong>{draft.treatmentName}</strong><small>Los cambios se aplicarán a esta línea.</small></div>
      : <CatalogTreatmentSelector items={treatments.filter(item => item.activo)} query={draft.query} selectedId={draft.treatmentId}
        label="Buscar tratamiento" placeholder="Nombre o código…" showPrice disabled={disabled}
        onQueryChange={query => change({ query, treatmentId: '', treatmentName: '' })}
        onSelect={treatment => change({ treatmentId: treatment.id, treatmentName: treatment.nombre, query: treatment.nombre, price: treatment.precio })} />}
    <fieldset disabled={disabled || !draft.treatmentId} className="dc-budget-fields">
      <label className="dc-budget-piece-field">{editing ? 'Pieza' : 'Piezas'}<input value={draft.teeth} onChange={event => change({ teeth: event.target.value })}
        placeholder={editing ? '16' : '16, 17, 26…'} inputMode="text" aria-describedby="budget-pieces-hint" /></label>
      <label>Caras<input value={draft.faces} onChange={event => change({ faces: event.target.value.toUpperCase().replaceAll(' ', '') })} maxLength={10} placeholder="MOD" /></label>
      <label>Precio unitario<input value={draft.price} inputMode="decimal" onChange={event => change({ price: event.target.value.replace(',', '.') })} /></label>
      <label>Dto %<input value={draft.discount} inputMode="decimal" onChange={event => change({ discount: event.target.value.replace(',', '.') })} /></label>
    </fieldset>
    <small id="budget-pieces-hint" className="dc-budget-help">{editing ? 'Deja la pieza vacía para un tratamiento general.' : 'Una línea por pieza. Sin pieza para tratamientos generales.'}</small>
    {pieces && pieces.length > 0 && <div className="dc-budget-pieces" aria-label="Piezas seleccionadas">{pieces.map(piece => <button type="button" key={piece} disabled={disabled}
      aria-label={`Quitar pieza ${piece}`} onClick={() => change({ teeth: pieces.filter(value => value !== piece).join(', ') })}>{piece}<X size={12} aria-hidden="true" /></button>)}</div>}
    <div className="dc-budget-preview"><span>Importe{(pieces?.length ?? 0) > 1 ? ` · ${pieces!.length} piezas` : ''}</span><output aria-label="Importe de la línea">{amount === null ? '—' : `${money(amount)} €`}</output></div>
    {error && <p className="dc-budget-help" role="status">{error}</p>}
    <div className="dc-budget-composer-actions"><button type="submit" disabled={disabled || Boolean(error)}>
      {editing ? <Save size={15} /> : <Plus size={15} />}{saving ? 'Guardando…' : editing ? 'Guardar cambios' : (pieces?.length ?? 0) > 1 ? `Añadir ${pieces!.length} líneas` : 'Añadir'}</button>
      {(editing || draft.treatmentId || draft.query || draft.teeth || draft.faces) && <button type="button" disabled={disabled} onClick={onCancel}>{editing ? 'Cancelar edición' : 'Limpiar'}</button>}</div>
  </form>;
}
