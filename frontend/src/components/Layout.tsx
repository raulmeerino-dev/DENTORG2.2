import { Outlet } from 'react-router-dom';
import MainNav from './Sidebar';
import AppStatus from './AppStatus';
import ErrorBoundary from './ErrorBoundary';

export default function Layout() {
  return (
    <div className="app-shell">
      <MainNav />
      <AppStatus />
      <main className="main-content">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
