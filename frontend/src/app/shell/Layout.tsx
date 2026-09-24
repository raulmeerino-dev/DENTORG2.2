import { Outlet } from 'react-router-dom';
import MainNav from './MainNav';
import AppStatus from './AppStatus';
import ErrorBoundary from '../../shared/ui/ErrorBoundary';
import AssistantFloatingButton from '../../domains/ai/assistant/AssistantFloatingButton';

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
      <AssistantFloatingButton />
    </div>
  );
}
