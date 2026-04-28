import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import type { UserRole } from './types/api';
import Layout from './components/Layout';
import PacientesPage from './modules/pacientes';
import AgendaPage from './modules/agenda';
import ListadosPage from './modules/listados';
import ConfiguracionPage from './modules/configuracion';
import LoginPage from './modules/auth/LoginPage';
import DashboardPage from './modules/dashboard';
import AdminExtrasPage from './modules/adminExtras';
import MisCitasPage from './modules/misCitas';

const queryClient = new QueryClient();

function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="loading-page">Cargando sesión...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function RoleProtected({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.rol)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Protected><Layout /></Protected>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="pacientes" element={<PacientesPage />} />
              <Route path="agenda" element={<AgendaPage />} />
              <Route path="listados" element={<RoleProtected roles={['admin']}><ListadosPage /></RoleProtected>} />
              <Route path="configuracion" element={<RoleProtected roles={['admin']}><ConfiguracionPage /></RoleProtected>} />
              <Route path="admin-extras" element={<RoleProtected roles={['admin']}><AdminExtrasPage /></RoleProtected>} />
              <Route path="mis-citas" element={<MisCitasPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
