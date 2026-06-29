import { api } from '../../lib/api';
import { extractBudgetLinesFromText, extractBudgetPatientQuery, normalizeBudgetLines } from './BudgetLineParser';
import { resolveDateFields } from './DateResolver';
import { applyDraftPatch } from './DraftPatch';
import { extractStructuredEntityPhrase } from './EntityPhraseParser';
import { resolvePatientFields } from './PatientResolver';
import { resolveProfessionalFields } from './ProfessionalResolver';
import { resolveSlotSelection } from './SlotSelectionResolver';
import { resolveTimePreference } from './TimePreferenceResolver';
import { resolveTreatmentFields } from './TreatmentResolver';
import { cancelIntent, createIntent, finalizeIntent } from './draftStore';
import { interpretAssistantTurn } from './orchestrator';
import type {
  AssistantContextSnapshot,
  AssistantIntent,
  AssistantIntentFields,
  AssistantIntentName,
  AssistantInterpreterInput,
  AssistantRiskLevel,
  AssistantSessionMemory,
  AssistantTurnDebug,
  AssistantTurnResult,
  DraftPatch,
} from './types';

type LLMIntentPayload = {
  intent: AssistantIntentName;
  confidence: number;
  status: 'ready' | 'draft' | 'needs_clarification' | 'awaiting_confirmation' | 'cancelled' | 'error';
  fields: {
    patientId?: string | null;
    patientQuery?: string | null;
    professionalId?: string | null;
    professionalQuery?: string | null;
    treatmentType?: string | null;
    dateRange?: string | null;
    preferredDate?: string | null;
    preferredTime?: string | null;
    timePreference?: 'morning' | 'afternoon' | 'first_available' | 'last_available' | null;
    durationMinutes?: number | null;
    appointmentId?: string | null;
    taskText?: string | null;
    noteText?: string | null;
    amount?: number | null;
    selectedSlotIndex?: number | null;
    budgetLines?: AssistantIntentFields['budgetLines'];
    budgetStatus?: AssistantIntentFields['budgetStatus'];
  };
  missingFields: string[];
  needsClarification: boolean;
  clarificationQuestion?: string | null;
  requiresConfirmation: boolean;
  riskLevel: AssistantRiskLevel;
  spokenSummary: string;
};

type LLMInterpretResponse = {
  intent: LLMIntentPayload;
  debug?: AssistantTurnDebug;
};

type DraftPatchResponse = {
  patch: DraftPatch;
  debug?: AssistantTurnDebug;
};

function mockDebug(intentFinal = 'unknown'): AssistantTurnDebug {
  return {
    route: 'mock',
    providerUsed: 'mock',
    modelUsed: 'MockIntentInterpreter',
    intentFinal,
  };
}

function safeBackendLLMMessage(error: unknown) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail !== 'string') return null;
  if (detail.includes('Ollama no está ejecutándose')) return detail;
  if (detail.includes('No se ha ejecutado nada')) return detail;
  if (detail.includes('No hay motor de IA disponible')) return detail;
  return null;
}

function safeErrorIntent(input: AssistantInterpreterInput, message: string): AssistantIntent {
  const intent = createIntent('unknown', { taskText: input.text }, 0.75, input.text);
  return {
    ...intent,
    status: 'needs_clarification',
    needsClarification: true,
    clarificationQuestion: message,
    spokenSummary: message,
    summary: message,
  };
}

function safeContextFromSnapshot(context: AssistantContextSnapshot) {
  return {
    screen: context.screen,
    currentPatientId: context.currentPatientId,
    hasCurrentPatient: Boolean(context.currentPatientId),
    currentPatientDisplayName: context.currentPatientDisplayName ?? null,
    selectedAppointmentId: context.selectedAppointmentId ?? null,
    hasSelectedAppointment: Boolean(context.selectedAppointmentId),
    currentUserRole: context.currentUserRole,
    permissions: context.permissions,
    visibleDateRange: context.visibleAgendaDate ?? null,
    recentActions: context.recentActions,
  };
}

