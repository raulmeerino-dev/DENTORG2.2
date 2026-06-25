import { normalizeBudgetLines } from './BudgetLineParser';
import { resolvePatientFields } from './PatientResolver';
import { resolveTreatmentFields } from './TreatmentResolver';
import { mergeIntentDraft } from './draftStore';
import type {
  AssistantBudgetLine,
  AssistantBudgetResolution,
  AssistantContextSnapshot,
  AssistantIntent,
  AssistantIntentFields,
  AssistantOperationalResolution,
  AssistantPatientOption,
  AssistantPhase,
  AssistantProfessionalOption,
  AssistantResolutionStatus,
  AssistantTreatmentOption,
} from './types';

export interface BudgetOperationalResolverInput {
  draft: AssistantIntent;
  safeContext: AssistantContextSnapshot;
  patients: AssistantPatientOption[];
  professionals: AssistantProfessionalOption[];
  treatments: AssistantTreatmentOption[];
}

export interface BudgetOperationalResolverOutput {
  draft: AssistantIntent;
  resolution: AssistantOperationalResolution;
  nextQuestion?: string | null;
  canConfirm: boolean;
}

function hasPermission(context: AssistantContextSnapshot, permission: string) {
  return context.permissions.some((item) => item === permission);
}

function hasBudgetCreatePermission(context: AssistantContextSnapshot) {
  return hasPermission(context, 'budget:create') || hasPermission(context, 'create_budget');
}

function hasBudgetConfirmPermission(context: AssistantContextSnapshot) {
  return hasPermission(context, 'budget:confirm') || hasPermission(context, 'create_budget');
}

function selectedPatient(id: string, fields: AssistantIntentFields, patients: AssistantPatientOption[]) {
  const option = patients.find((item) => item.id === id);
  return { id, displayName: option?.displayName ?? fields.patientDisplayName ?? fields.patientQuery ?? 'Paciente' };
}

function treatmentOption(id: string | null | undefined, treatments: AssistantTreatmentOption[]) {
  return id ? treatments.find((item) => item.id === id) ?? null : null;
}

function isValidTooth(value: string | null | undefined) {
  if (!value) return true;
  const tooth = Number(value);
  if (!Number.isInteger(tooth)) return false;
  const quadrant = Math.floor(tooth / 10);
  const position = tooth % 10;
  return quadrant >= 1 && quadrant <= 8 && position >= 1 && position <= 8;
}

