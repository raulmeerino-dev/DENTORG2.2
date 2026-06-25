import type { QueryClient } from '@tanstack/react-query';
import type { NavigateFunction } from 'react-router-dom';
import { getPresupuestos, getSaldoPaciente } from '../../lib/api';
import { cancelAppointmentFromAssistant, createAppointmentFromAssistant, moveAppointmentFromAssistant } from './AppointmentAssistantAdapter';
import { createBudgetFromAssistant } from './BudgetAssistantAdapter';
import { findAvailableSlotsForIntent, findVisibleAppointmentForIntent, getAssistantPatientAppointments, getAssistantScheduleByDate, getAssistantTodaySchedule, summarizeSchedule } from './ScheduleAssistantAdapter';
import type { AssistantActionResult, AssistantContextSnapshot, AssistantIntent, AssistantProfessionalOption, AssistantSlot } from './types';
import { preferredDateFromFields, slotLabel } from './schedulePlanning';

function setPatientSession(intent: AssistantIntent) {
  if (!intent.fields.patientId) return;
  sessionStorage.setItem('dentcore_selected_patient_id', intent.fields.patientId);
  if (intent.fields.patientDisplayName) {
    sessionStorage.setItem('dentcore_selected_patient_name', intent.fields.patientDisplayName);
  }
}

function appointmentQueryParams(fechaHora: string, citaId?: string) {
  const params = new URLSearchParams();
  params.set('fecha', fechaHora.slice(0, 10));
  if (citaId) params.set('cita_id', citaId);
  return params.toString();
}

export async function findSlotsForIntent(intent: AssistantIntent): Promise<AssistantSlot[]> {
  return findAvailableSlotsForIntent(intent);
}

export async function findAppointmentForIntent(intent: AssistantIntent, context: AssistantContextSnapshot) {
  return findVisibleAppointmentForIntent(intent, context);
}

async function ensureAppointmentSlot(intent: AssistantIntent) {
  if (intent.fields.slot?.fechaHora) return intent.fields.slot;
  const slots = intent.fields.suggestedSlots?.length ? intent.fields.suggestedSlots : await findSlotsForIntent(intent);
  return slots[0] ?? null;
}

