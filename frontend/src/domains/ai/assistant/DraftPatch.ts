import { resolvePatientFields } from './PatientResolver';
import { resolveProfessionalFields } from './ProfessionalResolver';
import { resolveTreatmentFields } from './TreatmentResolver';
import { cancelIntent, finalizeIntent, mergeIntentDraft } from './draftStore';
import type {
  AssistantContextSnapshot,
  AssistantIntent,
  AssistantIntentFields,
  AssistantPatientOption,
  AssistantProfessionalOption,
  AssistantSessionMemory,
  AssistantTreatmentOption,
  DraftPatch,
} from './types';

type DraftPatchApplyContext = {
  context: AssistantContextSnapshot;
  patients: AssistantPatientOption[];
  professionals: AssistantProfessionalOption[];
  treatments: AssistantTreatmentOption[];
  sessionMemory?: AssistantSessionMemory;
};

const SLOT_DEPENDENT_FIELDS = new Set<keyof AssistantIntentFields>([
  'professional',
  'professionalId',
  'professionalQuery',
  'treatmentId',
  'treatmentType',
  'dateRange',
  'datePreference',
  'preferredDate',
  'preferredTime',
  'timePreference',
  'durationMinutes',
]);

function hasOwn<T extends object>(target: T | undefined, key: PropertyKey) {
  return Boolean(target && Object.prototype.hasOwnProperty.call(target, key));
}

function visiblePatientFields(patientId: string, patients: AssistantPatientOption[]): AssistantIntentFields {
  const option = patients.find((item) => item.id === patientId);
  return {
    patientId,
    patientQuery: option?.displayName ?? null,
    patientDisplayName: option?.displayName ?? null,
    patientOptions: [],
  };
}

function visibleProfessionalFields(professionalId: string, professionals: AssistantProfessionalOption[]): AssistantIntentFields {
  const option = professionals.find((item) => item.id === professionalId);
  return {
    professionalId,
    professionalQuery: option?.displayName ?? null,
    professional: option?.displayName ?? null,
    professionalOptions: [],
  };
}

function clearFieldPatch(field: string): AssistantIntentFields {
  const normalized = field.trim();
  if (['patient', 'patientId', 'patientQuery'].includes(normalized)) {
    return { patientId: null, patientQuery: null, patientDisplayName: null, patientOptions: [] };
  }
  if (['professional', 'professionalId', 'professionalQuery'].includes(normalized)) {
    return { professionalId: null, professionalQuery: null, professional: null, professionalOptions: [] };
  }
  if (['treatment', 'treatmentId', 'treatmentType'].includes(normalized)) {
    return { treatmentId: null, treatmentType: null, treatmentOptions: [] };
  }
  if (['date', 'dateRange', 'preferredDate'].includes(normalized)) {
    return { dateRange: null, datePreference: null, preferredDate: null };
  }
  if (['time', 'preferredTime', 'timePreference'].includes(normalized)) {
    return { preferredTime: null, timePreference: null };
  }
  if (['slot', 'selectedSlot', 'selectedSlotIndex'].includes(normalized)) {
    return { slot: null, selectedSlotIndex: null };
  }
  if (['duration', 'durationMinutes'].includes(normalized)) {
    return { durationMinutes: null };
  }
  if (['budgetLines', 'budget', 'presupuesto'].includes(normalized)) {
    return { budgetLines: [], budgetTotal: null };
  }
  return {};
}

function mergeFields(base: AssistantIntentFields, patch: AssistantIntentFields) {
  return { ...base, ...patch };
}

