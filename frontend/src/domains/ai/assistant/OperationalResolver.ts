import { getActionDefinition } from './actionRegistry';
import { resolveBudgetOperationalDraft } from './BudgetOperationalResolver';
import { resolvePatientFields } from './PatientResolver';
import { resolveProfessionalFields } from './ProfessionalResolver';
import { findAvailableSlotsForIntent } from './ScheduleAssistantAdapter';
import { preferredDateFromFields } from './schedulePlanning';
import { resolveTreatmentFields } from './TreatmentResolver';
import { mergeIntentDraft } from './draftStore';
import type {
  AssistantContextSnapshot,
  AssistantPhase,
  AssistantIntent,
  AssistantIntentFields,
  AssistantOperationalResolution,
  AssistantPatientOption,
  AssistantProfessionalOption,
  AssistantSlot,
  AssistantSlotsResolution,
  AssistantTreatmentOption,
} from './types';

export interface OperationalResolverInput {
  draft: AssistantIntent;
  safeContext: AssistantContextSnapshot;
  patients: AssistantPatientOption[];
  professionals: AssistantProfessionalOption[];
  treatments: AssistantTreatmentOption[];
  findSlots?: (draft: AssistantIntent) => Promise<AssistantSlot[]>;
}

export interface OperationalResolverOutput {
  draft: AssistantIntent;
  resolution: AssistantOperationalResolution;
  nextQuestion?: string | null;
  canConfirm: boolean;
}

const PATIENT_REQUIRED_INTENTS = new Set([
  'open_patient_profile',
  'search_patient',
  'create_appointment',
  'show_patient_pending_items',
  'create_budget_draft',
  'register_payment_draft',
  'create_clinical_note_draft',
]);

const TREATMENT_REQUIRED_INTENTS = new Set([
  'find_available_slots',
  'create_appointment',
  'move_appointment',
]);

const SCHEDULE_INTENTS = new Set([
  'find_available_slots',
  'create_appointment',
  'move_appointment',
]);

function selectedPatient(id: string, fields: AssistantIntentFields, patients: AssistantPatientOption[]) {
  const option = patients.find((item) => item.id === id);
  return { id, displayName: option?.displayName ?? fields.patientDisplayName ?? fields.patientQuery ?? 'Paciente' };
}

function selectedProfessional(id: string, fields: AssistantIntentFields, professionals: AssistantProfessionalOption[]) {
  const option = professionals.find((item) => item.id === id);
  return { id, displayName: option?.displayName ?? fields.professional ?? fields.professionalQuery ?? 'Profesional' };
}

function selectedTreatment(id: string, fields: AssistantIntentFields, treatments: AssistantTreatmentOption[]) {
  const option = treatments.find((item) => item.id === id);
  return {
    id,
    name: option?.displayName ?? fields.treatmentType ?? 'Tratamiento',
    defaultDurationMinutes: option?.defaultDurationMinutes ?? fields.durationMinutes ?? null,
  };
}

function hasDateCriteria(fields: AssistantIntentFields) {
  return Boolean(fields.slot?.fechaHora || fields.preferredDate || fields.dateRange || fields.datePreference);
}

function hasOpenAmbiguity(resolution: AssistantOperationalResolution) {
  return [
    resolution.patientResolution,
    resolution.professionalResolution,
    resolution.treatmentResolution,
  ].some((item) => item?.status === 'ambiguous' || item?.status === 'not_found');
}

function appointmentLike(intent: AssistantIntent) {
  return intent.intent === 'create_appointment' || intent.intent === 'move_appointment';
}

function needsSlots(intent: AssistantIntent) {
  return SCHEDULE_INTENTS.has(intent.intent);
}

