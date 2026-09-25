import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const activeDialogs: HTMLElement[] = [];

export function Dialog({ label, onClose, closeDisabled = false, className = '', children }: {
  label: string; onClose: () => void; closeDisabled?: boolean; className?: string; children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const close = useEffectEvent(() => { if (!closeDisabled) onClose(); });
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const element = panel.current;
    if (element) activeDialogs.push(element);
    element?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (activeDialogs.at(-1) !== element) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); panel.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (element) { const index = activeDialogs.indexOf(element); if (index >= 0) activeDialogs.splice(index, 1); }
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return createPortal(<div className="dc-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !closeDisabled) onClose(); }}>
    <section ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={className}>{children}</section>
  </div>, document.body);
}
