import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, X } from 'lucide-react';
import { getRecordOptions, type RecordLookupKind } from '../../api/records';
import { FloatingPopover } from '../../design-system/FloatingPopover';

export function RecordLookup({ label, kind, value, onChange, scope }: {
  label: string; kind: RecordLookupKind; value: string; onChange: (value: string) => void; scope: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedTerm(term), 250);
    return () => window.clearTimeout(timeout);
  }, [term]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    function closeOutside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  const options = useQuery({
    queryKey: ['records-options', scope, kind, debouncedTerm],
    queryFn: ({ signal }) => getRecordOptions(kind, debouncedTerm, signal),
    enabled: open,
    staleTime: 30_000,
  });
  const selected = useQuery({
    queryKey: ['records-option-selected', scope, kind, value],
    queryFn: ({ signal }) => getRecordOptions(kind, value, signal),
    enabled: Boolean(value),
    staleTime: 60_000,
  });
  const selectedLabel = selected.data?.find(option => option.id === value)?.label;
  function toggle() {
    setOpen(!open);
  }
  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setTerm('');
    trigger.current?.focus();
  }
  return <div className="records-lookup" ref={root} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    <span className="records-field-label" id={`${id}-label`}>{label}</span>
    <div className="records-lookup-control">
      <button ref={trigger} type="button" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={`${id}-options`} aria-haspopup="listbox" onClick={toggle}>
        <span id={`${id}-value`}>{value ? selectedLabel ?? (selected.isLoading ? 'Cargando…' : 'Selección guardada') : 'Todos'}</span><ChevronDown size={13} aria-hidden="true" />
      </button>
      {value && <button type="button" className="records-clear-selection" aria-label={`Quitar filtro ${label.toLowerCase()}`} onClick={() => choose('')}><X size={13} /></button>}
    </div>
    {open && <FloatingPopover className="records-lookup-popover" anchorRef={trigger} width={310} maxHeight={340} align="start" onClose={() => setOpen(false)}>
      <input ref={search} aria-label={`Buscar ${label.toLowerCase()}`} placeholder="Nombre o identificador…" value={term} onChange={event => setTerm(event.target.value)} onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); root.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus(); }
      }} />
      <div id={`${id}-options`} role="listbox" aria-label={label} className="records-lookup-options" onKeyDown={event => {
        const elements = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
        const index = elements.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          elements[(index + (event.key === 'ArrowDown' ? 1 : -1) + elements.length) % elements.length]?.focus();
        }
      }}>
        <button type="button" role="option" aria-selected={!value} onClick={() => choose('')}>Todos</button>
        {(options.data ?? []).map(option => <button type="button" role="option" aria-selected={value === option.id} key={option.id} onClick={() => choose(option.id)}>{option.label}</button>)}
      </div>
      {options.isLoading && <p role="status">Buscando…</p>}
      {options.isError && <p role="alert">No se pudieron cargar las opciones. <button type="button" onClick={() => void options.refetch()}>Reintentar</button></p>}
      {!options.isLoading && !options.isError && !options.data?.length && <p>Sin coincidencias.</p>}
    </FloatingPopover>}
  </div>;
}
