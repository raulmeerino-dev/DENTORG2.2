import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Building2,
  CalendarCheck2,
  CalendarDays,
  CreditCard,
  LogOut,
  Moon,
  Settings2,
  ShieldCheck,
  Sun,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS, WORKFLOW_ITEMS, canAccess } from '../config/workflow';
import type { AppSection } from '../config/workflow';
import dentcoreLogo from '../assets/branding/dentcore-clinic-logo-64.png';

const ICON_SIZE = 18;

const NAV_ICONS: Partial<Record<AppSection, ReactNode>> = {
  hoy: <CalendarCheck2 size={ICON_SIZE} strokeWidth={1.9} />,
  pacientes: <UsersRound size={ICON_SIZE} strokeWidth={1.9} />,
  agenda: <CalendarDays size={ICON_SIZE} strokeWidth={1.9} />,
  caja: <CreditCard size={ICON_SIZE} strokeWidth={1.9} />,
  adminExtras: <Settings2 size={ICON_SIZE} strokeWidth={1.9} />,
};

export default function MainNav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem('dentcore-theme') ?? 'light');
  const [now, setNow] = useState(() => new Date());
  const navItems = WORKFLOW_ITEMS.filter((item) => (
    item.route
    && canAccess(user?.rol, item)
    && ['hoy', 'pacientes', 'agenda', 'caja', 'adminExtras'].includes(item.id)
  ));
  const nowLabel = now.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' })
    + ` ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  const isDark = theme === 'dark';
  const isAdminArea = ['/admin-extras', '/configuracion', '/listados'].some((route) => location.pathname.startsWith(route));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('dentcore-theme', theme);
  }, [theme]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="euro-shell-header">
      <div className="euro-titlebar">
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true">
            <img src={dentcoreLogo} alt="" />
          </span>
          <div>
            <strong>DentCore Clinic</strong>
            <span className="title-clock">{nowLabel}</span>
          </div>
        </div>
        <div className="euro-titlebar-context">
          <span className="clinic-chip"><Building2 size={13} strokeWidth={2} aria-hidden="true" /> Clinica Dental</span>
          <span className="role-chip"><ShieldCheck size={13} strokeWidth={2} aria-hidden="true" /> {user?.nombre} - {user?.rol ? ROLE_LABELS[user.rol] : 'Sin rol'}</span>
          <button
            type="button"
            className={`theme-toggle ${isDark ? 'is-dark' : ''}`}
            aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
            title={isDark ? 'Modo claro' : 'Modo oscuro'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          >
            {isDark ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
          </button>
        </div>
      </div>
      <nav className="euro-main-nav" aria-label="Modulos principales">
        <div className="euro-nav-group">
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.route!}
              className={({ isActive }) => `euro-nav-button${isActive || (item.id === 'adminExtras' && isAdminArea) ? ' active' : ''}`}
              aria-label={item.label}
            >
              <span className="nav-icon" aria-hidden="true">{NAV_ICONS[item.id]}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
        <div className="euro-nav-actions">
          <button className="euro-nav-button nav-exit" onClick={() => void logout()}>
            <span className="nav-icon" aria-hidden="true">
              <LogOut size={ICON_SIZE} strokeWidth={1.9} />
            </span>
            <span>Salir</span>
          </button>
        </div>
      </nav>
    </header>
  );
}
