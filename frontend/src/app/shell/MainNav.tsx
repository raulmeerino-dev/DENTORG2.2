import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getClinicas } from '../../api/identity';
import { Banknote, CalendarDays, ClipboardList, FolderOpen, BriefcaseBusiness, LogOut, Moon, Settings2, Sun, UsersRound, Sparkles } from 'lucide-react';
import { FloatingPopover } from '../../design-system/FloatingPopover';
import { useAuth } from '../../domains/identity/session/AuthContext';
import { GLOBAL_LAUNCHER_IDS, ROLE_LABELS, WORKFLOW_ITEMS, canAccess } from '../navigation/workflow';
import type { AppSection } from '../navigation/workflow';
import dentcoreLogo from '../../assets/branding/dentcore-clinic-logo-64.png';
import DoctorNotificationsBell from '../../domains/scheduling/components/DoctorNotificationsBell';
import StaffClockPopover from '../../domains/identity/components/StaffClockPopover';
import EnSala from '../../domains/scheduling/workspace/EnSala';
import { getClinicTimeZone } from '../../shared/time/clinicTime';
import './shell.css';

const icons: Partial<Record<AppSection, typeof CalendarDays>> = { hoy: CalendarDays, pacientes: UsersRound, caja: Banknote, listados: ClipboardList, archivos: FolderOpen, administracion: BriefcaseBusiness, adminExtras: Settings2, portalPaciente: CalendarDays };

export default function MainNav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuAnchor = useRef<HTMLButtonElement>(null);
  const clinics = useQuery({ queryKey: ['clinicas', user?.clinica_id], queryFn: getClinicas, enabled: userMenuOpen && user?.rol !== 'paciente', staleTime: 300_000 });
  const clinic = clinics.data?.find(item => item.id === user?.clinica_id) ?? (clinics.data?.length === 1 ? clinics.data[0] : undefined);
  const clinicLabel = clinic?.nombre ?? (clinics.isError ? 'Clínica no disponible' : clinics.data && clinics.data.length > 1 ? 'Todas las clínicas' : 'Clínica Dental');
  const [theme, setTheme] = useState(() => localStorage.getItem('dentcore-theme') ?? 'light');
  const [now, setNow] = useState(() => new Date());
  const navItems = WORKFLOW_ITEMS.filter(item => GLOBAL_LAUNCHER_IDS.includes(item.id) && item.route && canAccess(user?.rol, item));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('dentcore-theme', theme);
  }, [theme]);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  const clock = now.toLocaleDateString('es-ES', { timeZone: getClinicTimeZone(), day: '2-digit', month: 'short' }) + ' · ' + now.toLocaleTimeString('es-ES', { timeZone: getClinicTimeZone(), hour: '2-digit', minute: '2-digit' });
  return <>
    <a className="dc-skip-link" href="#main-workspace">Ir al área de trabajo</a>
    <aside className="dc-sidebar" aria-label="Barra lateral">
      <NavLink to={user?.rol === 'paciente' ? '/mis-citas' : '/jornada'} className="dc-brand" aria-label="DentCore"><img src={dentcoreLogo} alt="" /><strong>DentCore</strong></NavLink>
      <nav className="dc-navigation" aria-label="Navegación principal">
        {(['daily', 'secondary'] as const).map(group => <div className={`dc-nav-group dc-nav-group-${group}`} key={group} role="group" aria-label={group === 'daily' ? 'Trabajo diario' : 'Consulta y administración'}>
        {navItems.filter(item => (item.group ?? 'daily') === group).map(item => {
          const Icon = icons[item.id] ?? CalendarDays;
          const agendaActive = location.pathname === '/agenda' || (location.pathname === '/jornada' && new URLSearchParams(location.search).get('vista') === 'agenda');
          const active = item.id === 'agenda' ? agendaActive : item.id === 'hoy' ? !agendaActive && ['/jornada', '/hoy', '/whatsapp'].some(path => location.pathname.startsWith(path)) : location.pathname.startsWith(item.route!);
          const jornadaParams = new URLSearchParams(location.pathname === '/jornada' ? location.search : '');
          if (item.id === 'agenda' || item.id === 'hoy') jornadaParams.set('vista', item.id === 'agenda' ? 'agenda' : 'operativa');
          const route = item.id === 'agenda' || item.id === 'hoy' ? `/jornada?${jornadaParams}` : item.route!;
          return <Link key={item.id} to={route} className={`dc-nav-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} title={item.label}><Icon size={18} aria-hidden="true" /><span>{item.label}</span></Link>;
        })}
        </div>)}
      </nav>
    </aside>
    <header className="dc-topbar">
      <div className="dc-topbar-actions">
        {user?.rol !== 'paciente' && <EnSala />}
        <DoctorNotificationsBell />
        {user?.rol !== 'paciente' && <div className="dc-clock"><StaffClockPopover label={clock} currentUserId={user?.id} /></div>}
        <button type="button" ref={userMenuAnchor} className="dc-user-menu-trigger" aria-label="Menú de usuario" aria-haspopup="menu" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen(!userMenuOpen)} title={user?.nombre}><UsersRound size={16} aria-hidden="true" /><span>{user?.nombre}</span></button>
        {userMenuOpen && <FloatingPopover anchorRef={userMenuAnchor} onClose={() => setUserMenuOpen(false)} role="menu" aria-label="Menú de usuario" className="patient-actions-menu" width={260}>
          <div className="dc-user-menu-context"><strong>{user?.nombre}</strong><span>{user?.rol ? ROLE_LABELS[user.rol] : ''}</span>{user?.rol !== 'paciente' && <span>{clinicLabel}</span>}</div>
          {user?.rol !== 'paciente' && <button type="button" role="menuitem" onClick={() => { setUserMenuOpen(false); window.dispatchEvent(new Event('dentcore:open-assistant')); }}><Sparkles size={15} aria-hidden="true" /><span>Asistente · Ctrl Espacio</span></button>}
        </FloatingPopover>}
        <button type="button" className="dc-icon-button" aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
        <button type="button" className="dc-icon-button" aria-label="Cerrar sesión" onClick={() => void logout()}><LogOut size={17} /></button>
      </div>
    </header>
  </>;
}