function draftForLLM(draft: AssistantIntent | null) {
  if (!draft) return null;
  return {
    intent: draft.intent,
    confidence: draft.confidence,
    status: draft.status,
    fields: {
      patientId: draft.fields.patientId ?? null,
      patientQuery: draft.fields.patientQuery ?? null,
      professionalId: draft.fields.professionalId ?? null,
      professionalQuery: draft.fields.professionalQuery ?? draft.fields.professional ?? null,
      treatmentType: draft.fields.treatmentType ?? null,
      dateRange: draft.fields.dateRange ?? null,
      preferredDate: draft.fields.preferredDate ?? null,
      preferredTime: draft.fields.preferredTime ?? null,
      timePreference: draft.fields.timePreference ?? null,
      durationMinutes: draft.fields.durationMinutes ?? null,
      appointmentId: draft.fields.appointmentId ?? null,
      taskText: draft.fields.taskText ?? draft.fields.taskTitle ?? null,
      noteText: draft.fields.noteText ?? null,
      amount: draft.fields.amount ?? null,
      selectedSlotIndex: null,
      budgetLines: draft.fields.budgetLines ?? null,
      budgetStatus: draft.fields.budgetStatus ?? null,
    },
    missingFields: draft.missingFields,
    needsClarification: draft.needsClarification,
    clarificationQuestion: draft.clarificationQuestion ?? null,
    requiresConfirmation: draft.requiresConfirmation,
    riskLevel: draft.riskLevel,
    spokenSummary: draft.spokenSummary,
  };
}

function visibleOptionsForDraft(draft: AssistantIntent) {
  return {
    patients: (draft.fields.patientOptions ?? []).map((option) => ({
      id: option.id,
      displayName: option.displayName,
    })),
    professionals: (draft.fields.professionalOptions ?? []).map((option) => ({
      id: option.id,
      displayName: option.displayName,
    })),
    slots: (draft.fields.suggestedSlots ?? []).map((slot, index) => ({
      id: String(index),
      start: slot.fechaHora ?? slot.label ?? '',
      end: null,
      professionalId: slot.doctorId ?? null,
    })),
  };
}

function slotFromIndex(index: number | null | undefined, memory: AssistantSessionMemory | undefined, currentDraft: AssistantIntent | null) {
  if (index == null || index < 0) return null;
  return currentDraft?.fields.suggestedSlots?.[index] ?? memory?.lastSlots?.[index] ?? null;
}

function fieldsFromLLM(payload: LLMIntentPayload, input: AssistantInterpreterInput): AssistantIntentFields {
  const raw = payload.fields ?? {};
  const structured = extractStructuredEntityPhrase(input.text);
  const budgetPatientQuery = payload.intent === 'create_budget_draft' || payload.intent === 'update_budget_draft'
    ? extractBudgetPatientQuery(input.text)
    : null;
  const rawPatientQuery = budgetPatientQuery ?? structured.patientQuery ?? raw.patientQuery;
  const rawProfessionalQuery = structured.professionalQuery ?? raw.professionalQuery;
  const rawTreatmentType = structured.treatmentType ?? raw.treatmentType;
  const isBudgetIntent = payload.intent === 'create_budget_draft' || payload.intent === 'update_budget_draft';
  const budgetLines = isBudgetIntent
    ? normalizeBudgetLines(
        raw.budgetLines,
        input.text,
        input.treatments,
      )
    : null;
  const selectedSlot = slotFromIndex(raw.selectedSlotIndex, input.sessionMemory, input.currentDraft)
    ?? resolveSlotSelection(input.text, input.currentDraft?.fields.suggestedSlots ?? input.sessionMemory?.lastSlots);
  const patientFields = rawPatientQuery
    ? resolvePatientFields({
        query: rawPatientQuery,
        context: input.context,
        patients: input.patients,
        allowCurrentPatient: true,
      })
    : raw.patientId
      ? { patientId: raw.patientId, patientQuery: null }
      : resolvePatientFields({ query: null, context: input.context, patients: input.patients, allowCurrentPatient: payload.intent === 'create_appointment' || payload.intent === 'show_patient_pending_items' || isBudgetIntent });
  const professionalFields = rawProfessionalQuery
    ? resolveProfessionalFields(rawProfessionalQuery, input.professionals)
    : raw.professionalId
      ? { professionalId: raw.professionalId }
      : {};
  const treatmentFields = rawTreatmentType ? resolveTreatmentFields(rawTreatmentType, input.treatments) : {};
  const dateFields = resolveDateFields(input.text);
  const timeFields = resolveTimePreference(input.text);
  const treatmentType = treatmentFields.treatmentType ?? (input.treatments.length ? null : rawTreatmentType ?? null);

  if (isBudgetIntent) {
    return {
      ...patientFields,
      patientId: patientFields.patientId ?? raw.patientId ?? null,
      patientQuery: patientFields.patientQuery ?? rawPatientQuery ?? null,
      budgetLines: budgetLines?.length ? budgetLines : extractBudgetLinesFromText(input.text, input.treatments),
      budgetStatus: raw.budgetStatus ?? 'draft',
      budgetTotal: null,
    };
  }

  return {
    ...patientFields,
    ...professionalFields,
    ...treatmentFields,
    ...dateFields,
    ...timeFields,
    patientId: patientFields.patientId ?? raw.patientId ?? null,
    patientQuery: patientFields.patientQuery ?? rawPatientQuery ?? null,
    professionalId: professionalFields.professionalId ?? raw.professionalId ?? null,
    professionalQuery: professionalFields.professionalQuery ?? rawProfessionalQuery ?? null,
    treatmentType,
    dateRange: dateFields.dateRange ?? raw.dateRange ?? null,
    preferredDate: dateFields.preferredDate ?? raw.preferredDate ?? null,
    preferredTime: timeFields.preferredTime ?? raw.preferredTime ?? null,
    timePreference: timeFields.timePreference ?? raw.timePreference ?? null,
    durationMinutes: treatmentFields.durationMinutes ?? raw.durationMinutes ?? null,
    appointmentId: raw.appointmentId ?? input.context.selectedAppointmentId ?? null,
    taskText: raw.taskText ?? null,
    noteText: raw.noteText ?? null,
    amount: raw.amount ?? null,
    selectedSlotIndex: raw.selectedSlotIndex ?? null,
    ...(selectedSlot ? { slot: selectedSlot } : {}),
  };
}

