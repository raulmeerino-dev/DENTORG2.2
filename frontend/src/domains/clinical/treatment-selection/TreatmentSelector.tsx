import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TratamientoCatalogo } from '../../../api/types';
import { FloatingPopover } from '../../../design-system/FloatingPopover';
import { money } from '../../../shared/format';
import { describeCatalogTreatment, filterTreatments, indexTreatments, normalizeTreatmentSearch, type TreatmentOption } from './treatmentSearch';
import './treatment-selector.css';

type Props<T> = {
  items: readonly T[];
  describe: (item: T) => TreatmentOption;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (item: T) => void;
  selectedId?: string | null;
  onManual?: (text: string) => void;
  manualValue?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  showPrice?: boolean;
  catalogInitiallyOpen?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
};

export function TreatmentSelector<T>({ items, describe, query, onQueryChange, onSelect, selectedId,
  onManual, manualValue, label = 'Tratamiento', placeholder = 'Buscar por nombre o código…', disabled = false,
  showPrice = false, catalogInitiallyOpen = false, autoFocus = false, maxLength = 500 }: Props<T>) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [catalogOpen, setCatalogOpen] = useState(catalogInitiallyOpen);
  const [category, setCategory] = useState('');
  const index = useMemo(() => indexTreatments(items, describe), [items, describe]);
  const matches = useMemo(() => filterTreatments(index, query), [index, query]);
  const catalog = useMemo(() => filterTreatments(index, query, category), [index, query, category]);
  const categories = useMemo(() => [...new Set(index.map(entry => entry.option.category).filter((name): name is string => Boolean(name)))].sort((a,b) => a.localeCompare(b, 'es')), [index]);
  const suggestions = matches.slice(0, 30);
  const normalized = normalizeTreatmentSearch(query);
  const exact = matches.find(entry => normalizeTreatmentSearch(entry.option.name) === normalized || (entry.code && entry.code === normalized.replaceAll(' ', '')));
  const canUseManual = Boolean(onManual && query.trim());
  const count = suggestions.length + (canUseManual ? 1 : 0);
  const activeIndex = active >= 0 && active < count ? active : -1;
  const selected = index.find(entry => entry.option.id === selectedId);

  useEffect(() => {
    if (open && activeIndex >= 0) document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [id, open, activeIndex]);

  function choose(item: T) {
    onSelect(item);
    setOpen(false);
    setActive(-1);
  }

  function chooseManual() {
    onManual?.(query.trim());
    setOpen(false);
    setActive(-1);
  }

  function optionContent(option: TreatmentOption) {
    return <>
      {option.code && <span className="dc-treatment-code">{option.code}</span>}
      <span className="dc-treatment-copy"><strong>{option.name}</strong>{option.category && <small>{option.category}</small>}</span>
      {showPrice && option.price !== undefined && <span className="dc-treatment-price">{money(option.price)}</span>}
    </>;
  }

  function optionLabel(option: TreatmentOption) {
    return [option.code, option.name, option.category, showPrice && option.price !== undefined ? money(option.price) : undefined].filter(Boolean).join(' · ');
  }

  return <div className="dc-treatment-selector" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <label htmlFor={id}>{label}</label>
    <div className="dc-treatment-search-row">
      <input ref={input} id={id} type="text" role="combobox" aria-autocomplete="list" aria-expanded={open && !disabled}
        aria-controls={open && !disabled ? `${id}-results` : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        autoComplete="off" autoFocus={autoFocus} disabled={disabled} value={query} placeholder={placeholder} maxLength={maxLength}
        onFocus={() => { setOpen(true); setActive(-1); }}
        onChange={event => { onQueryChange(event.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActive(count ? (activeIndex + (event.key === 'ArrowDown' ? 1 : activeIndex < 0 ? 0 : -1) + count) % count : -1);
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (activeIndex >= 0 && activeIndex < suggestions.length) choose(suggestions[activeIndex].item);
            else if (activeIndex === suggestions.length && canUseManual) chooseManual();
            else if (exact) choose(exact.item);
            else if (canUseManual) chooseManual();
          } else if (event.key === 'Tab') setOpen(false);
        }} />
      <button type="button" className="dc-treatment-catalog-toggle" disabled={disabled} aria-expanded={catalogOpen}
        aria-controls={`${id}-catalog`} onClick={() => { setCatalogOpen(value => !value); setOpen(false); }}>Catálogo</button>
    </div>
    {(selected || manualValue) && <small className="dc-treatment-selection-kind">
      {selected ? `Catálogo${selected.option.code ? ` · ${selected.option.code}` : ''}` : 'Concepto manual · no se añade al catálogo'}
    </small>}
    {open && !disabled && <FloatingPopover anchorRef={input} align="start" width="anchor" maxHeight={320}
      onClose={() => { setOpen(false); setActive(-1); }} className="dc-treatment-suggestions" id={`${id}-results`} role="listbox" aria-label={`Resultados · ${label}`}>
      {suggestions.map((entry, position) => <button type="button" role="option" tabIndex={-1}
        id={`${id}-option-${position}`} key={entry.option.id} aria-label={optionLabel(entry.option)} aria-selected={position === activeIndex}
        className="dc-treatment-option" onPointerMove={() => setActive(position)} onMouseDown={event => event.preventDefault()}
        onClick={() => choose(entry.item)}>{optionContent(entry.option)}</button>)}
      {!matches.length && <p role="status" className="dc-treatment-empty">Sin resultados en el catálogo.</p>}
      {canUseManual && <button type="button" role="option" tabIndex={-1} id={`${id}-option-${suggestions.length}`}
        aria-selected={activeIndex === suggestions.length} className="dc-treatment-option dc-treatment-manual"
        onPointerMove={() => setActive(suggestions.length)} onMouseDown={event => event.preventDefault()} onClick={chooseManual}>
        <span className="dc-treatment-copy"><strong>Usar «{query.trim()}» como concepto manual</strong><small>Solo en este contexto; no crea un tratamiento en el catálogo.</small></span>
      </button>}
      {matches.length > suggestions.length && <p className="dc-treatment-empty">{matches.length} coincidencias. Afina la búsqueda o abre Catálogo para verlas todas.</p>}
    </FloatingPopover>}
    {catalogOpen && <section id={`${id}-catalog`} className="dc-treatment-catalog" aria-label="Catálogo completo de tratamientos">
      <div className="dc-treatment-catalog-filter">
        <label htmlFor={`${id}-family`}>Familia</label>
        <select id={`${id}-family`} value={category} disabled={disabled} onChange={event => setCategory(event.target.value)}>
          <option value="">Todas las familias</option>{categories.map(name => <option key={name}>{name}</option>)}
        </select>
        <small>{catalog.length} {catalog.length === 1 ? 'tratamiento' : 'tratamientos'}</small>
      </div>
      {query && <button type="button" className="dc-treatment-reset" disabled={disabled} onClick={() => { onQueryChange(''); setCategory(''); setOpen(false); }}>Ver catálogo completo</button>}
      <div className="dc-treatment-catalog-list">
        {catalog.map(entry => <button type="button" key={entry.option.id} disabled={disabled} aria-label={optionLabel(entry.option)} aria-pressed={entry.option.id === selectedId}
          className="dc-treatment-option" onClick={() => choose(entry.item)}>{optionContent(entry.option)}</button>)}
        {!catalog.length && <p role="status" className="dc-treatment-empty">Sin resultados en esta familia.</p>}
      </div>
    </section>}
  </div>;
}

export function CatalogTreatmentSelector(props: Omit<Props<TratamientoCatalogo>, 'describe'>) {
  return <TreatmentSelector {...props} describe={describeCatalogTreatment} />;
}
