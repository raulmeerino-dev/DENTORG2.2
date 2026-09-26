import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast, Toaster } from 'sonner';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from '../domains/identity/session/AuthContext';
import { getApiErrorMessage } from '../api/errors';
import type { UserRole } from '../api/types';
import Layout from './shell/Layout';
import RealtimeSync from '../shared/realtime/RealtimeSync';
import JornadaWorkspace from '../domains/scheduling/workspace/JornadaWorkspace';
import LoginPage from '../domains/identity/LoginPage';
import PortalInvitePage from '../domains/patient-portal/invitation';
import { administrationHref } from '../domains/administration/tabs';

const PacientesPage = lazy(() => import('../domains/patients'));
const PatientFileView = lazy(() => import('../domains/documents/PatientFileView'));
const CajaPage = lazy(() => import('../domains/billing/cash-register'));
const RecordsWorkspace = lazy(() => import('../domains/reporting'));
const AdminExtrasPage = lazy(() => import('../domains/administration'));
const MisCitasPage = lazy(() => import('../domains/patient-portal/appointments'));
const WhatsAppPage = lazy(() => import('../domains/communications/whatsapp'));

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
const ADMIN_ROLES: UserRole[] = ['admin'];
const PATIENT_ROLES: UserRole[] = ['paciente'];

function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="loading-page">Cargando sesión...</div>;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function RoleProtected({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.rol)) {
    return <Navigate to={user?.rol === 'paciente' ? '/mis-citas' : '/jornada'} replace />;
  }
  return children;
}

function LazyRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="loading-page">Cargando módulo…</div>}>
      {children}
    </Suspense>
  );
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.rol === 'paciente' ? '/mis-citas' : '/jornada'} replace />;
}

function JornadaRedirect({ perspective }: { perspective: 'agenda' | 'operativa' }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('vista', perspective);
  if (!params.has('fecha')) {
    const focusedDate = sessionStorage.getItem('dentcore_agenda_focus_date');
    if (focusedDate) params.set('fecha', focusedDate);
  }
  return <Navigate to={`/jornada?${params}`} replace />;
}

function ConfiguracionRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const destination = new URL(administrationHref(params.get('tab') ?? 'general'), window.location.origin);
  params.forEach((value, key) => { if (key !== 'tab') destination.searchParams.set(key, value); });
  return <Navigate to={`${destination.pathname}${destination.search}`} replace />;
}

function RecordsRedirect() {
  const location = useLocation();
  return <Navigate to={`/registros${location.search}`} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeSync />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/portal/invite/:token" element={<PortalInvitePage />} />
            <Route path="/" element={<Protected><Layout /></Protected>}>
              <Route index element={<HomeRedirect />} />
              <Route path="jornada" element={<RoleProtected roles={STAFF_ROLES}><JornadaWorkspace /></RoleProtected>} />
              <Route path="hoy" element={<RoleProtected roles={STAFF_ROLES}><JornadaRedirect perspective="operativa" /></RoleProtected>} />
              <Route path="dashboard" element={<RoleProtected roles={ADMIN_ROLES}><Navigate to="/administracion?tab=reportes" replace /></RoleProtected>} />
              <Route path="pacientes" element={<RoleProtected roles={STAFF_ROLES}><LazyRoute><PacientesPage /></LazyRoute></RoleProtected>} />
              <Route path="pacientes/:patientId/archivo/:kind/:fileId" element={<RoleProtected roles={STAFF_ROLES}><LazyRoute><PatientFileView /></LazyRoute></RoleProtected>} />
              <Route path="agenda" element={<RoleProtected roles={STAFF_ROLES}><JornadaRedirect perspective="agenda" /></RoleProtected>} />
              <Route path="whatsapp" element={<RoleProtected roles={STAFF_ROLES}><LazyRoute><WhatsAppPage /></LazyRoute></RoleProtected>} />
              <Route path="caja" element={<RoleProtected roles={BILLING_ROLES}><LazyRoute><CajaPage /></LazyRoute></RoleProtected>} />
              <Route path="registros" element={<RoleProtected roles={STAFF_ROLES}><LazyRoute><RecordsWorkspace /></LazyRoute></RoleProtected>} />
              <Route path="archivos" element={<RoleProtected roles={STAFF_ROLES}><LazyRoute><RecordsWorkspace mode="files" /></LazyRoute></RoleProtected>} />
              <Route path="listados" element={<RoleProtected roles={STAFF_ROLES}><RecordsRedirect /></RoleProtected>} />
              <Route path="configuracion" element={<RoleProtected roles={ADMIN_ROLES}><ConfiguracionRedirect /></RoleProtected>} />
              <Route path="admin-extras" element={<RoleProtected roles={ADMIN_ROLES}><ConfiguracionRedirect /></RoleProtected>} />
              <Route path="administracion" element={<RoleProtected roles={ADMIN_ROLES}><LazyRoute><AdminExtrasPage key="administration" mode="administration" /></LazyRoute></RoleProtected>} />
              <Route path="ajustes" element={<RoleProtected roles={ADMIN_ROLES}><LazyRoute><AdminExtrasPage key="settings" /></LazyRoute></RoleProtected>} />
              <Route path="mis-citas" element={<RoleProtected roles={PATIENT_ROLES}><LazyRoute><MisCitasPage /></LazyRoute></RoleProtected>} />
              <Route path="*" element={<section className="page error-screen"><h1>Pantalla no encontrada</h1><p>Comprueba la dirección o abre una sección desde la navegación lateral.</p></section>} />
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