function firstPriorityQuestion(draft: AssistantIntent, resolution: AssistantOperationalResolution) {
  const patient = resolution.patientResolution;
  const treatment = resolution.treatmentResolution;
  const professional = resolution.professionalResolution;
  const date = resolution.dateResolution;
  const slots = resolution.slotsResolution;

  if (PATIENT_REQUIRED_INTENTS.has(draft.intent)) {
    if (patient?.status === 'ambiguous') return patient.message ?? 'He encontrado varios pacientes. Elige uno.';
    if (patient?.status === 'not_found') return patient.message ?? 'No encuentro ese paciente. Revisa el nombre.';
    if (patient?.status === 'missing') return patient.message ?? 'Me falta elegir paciente.';
  }

  if (TREATMENT_REQUIRED_INTENTS.has(draft.intent)) {
    if (treatment?.status === 'ambiguous') return treatment.message ?? 'He encontrado varios tratamientos. Elige uno.';
    if (treatment?.status === 'not_found') return treatment.message ?? 'No encuentro ese tratamiento. Elige uno del catalogo.';
    if (treatment?.status === 'missing') return treatment.message ?? 'Me falta el tratamiento.';
  }

  if (professional?.status === 'ambiguous') return professional.message ?? 'He encontrado varios profesionales. Elige uno.';
  if (professional?.status === 'not_found') return professional.message ?? 'No encuentro ese profesional. Elige uno.';

  if (needsSlots(draft) && date?.status === 'missing') {
    return date.message ?? 'Me falta fecha o rango para buscar huecos.';
  }

  if (slots?.status === 'missing_data') return slots.message ?? 'Faltan datos para buscar huecos.';
  if (slots?.status === 'no_slots') return slots.message ?? 'No he encontrado huecos con esos datos.';
  if (appointmentLike(draft) && slots?.status === 'found' && !draft.fields.slot?.fechaHora) {
    return 'Elige uno de los huecos disponibles para poder confirmar.';
  }

  return null;
}

function canConfirmDraft(draft: AssistantIntent, resolution: AssistantOperationalResolution, nextQuestion: string | null, context: AssistantContextSnapshot) {
  if (!draft.requiresConfirmation) return false;
  const action = getActionDefinition(draft.intent);
  const hasPermissions = action.permissions.every((permission) => context.permissions.includes(permission));
  if (!hasPermissions || nextQuestion || hasOpenAmbiguity(resolution)) return false;

  if (draft.intent === 'create_appointment') {
    return Boolean(
      draft.fields.patientId
      && (draft.fields.treatmentId || draft.fields.treatmentType)
      && draft.fields.slot?.fechaHora
      && (draft.fields.professionalId || draft.fields.slot.doctorId),
    );
  }

  if (draft.intent === 'move_appointment') {
    return Boolean(draft.fields.appointmentId && (draft.fields.slot?.fechaHora || preferredDateFromFields(draft.fields)));
  }

  return !draft.needsClarification;
}

