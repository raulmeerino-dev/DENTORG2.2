import { ArrowLeft } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import './task-surface.css';

/** A focused task in the application workspace, never a modal or a portal. */
export function TaskSurface({ title, context, onClose, children, actions, className = '', backLabel = 'Volver a la ficha' }: {
  title: string;
  context?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  backLabel?: string;
}) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousFocusRef = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useEffect(() => {
    const previous = previousFocusRef.current;
    headingRef.current?.focus({ preventScroll: true });
    return () => {
      window.requestAnimationFrame(() => {
        const target = previous?.isConnected ? previous : document.querySelector<HTMLElement>('[data-task-return]');
        target?.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <section className={`dc-task-surface ${className}`} aria-labelledby={titleId}>
      <header className="dc-task-header">
        <button type="button" className="dc-task-back" onClick={onClose} aria-label={backLabel}>
          <ArrowLeft size={16} aria-hidden="true" /><span>{backLabel}</span>
        </button>
        <div className="dc-task-heading">
          <h1 id={titleId} ref={headingRef} tabIndex={-1}>{title}</h1>
          {context && <div className="dc-task-context">{context}</div>}
        </div>
        {actions && <div className="dc-task-actions">{actions}</div>}
      </header>
      <div className="dc-task-body">{children}</div>
    </section>
  );
}
