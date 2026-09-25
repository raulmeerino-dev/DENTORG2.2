import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function SidebarLink({ to, label, active, icon }: { to: string; label: string; active: boolean; icon: ReactNode }) {
  return <Link to={to} className={`dc-nav-link${active ? ' is-active' : ''}`} aria-label={label} aria-current={active ? 'page' : undefined}>
    {icon}<span>{label}</span>
  </Link>;
}
