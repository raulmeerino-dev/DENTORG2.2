import { clinicTime } from '../../../shared/time/clinicTime';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCircle2, Clock3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../identity/session/AuthContext';
import { getMyDoctorNotifications, markDoctorNotificationRead } from '../../../api/communications';
import { localAppointmentDate } from '../agenda/agendaTime';
import type { DoctorNotification } from '../../../api/types';
import { FloatingPopover } from '../../../design-system/FloatingPopover';

const POLL_INTERVAL_MS = 6000;

function appointmentDate(notification: DoctorNotification) {
  return localAppointmentDate(notification.appointment_time);
}

function appointmentTimeLabel(notification: DoctorNotification) {
  return clinicTime(notification.appointment_time);
}

function createdTimeLabel(notification: DoctorNotification) {
  return clinicTime(notification.created_at);
}

function playNotificationSound() {
  const AudioContextClass = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.16);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.18);
  window.setTimeout(() => void context.close(), 320);
}

function DoctorNotificationsBellContent({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const initializedRef = useRef(false);
  const shownRef = useRef<Set<string>>(new Set());

  const notificationsQuery = useQuery({
    queryKey: ['doctor-notifications', userId],
    queryFn: () => getMyDoctorNotifications(false),
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const markReadMutation = useMutation({
    mutationFn: markDoctorNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['doctor-notifications', userId] });
    },
  });

  const notifications = useMemo(() => notificationsQuery.data ?? [], [notificationsQuery.data]);
  const unread = useMemo(() => notifications.filter((notification) => !notification.read), [notifications]);

  const openAppointment = useCallback((notification: DoctorNotification) => {
    shownRef.current.add(notification.id);
    if (!notification.read) {
      markReadMutation.mutate(notification.id);
    }
    setOpen(false);
    navigate(`/jornada?vista=agenda&fecha=${appointmentDate(notification)}&doctor_id=${notification.recipient_doctor_id}&cita_id=${notification.appointment_id}`);
  }, [markReadMutation, navigate]);

  useEffect(() => {
    if (!notificationsQuery.data) return;
    const unreadNow = notificationsQuery.data.filter((notification) => !notification.read);
    if (!initializedRef.current) {
      unreadNow.forEach((notification) => shownRef.current.add(notification.id));
      initializedRef.current = true;
      return;
    }

    unreadNow.forEach((notification) => {
      if (shownRef.current.has(notification.id)) return;
      shownRef.current.add(notification.id);
      toast(notification.title, {
        description: `${appointmentTimeLabel(notification)} - ${notification.message}`,
        action: {
          label: 'Ver cita',
          onClick: () => openAppointment(notification),
        },
      });
      try {
        playNotificationSound();
      } catch {
        // Some browsers block audio until the user has interacted with the page.
      }
    });
  }, [notificationsQuery.data, openAppointment]);

  return (
    <div className="doctor-notifications">
      <button
        ref={triggerRef}
        type="button"
        className={`doctor-notifications-trigger ${unread.length ? 'has-unread' : ''}`}
        aria-label={unread.length ? `Notificaciones: ${unread.length} sin leer` : 'Notificaciones'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={16} strokeWidth={2.1} aria-hidden="true" />
        {unread.length > 0 && <span>{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>

      {open && (
        <FloatingPopover anchorRef={triggerRef} width={380} maxHeight={520} onClose={() => setOpen(false)} className="doctor-notifications-popover" role="dialog" aria-label="Notificaciones del doctor">
          <header>
            <strong>Notificaciones</strong>
            <small>{unread.length ? `${unread.length} sin leer` : 'Sin pendientes'}</small>
          </header>
          <div className="doctor-notifications-list">
            {notifications.slice(0, 8).map((notification) => (
              <button
                type="button"
                key={notification.id}
                className={notification.read ? 'is-read' : 'is-unread'}
                onClick={() => openAppointment(notification)}
              >
                <span className="doctor-notification-icon" aria-hidden="true">
                  {notification.read ? <CheckCircle2 size={15} strokeWidth={2} /> : <Clock3 size={15} strokeWidth={2} />}
                </span>
                <span className="doctor-notification-copy">
                  <strong>{notification.patient_name}</strong>
                  <em>{notification.message}</em>
                  <small>{appointmentTimeLabel(notification)} - Aviso {createdTimeLabel(notification)}</small>
                </span>
              </button>
            ))}
            {notificationsQuery.isError && <p role="alert">No se pudieron cargar los avisos. <button type="button" onClick={() => void notificationsQuery.refetch()}>Reintentar</button></p>}
            {markReadMutation.isError && <p role="alert">No se pudo marcar el aviso como leído.</p>}
            {!notificationsQuery.isLoading && !notificationsQuery.isError && !notifications.length && (
              <p>No hay notificaciones pendientes.</p>
            )}
            {notificationsQuery.isLoading && <p>Cargando avisos...</p>}
          </div>
        </FloatingPopover>
      )}
    </div>
  );
}

export default function DoctorNotificationsBell() {
  const { user } = useAuth();
  if (user?.rol !== 'doctor' || !user.doctor_id) return null;
  return <DoctorNotificationsBellContent userId={user.id} />;
}
