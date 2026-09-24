import { Outlet } from 'react-router-dom';
import MainNav from './MainNav';
import AppStatus from './AppStatus';
import ErrorBoundary from '../../shared/ui/ErrorBoundary';
import AssistantFloatingButton from '../../domains/ai/assistant/AssistantFloatingButton';

export default function Layout() {
  return (
    <div className="app-shell">
      <MainNav />
      <main className="main-content" id="main-workspace" tabIndex={-1}>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <AppStatus />
      <AssistantFloatingButton />
    </div>
  );
}
