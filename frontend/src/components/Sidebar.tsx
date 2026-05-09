import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS, WORKFLOW_ITEMS, canAccess } from '../config/workflow';
import type { AppSection } from '../config/workflow';

const NAV_ICONS: Partial<Record<AppSection, ReactNode>> = {
  hoy: <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6"/><path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  pacientes: <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.6"/><path d="M3 18c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  agenda: <svg viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6"/><line x1="2" y1="9" x2="18" y2="9" stroke="currentColor" strokeWidth="1.4"/><line x1="6.5" y1="2" x2="6.5" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><line x1="13.5" y1="2" x2="13.5" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="7" cy="13" r="1" fill="currentColor"/><circle cx="10" cy="13" r="1" fill="currentColor"/><circle cx="13" cy="13" r="1" fill="currentColor"/></svg>,
  caja: <svg viewBox="0 0 20 20" fill="none"><rect x="1.5" y="7" width="17" height="11" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M5 7V5a5 5 0 0 1 10 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><line x1="10" y1="11" x2="10" y2="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><line x1="8" y1="12.5" x2="12" y2="12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  dashboard: <svg viewBox="0 0 20 20" fill="none"><rect x="2" y="10" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="7.5" y="6" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="13" y="2" width="5" height="16" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>,
};

export default function MainNav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem('dentcore-theme') ?? 'light');
  const [now, setNow] = useState(() => new Date());
  const navItems = WORKFLOW_ITEMS.filter((item) => item.route && canAccess(user?.rol, item));
  const dailyItems = navItems.filter((item) => ['hoy', 'pacientes', 'agenda', 'caja'].includes(item.id));
  const adminItems = navItems.filter((item) => !['hoy', 'pacientes', 'agenda', 'caja'].includes(item.id));
  const nowLabel = now.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' })
    + ` ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  const isDark = theme === 'dark';
  const isAdminArea = adminItems.some((item) => item.route && location.pathname.startsWith(item.route));
  const adminHome = adminItems.find((item) => item.id === 'ficheros') ?? adminItems[0];

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
        <strong>DentCore Clinic <span className="title-clock">{nowLabel}</span></strong>
        <span>Clinica actual: CLINICA DENTAL</span>
        <span className="role-chip">{user?.nombre} - {user?.rol ? ROLE_LABELS[user.rol] : 'Sin rol'}</span>
        <button
          type="button"
          className={`theme-toggle ${isDark ? 'is-dark' : ''}`}
          aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
          title={isDark ? 'Modo claro' : 'Modo oscuro'}
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
          <span aria-hidden="true" />
        </button>
      </div>
      <nav className="euro-main-nav" aria-label="Modulos principales">
        {dailyItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.route!}
            className={({ isActive }) => `euro-nav-button${isActive ? ' active' : ''}`}
            title={item.description}
          >
            <span className="nav-icon" aria-hidden="true">{NAV_ICONS[item.id]}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        {adminHome && (
          <div className={`admin-mode-nav${isAdminArea ? ' is-active' : ''}`}>
            <NavLink
              to={adminHome.route!}
              className={() => `euro-nav-button admin-mode-button${isAdminArea ? ' active' : ''}`}
              title="Entrar en ajustes y gestion de administrador"
            >
              <span className="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.6"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </span>
              <span>Admin</span>
            </NavLink>
            {isAdminArea && (
              <div className="admin-mode-links" aria-label="Secciones de administrador">
              {adminItems.map((item) => (
                <NavLink key={item.id} to={item.route!} title={item.description}>
                  <span>{item.shortcut}</span>
                  {item.label}
                </NavLink>
              ))}
              </div>
            )}
          </div>
        )}
        <button className="euro-nav-button nav-exit" onClick={() => void logout()}>
          <span className="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none"><path d="M13 3h4v14h-4M8 14l5-4-5-4M2 10h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span>Salir</span>
        </button>
      </nav>
    </header>
  );
}
