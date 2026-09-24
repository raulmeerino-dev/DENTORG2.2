import { describe, expect, it, vi } from 'vitest';
import { buildAssistantContext } from './assistantContext';
import { applyDraftPatch } from './DraftPatch';
import { createIntent, mergeIntentDraft } from './draftStore';
import { resolveOperationalDraft } from './OperationalResolver';
import type { AssistantIntent, AssistantSlot } from './types';

const context = buildAssistantContext('/agenda', {
  id: 'user-1',
  username: 'recepcion',
  nombre: 'Recepcion',
  rol: 'recepcion',
  doctor_id: null,
});

const patients = [
  { id: 'patient-carmen-gomez', displayName: 'Carmen Gomez', historyNumber: 482, phone: '600000482' },
  { id: 'patient-carmen-lopez', displayName: 'Carmen Lopez', historyNumber: 713, phone: '600000713' },
  { id: 'patient-cesar', displayName: 'Cesar Gutierrez', historyNumber: 914, phone: '600000914' },
];

const professionals = [
  { id: 'doctor-cintia', displayName: 'Cintia Martin', specialty: 'Higiene' },
  { id: 'doctor-laura', displayName: 'Laura Perez', specialty: 'General' },
];

const treatments = [
  { id: 't-limp', displayName: 'Limpieza / profilaxis', code: 'LIMP', familyName: 'Higiene', defaultDurationMinutes: 30, unitPrice: 60, requiresTooth: false },
  { id: 't-rev', displayName: 'Revision', code: 'REV', familyName: 'General', defaultDurationMinutes: 20, unitPrice: 25, requiresTooth: false },
  { id: 't-emp', displayName: 'Empaste', code: 'EMP', familyName: 'Conservadora', defaultDurationMinutes: 40, unitPrice: 50, requiresTooth: true },
  { id: 't-endo', displayName: 'Endodoncia', code: 'ENDO', familyName: 'Endodoncia', defaultDurationMinutes: 60, unitPrice: 150, requiresTooth: true },
];

function resolve(draft: AssistantIntent, slots: AssistantSlot[] = []) {
  const findSlots = vi.fn(async (scopedDraft: AssistantIntent) => slots.map((slot, index) => ({
    ...slot,
    doctorId: slot.doctorId ?? scopedDraft.fields.professionalId,
    doctorName: slot.doctorName ?? scopedDraft.fields.professional,
    label: slot.label ?? `${index + 1}`,
  })));

  return {
    findSlots,
    result: resolveOperationalDraft({
      draft,
      safeContext: context,
      patients,
      professionals,
      treatments,
      findSlots,
    }),
  };
}

