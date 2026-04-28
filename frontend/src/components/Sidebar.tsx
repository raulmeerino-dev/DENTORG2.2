import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS, WORKFLOW_ITEMS, canAccess } from '../config/workflow';

export default function MainNav() {
  const { user, logout } = useAuth();
  const navItems = WORKFLOW_ITEMS.filter((item) => item.route && canAccess(user?.rol, item));
  const today = new Date().toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });

  return (
    <header className="euro-shell-header">
      <div className="euro-titlebar">
        <strong>DentOrg2 Clinic</strong>
        <span>Clinica actual: CLINICA DENTAL</span>
        <span>{today}</span>
        <span className="role-chip">{user?.nombre} · {user?.rol ? ROLE_LABELS[user.rol] : 'Sin rol'}</span>
      </div>
      <nav className="euro-main-nav" aria-label="Modulos principales">
        {navItems.map((item) => (
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
        <button className="euro-nav-button nav-exit" onClick={() => void logout()}>
          <span className="nav-icon">[X]</span>
          <span>Salir</span>
        </button>
      </nav>
    </header>
  );
}
