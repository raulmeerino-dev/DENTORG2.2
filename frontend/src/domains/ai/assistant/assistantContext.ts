import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../identity/session/AuthContext';
import type { UsuarioMe, UserRole } from '../../../api/types';
import type { AssistantContextSnapshot, AssistantPermission } from './types';

const ROLE_PERMISSIONS: Record<UserRole, AssistantPermission[]> = {
  admin: [
    'read_patients',
    'open_patient_profile',
    'read_schedule',
    'create_appointments',
    'move_appointments',
    'cancel_appointments',
    'create_tasks',
    'read_patient_pending',
    'create_budget',
    'budget:create',
    'budget:confirm',
    'register_payment',
    'create_clinical_note',
  ],
  doctor: [
    'read_patients',
    'open_patient_profile',
    'read_schedule',
    'create_appointments',
    'move_appointments',
    'cancel_appointments',
    'create_tasks',
    'read_patient_pending',
    'create_budget',
    'budget:create',
    'budget:confirm',
    'create_clinical_note',
  ],
  recepcion: [
    'read_patients',
    'open_patient_profile',
    'read_schedule',
    'create_appointments',
    'move_appointments',
    'cancel_appointments',
    'create_tasks',
    'read_patient_pending',
    'create_budget',
    'budget:create',
    'budget:confirm',
    'register_payment',
  ],
  auxiliar: [
    'read_patients',
    'open_patient_profile',
    'read_schedule',
    'create_appointments',
    'create_tasks',
    'read_patient_pending',
  ],
  paciente: [],
};

function screenFromPath(pathname: string, search = '') {
  if (pathname.startsWith('/jornada')) return new URLSearchParams(search).get('vista') === 'agenda' ? 'schedule' : 'today';
  if (pathname.startsWith('/pacientes')) return 'patient_profile';
  if (pathname.startsWith('/agenda')) return 'schedule';
  if (pathname.startsWith('/caja')) return 'cashdesk';
  if (['/listados', '/registros', '/archivos'].some(path => pathname.startsWith(path))) return 'reports';
  if (['/admin-extras', '/configuracion', '/administracion', '/ajustes'].some(path => pathname.startsWith(path))) return 'admin';
  if (pathname.startsWith('/hoy')) return 'today';
  if (pathname.startsWith('/whatsapp')) return 'whatsapp';
  return 'unknown';
}

function readSessionValue(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function buildAssistantContext(pathname: string, user: UsuarioMe | null, search = ''): AssistantContextSnapshot {
  const patientId = user?.rol === 'paciente'
    ? user.paciente_id ?? null
    : readSessionValue('dentcore_selected_patient_id');
  const patientName = user?.rol === 'paciente'
    ? null
    : readSessionValue('dentcore_selected_patient_name');

  return {
    screen: screenFromPath(pathname, search),
    path: pathname,
    currentPatientId: patientId,
    currentPatientDisplayName: patientName,
    selectedAppointmentId: readSessionValue('dentcore_agenda_focus_cita_id'),
    visibleAgendaDate: readSessionValue('dentcore_agenda_focus_date'),
    currentUserId: user?.id ?? null,
    currentDoctorId: user?.doctor_id ?? null,
    currentUserRole: user?.rol ?? null,
    permissions: user?.rol ? ROLE_PERMISSIONS[user.rol] : [],
    recentActions: [screenFromPath(pathname, search)],
  };
}

export function useAssistantContextProvider() {
  const location = useLocation();
  const { user } = useAuth();

  return useCallback(
    () => buildAssistantContext(location.pathname, user, location.search),
    [location.pathname, location.search, user],
  );
}
