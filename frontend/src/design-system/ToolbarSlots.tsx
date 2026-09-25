import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
type Slot = 'module' | 'actions';
const Slots = createContext<{ targets: Partial<Record<Slot, HTMLElement | null>>; register: (name: Slot, node: HTMLElement | null) => void } | null>(null);
export function ToolbarSlots({ children }: { children: ReactNode }) {
  const [targets, setTargets] = useState<Partial<Record<Slot, HTMLElement | null>>>({});
  const register = useCallback((name: Slot, node: HTMLElement | null) => setTargets(current => current[name] === node ? current : { ...current, [name]: node }), []);
  const value = useMemo(() => ({ targets, register }), [targets, register]);
  return <Slots.Provider value={value}>{children}</Slots.Provider>;
}
export function ToolbarSlot({ name }: { name: Slot }) {
  const register = useContext(Slots)?.register;
  const ref = useCallback((node: HTMLDivElement | null) => register?.(name, node), [register, name]);
  return <div ref={ref} className={`dc-toolbar-slot dc-toolbar-slot-${name}`} />;
}
export function ToolbarContribution({ slot, children }: { slot: Slot; children: ReactNode }) {
  const context = useContext(Slots);
  const target = context?.targets[slot];
  return target ? createPortal(children, target) : context ? null : <>{children}</>;
}
