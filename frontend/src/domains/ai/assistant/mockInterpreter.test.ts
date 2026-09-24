import { describe, expect, it } from 'vitest';
import { buildAssistantContext } from './assistantContext';
import { interpretAssistantTurn } from './orchestrator';
import type { AssistantContextSnapshot, AssistantIntent } from './types';

function contextWithPatient(): AssistantContextSnapshot {
  return {
    ...buildAssistantContext('/pacientes', {
      id: 'user-1',
      username: 'doctor',
      nombre: 'Doctor',
      rol: 'doctor',
      doctor_id: 'doctor-cintia',
    }),
    currentPatientId: 'patient-current',
    currentPatientDisplayName: 'Paciente Actual',
  };
}

const emptyContext = buildAssistantContext('/agenda', {
  id: 'user-1',
  username: 'recepcion',
  nombre: 'Recepcion',
  rol: 'recepcion',
  doctor_id: null,
});

const patients = [
  { id: 'patient-carmen-gomez', displayName: 'Carmen Gomez', historyNumber: 482, phone: '600000482' },
  { id: 'patient-carmen-lopez', displayName: 'Carmen Lopez', historyNumber: 713, phone: '600000713' },
  { id: 'patient-cesar-gutierrez', displayName: 'Cesar Gutierrez', historyNumber: 914, phone: '600000914' },
  { id: 'patient-maria-lopez', displayName: 'Maria Lopez', historyNumber: 915, phone: '600000915' },
  { id: 'patient-ana', displayName: 'Ana Garcia', historyNumber: 916, phone: '600000916' },
];
const professionals = [
  { id: 'doctor-cintia', displayName: 'Cintia Martin', specialty: 'Higiene' },
  { id: 'doctor-laura', displayName: 'Laura Perez', specialty: 'General' },
];
const treatments = [
  { id: 't-limp', displayName: 'Limpieza / profilaxis', code: 'LIMP', familyName: 'Higiene', defaultDurationMinutes: 30 },
  { id: 't-rev', displayName: 'Revision', code: 'REV', familyName: 'General', defaultDurationMinutes: 20 },
  { id: 't-emp', displayName: 'Empaste', code: 'EMP', familyName: 'Conservadora', defaultDurationMinutes: 30 },
  { id: 't-endo', displayName: 'Endodoncia', code: 'ENDO', familyName: 'Endodoncia', defaultDurationMinutes: 60 },
  { id: 't-impl', displayName: 'Implante', code: 'IMPL', familyName: 'Implantes', defaultDurationMinutes: 60 },
  { id: 't-cor', displayName: 'Corona', code: 'COR', familyName: 'Protesis', defaultDurationMinutes: 50 },
];

function interpret(text: string, currentDraft: AssistantIntent | null = null, context = emptyContext) {
  return interpretAssistantTurn({
    text,
    currentDraft,
    context,
    patients,
    professionals,
    treatments,
  });
}

function interpretWithoutTreatmentCatalog(text: string, currentDraft: AssistantIntent | null = null, context = emptyContext) {
  return interpretAssistantTurn({
    text,
    currentDraft,
    context,
    patients,
    professionals,
    treatments: [],
  });
}

