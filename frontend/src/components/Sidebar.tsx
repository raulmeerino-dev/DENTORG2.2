import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS, WORKFLOW_ITEMS, canAccess } from '../config/workflow';

export default function MainNav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem('dentorg-theme') ?? 'light');
  const navItems = WORKFLOW_ITEMS.filter((item) => item.route && canAccess(user?.rol, item));
  const dailyItems = navItems.filter((item) => ['dashboard', 'pacientes', 'agenda'].includes(item.id));
  const adminItems = navItems.filter((item) => !['dashboard', 'pacientes', 'agenda'].includes(item.id));
  const today = new Date().toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
  const isDark = theme === 'dark';
  const isAdminArea = adminItems.some((item) => item.route && location.pathname.startsWith(item.route));
  const adminHome = adminItems.find((item) => item.id === 'ficheros') ?? adminItems[0];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('dentorg-theme', theme);
  }, [theme]);

  return (
    <header className="euro-shell-header">
      <div className="euro-titlebar">
        <strong>DentOrg2 Clinic</strong>
        <span>Clinica actual: CLINICA DENTAL</span>
        <span>{today}</span>
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
            <span className="nav-icon">{item.shortcut}</span>
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
              <span className="nav-icon">AD</span>
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
          <span className="nav-icon">[X]</span>
          <span>Salir</span>
        </button>
      </nav>
    </header>
  );
}
