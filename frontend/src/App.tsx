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
import WhatsAppPage from './modules/whatsapp';

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError) return;
      toast.error(getApiErrorMessage(error, 'No se pudo completar la operación.'));
    },
  }),
});

const STAFF_ROLES: UserRole[] = ['admin', 'doctor', 'recepcion', 'auxiliar'];
const BILLING_ROLES: UserRole[] = ['admin', 'recepcion'];
const REPORT_ROLES: UserRole[] = ['admin', 'recepcion'];
const ADMIN_ROLES: UserRole[] = ['admin'];
const PATIENT_ROLES: UserRole[] = ['paciente'];

function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="loading-page">Cargando sesión...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function RoleProtected({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.rol)) {
    return <Navigate to={user?.rol === 'paciente' ? '/mis-citas' : '/hoy'} replace />;
  }
  return children;
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.rol === 'paciente' ? '/mis-citas' : '/hoy'} replace />;
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
              <Route index element={<HomeRedirect />} />
              <Route path="hoy" element={<RoleProtected roles={STAFF_ROLES}><HoyPage /></RoleProtected>} />
              <Route path="dashboard" element={<RoleProtected roles={ADMIN_ROLES}><Navigate to="/admin-extras?tab=reportes" replace /></RoleProtected>} />
              <Route path="pacientes" element={<RoleProtected roles={STAFF_ROLES}><PacientesPage /></RoleProtected>} />
              <Route path="agenda" element={<RoleProtected roles={STAFF_ROLES}><AgendaPage /></RoleProtected>} />
              <Route path="whatsapp" element={<RoleProtected roles={STAFF_ROLES}><WhatsAppPage /></RoleProtected>} />
              <Route path="caja" element={<RoleProtected roles={BILLING_ROLES}><CajaPage /></RoleProtected>} />
              <Route path="listados" element={<RoleProtected roles={REPORT_ROLES}><ListadosPage /></RoleProtected>} />
              <Route path="configuracion" element={<RoleProtected roles={ADMIN_ROLES}><ConfiguracionRedirect /></RoleProtected>} />
              <Route path="admin-extras" element={<RoleProtected roles={ADMIN_ROLES}><AdminExtrasPage /></RoleProtected>} />
              <Route path="mis-citas" element={<RoleProtected roles={PATIENT_ROLES}><MisCitasPage /></RoleProtected>} />
              <Route path="portal" element={<RoleProtected roles={PATIENT_ROLES}><MisCitasPage /></RoleProtected>} />
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
