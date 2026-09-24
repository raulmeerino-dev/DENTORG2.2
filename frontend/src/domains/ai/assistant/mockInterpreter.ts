import { resolveDateFields } from './DateResolver';
import { extractBudgetLinesFromText, extractBudgetPatientQuery, isBudgetRequestText } from './BudgetLineParser';
import { extractPatientQuery, resolvePatientFields } from './PatientResolver';
import { defaultProfessionalFromContext, extractProfessionalFields } from './ProfessionalResolver';
import { resolveTimePreference } from './TimePreferenceResolver';
import { resolveTreatmentFields } from './TreatmentResolver';
import { createIntent } from './draftStore';
import { cleanCapturedPhrase, hasAvailabilityRequest, includesAny, normalizeAssistantText } from './textUtils';
import type { AssistantContextSnapshot, AssistantIntent, AssistantIntentFields, AssistantInterpreterInput, AssistantPatientOption, AssistantProfessionalOption, AssistantTreatmentOption } from './types';

export function isConfirmCommand(text: string) {
  const normalized = normalizeAssistantText(text);
  return /\b(si|vale|ok|okay|correcto|confirma|confirmar|guardalo|guarda|hazlo|adelante)\b/.test(normalized)
    && !/^\s*no\b/.test(normalized);
}

export function isCancelDraftCommand(text: string) {
  const normalized = normalizeAssistantText(text);
  return /^(no|no gracias|cancelalo|cancela eso|cancela el borrador|descarta eso|olvida eso|no lo guardes|no confirmes)$/.test(normalized)
    || /\b(cancela|descarta|olvida|borra)\s+(?:eso|el borrador|este borrador)\b/.test(normalized);
}

function resolveDurationFields(text: string): AssistantIntentFields {
  const normalized = normalizeAssistantText(text);
  const match = normalized.match(/\b(?:duracion|dura|pon(?:le)?\s+duracion)\s+(?:de\s+)?(\d{1,3})\s*(?:min|mins|minutos?)?\b/);
  if (!match) return {};
  const durationMinutes = Number(match[1]);
  return Number.isFinite(durationMinutes) && durationMinutes > 0 ? { durationMinutes } : {};
}

function extractCommonFields(
  text: string,
  context: AssistantContextSnapshot,
  patients: AssistantPatientOption[],
  professionals: AssistantProfessionalOption[],
  treatments: AssistantTreatmentOption[],
  intent: 'open' | 'search' | 'appointment' | 'generic',
  allowCurrentPatient: boolean,
  useDefaultProfessional: boolean,
): AssistantIntentFields {
  const patientQuery = extractPatientQuery(text, intent, patients);
  const professionalFields = extractProfessionalFields(text, professionals);
  const hasProfessional = Boolean(professionalFields.professional || professionalFields.professionalId || professionalFields.professionalQuery);
  return {
    ...resolvePatientFields({ query: patientQuery, context, patients, allowCurrentPatient }),
    ...resolveTreatmentFields(text, treatments),
    ...(hasProfessional ? professionalFields : useDefaultProfessional ? defaultProfessionalFromContext(context, professionals) : {}),
    ...resolveDateFields(text),
    ...resolveTimePreference(text),
    ...resolveDurationFields(text),
  };
}

function cancellationOrNoShowIntent(text: string, context: AssistantContextSnapshot): AssistantIntent | null {
  const normalized = normalizeAssistantText(text);
  const isNoShow = /\b(no viene|no vino|no asistio|no acude|falta)\b/.test(normalized);
  const isCancel = /\b(cancela|anula)\b/.test(normalized) && /\bcita\b/.test(normalized);
  if (!isNoShow && !isCancel) return null;

  return createIntent('cancel_appointment', {
    ...resolveDateFields(text),
    ...resolveTimePreference(text),
    appointmentId: context.selectedAppointmentId ?? null,
    appointmentQuery: text,
    appointmentAction: isNoShow ? 'no_show' : 'cancel',
  }, isNoShow ? 0.82 : 0.77, text);
}

