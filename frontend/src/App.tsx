import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast, Toaster } from 'sonner';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { getApiErrorMessage } from './lib/api';
import type { UserRole } from './types/api';
import Layout from './components/Layout';
import HoyPage from './modules/hoy';
import LoginPage from './modules/auth/LoginPage';
import PortalInvitePage from './modules/portalInvite';

const PacientesPage = lazy(() => import('./modules/pacientes'));
const AgendaPage = lazy(() => import('./modules/agenda'));
const CajaPage = lazy(() => import('./modules/caja'));
const ListadosPage = lazy(() => import('./modules/listados'));
const AdminExtrasPage = lazy(() => import('./modules/adminExtras'));
const MisCitasPage = lazy(() => import('./modules/misCitas'));
const WhatsAppPage = lazy(() => import('./modules/whatsapp'));

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

function LazyRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="loading-page">Cargando modulo...</div>}>
      {children}
    </Suspense>
  );
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
            <Route path="/portal/invite/:token" element={<PortalInvitePage />} />
            <Route path="/" element={<Protected><Layout /></Protected>}>
              <Route index element={<HomeRedirect />} />
              <Route path="hoy" element={<RoleProtected roles={STAFF_ROLES}><HoyPage /></RoleProtected>} />
              <Route path="dashboard" element={<RoleProtected roles={ADMIN_ROLES}><Navigate to="/admin-extras?tab=reportes" replace /></RoleProtected>} />
              <Route path="pacientes" element={<RoleProtected roles={STAFF_ROLES}><LazyRoute><PacientesPage /></LazyRoute></RoleProtected>} />
              <Route path="agenda" element={<RoleProtected roles={STAFF_ROLES}><LazyRoute><AgendaPage /></LazyRoute></RoleProtected>} />
              <Route path="whatsapp" element={<RoleProtected roles={STAFF_ROLES}><LazyRoute><WhatsAppPage /></LazyRoute></RoleProtected>} />
              <Route path="caja" element={<RoleProtected roles={BILLING_ROLES}><LazyRoute><CajaPage /></LazyRoute></RoleProtected>} />
              <Route path="listados" element={<RoleProtected roles={REPORT_ROLES}><LazyRoute><ListadosPage /></LazyRoute></RoleProtected>} />
              <Route path="configuracion" element={<RoleProtected roles={ADMIN_ROLES}><ConfiguracionRedirect /></RoleProtected>} />
              <Route path="admin-extras" element={<RoleProtected roles={ADMIN_ROLES}><LazyRoute><AdminExtrasPage /></LazyRoute></RoleProtected>} />
              <Route path="mis-citas" element={<RoleProtected roles={PATIENT_ROLES}><LazyRoute><MisCitasPage /></LazyRoute></RoleProtected>} />
              <Route path="portal" element={<RoleProtected roles={PATIENT_ROLES}><LazyRoute><MisCitasPage /></LazyRoute></RoleProtected>} />
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