describe('mock voice assistant interpreter', () => {
  it('opens a clear patient profile without confirmation', () => {
    const result = interpret('Abre la ficha de Carmen Gomez.');
    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.intent).toBe('open_patient_profile');
    expect(result.intent.fields.patientDisplayName).toBe('Carmen Gomez');
    expect(result.intent.requiresConfirmation).toBe(false);
    expect(result.intent.needsClarification).toBe(false);
  });

  it('keeps an appointment draft and asks when Carmen is ambiguous', () => {
    const result = interpret('Dale cita a Carmen para limpieza la semana que viene.');
    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.intent).toBe('create_appointment');
    expect(result.intent.fields.treatmentType).toBe('Limpieza / profilaxis');
    expect(result.intent.fields.dateRange).toBe('next_week');
    expect(result.intent.fields.patientOptions).toHaveLength(2);
    expect(result.intent.status).toBe('needs_clarification');
  });

  it('uses current patient for pending items and six-month reviews', () => {
    const pending = interpret('Que tiene pendiente este paciente?', null, contextWithPatient());
    expect(pending.kind).toBe('intent');
    if (pending.kind !== 'intent') return;
    expect(pending.intent.intent).toBe('show_patient_pending_items');
    expect(pending.intent.fields.patientId).toBe('patient-current');
    expect(pending.intent.status).toBe('ready');

    const review = interpret('Ponle una revision en seis meses.', null, contextWithPatient());
    expect(review.kind).toBe('intent');
    if (review.kind !== 'intent') return;
    expect(review.intent.intent).toBe('create_appointment');
    expect(review.intent.fields.patientId).toBe('patient-current');
    expect(review.intent.fields.treatmentType).toBe('Revision');
    expect(review.intent.fields.dateRange).toBe('in_six_months');
    expect(review.intent.status).toBe('needs_clarification');
  });

  it('searches partial patient names and keeps ambiguity visible', () => {
    const result = interpret('Busca a Carmen.');
    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.intent).toBe('search_patient');
    expect(result.intent.fields.patientQuery).toBe('Carmen');
    expect(result.intent.fields.patientOptions).toHaveLength(2);
  });

  it('resolves common transcription variants for Cintia', () => {
    const result = interpret('Dale cita a Carmen Gomez con Cynthia para limpieza manana por la tarde.');
    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.fields.professionalId).toBe('doctor-cintia');
    expect(result.intent.fields.timePreference).toBe('afternoon');
    expect(result.intent.fields.dateRange).toBe('tomorrow');
  });

  it('prepares no-show appointment drafts from visible agenda context and spoken time', () => {
    const context = {
      ...emptyContext,
      visibleAgendaDate: '2026-07-01',
    };
    const result = interpret('El de las cinco no viene.', null, context);
    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.intent).toBe('cancel_appointment');
    expect(result.intent.fields.appointmentAction).toBe('no_show');
    expect(result.intent.fields.preferredTime).toBe('17:00');
  });

  it('extracts entities before trailing options/huecos clauses', () => {
    const result = interpretWithoutTreatmentCatalog('dale cita a cesar gutierrez para empastes con cinthia, dime que opciones y huecos hay');
    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(['find_available_slots', 'create_appointment']).toContain(result.intent.intent);
    expect(result.intent.intent).toBe('find_available_slots');
    expect(result.intent.fields.patientQuery).toBe('cesar gutierrez');
    expect(result.intent.fields.treatmentType).toBe('empastes');
    expect(result.intent.fields.professionalQuery).toBe('cinthia');
    expect(result.intent.fields.dateRange).toBe('next_available');
    expect(result.intent.missingFields).not.toContain('patientQuery');
    expect(result.intent.missingFields).not.toContain('treatmentType');
    expect(result.intent.missingFields).not.toContain('professionalQuery');
  });

  it('understands availability requests with treatment, professional and patient after para', () => {
    const result = interpretWithoutTreatmentCatalog('busca huecos para limpieza con laura para maria lopez');
    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.intent).toBe('find_available_slots');
    expect(result.intent.fields.patientQuery).toBe('maria lopez');
    expect(result.intent.fields.treatmentType).toBe('limpieza');
    expect(result.intent.fields.professionalQuery).toBe('laura');
    expect(result.intent.fields.dateRange).toBe('next_available');
  });

  it('understands options requests without leaking the options clause into entities', () => {
    const result = interpretWithoutTreatmentCatalog('quiero opciones para empaste con cintia para cesar');
    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.intent).toBe('find_available_slots');
    expect(result.intent.fields.patientQuery).toBe('cesar');
    expect(result.intent.fields.treatmentType).toBe('empaste');
    expect(result.intent.fields.professionalQuery).toBe('cintia');
  });

  it('keeps appointment creation extraction with weekday and afternoon preference', () => {
    const result = interpretWithoutTreatmentCatalog('dale cita a ana para revision con cintia el jueves por la tarde');
    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.intent).toBe('create_appointment');
    expect(result.intent.fields.patientQuery).toBe('ana');
    expect(result.intent.fields.treatmentType).toBe('revision');
    expect(result.intent.fields.professionalQuery).toBe('cintia');
    expect(result.intent.fields.datePreference).toBe('jueves');
    expect(result.intent.fields.timePreference).toBe('afternoon');
  });

  it('classifies presu as a budget with separate endodontic lines by tooth', () => {
    const result = interpret('hazme un presu para cesar gutierrez de una endodoncia en el 24 y otra en el 23');
    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.intent).toBe('create_budget_draft');
    expect(result.intent.fields.patientQuery?.toLowerCase()).toBe('cesar gutierrez');
    expect(result.intent.fields.budgetLines).toHaveLength(2);
    expect(result.intent.fields.budgetLines?.[0]).toMatchObject({ treatmentQuery: 'endodoncia', tooth: '24', quantity: 1 });
    expect(result.intent.fields.budgetLines?.[1]).toMatchObject({ treatmentQuery: 'endodoncia', tooth: '23', quantity: 1 });
    expect(result.intent.fields.professionalId).toBeUndefined();
    expect(result.intent.fields.dateRange).toBeUndefined();
    expect(result.intent.fields.preferredTime).toBeUndefined();
    expect(result.intent.fields.durationMinutes).toBeUndefined();
  });

  it('splits budget treatments without teeth', () => {
    const result = interpret('prepara presupuesto para maria lopez de limpieza y revision');
    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.intent).toBe('create_budget_draft');
    expect(result.intent.fields.patientQuery?.toLowerCase()).toBe('maria lopez');
    expect(result.intent.fields.budgetLines?.map((line) => line.treatmentQuery)).toEqual(['limpieza', 'revision']);
  });

  it('splits different treatments on the same tooth', () => {
    const result = interpret('hazle presupuesto de implante en 46 y corona en 46');
    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.intent).toBe('create_budget_draft');
    expect(result.intent.fields.budgetLines).toHaveLength(2);
    expect(result.intent.fields.budgetLines?.[0]).toMatchObject({ treatmentQuery: 'implante', tooth: '46' });
    expect(result.intent.fields.budgetLines?.[1]).toMatchObject({ treatmentQuery: 'corona', tooth: '46' });
  });

  it('splits plural quantity budget phrasing into tooth lines', () => {
    const result = interpret('haz presupuesto para cesar gutierrez de dos endodoncias, 24 y 23');
    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.fields.budgetLines).toHaveLength(2);
    expect(result.intent.fields.budgetLines?.map((line) => line.tooth)).toEqual(['24', '23']);
  });
});