function intentForNewText(input: AssistantInterpreterInput): AssistantIntent {
  const { text, context, patients, professionals, treatments } = input;
  const normalized = normalizeAssistantText(text);
  const dateFields = resolveDateFields(text);

  if (includesAny(text, ['agenda de hoy', 'agenda hoy', 'citas de hoy'])) {
    return createIntent('show_today_schedule', {}, 0.95, text);
  }

  if (includesAny(text, ['agenda', 'citas']) && (dateFields.dateRange || dateFields.datePreference || dateFields.preferredDate)) {
    return createIntent('show_schedule_by_date', dateFields, 0.88, text);
  }

  const cancelIntent = cancellationOrNoShowIntent(text, context);
  if (cancelIntent) return cancelIntent;

  if (isBudgetRequestText(text)) {
    const patientQuery = extractBudgetPatientQuery(text);
    const patientFields = resolvePatientFields({ query: patientQuery, context, patients, allowCurrentPatient: true });
    return createIntent('create_budget_draft', {
      ...patientFields,
      patientQuery: patientFields.patientQuery ?? patientQuery ?? null,
      budgetLines: extractBudgetLinesFromText(text, treatments),
      budgetStatus: 'draft',
    }, 0.9, text);
  }

  if (includesAny(text, ['pendiente este paciente', 'pendientes este paciente', 'que tiene pendiente', 'que tiene pendiente'])) {
    const fields = resolvePatientFields({ query: null, context, patients, allowCurrentPatient: true });
    return createIntent('show_patient_pending_items', fields, 0.9, text);
  }

  if (includesAny(text, ['abre', 'abrir']) && includesAny(text, ['ficha', 'paciente'])) {
    const fields = extractCommonFields(text, context, patients, professionals, treatments, 'open', false, false);
    return createIntent('open_patient_profile', fields, 0.86, text);
  }

  if (hasAvailabilityRequest(text) || includesAny(text, ['hueco', 'huecos', 'disponible', 'libre'])) {
    const fields = extractCommonFields(
      text,
      context,
      patients,
      professionals,
      treatments,
      includesAny(text, ['cita', 'dale cita', 'ponle']) ? 'appointment' : 'generic',
      false,
      false,
    );
    const intent = createIntent('find_available_slots', fields, 0.86, text);
    return {
      ...intent,
      spokenSummary: `Busco los proximos huecos disponibles${fields.patientQuery ? ` para ${fields.patientQuery}` : ''}${fields.professionalQuery ? ` con ${fields.professionalQuery}` : ''}${fields.treatmentType ? ` para ${fields.treatmentType}` : ''}.`,
    };
  }

  if (includesAny(text, ['busca', 'buscar', 'encuentra'])) {
    const fields = extractCommonFields(text, context, patients, professionals, treatments, 'search', false, false);
    return createIntent('search_patient', fields, 0.82, text);
  }

  if (includesAny(text, ['mueve', 'mover', 'cambia', 'reprograma']) && includesAny(text, ['cita'])) {
    return createIntent('move_appointment', {
      ...resolveDateFields(text),
      ...extractProfessionalFields(text, professionals),
      ...resolveTimePreference(text),
      appointmentId: context.selectedAppointmentId ?? null,
      appointmentQuery: text,
    }, 0.75, text);
  }

  if (includesAny(text, ['cita', 'ponle', 'dale cita']) || includesAny(text, ['revision en seis meses', 'revisar en seis meses'])) {
    const fields = extractCommonFields(text, context, patients, professionals, treatments, 'appointment', true, true);
    return createIntent('create_appointment', fields, 0.84, text);
  }

  if (includesAny(text, ['cobro', 'pago', 'cobra', 'cobrar'])) {
    const amountMatch = normalized.match(/\b(\d+)(?:[,.](\d{1,2}))?\s*(?:eur|euro|euros)?\b/);
    const amount = amountMatch ? Number(`${amountMatch[1]}.${amountMatch[2] ?? '0'}`) : null;
    const fields = { ...extractCommonFields(text, context, patients, professionals, treatments, 'generic', true, false), amount };
    return createIntent('register_payment_draft', fields, 0.76, text);
  }

  if (includesAny(text, ['nota clinica', 'anota en clinica'])) {
    const fields = { ...extractCommonFields(text, context, patients, professionals, treatments, 'generic', true, false), noteText: cleanCapturedPhrase(text) };
    return createIntent('create_clinical_note_draft', fields, 0.76, text);
  }

  if (includesAny(text, ['tarea', 'llamar', 'revisar'])) {
    return createIntent('create_task', { taskText: cleanCapturedPhrase(text), taskTitle: cleanCapturedPhrase(text) }, 0.68, text);
  }

  return createIntent('unknown', { taskText: cleanCapturedPhrase(text) }, 0.2, text);
}

export function interpretMockAssistantInput(input: AssistantInterpreterInput): AssistantIntent {
  return intentForNewText(input);
}
