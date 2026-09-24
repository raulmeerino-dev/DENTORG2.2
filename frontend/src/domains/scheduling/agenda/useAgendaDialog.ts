import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

/** Keyboard scope for the agenda's brief actions, restoring the caller on close. */
export function useAgendaDialog<T extends HTMLElement>(onClose: () => void, busy = false) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<T>) {
    if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(control => control.offsetParent !== null);
    const first = controls[0]; const last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return { ref, onKeyDown, tabIndex: -1 as const, role: 'dialog' as const, 'aria-modal': true as const };
}