function intentFromLLM(payload: LLMIntentPayload, input: AssistantInterpreterInput) {
  const fields = fieldsFromLLM(payload, input);
  const intent = createIntent(
    payload.intent,
    fields,
    payload.confidence,
    input.text,
  );
  return {
    ...intent,
    spokenSummary: payload.spokenSummary || intent.spokenSummary,
    riskLevel: payload.riskLevel ?? intent.riskLevel,
  };
}

export async function interpretLLMAssistantInput(input: AssistantInterpreterInput): Promise<AssistantIntent> {
  return (await interpretLLMAssistantInputWithDebug(input)).intent;
}

async function interpretLLMAssistantInputWithDebug(input: AssistantInterpreterInput): Promise<{ intent: AssistantIntent; debug?: AssistantTurnDebug }> {
  const { data } = await api.post<LLMInterpretResponse>('/assistant/interpret', {
    userText: input.text,
    context: safeContextFromSnapshot(input.context),
    currentDraft: draftForLLM(input.currentDraft ?? input.sessionMemory?.lastDraft ?? null),
    lastAssistantQuestion: input.sessionMemory?.lastQuestion ?? null,
  });
  const intent = intentFromLLM(data.intent, input);
  return {
    intent,
    debug: data.debug ? { ...data.debug, intentFinal: intent.intent } : undefined,
  };
}

export async function interpretDraftPatchInput(input: AssistantInterpreterInput): Promise<DraftPatch> {
  return (await interpretDraftPatchInputWithDebug(input)).patch;
}

async function interpretDraftPatchInputWithDebug(input: AssistantInterpreterInput): Promise<{ patch: DraftPatch; debug?: AssistantTurnDebug }> {
  const currentDraft = input.currentDraft ?? input.sessionMemory?.lastDraft;
  if (!currentDraft) throw new Error('No hay borrador activo para aplicar un patch.');
  const { data } = await api.post<DraftPatchResponse>('/assistant/patch', {
    userText: input.text,
    currentDraft: draftForLLM(currentDraft),
    safeContext: safeContextFromSnapshot(input.context),
    lastAssistantQuestion: input.sessionMemory?.lastQuestion ?? null,
    visibleOptions: visibleOptionsForDraft(currentDraft),
  });
  return {
    patch: data.patch,
    debug: data.debug ? { ...data.debug, intentFinal: data.patch.action } : undefined,
  };
}

