import { ToolbarSlots } from '../../design-system/ToolbarSlots';
import { Outlet, useLocation } from 'react-router-dom';
import MainNav from './MainNav';
import AppStatus from './AppStatus';
import RecordReturnLink from './RecordReturnLink';
import ErrorBoundary from '../../shared/ui/ErrorBoundary';
import AssistantFloatingButton from '../../domains/ai/assistant/AssistantFloatingButton';

export default function Layout() {
  const location = useLocation();
  return (
    <ToolbarSlots><div className="app-shell">
      <MainNav />
      <main className="main-content" id="main-workspace" tabIndex={-1}>
        <RecordReturnLink />
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <AppStatus />
      <AssistantFloatingButton />
    </div></ToolbarSlots>
  );
}