async function resolveSlots({
  draft,
  resolution,
  professionals,
  findSlots,
}: {
  draft: AssistantIntent;
  resolution: AssistantOperationalResolution;
  professionals: AssistantProfessionalOption[];
  findSlots: (draft: AssistantIntent) => Promise<AssistantSlot[]>;
}): Promise<{ fields: AssistantIntentFields; slotsResolution?: AssistantSlotsResolution }> {
  if (!needsSlots(draft)) return { fields: {} };

  if (draft.fields.slot?.fechaHora) {
    return {
      fields: {},
      slotsResolution: {
        status: 'ready',
        slots: draft.fields.suggestedSlots ?? [draft.fields.slot],
        message: 'Hueco seleccionado.',
      },
    };
  }

  const hasTreatmentOrDuration = Boolean(draft.fields.durationMinutes || draft.fields.treatmentId || draft.fields.treatmentType);
  if (!hasTreatmentOrDuration || resolution.treatmentResolution?.status === 'missing' || resolution.treatmentResolution?.status === 'not_found') {
    return {
      fields: {},
      slotsResolution: { status: 'missing_data', message: 'Necesito un tratamiento o duracion para buscar huecos.' },
    };
  }

  if (!hasDateCriteria(draft.fields)) {
    return {
      fields: {},
      slotsResolution: { status: 'missing_data', message: 'Necesito fecha o rango para buscar huecos.' },
    };
  }

  if (resolution.professionalResolution?.status === 'ambiguous' || resolution.professionalResolution?.status === 'not_found') {
    return {
      fields: {},
      slotsResolution: { status: 'missing_data', message: 'Necesito resolver el profesional antes de consultar huecos.' },
    };
  }

  const selectedProfessionalId = draft.fields.professionalId;
  const searchProfessionals = selectedProfessionalId
    ? professionals.filter((item) => item.id === selectedProfessionalId)
    : professionals;

  if (!searchProfessionals.length) {
    return {
      fields: {},
      slotsResolution: { status: 'missing_data', message: 'No hay profesionales activos para consultar disponibilidad.' },
    };
  }

  const slotGroups = await Promise.all(searchProfessionals.slice(0, 6).map(async (professional) => {
    const scopedDraft = mergeIntentDraft(draft, {
      fields: {
        professionalId: professional.id,
        professional: professional.displayName,
        professionalQuery: professional.displayName,
      },
    });
    const slots = await findSlots(scopedDraft);
    return slots.map((slot) => ({
      ...slot,
      doctorId: slot.doctorId ?? professional.id,
      doctorName: slot.doctorName ?? professional.displayName,
      label: slot.label ?? `${slot.fechaHora?.slice(0, 16).replace('T', ' ')} - ${professional.displayName}`,
    }));
  }));

  const slots = slotGroups
    .flat()
    .sort((a, b) => (a.fechaHora ?? '').localeCompare(b.fechaHora ?? ''))
    .slice(0, 8);

  if (!slots.length) {
    return {
      fields: { suggestedSlots: [], slot: null, selectedSlotIndex: null },
      slotsResolution: { status: 'no_slots', slots: [], message: 'No he encontrado huecos con esos datos.' },
    };
  }

  return {
    fields: { suggestedSlots: slots, slot: null, selectedSlotIndex: null },
    slotsResolution: { status: 'found', slots, message: `He encontrado ${slots.length} hueco(s).` },
  };
}