export async function executeAssistantAction({
  intent,
  context,
  professionals = [],
  queryClient,
  navigate,
}: {
  intent: AssistantIntent;
  context: AssistantContextSnapshot;
  professionals?: AssistantProfessionalOption[];
  queryClient: QueryClient;
  navigate: NavigateFunction;
}): Promise<AssistantActionResult> {
  switch (intent.intent) {
    case 'open_patient_profile': {
      if (!intent.fields.patientId) return { ok: false, message: 'No hay un paciente real para abrir.' };
      setPatientSession(intent);
      navigate(`/pacientes?paciente_id=${intent.fields.patientId}`);
      return { ok: true, message: `Ficha abierta: ${intent.fields.patientDisplayName ?? 'paciente seleccionado'}.` };
    }

    case 'search_patient': {
      const options = intent.fields.patientOptions ?? [];
      return {
        ok: true,
        message: intent.fields.patientDisplayName
          ? `Coincidencia encontrada: ${intent.fields.patientDisplayName}.`
          : options.length
            ? `He encontrado ${options.length} coincidencia(s) para "${intent.fields.patientQuery}".`
            : `Busqueda preparada para "${intent.fields.patientQuery}".`,
        details: options.map((option) => `${option.displayName}${option.phone ? ` - ${option.phone}` : ''}`),
      };
    }

    case 'show_today_schedule': {
      const citas = await getAssistantTodaySchedule();
      const summary = summarizeSchedule(citas);
      navigate('/agenda');
      return {
        ok: true,
        message: `Agenda de hoy abierta: ${summary.total} cita(s) activas, ${summary.pending} pendiente(s) de confirmar.`,
        details: summary.next ? [`Siguiente: ${summary.next.fecha_hora.slice(11, 16)} - ${summary.next.paciente?.nombre ?? 'Paciente'}`] : undefined,
      };
    }

    case 'show_schedule_by_date': {
      const date = preferredDateFromFields(intent.fields);
      const citas = date ? await getAssistantScheduleByDate(date, intent.fields.professionalId) : [];
      const summary = summarizeSchedule(citas);
      navigate(date ? `/agenda?fecha=${date}` : '/agenda');
      return {
        ok: true,
        message: date ? `Agenda abierta en ${date}: ${summary.total} cita(s) activas.` : 'Agenda abierta; la preferencia de fecha queda indicada en el panel.',
      };
    }

    case 'show_patient_pending_items': {
      const patientId = intent.fields.patientId;
      if (!patientId) return { ok: false, message: 'No hay un paciente real para consultar pendientes.' };
      const [citas, presupuestos, saldo] = await Promise.all([
        queryClient.fetchQuery({ queryKey: ['assistant-citas-paciente', patientId], queryFn: () => getAssistantPatientAppointments(patientId) }),
        queryClient.fetchQuery({ queryKey: ['assistant-presupuestos', patientId], queryFn: () => getPresupuestos(patientId) }),
        queryClient.fetchQuery({ queryKey: ['assistant-saldo', patientId], queryFn: () => getSaldoPaciente(patientId) }),
      ]);
      const citasPendientes = citas.filter((cita) => !['atendida', 'anulada', 'falta', 'cancelled_by_patient'].includes(cita.estado));
      const presupuestosAbiertos = presupuestos.filter((presupuesto) => !['rechazado', 'facturado'].includes(presupuesto.estado));
      return {
        ok: true,
        message: `Pendientes de ${intent.fields.patientDisplayName ?? 'paciente'}: ${citasPendientes.length} cita(s), ${presupuestosAbiertos.length} presupuesto(s), saldo ${saldo.pendiente} EUR.`,
        details: [
          `Citas activas: ${citasPendientes.length}`,
          `Presupuestos abiertos: ${presupuestosAbiertos.length}`,
          `Facturas pendientes: ${saldo.facturas_pendientes}`,
        ],
      };
    }

    case 'find_available_slots': {
      if (intent.fields.suggestedSlots?.length) {
        return {
          ok: true,
          message: `He encontrado ${intent.fields.suggestedSlots.length} hueco(s).`,
          details: intent.fields.suggestedSlots.map(slotLabel),
        };
      }
      if (!intent.fields.professionalId) {
        return {
          ok: true,
          simulated: true,
          message: `Indica un profesional para consultar disponibilidad real de ${intent.fields.treatmentType ?? 'la cita'}.`,
        };
      }
      const slots = await findSlotsForIntent(intent);
      return {
        ok: true,
        message: slots.length ? `He encontrado ${slots.length} hueco(s).` : 'No he encontrado huecos con esos filtros.',
        details: slots.map(slotLabel),
      };
    }

    case 'create_appointment': {
      if (!intent.fields.patientId) return { ok: false, message: 'No hay un paciente real para crear la cita.' };
      const slot = await ensureAppointmentSlot(intent);
      const professionalId = intent.fields.professionalId ?? slot?.doctorId;
      if (!professionalId) {
        return { ok: false, message: 'No puedo crear la cita sin un profesional real de DentCore.' };
      }
      if (!slot?.fechaHora) {
        return { ok: false, message: 'No he encontrado un hueco disponible para crear la cita.' };
      }
      setPatientSession(intent);
      const executableIntent = professionalId === intent.fields.professionalId
        ? intent
        : { ...intent, fields: { ...intent.fields, professionalId } };
      const created = await createAppointmentFromAssistant(executableIntent, slot.fechaHora, slot.durationMinutes ?? intent.fields.durationMinutes ?? 30);
      void queryClient.invalidateQueries({ queryKey: ['citas'] });
      void queryClient.invalidateQueries({ queryKey: ['citas-paciente', created.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['paciente-detalle', created.paciente_id] });
      navigate(`/agenda?${appointmentQueryParams(created.fecha_hora, created.id)}`);
      return {
        ok: true,
        message: `Cita creada para ${intent.fields.patientDisplayName ?? 'el paciente'}: ${created.fecha_hora.slice(0, 16).replace('T', ' ')}.`,
      };
    }

    case 'move_appointment': {
      if (!intent.fields.appointmentId) return { ok: false, message: 'No hay una cita seleccionada para mover.' };
      const slot = await ensureAppointmentSlot(intent);
      if (!slot?.fechaHora) return { ok: false, message: 'No he encontrado fecha/hora para reprogramar la cita.' };
      const updated = await moveAppointmentFromAssistant({
        ...intent,
        fields: { ...intent.fields, professionalId: intent.fields.professionalId ?? slot.doctorId ?? null },
      }, slot.fechaHora, slot.durationMinutes ?? intent.fields.durationMinutes ?? undefined);
      void queryClient.invalidateQueries({ queryKey: ['citas'] });
      void queryClient.invalidateQueries({ queryKey: ['citas-paciente', updated.paciente_id] });
      navigate(`/agenda?${appointmentQueryParams(updated.fecha_hora, updated.id)}`);
      return { ok: true, message: `Cita movida a ${updated.fecha_hora.slice(0, 16).replace('T', ' ')}.` };
    }

    case 'cancel_appointment': {
      if (!intent.fields.appointmentId) return { ok: false, message: 'No hay una cita seleccionada para cancelar.' };
      const cancelled = await cancelAppointmentFromAssistant(intent);
      void queryClient.invalidateQueries({ queryKey: ['citas'] });
      void queryClient.invalidateQueries({ queryKey: ['citas-paciente', cancelled.paciente_id] });
      return {
        ok: true,
        message: intent.fields.appointmentAction === 'no_show'
          ? 'Falta registrada con trazabilidad.'
          : 'Cita cancelada con trazabilidad.',
      };
    }

    case 'create_budget_draft':
    case 'update_budget_draft': {
      const created = await createBudgetFromAssistant(intent, context, professionals);
      setPatientSession(intent);
      void queryClient.invalidateQueries({ queryKey: ['presupuestos', created.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['paciente-detalle', created.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['odontograma-contexto', created.paciente_id] });
      navigate(`/pacientes?paciente_id=${created.paciente_id}`);
      return {
        ok: true,
        message: `Presupuesto #${created.numero} creado para ${intent.fields.patientDisplayName ?? 'el paciente'} con ${created.lineas.length} linea(s).`,
      };
    }

    case 'register_payment_draft':
    case 'create_clinical_note_draft':
    case 'create_task':
      return {
        ok: true,
        simulated: true,
        message: `Borrador confirmado y auditado: ${intent.summary}. Falta conectar esta accion a su herramienta segura especifica.`,
      };

    case 'unknown':
      return { ok: false, message: 'No he entendido la accion. Prueba con una peticion operativa concreta.' };

    default:
      return { ok: false, message: 'Accion no soportada todavia.' };
  }
}
