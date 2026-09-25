import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FloatingPopover } from '../../design-system/FloatingPopover';

export function SidebarLink({ to, label, active, compact, icon }: { to: string; label: string; active: boolean; compact: boolean; icon: ReactNode }) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => { if (timer.current) clearTimeout(timer.current); };
  const close = () => { cancelClose(); setPoint(null); };
  const leave = () => { cancelClose(); timer.current = setTimeout(() => setPoint(null), 120); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const show = (element: HTMLElement) => {
    if (!compact) return;
    cancelClose();
    const rect = element.getBoundingClientRect();
    const sidebar = element.closest('aside')?.getBoundingClientRect();
    setPoint({ x: (sidebar?.right ?? rect.right) + 6, y: rect.top });
  };
  return <>
    <Link to={to} className={`dc-nav-link${active ? ' is-active' : ''}`} aria-label={label} aria-current={active ? 'page' : undefined}
      onMouseEnter={event => show(event.currentTarget)} onMouseLeave={leave} onFocus={event => show(event.currentTarget)} onBlur={close} onClick={close}>
      {icon}<span>{label}</span>
    </Link>
    {compact && point && <FloatingPopover point={point} width={160} maxHeight={80} role="tooltip" className="dc-sidebar-tooltip" onClose={close} onMouseEnter={cancelClose} onMouseLeave={leave}>{label}</FloatingPopover>}
  </>;
}