export async function interpretAssistantTurnWithLLM(input: AssistantInterpreterInput): Promise<AssistantTurnResult> {
  const activeDraft = input.currentDraft ?? input.sessionMemory?.lastDraft ?? null;
  if (activeDraft) {
    try {
      const patchResult = await interpretDraftPatchInputWithDebug(input);
      const { patch } = patchResult;
      const debug = patchResult.debug;
      if (patch.action === 'cancel') {
        return {
          kind: 'cancelled',
          intent: cancelIntent(activeDraft),
          responseText: patch.spokenSummary || 'Borrador cancelado. No se ha guardado nada.',
          debug,
        };
      }
      if (patch.action === 'start_new') {
        const intentResult = await interpretLLMAssistantInputWithDebug({ ...input, currentDraft: null, sessionMemory: { ...input.sessionMemory, lastDraft: null } });
        const { intent } = intentResult;
        return {
          kind: 'intent',
          intent,
          responseText: intent.clarificationQuestion ?? intent.spokenSummary ?? intent.summary,
          debug: intentResult.debug,
        };
      }
      if (patch.action === 'ask_clarification' || patch.action === 'unknown') {
        return {
          kind: 'intent',
          intent: activeDraft,
          responseText: patch.clarificationQuestion ?? patch.spokenSummary ?? 'No estoy seguro de como modificar el borrador. Puedes corregir un campo concreto.',
          debug,
        };
      }

      const patched = applyDraftPatch(activeDraft, patch, {
        context: input.context,
        patients: input.patients,
        professionals: input.professionals,
        treatments: input.treatments,
        sessionMemory: input.sessionMemory,
      });

      if (patch.action === 'confirm') {
        if (patched.needsClarification) {
          return {
            kind: 'intent',
            intent: patched,
            responseText: patched.clarificationQuestion ?? 'No puedo confirmar todavia. Faltan datos.',
            debug,
          };
        }
        return {
          kind: 'confirm',
          intent: patched,
          responseText: patch.spokenSummary || 'Confirmacion recibida. Valido permisos y preparo la ejecucion.',
          debug,
        };
      }

      return {
        kind: 'intent',
        intent: patched,
        responseText: patched.clarificationQuestion ?? patch.spokenSummary ?? patched.spokenSummary ?? patched.summary,
        debug,
      };
    } catch (error) {
      const safeMessage = safeBackendLLMMessage(error);
      if (safeMessage) {
        return {
          kind: 'intent',
          intent: activeDraft,
          responseText: safeMessage,
          debug: mockDebug(activeDraft.intent),
        };
      }
      return {
        kind: 'intent',
        intent: activeDraft,
        responseText: 'No he podido interpretar la modificacion con seguridad. El borrador sigue igual; puedes editar un campo manualmente.',
        debug: mockDebug(activeDraft.intent),
      };
    }
  }

  try {
    const intentResult = await interpretLLMAssistantInputWithDebug(input);
    const { intent } = intentResult;
    const debug = intentResult.debug;
    if (intent.intent === 'cancel_current_draft') {
      return {
        kind: 'cancelled',
        intent: cancelIntent(input.currentDraft ?? input.sessionMemory?.lastDraft ?? null),
        responseText: 'Borrador cancelado. No se ha guardado nada.',
        debug,
      };
    }

    if (intent.intent === 'confirm_current_draft' && (input.currentDraft ?? input.sessionMemory?.lastDraft)) {
      const draft = finalizeIntent((input.currentDraft ?? input.sessionMemory?.lastDraft)!);
      if (draft.needsClarification) {
        return {
          kind: 'intent',
          intent: draft,
          responseText: draft.clarificationQuestion ?? 'No puedo confirmar todavia. Faltan datos.',
          debug,
        };
      }
      return {
        kind: 'confirm',
        intent: draft,
        responseText: intent.spokenSummary || 'Confirmacion recibida. Valido permisos y preparo la ejecucion.',
        debug,
      };
    }

    return {
      kind: 'intent',
      intent,
      responseText: intent.clarificationQuestion ?? intent.spokenSummary ?? intent.summary,
      debug,
    };
  } catch (error) {
    const safeMessage = safeBackendLLMMessage(error);
    if (safeMessage) {
      const intent = safeErrorIntent(input, safeMessage);
      return {
        kind: 'intent',
        intent,
        responseText: safeMessage,
        debug: mockDebug(intent.intent),
      };
    }
    const result = interpretAssistantTurn(input);
    return result.kind === 'cancelled'
      ? { ...result, debug: mockDebug('cancel_current_draft') }
      : { ...result, debug: mockDebug(result.intent.intent) };
  }
}
