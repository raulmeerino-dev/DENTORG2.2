import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Building2,
  CalendarCheck2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  LogOut,
  Moon,
  Settings2,
  ShieldCheck,
  Sun,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { GLOBAL_LAUNCHER_IDS, ROLE_LABELS, WORKFLOW_ITEMS, canAccess } from '../config/workflow';
import type { AppSection, WorkflowItem } from '../config/workflow';
import dentorgLogo from '../assets/branding/dentorg-clinic-logo-64.png';
import DoctorNotificationsBell from './DoctorNotificationsBell';
import DoctorQuickScheduleDropdown from './DoctorQuickScheduleDropdown';

const ICON_SIZE = 18;

const NAV_ICONS: Partial<Record<AppSection, ReactNode>> = {
  hoy: <CalendarCheck2 size={ICON_SIZE} strokeWidth={1.9} />,
  agenda: <CalendarDays size={ICON_SIZE} strokeWidth={1.9} />,
  pacientes: <UsersRound size={ICON_SIZE} strokeWidth={1.9} />,
  listados: <ClipboardList size={ICON_SIZE} strokeWidth={1.9} />,
  adminExtras: <Settings2 size={ICON_SIZE} strokeWidth={1.9} />,
  portalPaciente: <CalendarCheck2 size={ICON_SIZE} strokeWidth={1.9} />,
};

export default function MainNav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const headerRef = useRef<HTMLElement | null>(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('dentorg-theme') ?? 'light');
  const [now, setNow] = useState(() => new Date());
  const [launcherOpen, setLauncherOpen] = useState(false);
  const navItems = GLOBAL_LAUNCHER_IDS
    .map((id) => WORKFLOW_ITEMS.find((item) => item.id === id))
    .filter((item): item is WorkflowItem => Boolean(item?.route && canAccess(user?.rol, item)));
  const nowLabel = now.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' })
    + ` ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  const isDark = theme === 'dark';
  const isAdminArea = ['/admin-extras', '/configuracion'].some((route) => location.pathname.startsWith(route));
  const isAgendaArea = ['/agenda', '/whatsapp'].some((route) => location.pathname.startsWith(route));
  const isReportsArea = ['/listados', '/caja'].some((route) => location.pathname.startsWith(route));
  const isPortalArea = ['/mis-citas', '/portal'].some((route) => location.pathname.startsWith(route));

  function isItemActive(item: WorkflowItem) {
    if (!item.route) return false;
    if (item.id === 'agenda') return isAgendaArea;
    if (item.id === 'listados') return isReportsArea;
    if (item.id === 'adminExtras') return isAdminArea;
    if (item.id === 'portalPaciente') return isPortalArea;
    return location.pathname === item.route || location.pathname.startsWith(`${item.route}/`);
  }

  const activeItem = navItems.find(isItemActive);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('dentorg-theme', theme);
  }, [theme]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!launcherOpen) return undefined;

    function onPointerDown(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setLauncherOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setLauncherOpen(false);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [launcherOpen]);

  return (
    <header className="euro-shell-header app-launcher-shell" ref={headerRef}>
      <div className="euro-titlebar app-launcher-bar">
        <div className="app-launcher-anchor">
          <button
            type="button"
            className="app-brand app-launcher-trigger"
            aria-haspopup="menu"
            aria-expanded={launcherOpen}
            aria-controls="main-module-launcher"
            onClick={() => setLauncherOpen((open) => !open)}
          >
            <span className="app-brand-mark" aria-hidden="true">
              <img src={dentorgLogo} alt="" />
            </span>
            <span className="app-brand-copy">
              <strong>DentOrg2 Clinic</strong>
              <span className="title-clock">{activeItem?.label ?? nowLabel}</span>
            </span>
            <ChevronDown className="app-launcher-chevron" size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>

          {launcherOpen && (
            <div id="main-module-launcher" className="module-launcher-menu" role="menu" aria-label="Modulos principales">
              {navItems.map((item) => {
                const active = isItemActive(item);
                return (
                  <NavLink
                    key={item.id}
                    to={item.route!}
                    role="menuitem"
                    aria-current={active ? 'page' : undefined}
                    className={`module-launcher-item${active ? ' active' : ''}`}
                    onClick={() => setLauncherOpen(false)}
                  >
                    <span className="module-launcher-icon" aria-hidden="true">{NAV_ICONS[item.id]}</span>
                    <span className="module-launcher-copy">
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </NavLink>
                );
              })}
            </div>
          )}
        </div>

        <div className="euro-titlebar-context">
          <span className="title-clock app-launcher-clock">{nowLabel}</span>
          <span className="clinic-chip"><Building2 size={13} strokeWidth={2} aria-hidden="true" /> Clinica Dental</span>
          <span className="role-chip"><ShieldCheck size={13} strokeWidth={2} aria-hidden="true" /> {user?.nombre} - {user?.rol ? ROLE_LABELS[user.rol] : 'Sin rol'}</span>
          <DoctorQuickScheduleDropdown />
          <DoctorNotificationsBell />
          <button
            type="button"
            className={`theme-toggle ${isDark ? 'is-dark' : ''}`}
            aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
            title={isDark ? 'Modo claro' : 'Modo oscuro'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          >
            {isDark ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
          </button>
          <button className="euro-nav-button nav-exit app-launcher-exit" onClick={() => void logout()}>
            <span className="nav-icon" aria-hidden="true">
              <LogOut size={ICON_SIZE} strokeWidth={1.9} />
            </span>
            <span>Salir</span>
          </button>
        </div>
      </div>
    </header>
  );
}