export async function resolveOperationalDraft(input: OperationalResolverInput): Promise<OperationalResolverOutput> {
  if (input.draft.intent === 'create_budget_draft' || input.draft.intent === 'update_budget_draft') {
    return resolveBudgetOperationalDraft(input);
  }

  const findSlots = input.findSlots ?? findAvailableSlotsForIntent;
  let fields: AssistantIntentFields = {};
  let workingDraft = input.draft;
  const resolution: AssistantOperationalResolution = {};

  if (workingDraft.fields.patientId) {
    const selected = selectedPatient(workingDraft.fields.patientId, workingDraft.fields, input.patients);
    fields.patientDisplayName = selected.displayName;
    resolution.patientResolution = { status: 'resolved', selected };
  } else if (workingDraft.fields.patientQuery) {
    const resolved = resolvePatientFields({
      query: workingDraft.fields.patientQuery,
      context: input.safeContext,
      patients: input.patients,
      allowCurrentPatient: false,
    });
    fields = { ...fields, ...resolved };
    if (resolved.patientId) {
      resolution.patientResolution = { status: 'resolved', selected: selectedPatient(resolved.patientId, resolved, input.patients) };
    } else if (resolved.patientOptions?.length) {
      resolution.patientResolution = {
        status: 'ambiguous',
        options: resolved.patientOptions,
        message: `He encontrado varias coincidencias para ${workingDraft.fields.patientQuery}. Elige paciente.`,
      };
    } else {
      resolution.patientResolution = { status: 'not_found', message: `No encuentro paciente para ${workingDraft.fields.patientQuery}.` };
    }
  } else if (PATIENT_REQUIRED_INTENTS.has(workingDraft.intent) && input.safeContext.currentPatientId && workingDraft.intent !== 'search_patient') {
    fields.patientId = input.safeContext.currentPatientId;
    fields.patientDisplayName = input.safeContext.currentPatientDisplayName ?? 'Paciente actual';
    fields.patientQuery = input.safeContext.currentPatientDisplayName ?? 'paciente actual';
    fields.patientOptions = [];
    resolution.patientResolution = {
      status: 'resolved',
      selected: { id: input.safeContext.currentPatientId, displayName: fields.patientDisplayName },
      message: 'Uso el paciente activo.',
    };
  } else if (PATIENT_REQUIRED_INTENTS.has(workingDraft.intent)) {
    resolution.patientResolution = { status: 'missing', message: 'Me falta elegir paciente.' };
  }

  workingDraft = mergeIntentDraft(workingDraft, { fields });
  fields = {};

  if (workingDraft.fields.professionalId) {
    const selected = selectedProfessional(workingDraft.fields.professionalId, workingDraft.fields, input.professionals);
    fields.professional = selected.displayName;
    fields.professionalQuery = selected.displayName;
    resolution.professionalResolution = { status: 'resolved', selected };
  } else if (workingDraft.fields.slot?.doctorId) {
    const selected = selectedProfessional(workingDraft.fields.slot.doctorId, workingDraft.fields, input.professionals);
    fields.professionalId = selected.id;
    fields.professional = selected.displayName;
    fields.professionalQuery = selected.displayName;
    resolution.professionalResolution = { status: 'resolved', selected, message: 'Profesional resuelto por el hueco seleccionado.' };
  } else if (workingDraft.fields.professionalQuery) {
    const resolved = resolveProfessionalFields(workingDraft.fields.professionalQuery, input.professionals);
    fields = { ...fields, ...resolved };
    if (resolved.professionalId) {
      resolution.professionalResolution = {
        status: 'resolved',
        selected: selectedProfessional(resolved.professionalId, resolved, input.professionals),
      };
    } else if (resolved.professionalOptions?.length) {
      resolution.professionalResolution = {
        status: 'ambiguous',
        options: resolved.professionalOptions,
        message: `He encontrado varios profesionales para ${workingDraft.fields.professionalQuery}. Elige uno.`,
      };
    } else {
      resolution.professionalResolution = { status: 'not_found', message: `No encuentro profesional para ${workingDraft.fields.professionalQuery}.` };
    }
  } else if (input.safeContext.currentDoctorId && SCHEDULE_INTENTS.has(workingDraft.intent)) {
    const selected = selectedProfessional(input.safeContext.currentDoctorId, workingDraft.fields, input.professionals);
    fields.professionalId = selected.id;
    fields.professional = selected.displayName;
    fields.professionalQuery = selected.displayName;
    resolution.professionalResolution = { status: 'resolved', selected, message: 'Uso el profesional activo de agenda.' };
  } else if (SCHEDULE_INTENTS.has(workingDraft.intent) && input.professionals.length) {
    resolution.professionalResolution = {
      status: 'missing',
      flexible: true,
      message: 'Buscare huecos con profesionales disponibles.',
    };
  }

  workingDraft = mergeIntentDraft(workingDraft, { fields });
  fields = {};

  if (workingDraft.fields.treatmentId) {
    const selected = selectedTreatment(workingDraft.fields.treatmentId, workingDraft.fields, input.treatments);
    fields.treatmentType = selected.name;
    fields.durationMinutes = workingDraft.fields.durationMinutes ?? selected.defaultDurationMinutes ?? 30;
    resolution.treatmentResolution = { status: 'resolved', selected };
  } else if (workingDraft.fields.treatmentType) {
    const resolved = resolveTreatmentFields(workingDraft.fields.treatmentType, input.treatments);
    fields = { ...fields, ...resolved };
    if (resolved.treatmentId) {
      resolution.treatmentResolution = {
        status: 'resolved',
        selected: selectedTreatment(resolved.treatmentId, resolved, input.treatments),
      };
    } else if (resolved.treatmentOptions?.length) {
      resolution.treatmentResolution = {
        status: 'ambiguous',
        options: resolved.treatmentOptions,
        message: `He encontrado varios tratamientos para ${workingDraft.fields.treatmentType}. Elige uno.`,
      };
    } else if (input.treatments.length) {
      resolution.treatmentResolution = { status: 'not_found', message: `No encuentro tratamiento de catalogo para ${workingDraft.fields.treatmentType}.` };
      fields.durationMinutes = null;
    } else {
      resolution.treatmentResolution = {
        status: 'resolved',
        selected: { id: 'manual-treatment', name: workingDraft.fields.treatmentType, defaultDurationMinutes: resolved.durationMinutes ?? 30 },
        message: 'Uso una duracion estimada porque no hay catalogo cargado.',
      };
      fields.durationMinutes = resolved.durationMinutes ?? workingDraft.fields.durationMinutes ?? 30;
    }
  } else if (TREATMENT_REQUIRED_INTENTS.has(workingDraft.intent)) {
    resolution.treatmentResolution = { status: 'missing', message: 'Me falta el tratamiento.' };
  }

  workingDraft = mergeIntentDraft(workingDraft, { fields });
  fields = {};

  if (!workingDraft.fields.durationMinutes && resolution.treatmentResolution?.status === 'resolved') {
    fields.durationMinutes = resolution.treatmentResolution.selected?.defaultDurationMinutes ?? 30;
  }

  if (!hasDateCriteria(workingDraft.fields) && SCHEDULE_INTENTS.has(workingDraft.intent)) {
    fields.dateRange = 'next_available';
  }

  workingDraft = mergeIntentDraft(workingDraft, { fields });

  resolution.dateResolution = hasDateCriteria(workingDraft.fields)
    ? {
        status: 'resolved',
        dateRange: workingDraft.fields.dateRange ?? null,
        preferredDate: workingDraft.fields.preferredDate ?? preferredDateFromFields(workingDraft.fields),
        timePreference: workingDraft.fields.timePreference ?? null,
      }
    : { status: 'missing', message: 'Me falta fecha o rango.' };

  const slots = await resolveSlots({
    draft: workingDraft,
    resolution,
    professionals: input.professionals,
    findSlots,
  });

  if (slots.slotsResolution) resolution.slotsResolution = slots.slotsResolution;
  workingDraft = mergeIntentDraft(workingDraft, { fields: slots.fields });

  if (workingDraft.fields.slot?.doctorId && !workingDraft.fields.professionalId) {
    const selected = selectedProfessional(workingDraft.fields.slot.doctorId, workingDraft.fields, input.professionals);
    workingDraft = mergeIntentDraft(workingDraft, {
      fields: {
        professionalId: selected.id,
        professional: selected.displayName,
        professionalQuery: selected.displayName,
      },
    });
    resolution.professionalResolution = { status: 'resolved', selected, message: 'Profesional resuelto por el hueco seleccionado.' };
  }

  const nextQuestion = firstPriorityQuestion(workingDraft, resolution);
  const canConfirm = canConfirmDraft(workingDraft, resolution, nextQuestion, input.safeContext);
  const status: AssistantPhase = nextQuestion
    ? 'needs_clarification'
    : workingDraft.requiresConfirmation
      ? 'awaiting_confirmation'
      : 'ready';

  const draft = {
    ...workingDraft,
    status,
    needsClarification: Boolean(nextQuestion),
    clarificationQuestion: nextQuestion,
    operationalResolution: resolution,
    operationalNextQuestion: nextQuestion,
    operationalCanConfirm: canConfirm,
    updatedAt: new Date().toISOString(),
  };

  return {
    draft,
    resolution,
    nextQuestion,
    canConfirm,
  };
}
