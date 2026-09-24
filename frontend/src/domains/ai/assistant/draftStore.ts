import { getActionDefinition, getMissingFields } from './actionRegistry';
import type { AssistantFieldKey, AssistantIntent, AssistantIntentFields, AssistantIntentName, AssistantPatientOption, AssistantProfessionalOption, AssistantTreatmentOption } from './types';

function intentId() {
  return `assistant-intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function confirmationRequired(intent: AssistantIntentName) {
  return getActionDefinition(intent).confirmation !== 'none';
}

function riskLevelFor(intent: AssistantIntentName) {
  return getActionDefinition(intent).riskLevel;
}

function labelForDateRange(value?: string | null) {
  const labels: Record<string, string> = {
    today: 'hoy',
    tomorrow: 'manana',
    after_tomorrow: 'pasado manana',
    next_week: 'la semana que viene',
    in_three_months: 'en tres meses',
    in_six_months: 'en seis meses',
    in_two_weeks: 'dentro de dos semanas',
    end_of_month: 'final de mes',
    next_available: 'proximos huecos disponibles',
  };
  return value ? labels[value] ?? value : null;
}

function fieldLabel(field: AssistantFieldKey) {
  const labels: Record<AssistantFieldKey, string> = {
    patientId: 'paciente',
    patientQuery: 'busqueda de paciente',
    treatmentType: 'tratamiento',
    professional: 'profesional',
    professionalQuery: 'profesional',
    timePreference: 'preferencia horaria',
    dateRange: 'fecha',
    preferredDate: 'fecha',
    preferredTime: 'hora',
    slot: 'hueco',
    appointmentId: 'cita',
    taskTitle: 'tarea',
    taskText: 'tarea',
    amount: 'importe',
    budgetLines: 'lineas de presupuesto',
    durationMinutes: 'duracion',
    noteText: 'texto de la nota',
  };
  return labels[field];
}

export function summarizeIntent(intent: Pick<AssistantIntent, 'intent' | 'fields'>) {
  const action = getActionDefinition(intent.intent);
  const fields = intent.fields;
  if (intent.intent === 'create_budget_draft' || intent.intent === 'update_budget_draft') {
    const lineCount = fields.budgetLines?.length ?? 0;
    const total = typeof fields.budgetTotal === 'number' && Number.isFinite(fields.budgetTotal)
      ? `${fields.budgetTotal.toFixed(2)} EUR`
      : null;
    const bits = [
      fields.patientDisplayName ?? fields.patientQuery,
      lineCount ? `${lineCount} linea(s)` : null,
      total,
      fields.budgetStatus ?? 'draft',
    ].filter(Boolean);
    return bits.length ? `${action.label}: ${bits.join(' - ')}` : action.label;
  }
  const bits = [
    fields.patientDisplayName,
    fields.treatmentType,
    fields.professional || fields.professionalQuery ? `con ${fields.professional ?? fields.professionalQuery}` : null,
    fields.slot?.label ?? fields.preferredTime ?? fields.timePreference ?? fields.datePreference ?? fields.preferredDate ?? labelForDateRange(fields.dateRange),
    fields.amount ? `${fields.amount.toFixed(2)} EUR` : null,
    fields.taskText ?? fields.taskTitle,
  ].filter(Boolean);
  return bits.length ? `${action.label}: ${bits.join(' · ')}` : action.label;
}

function clarificationFor(intent: AssistantIntent, missingFields: AssistantFieldKey[]) {
  if (intent.fields.patientOptions && intent.fields.patientOptions.length > 1 && !intent.fields.patientId) {
    const names = intent.fields.patientOptions.map((option) => option.displayName).join(', ');
    return `He encontrado varias coincidencias: ${names}. ¿A cual te refieres?`;
  }
  if (intent.fields.professionalOptions && intent.fields.professionalOptions.length > 1 && !intent.fields.professionalId) {
    const names = intent.fields.professionalOptions.map((option) => option.displayName).join(', ');
    return `He encontrado varios profesionales: ${names}. ¿Con cual quieres trabajar?`;
  }
  if (intent.fields.treatmentOptions && intent.fields.treatmentOptions.length > 1 && !intent.fields.treatmentId) {
    const names = intent.fields.treatmentOptions.map((option) => option.displayName).join(', ');
    return `He encontrado varios tratamientos: ${names}. Cual quieres usar?`;
  }
  if (missingFields.length) {
    return `Me falta ${missingFields.map(fieldLabel).join(', ')} para preparar la accion.`;
  }
  return null;
}

export function finalizeIntent(intent: AssistantIntent): AssistantIntent {
  const missingFields = getMissingFields(intent);
  const hasAmbiguousPatient = Boolean(intent.fields.patientOptions?.length && !intent.fields.patientId);
  const hasAmbiguousProfessional = Boolean(intent.fields.professionalOptions?.length && !intent.fields.professionalId);
  const hasAmbiguousTreatment = Boolean(intent.fields.treatmentOptions?.length && !intent.fields.treatmentId);
  const needsClarification = missingFields.length > 0 || hasAmbiguousPatient || hasAmbiguousProfessional || hasAmbiguousTreatment;
  const requiresConfirmation = confirmationRequired(intent.intent);
  const status = needsClarification
    ? 'needs_clarification'
    : requiresConfirmation
      ? 'awaiting_confirmation'
      : 'ready';
  const summary = summarizeIntent(intent);

  return {
    ...intent,
    status,
    missingFields,
    needsClarification,
    clarificationQuestion: clarificationFor(intent, missingFields),
    requiresConfirmation,
    riskLevel: riskLevelFor(intent.intent),
    summary,
    spokenSummary: summary,
    updatedAt: nowIso(),
  };
}

export function createIntent(intent: AssistantIntentName, fields: AssistantIntentFields, confidence: number, originalText?: string): AssistantIntent {
  return finalizeIntent({
    id: intentId(),
    intent,
    confidence,
    status: 'interpreting',
    fields,
    missingFields: [],
    needsClarification: false,
    clarificationQuestion: null,
    requiresConfirmation: confirmationRequired(intent),
    riskLevel: riskLevelFor(intent),
    summary: getActionDefinition(intent).label,
    spokenSummary: getActionDefinition(intent).label,
    originalText,
    updatedAt: nowIso(),
  });
}

function mergeDefinedFields(base: AssistantIntentFields, patch: AssistantIntentFields) {
  const next = { ...base };
  (Object.keys(patch) as Array<keyof AssistantIntentFields>).forEach((key) => {
    const value = patch[key];
    if (value !== undefined) {
      next[key] = value as never;
    }
  });
  return next;
}

export function mergeIntentDraft(current: AssistantIntent, patch: Partial<AssistantIntent> & { fields?: AssistantIntentFields }) {
  return finalizeIntent({
    ...current,
    ...patch,
    id: current.id,
    intent: patch.intent ?? current.intent,
    fields: mergeDefinedFields(current.fields, patch.fields ?? {}),
    originalText: [current.originalText, patch.originalText].filter(Boolean).join('\n'),
  });
}

export function applyPatientOption(current: AssistantIntent, option: AssistantPatientOption) {
  return mergeIntentDraft(current, {
    fields: {
      patientId: option.id,
      patientDisplayName: option.displayName,
      patientQuery: option.displayName,
      patientOptions: [],
    },
  });
}

export function applyProfessionalOption(current: AssistantIntent, option: AssistantProfessionalOption) {
  return mergeIntentDraft(current, {
    fields: {
      professionalId: option.id,
      professional: option.displayName,
      professionalQuery: option.displayName,
      professionalOptions: [],
    },
  });
}

export function applyTreatmentOption(current: AssistantIntent, option: AssistantTreatmentOption) {
  return mergeIntentDraft(current, {
    fields: {
      treatmentId: option.id,
      treatmentType: option.displayName,
      durationMinutes: option.defaultDurationMinutes ?? current.fields.durationMinutes ?? 30,
      treatmentOptions: [],
      slot: null,
      suggestedSlots: [],
    },
  });
}

export function cancelIntent(current: AssistantIntent | null): AssistantIntent | null {
  if (!current) return null;
  return {
    ...current,
    status: 'cancelled',
    needsClarification: false,
    clarificationQuestion: null,
    updatedAt: nowIso(),
  };
}

export class IntentDraftStore {
  private currentDraft: AssistantIntent | null = null;
  private history: AssistantIntent[] = [];

  getCurrentDraft() {
    return this.currentDraft;
  }

  setDraft(intent: AssistantIntent | null) {
    if (this.currentDraft) this.history.push(this.currentDraft);
    this.currentDraft = intent ? finalizeIntent(intent) : null;
    return this.currentDraft;
  }

  updateDraft(partialFields: AssistantIntentFields) {
    if (!this.currentDraft) return null;
    this.history.push(this.currentDraft);
    this.currentDraft = mergeIntentDraft(this.currentDraft, { fields: partialFields });
    return this.currentDraft;
  }

  clearDraft() {
    if (this.currentDraft) this.history.push(this.currentDraft);
    this.currentDraft = null;
  }

  cancelDraft() {
    if (this.currentDraft) this.history.push(this.currentDraft);
    this.currentDraft = cancelIntent(this.currentDraft);
    return this.currentDraft;
  }

  confirmDraft() {
    if (!this.currentDraft) return null;
    this.history.push(this.currentDraft);
    this.currentDraft = finalizeIntent(this.currentDraft);
    return this.currentDraft;
  }

  hasActiveDraft() {
    return Boolean(this.currentDraft && this.currentDraft.status !== 'cancelled');
  }

  getDraftHistory() {
    return [...this.history];
  }
}
