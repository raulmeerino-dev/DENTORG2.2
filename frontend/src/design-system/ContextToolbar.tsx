import { useRef, useState, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { SlidersHorizontal, X, Search, MoreHorizontal } from 'lucide-react';
import { FloatingPopover } from './FloatingPopover';
import './toolbars.css';
export function ContextToolbar({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`dc-context-toolbar ${className}`} />;
}
export function FiltersPopover({ count = 0, children }: { count?: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return <><button ref={anchor} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}><SlidersHorizontal size={14} />Filtros{count > 0 && <b>{count}</b>}</button>
    {open && <FloatingPopover anchorRef={anchor} align="start" role="dialog" aria-label="Filtros" className="dc-toolbar-filters" width={340} maxHeight={520} onClose={() => setOpen(false)}>
      <div className="dc-toolbar-filter-heading"><strong>Filtros</strong><button type="button" aria-label="Cerrar filtros" onClick={() => setOpen(false)}><X size={14} /></button></div>{children}
    </FloatingPopover>}</>;
}
export function ActiveFilterChips({ filters }: { filters: { key: string; label: string; onRemove: () => void }[] }) {
  return filters.length ? <div className="dc-active-filter-chips">{filters.map(filter => <button key={filter.key} type="button" onClick={filter.onRemove} aria-label={`Quitar filtro ${filter.label}`}>{filter.label}<X size={12} /></button>)}</div> : null;
}

export function ToolbarSearch(props: InputHTMLAttributes<HTMLInputElement>) {
  return <label className="dc-toolbar-search"><Search size={15} aria-hidden="true" /><input type="search" {...props} /></label>;
}
export function ToolbarMenu({ label = 'Más acciones', children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return <><button ref={anchor} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={16} /></button>
    {open && <FloatingPopover anchorRef={anchor} role="menu" aria-label={label} className="dc-toolbar-menu" onClose={() => setOpen(false)}>{children}</FloatingPopover>}</>;
}
