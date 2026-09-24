import { useState } from 'react';
import { Dialog } from '../../design-system';
import type { RecordFilterKey, RecordQuery, RecordView } from '../../api/records';
import { RecordLookup } from './RecordLookup';
import { ADVANCED_RECORD_FILTERS } from './recordQuery';

const RANGE_LABELS: Partial<Record<RecordFilterKey, string>> = {
  importe_min: 'Importe mínimo', importe_max: 'Importe máximo', saldo_min: 'Saldo mínimo', saldo_max: 'Saldo máximo',
};

export function AdvancedRecordFilters({ view, query, scope, onClose, onApply, fileMode }: {
  view: RecordView; query: RecordQuery; scope: string; onClose: () => void;
  onApply: (values: Partial<Record<RecordFilterKey, string>>) => void; fileMode: boolean;
}) {
  const keys = ADVANCED_RECORD_FILTERS.filter(key => view.filters.includes(key) && !(fileMode && key === 'tipo'));
  const [values, setValues] = useState<Partial<Record<RecordFilterKey, string>>>(() => Object.fromEntries(keys.map(key => [key, query[key] ?? ''])));
  const set = (key: RecordFilterKey, value: string) => setValues(current => ({ ...current, [key]: value }));
  const typeLabel = view.id === 'inventario' ? 'Clasificación de producto' : view.id === 'auditoria' ? 'Entidad' : 'Tipo de registro';
  return <Dialog label="Más filtros" onClose={onClose} className="records-filter-dialog">
    <header><strong>Más filtros · {view.label}</strong><button type="button" onClick={onClose}>Cerrar</button></header>
    <form onSubmit={event => { event.preventDefault(); onApply(values); }}>
      <div className="records-advanced-fields">
        {keys.includes('clinica_id') && <RecordLookup label="Clínica" kind="clinicas" scope={scope} value={values.clinica_id ?? ''} onChange={value => set('clinica_id', value)} />}
        {keys.includes('tratamiento_id') && <RecordLookup label="Tratamiento" kind="tratamientos" scope={scope} value={values.tratamiento_id ?? ''} onChange={value => set('tratamiento_id', value)} />}
        {keys.includes('tipo') && <label>{typeLabel}{view.types.length > 0 ? <select value={values.tipo ?? ''} onChange={event => set('tipo', event.target.value)}>
          <option value="">Todos</option>{view.types.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select> : <input type="text" value={values.tipo ?? ''} placeholder={view.id === 'inventario' ? 'Tipo de producto…' : view.id === 'auditoria' ? 'Entidad del registro…' : 'Tipo de registro…'} onChange={event => set('tipo', event.target.value)} />}</label>}
        {keys.filter(key => RANGE_LABELS[key]).map(key => <label key={key}>{RANGE_LABELS[key]}<input type="number" step="0.01" inputMode="decimal" value={values[key] ?? ''} onChange={event => set(key, event.target.value)} /></label>)}
      </div>
      <footer><button type="button" onClick={() => setValues({})}>Limpiar filtros avanzados</button><button type="submit" className="primary-action">Aplicar filtros</button></footer>
    </form>
  </Dialog>;
}
