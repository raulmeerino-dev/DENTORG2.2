import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast, Toaster } from 'sonner';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { getApiErrorMessage } from './lib/api';
import type { UserRole } from './types/api';
import Layout from './components/Layout';
import PacientesPage from './modules/pacientes';
import AgendaPage from './modules/agenda';
import CajaPage from './modules/caja';
import HoyPage from './modules/hoy';
import ListadosPage from './modules/listados';
import LoginPage from './modules/auth/LoginPage';
import AdminExtrasPage from './modules/adminExtras';
import MisCitasPage from './modules/misCitas';

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError) return;
      toast.error(getApiErrorMessage(error, 'No se pudo completar la operación.'));
    },
  }),
});

function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="loading-page">Cargando sesión...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function RoleProtected({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.rol)) return <Navigate to="/hoy" replace />;
  return children;
}

function ConfiguracionRedirect() {
  const location = useLocation();
  return <Navigate to={`/admin-extras${location.search}`} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Protected><Layout /></Protected>}>
              <Route index element={<Navigate to="/hoy" replace />} />
              <Route path="hoy" element={<HoyPage />} />
              <Route path="dashboard" element={<RoleProtected roles={['admin']}><Navigate to="/admin-extras?tab=reportes" replace /></RoleProtected>} />
              <Route path="pacientes" element={<PacientesPage />} />
              <Route path="agenda" element={<AgendaPage />} />
              <Route path="caja" element={<RoleProtected roles={['admin', 'recepcion']}><CajaPage /></RoleProtected>} />
              <Route path="listados" element={<RoleProtected roles={['admin']}><ListadosPage /></RoleProtected>} />
              <Route path="configuracion" element={<RoleProtected roles={['admin']}><ConfiguracionRedirect /></RoleProtected>} />
              <Route path="admin-extras" element={<RoleProtected roles={['admin']}><AdminExtrasPage /></RoleProtected>} />
              <Route path="mis-citas" element={<MisCitasPage />} />
              <Route path="portal" element={<MisCitasPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster
          position="top-right"
          richColors
          closeButton
          theme="system"
          toastOptions={{
            duration: 4500,
            style: { fontFamily: 'inherit' },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