function money(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function resolveLineTreatment(line: AssistantBudgetLine, treatments: AssistantTreatmentOption[]) {
  const selected = treatmentOption(line.treatmentId, treatments);
  if (selected) {
    return {
      status: 'resolved' as AssistantResolutionStatus,
      line: {
        ...line,
        treatmentId: selected.id,
        treatmentName: selected.displayName,
        treatmentQuery: line.treatmentQuery ?? selected.displayName,
        treatmentOptions: [],
      },
      option: selected,
    };
  }

  const query = line.treatmentQuery ?? line.treatmentName ?? line.description ?? null;
  if (!query) {
    return {
      status: 'missing' as AssistantResolutionStatus,
      line: { ...line, treatmentId: null, treatmentOptions: [] },
      option: null,
    };
  }

  const resolved = resolveTreatmentFields(query, treatments);
  const resolvedOption = treatmentOption(resolved.treatmentId, treatments);
  if (resolvedOption) {
    return {
      status: 'resolved' as AssistantResolutionStatus,
      line: {
        ...line,
        treatmentQuery: line.treatmentQuery ?? query,
        treatmentId: resolvedOption.id,
        treatmentName: resolvedOption.displayName,
        treatmentOptions: [],
      },
      option: resolvedOption,
    };
  }

  if (resolved.treatmentOptions?.length) {
    return {
      status: 'ambiguous' as AssistantResolutionStatus,
      line: {
        ...line,
        treatmentId: null,
        treatmentName: null,
        treatmentQuery: query,
        treatmentOptions: resolved.treatmentOptions,
      },
      option: null,
    };
  }

  return {
    status: treatments.length ? 'not_found' as AssistantResolutionStatus : 'missing' as AssistantResolutionStatus,
    line: {
      ...line,
      treatmentId: null,
      treatmentName: null,
      treatmentQuery: query,
      treatmentOptions: [],
    },
    option: null,
  };
}

function resolveBudgetLine(line: AssistantBudgetLine, treatments: AssistantTreatmentOption[]) {
  const treatment = resolveLineTreatment(line, treatments);
  const quantity = Math.max(1, Number(line.quantity ?? 1));
  const discount = Math.max(0, Math.min(100, Number(line.discount ?? 0)));
  const unitPrice = money(line.unitPrice ?? treatment.option?.unitPrice ?? null);
  const total = unitPrice == null ? null : money(unitPrice * quantity * (1 - discount / 100));
  const missingFields: AssistantBudgetLine['missingFields'] = [];

  if (treatment.status !== 'resolved') missingFields.push('treatment');
  if (treatment.option?.requiresTooth && !line.tooth) missingFields.push('tooth');
  if (!isValidTooth(line.tooth)) missingFields.push('tooth');
  if (!Number.isFinite(quantity) || quantity <= 0) missingFields.push('quantity');
  if (unitPrice == null) missingFields.push('price');

  const status: AssistantResolutionStatus = missingFields.length
    ? treatment.status === 'resolved' ? 'missing' : treatment.status
    : 'resolved';

  return {
    ...treatment.line,
    tooth: line.tooth ?? null,
    quantity,
    unitPrice,
    discount,
    total,
    resolutionStatus: status,
    missingFields,
  };
}

function patientResolution(
  draft: AssistantIntent,
  context: AssistantContextSnapshot,
  patients: AssistantPatientOption[],
) {
  let fields: AssistantIntentFields = {};
  const resolution: AssistantOperationalResolution = {};

  if (draft.fields.patientId) {
    const selected = selectedPatient(draft.fields.patientId, draft.fields, patients);
    fields.patientDisplayName = selected.displayName;
    resolution.patientResolution = { status: 'resolved', selected };
    return { fields, resolution };
  }

  if (draft.fields.patientQuery) {
    const resolved = resolvePatientFields({
      query: draft.fields.patientQuery,
      context,
      patients,
      allowCurrentPatient: false,
    });
    fields = { ...fields, ...resolved };
    if (resolved.patientId) {
      resolution.patientResolution = { status: 'resolved', selected: selectedPatient(resolved.patientId, resolved, patients) };
    } else if (resolved.patientOptions?.length) {
      resolution.patientResolution = {
        status: 'ambiguous',
        options: resolved.patientOptions,
        message: `He encontrado varias coincidencias para ${draft.fields.patientQuery}. Elige paciente.`,
      };
    } else {
      resolution.patientResolution = { status: 'not_found', message: `No encuentro paciente para ${draft.fields.patientQuery}.` };
    }
    return { fields, resolution };
  }

  if (context.currentPatientId) {
    fields.patientId = context.currentPatientId;
    fields.patientDisplayName = context.currentPatientDisplayName ?? 'Paciente actual';
    fields.patientQuery = context.currentPatientDisplayName ?? 'paciente actual';
    fields.patientOptions = [];
    resolution.patientResolution = {
      status: 'resolved',
      selected: { id: context.currentPatientId, displayName: fields.patientDisplayName },
      message: 'Uso el paciente activo.',
    };
    return { fields, resolution };
  }

  resolution.patientResolution = { status: 'missing', message: 'Me falta elegir paciente para el presupuesto.' };
  return { fields, resolution };
}

function firstBudgetQuestion(
  draft: AssistantIntent,
  resolution: AssistantOperationalResolution,
  context: AssistantContextSnapshot,
  professionals: AssistantProfessionalOption[],
) {
  const patient = resolution.patientResolution;
  const budget = resolution.budgetResolution;

  if (patient?.status === 'ambiguous') return patient.message ?? 'He encontrado varios pacientes. Elige uno.';
  if (patient?.status === 'not_found') return patient.message ?? 'No encuentro ese paciente. Revisa el nombre.';
  if (patient?.status === 'missing') return patient.message ?? 'Me falta elegir paciente.';

  if (budget?.status === 'missing_lines') return budget.message ?? 'Me faltan lineas de presupuesto.';
  if (budget?.status === 'incomplete') return budget.message ?? 'Hay lineas incompletas en el presupuesto.';

  if (!context.currentDoctorId && !professionals.length) {
    return 'No hay doctor disponible para crear el presupuesto.';
  }

  if (!hasBudgetCreatePermission(context)) {
    return 'No tienes permiso para crear presupuestos.';
  }

  if (draft.requiresConfirmation && !hasBudgetConfirmPermission(context)) {
    return 'No tienes permiso para confirmar presupuestos.';
  }

  return null;
}

export async function resolveBudgetOperationalDraft(input: BudgetOperationalResolverInput): Promise<BudgetOperationalResolverOutput> {
  const patient = patientResolution(input.draft, input.safeContext, input.patients);
  let workingDraft = mergeIntentDraft(input.draft, { fields: patient.fields });
  const resolution: AssistantOperationalResolution = { ...patient.resolution };

  const normalizedLines = normalizeBudgetLines(
    workingDraft.fields.budgetLines,
    workingDraft.originalText ?? workingDraft.fields.treatmentType ?? '',
    input.treatments,
  );
  const resolvedLines = normalizedLines.map((line) => resolveBudgetLine(line, input.treatments));
  const total = money(resolvedLines.reduce((sum, line) => sum + (line.total ?? 0), 0)) ?? 0;
  const hasIncompleteLine = resolvedLines.some((line) => line.resolutionStatus !== 'resolved');
  const budgetResolution: AssistantBudgetResolution = !resolvedLines.length
    ? {
        status: 'missing_lines',
        lines: [],
        total: 0,
        message: 'Me falta al menos una linea de presupuesto.',
      }
    : hasIncompleteLine
      ? {
          status: 'incomplete',
          lines: resolvedLines,
          total,
          message: 'Hay lineas de presupuesto pendientes de resolver.',
        }
      : {
          status: 'ready',
          lines: resolvedLines,
          total,
          message: `Presupuesto preparado con ${resolvedLines.length} linea(s).`,
        };

  resolution.budgetResolution = budgetResolution;
  workingDraft = mergeIntentDraft(workingDraft, {
    fields: {
      budgetLines: resolvedLines,
      budgetStatus: workingDraft.fields.budgetStatus ?? 'draft',
      budgetTotal: total,
      treatmentType: null,
      professional: null,
      professionalId: null,
      professionalQuery: null,
      dateRange: null,
      preferredDate: null,
      preferredTime: null,
      timePreference: null,
      durationMinutes: null,
      slot: null,
      suggestedSlots: [],
    },
  });

  const nextQuestion = firstBudgetQuestion(workingDraft, resolution, input.safeContext, input.professionals);
  const canConfirm = Boolean(
    workingDraft.requiresConfirmation
    && !nextQuestion
    && resolution.patientResolution?.status === 'resolved'
    && budgetResolution.status === 'ready',
  );
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
