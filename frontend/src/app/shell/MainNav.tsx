import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Building2, Banknote, CalendarDays, ClipboardList, LogOut, Moon, Settings2, Sun, UsersRound, Sparkles } from 'lucide-react';
import { useAuth } from '../../domains/identity/session/AuthContext';
import { GLOBAL_LAUNCHER_IDS, ROLE_LABELS, WORKFLOW_ITEMS, canAccess } from '../navigation/workflow';
import type { AppSection } from '../navigation/workflow';
import dentcoreLogo from '../../assets/branding/dentcore-clinic-logo-64.png';
import DoctorNotificationsBell from '../../domains/scheduling/components/DoctorNotificationsBell';
import StaffClockPopover from '../../domains/identity/components/StaffClockPopover';
import EnSala from '../../domains/scheduling/workspace/EnSala';
import './shell.css';

const icons: Partial<Record<AppSection, typeof CalendarDays>> = { hoy: CalendarDays, pacientes: UsersRound, caja: Banknote, listados: ClipboardList, adminExtras: Settings2, portalPaciente: CalendarDays };

export default function MainNav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem('dentcore-theme') ?? 'light');
  const [now, setNow] = useState(() => new Date());
  const navItems = WORKFLOW_ITEMS.filter(item => GLOBAL_LAUNCHER_IDS.includes(item.id) && item.route && canAccess(user?.rol, item));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('dentcore-theme', theme);
  }, [theme]);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  const clock = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + ' · ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return <>
    <aside className="dc-sidebar">
      <NavLink to={user?.rol === 'paciente' ? '/mis-citas' : '/jornada'} className="dc-brand" aria-label="DentCore"><img src={dentcoreLogo} alt="" /><strong>DentCore</strong></NavLink>
      <nav className="dc-navigation" aria-label="Navegación principal">
        {navItems.map(item => {
          const Icon = icons[item.id] ?? CalendarDays;
          const active = item.id === 'hoy' ? ['/jornada', '/hoy', '/agenda', '/whatsapp'].some(path => location.pathname.startsWith(path)) : location.pathname.startsWith(item.route!);
          return <NavLink key={item.id} to={item.route!} className={`dc-nav-link${active ? ' is-active' : ''}${item.id === 'adminExtras' ? ' dc-nav-settings' : ''}`} aria-current={active ? 'page' : undefined} title={item.label}><Icon size={18} aria-hidden="true" /><span>{item.label}</span></NavLink>;
        })}
      </nav>
      <div className="dc-sidebar-footer"><span>Gestión clínica</span><small>DentCore Clinic</small></div>
    </aside>
    <header className="dc-topbar">
      <div className="dc-clinic"><Building2 size={16} aria-hidden="true" /><span>Clínica Dental</span></div>
      {user?.rol !== 'paciente' && <button type="button" className="dc-assistant-trigger" aria-label="Asistente" onClick={() => window.dispatchEvent(new Event('dentcore:open-assistant'))}><Sparkles size={15} aria-hidden="true" /><span>Asistente</span><kbd>Ctrl Espacio</kbd></button>}
      <div className="dc-topbar-actions">
        {user?.rol !== 'paciente' && <EnSala />}
        <DoctorNotificationsBell />
        {user?.rol !== 'paciente' && <div className="dc-clock"><StaffClockPopover label={clock} currentUserId={user?.id} /></div>}
        <span className="dc-user" title={user?.rol ? ROLE_LABELS[user.rol] : ''}>{user?.nombre}<small>{user?.rol ? ROLE_LABELS[user.rol] : ''}</small></span>
        <button type="button" className="dc-icon-button" aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
        <button type="button" className="dc-icon-button" aria-label="Cerrar sesión" onClick={() => void logout()}><LogOut size={17} /></button>
      </div>
    </header>
  </>;
}