function fieldsFromPatch(currentDraft: AssistantIntent, patch: DraftPatch, applyContext: DraftPatchApplyContext) {
  const updates = patch.updates ?? {};
  let fields: AssistantIntentFields = {};

  if (hasOwn(updates, 'patientQuery')) {
    fields = mergeFields(fields, updates.patientQuery
      ? resolvePatientFields({
          query: updates.patientQuery,
          context: applyContext.context,
          patients: applyContext.patients,
          allowCurrentPatient: false,
        })
      : { patientId: null, patientQuery: null, patientDisplayName: null, patientOptions: [] });
  }

  if (hasOwn(updates, 'patientId') && updates.patientId) {
    fields = mergeFields(fields, visiblePatientFields(updates.patientId, applyContext.patients));
  }

  if (hasOwn(updates, 'professionalQuery')) {
    fields = mergeFields(fields, updates.professionalQuery
      ? resolveProfessionalFields(updates.professionalQuery, applyContext.professionals)
      : { professionalId: null, professionalQuery: null, professional: null, professionalOptions: [] });
  }

  if (hasOwn(updates, 'professionalId') && updates.professionalId) {
    fields = mergeFields(fields, visibleProfessionalFields(updates.professionalId, applyContext.professionals));
  }

  if (hasOwn(updates, 'treatmentType')) {
    fields = mergeFields(fields, updates.treatmentType
      ? resolveTreatmentFields(updates.treatmentType, applyContext.treatments)
      : { treatmentId: null, treatmentType: null, treatmentOptions: [] });
  }

  if (hasOwn(updates, 'dateRange')) fields.dateRange = updates.dateRange ?? null;
  if (hasOwn(updates, 'preferredDate')) fields.preferredDate = updates.preferredDate ?? null;
  if (hasOwn(updates, 'preferredTime')) fields.preferredTime = updates.preferredTime ?? null;
  if (hasOwn(updates, 'timePreference')) fields.timePreference = updates.timePreference ?? null;
  if (hasOwn(updates, 'durationMinutes')) fields.durationMinutes = updates.durationMinutes ?? null;
  if (hasOwn(updates, 'taskText')) fields.taskText = updates.taskText ?? null;
  if (hasOwn(updates, 'noteText')) fields.noteText = updates.noteText ?? null;
  if (hasOwn(updates, 'amount')) fields.amount = updates.amount ?? null;
  if (hasOwn(updates, 'budgetLines')) fields.budgetLines = updates.budgetLines ?? [];
  if (hasOwn(updates, 'budgetStatus')) fields.budgetStatus = updates.budgetStatus ?? null;

  for (const field of patch.clearFields ?? []) {
    fields = mergeFields(fields, clearFieldPatch(field));
  }

  if (hasOwn(updates, 'selectedSlotIndex')) {
    const index = updates.selectedSlotIndex;
    const slot = index == null || index < 0
      ? null
      : currentDraft.fields.suggestedSlots?.[index] ?? applyContext.sessionMemory?.lastSlots?.[index] ?? null;
    fields.selectedSlotIndex = index ?? null;
    fields.slot = slot;
    if (slot?.doctorId) {
      fields = mergeFields(fields, visibleProfessionalFields(slot.doctorId, applyContext.professionals));
    }
  }

  const clearsSlot = Object.keys(fields).some((key) => SLOT_DEPENDENT_FIELDS.has(key as keyof AssistantIntentFields))
    && !hasOwn(fields, 'slot');
  if (clearsSlot) {
    fields.slot = null;
    fields.suggestedSlots = [];
    fields.selectedSlotIndex = null;
  }

  return fields;
}

export function applyDraftPatch(
  currentDraft: AssistantIntent,
  patch: DraftPatch,
  applyContext: DraftPatchApplyContext,
) {
  if (patch.action === 'cancel') return cancelIntent(currentDraft) ?? currentDraft;
  if (patch.action === 'confirm') return finalizeIntent(currentDraft);

  const fields = fieldsFromPatch(currentDraft, patch, applyContext);
  const next = mergeIntentDraft(currentDraft, {
    confidence: Math.max(currentDraft.confidence, patch.confidence),
    fields,
  });

  return patch.spokenSummary
    ? {
        ...next,
        spokenSummary: patch.spokenSummary,
      }
    : next;
}
