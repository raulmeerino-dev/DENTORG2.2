import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, CalendarDays, Wallet, Settings, Moon, Sun, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS, WORKFLOW_ITEMS, canAccess } from '../config/workflow';
import type { AppSection } from '../config/workflow';

const ICON_SIZE = 18;

const NAV_ICONS: Partial<Record<AppSection, ReactNode>> = {
  hoy: <LayoutDashboard size={ICON_SIZE} strokeWidth={1.8} />,
  pacientes: <Users size={ICON_SIZE} strokeWidth={1.8} />,
  agenda: <CalendarDays size={ICON_SIZE} strokeWidth={1.8} />,
  caja: <Wallet size={ICON_SIZE} strokeWidth={1.8} />,
  adminExtras: <Settings size={ICON_SIZE} strokeWidth={1.8} />,
};

export default function MainNav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem('dentorg-theme') ?? 'light');
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
    localStorage.setItem('dentorg-theme', theme);
  }, [theme]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="euro-shell-header">
      <div className="euro-titlebar">
        <strong>DentOrg2 Clinic <span className="title-clock">{nowLabel}</span></strong>
        <span>Clinica actual: CLINICA DENTAL</span>
        <span className="role-chip">{user?.nombre} - {user?.rol ? ROLE_LABELS[user.rol] : 'Sin rol'}</span>
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
      <nav className="euro-main-nav" aria-label="Modulos principales">
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.route!}
            className={({ isActive }) => `euro-nav-button${isActive || (item.id === 'adminExtras' && isAdminArea) ? ' active' : ''}`}
            title={item.description}
          >
            <span className="nav-icon" aria-hidden="true">{NAV_ICONS[item.id]}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button className="euro-nav-button nav-exit" onClick={() => void logout()}>
          <span className="nav-icon" aria-hidden="true">
            <LogOut size={ICON_SIZE} strokeWidth={1.8} />
          </span>
          <span>Salir</span>
        </button>
      </nav>
    </header>
  );
}
