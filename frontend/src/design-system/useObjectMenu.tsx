import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { FloatingPopover } from './FloatingPopover';
import './toolbars.css';

export type ObjectAction = { id: string; label: string; icon?: ReactNode; disabled?: boolean; danger?: boolean; run: () => void };

/** Text editing and an existing text selection belong to the browser. */
export function usesNativeContextMenu(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
    || Boolean(window.getSelection()?.toString());
}

export function isContextMenuKey(event: KeyboardEvent) {
  return event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey;
}

/** Store identity only: menu availability follows the latest object and permissions on every render. */
export function useObjectMenu<T>({ items, id, label, actions }: {
  items: readonly T[]; id: (item: T) => string; label: (item: T) => string; actions: (item: T) => ObjectAction[];
}) {
  const [opened, setOpened] = useState<{ id: string; x: number; y: number } | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const current = opened ? items.find(item => id(item) === opened.id) : undefined;
  const options = current ? actions(current) : [];
  function open(item: T, element: HTMLElement, point?: { x: number; y: number }) {
    if (!actions(item).length) return;
    origin.current = element;
    element.focus({ preventScroll: true });
    const rect = element.getBoundingClientRect();
    setOpened({ id: id(item), ...(point ?? { x: rect.left, y: rect.bottom }) });
  }
  function close() { setOpened(null); }
  function run(action: ObjectAction) {
    if (action.disabled) return;
    close();
    origin.current?.focus({ preventScroll: true });
    action.run();
  }
  const bindings = (item: T) => ({
    tabIndex: 0,
    'data-context-active': opened?.id === id(item) || undefined,
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      if (event.defaultPrevented || usesNativeContextMenu(event.target)) return;
      event.preventDefault(); event.stopPropagation();
      open(item, event.currentTarget, { x: event.clientX, y: event.clientY });
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (!isContextMenuKey(event) || event.defaultPrevented || usesNativeContextMenu(event.target)) return;
      event.preventDefault(); event.stopPropagation(); open(item, event.currentTarget);
    },
  });
  const trigger = (item: T) => <button type="button" className="dc-object-menu-trigger" aria-label={`Acciones: ${label(item)}`} title={`Acciones: ${label(item)}`}
    aria-haspopup="menu" aria-expanded={opened?.id === id(item)} onClick={event => { event.stopPropagation(); open(item, event.currentTarget); }}>
    <MoreHorizontal size={16} aria-hidden="true" />
  </button>;
  const menu = current && opened && options.length > 0 ? <FloatingPopover key={opened.id} point={opened} onClose={close} role="menu" aria-label={`Acciones: ${label(current)}`} className="dc-object-menu" width={280}
    onClick={event => event.stopPropagation()}>
    <strong className="dc-object-menu-title">{label(current)}</strong>
    {options.map((action, index) => <button key={action.id} type="button" role="menuitem" disabled={action.disabled}
      className={action.danger ? `dc-menu-danger${!options[index - 1]?.danger ? ' dc-menu-divider' : ''}` : undefined}
      onClick={() => run(action)}>{action.icon}<span>{action.label}</span></button>)}
  </FloatingPopover> : null;
  return { bindings, trigger, menu, close };
}
