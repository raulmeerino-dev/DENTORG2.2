import { Outlet } from 'react-router-dom';
import MainNav from './Sidebar';

export default function Layout() {
  return (
    <div className="app-shell">
      <MainNav />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