describe('OperationalResolver', () => {
  it('resolves appointment entities and proposes real slots without auto-selecting one', async () => {
    const draft = createIntent('create_appointment', {
      patientQuery: 'Cesar Gutierrez',
      treatmentType: 'empastes',
      professionalQuery: 'Cinthia',
      dateRange: 'next_available',
    }, 0.9);

    const { result, findSlots } = resolve(draft, [
      { fechaHora: '2026-07-01T10:30:00', durationMinutes: 40 },
    ]);
    const resolved = await result;

    expect(resolved.draft.fields.patientId).toBe('patient-cesar');
    expect(resolved.draft.fields.professionalId).toBe('doctor-cintia');
    expect(resolved.draft.fields.treatmentId).toBe('t-emp');
    expect(resolved.draft.fields.durationMinutes).toBe(40);
    expect(resolved.draft.fields.suggestedSlots).toHaveLength(1);
    expect(resolved.draft.fields.slot).toBeNull();
    expect(resolved.canConfirm).toBe(false);
    expect(resolved.nextQuestion).toMatch(/elige uno/i);
    expect(findSlots).toHaveBeenCalledTimes(1);
  });

  it('keeps ambiguous patients as options and prevents confirmation', async () => {
    const draft = createIntent('create_appointment', {
      patientQuery: 'Carmen',
      treatmentType: 'limpieza',
      dateRange: 'next_week',
    }, 0.9);

    const resolved = await resolve(draft).result;

    expect(resolved.resolution.patientResolution?.status).toBe('ambiguous');
    expect(resolved.draft.fields.patientOptions).toHaveLength(2);
    expect(resolved.canConfirm).toBe(false);
    expect(resolved.nextQuestion).toMatch(/paciente/i);
  });

  it('applies a patient DraftPatch and preserves the existing treatment', async () => {
    const draft = createIntent('create_appointment', {
      patientQuery: 'Carmen',
      patientOptions: patients.slice(0, 2),
      treatmentType: 'limpieza',
      dateRange: 'next_week',
    }, 0.9);

    const patched = applyDraftPatch(draft, {
      action: 'update_fields',
      confidence: 0.95,
      updates: { patientQuery: 'Carmen Gomez' },
      clearFields: [],
      spokenSummary: 'Paciente actualizado.',
    }, { context, patients, professionals, treatments });
    const resolved = await resolve(patched).result;

    expect(resolved.draft.fields.patientId).toBe('patient-carmen-gomez');
    expect(resolved.draft.fields.treatmentId).toBe('t-limp');
    expect(resolved.draft.fields.treatmentType).toBe('Limpieza / profilaxis');
  });

  it('searches slots across active professionals when no professional is fixed', async () => {
    const draft = createIntent('find_available_slots', {
      treatmentType: 'revision',
      dateRange: 'next_week',
    }, 0.9);
    const findSlots = vi.fn(async (scopedDraft: AssistantIntent) => [
      {
        fechaHora: scopedDraft.fields.professionalId === 'doctor-cintia'
          ? '2026-07-02T10:00:00'
          : '2026-07-02T16:00:00',
        doctorId: scopedDraft.fields.professionalId,
        doctorName: scopedDraft.fields.professional,
        durationMinutes: 20,
      },
    ]);

    const resolved = await resolveOperationalDraft({
      draft,
      safeContext: context,
      patients,
      professionals,
      treatments,
      findSlots,
    });

    expect(resolved.draft.fields.suggestedSlots).toHaveLength(2);
    expect(resolved.resolution.professionalResolution?.flexible).toBe(true);
    expect(findSlots).toHaveBeenCalledTimes(2);
  });

  it('resolves the selected slot professional and allows confirmation when complete', async () => {
    const draft = mergeIntentDraft(createIntent('create_appointment', {
      patientId: 'patient-cesar',
      patientDisplayName: 'Cesar Gutierrez',
      treatmentType: 'revision',
      dateRange: 'next_week',
    }, 0.9), {
      fields: {
        suggestedSlots: [
          { fechaHora: '2026-07-02T10:00:00', doctorId: 'doctor-cintia', doctorName: 'Cintia Martin', durationMinutes: 20 },
          { fechaHora: '2026-07-02T16:00:00', doctorId: 'doctor-laura', doctorName: 'Laura Perez', durationMinutes: 20 },
        ],
      },
    });

    const patched = applyDraftPatch(draft, {
      action: 'select_option',
      confidence: 0.95,
      updates: { selectedSlotIndex: 1 },
      clearFields: [],
      spokenSummary: 'Segundo hueco seleccionado.',
    }, { context, patients, professionals, treatments });
    const resolved = await resolve(patched).result;

    expect(resolved.draft.fields.slot?.fechaHora).toBe('2026-07-02T16:00:00');
    expect(resolved.draft.fields.professionalId).toBe('doctor-laura');
    expect(resolved.canConfirm).toBe(true);
    expect(resolved.nextQuestion).toBeNull();
  });

  it('resolves budget lines, prices and totals without appointment fields', async () => {
    const draft = createIntent('create_budget_draft', {
      patientQuery: 'Cesar Gutierrez',
      budgetStatus: 'draft',
      budgetLines: [
        { treatmentQuery: 'endodoncia', tooth: '24', quantity: 1 },
        { treatmentQuery: 'endodoncia', tooth: '23', quantity: 1 },
      ],
    }, 0.9);

    const resolved = await resolve(draft).result;

    expect(resolved.draft.fields.patientId).toBe('patient-cesar');
    expect(resolved.draft.fields.budgetLines).toHaveLength(2);
    expect(resolved.draft.fields.budgetLines?.[0]).toMatchObject({
      treatmentId: 't-endo',
      treatmentName: 'Endodoncia',
      tooth: '24',
      unitPrice: 150,
      total: 150,
      resolutionStatus: 'resolved',
    });
    expect(resolved.draft.fields.budgetTotal).toBe(300);
    expect(resolved.draft.fields.professionalId).toBeNull();
    expect(resolved.draft.fields.dateRange).toBeNull();
    expect(resolved.draft.fields.durationMinutes).toBeNull();
    expect(resolved.canConfirm).toBe(true);
  });

  it('applies a budget DraftPatch removing a tooth line', async () => {
    const draft = createIntent('create_budget_draft', {
      patientId: 'patient-cesar',
      patientDisplayName: 'Cesar Gutierrez',
      budgetLines: [
        { treatmentQuery: 'endodoncia', tooth: '24', quantity: 1 },
        { treatmentQuery: 'endodoncia', tooth: '23', quantity: 1 },
      ],
    }, 0.9);

    const patched = applyDraftPatch(draft, {
      action: 'update_fields',
      confidence: 0.95,
      updates: {
        budgetLines: [{ treatmentQuery: 'endodoncia', tooth: '24', quantity: 1 }],
      },
      clearFields: [],
      spokenSummary: 'Quito la endodoncia de la pieza 23.',
    }, { context, patients, professionals, treatments });
    const resolved = await resolve(patched).result;

    expect(resolved.draft.fields.budgetLines).toHaveLength(1);
    expect(resolved.draft.fields.budgetLines?.[0].tooth).toBe('24');
    expect(resolved.draft.fields.budgetTotal).toBe(150);
  });
});
