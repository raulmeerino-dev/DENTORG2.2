import { describe, expect, it, vi, beforeEach } from 'vitest';
import { api } from '../../lib/api';
import { buildAssistantContext } from './assistantContext';
import { createIntent, mergeIntentDraft } from './draftStore';
import { interpretAssistantTurnWithLLM, interpretLLMAssistantInput } from './LLMIntentInterpreter';
import type { AssistantIntent, DraftPatch } from './types';

vi.mock('../../lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}));

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
  { id: 'patient-ana', displayName: 'Ana Garcia', historyNumber: 915, phone: '600000915' },
];
const professionals = [
  { id: 'doctor-cintia', displayName: 'Cintia Martin', specialty: 'Higiene' },
  { id: 'doctor-laura', displayName: 'Laura Perez', specialty: 'General' },
];
const treatments = [
  { id: 't-limp', displayName: 'Limpieza / profilaxis', code: 'LIMP', familyName: 'Higiene', defaultDurationMinutes: 30 },
  { id: 't-rev', displayName: 'Revision', code: 'REV', familyName: 'General', defaultDurationMinutes: 20 },
  { id: 't-emp', displayName: 'Empaste', code: 'EMP', familyName: 'Conservadora', defaultDurationMinutes: 30 },
];

function llmIntent(fields: Record<string, unknown>, intent = 'create_appointment') {
  const requiresConfirmation = ['create_appointment', 'create_budget_draft', 'update_budget_draft'].includes(intent);
  const riskLevel = ['create_budget_draft', 'update_budget_draft', 'cancel_appointment'].includes(intent) ? 'high' : 'medium';
  return {
    data: {
      intent: {
        intent,
        confidence: 0.9,
        status: 'awaiting_confirmation',
        fields: {
          patientId: null,
          patientQuery: null,
          professionalId: null,
          professionalQuery: null,
          treatmentType: null,
          dateRange: null,
          preferredDate: null,
          preferredTime: null,
          timePreference: null,
          durationMinutes: null,
          appointmentId: null,
          taskText: null,
          noteText: null,
          amount: null,
          selectedSlotIndex: null,
          budgetLines: null,
          budgetStatus: null,
          ...fields,
        },
        missingFields: [],
        needsClarification: false,
        clarificationQuestion: null,
        requiresConfirmation,
        riskLevel,
        spokenSummary: 'Resumen operativo.',
      },
    },
  };
}

function llmPatch(patch: Partial<DraftPatch>) {
  return {
    data: {
      patch: {
        action: 'update_fields',
        confidence: 0.9,
        updates: {},
        clearFields: [],
        clarificationQuestion: null,
        spokenSummary: 'Borrador actualizado.',
        ...patch,
      },
    },
  };
}

function input(text: string, currentDraft: AssistantIntent | null = null) {
  return {
    text,
    currentDraft,
    context,
    patients,
    professionals,
    treatments,
  };
}

describe('LLMIntentInterpreter', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
  });

  it('calls the backend with safe context and resolves patient candidates after LLM output', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(llmIntent({ patientQuery: 'Carmen' }, 'search_patient'));

    const result = await interpretLLMAssistantInput(input('Busca a Carmen.'));

    expect(api.post).toHaveBeenCalledWith('/assistant/interpret', expect.objectContaining({
      userText: 'Busca a Carmen.',
      context: expect.objectContaining({
        hasCurrentPatient: false,
        permissions: expect.any(Array),
      }),
    }));
    expect(result.intent).toBe('search_patient');
    expect(result.fields.patientOptions).toHaveLength(2);
    expect(result.fields.patientQuery).toBe('Carmen');
  });

  it('sends active-draft turns to the DraftPatch endpoint', async () => {
    const draft = createIntent('create_appointment', {
      patientId: 'patient-carmen-gomez',
      patientDisplayName: 'Carmen Gomez',
      patientQuery: 'Carmen Gomez',
      professionalId: 'doctor-cintia',
      professional: 'Cintia Martin',
      treatmentType: 'Limpieza / profilaxis',
      dateRange: 'next_week',
    }, 0.9, 'Dale cita a Carmen Gomez.');
    vi.mocked(api.post).mockResolvedValueOnce(llmPatch({ updates: { timePreference: 'afternoon' } }));

    const result = await interpretAssistantTurnWithLLM(input('Mejor el jueves por la tarde.', draft));

    expect(api.post).toHaveBeenCalledWith('/assistant/patch', expect.objectContaining({
      userText: 'Mejor el jueves por la tarde.',
      currentDraft: expect.objectContaining({ intent: 'create_appointment' }),
      safeContext: expect.objectContaining({ hasCurrentPatient: false }),
    }));
    expect(api.post).not.toHaveBeenCalledWith('/assistant/interpret', expect.anything());
    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.fields.patientDisplayName).toBe('Carmen Gomez');
    expect(result.intent.fields.professional).toBe('Cintia Martin');
    expect(result.intent.fields.treatmentType).toBe('Limpieza / profilaxis');
    expect(result.intent.fields.timePreference).toBe('afternoon');
  });

  it('applies a professional correction patch without losing treatment or date', async () => {
    const draft = createIntent('create_appointment', {
      patientId: 'patient-cesar',
      patientDisplayName: 'Cesar Gutierrez',
      patientQuery: 'Cesar Gutierrez',
      professionalId: 'doctor-cintia',
      professional: 'Cintia Martin',
      professionalQuery: 'Cintia',
      treatmentType: 'Empaste',
      dateRange: 'next_available',
    }, 0.9);
    vi.mocked(api.post).mockResolvedValueOnce(llmPatch({ updates: { professionalQuery: 'Laura' } }));

    const result = await interpretAssistantTurnWithLLM(input('no, con laura', draft));

    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.id).toBe(draft.id);
    expect(result.intent.fields.patientDisplayName).toBe('Cesar Gutierrez');
    expect(result.intent.fields.treatmentType).toBe('Empaste');
    expect(result.intent.fields.dateRange).toBe('next_available');
    expect(result.intent.fields.professional).toBe('Laura Perez');
    expect(result.intent.fields.slot).toBeNull();
  });

  it('applies patient and professional correction patches while preserving treatment and date', async () => {
    const draft = createIntent('create_appointment', {
      patientQuery: 'Carmen',
      patientId: null,
      patientOptions: patients.slice(0, 2),
      treatmentType: 'Limpieza / profilaxis',
      dateRange: 'next_week',
    }, 0.9);
    vi.mocked(api.post).mockResolvedValueOnce(llmPatch({
      updates: {
        patientQuery: 'Carmen Gomez',
        professionalQuery: 'Cintia',
      },
    }));

    const result = await interpretAssistantTurnWithLLM(input('carmen gomez con cintia', draft));

    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.id).toBe(draft.id);
    expect(result.intent.fields.patientDisplayName).toBe('Carmen Gomez');
    expect(result.intent.fields.professional).toBe('Cintia Martin');
    expect(result.intent.fields.treatmentType).toBe('Limpieza / profilaxis');
    expect(result.intent.fields.dateRange).toBe('next_week');
  });

  it('applies a date correction patch while preserving patient, professional and treatment', async () => {
    const draft = createIntent('create_appointment', {
      patientId: 'patient-carmen-gomez',
      patientDisplayName: 'Carmen Gomez',
      patientQuery: 'Carmen Gomez',
      professionalId: 'doctor-cintia',
      professional: 'Cintia Martin',
      professionalQuery: 'Cintia',
      treatmentType: 'Revision',
      dateRange: 'in_six_months',
    }, 0.9);
    vi.mocked(api.post).mockResolvedValueOnce(llmPatch({ updates: { dateRange: 'in_three_months' } }));

    const result = await interpretAssistantTurnWithLLM(input('mejor en tres meses', draft));

    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.fields.patientDisplayName).toBe('Carmen Gomez');
    expect(result.intent.fields.professional).toBe('Cintia Martin');
    expect(result.intent.fields.treatmentType).toBe('Revision');
    expect(result.intent.fields.dateRange).toBe('in_three_months');
  });

  it('selects a slot through a DraftPatch selectedSlotIndex', async () => {
    const draft = mergeIntentDraft(createIntent('create_appointment', {
      patientId: 'patient-carmen-gomez',
      treatmentType: 'Limpieza / profilaxis',
      professionalId: 'doctor-cintia',
      dateRange: 'next_week',
    }, 0.9), {
      fields: {
        suggestedSlots: [
          { fechaHora: '2026-07-01T09:00:00', doctorId: 'doctor-cintia', doctorName: 'Cintia Martin', durationMinutes: 30 },
          { fechaHora: '2026-07-01T09:30:00', doctorId: 'doctor-cintia', doctorName: 'Cintia Martin', durationMinutes: 30 },
        ],
      },
    });
    vi.mocked(api.post).mockResolvedValueOnce(llmPatch({
      action: 'select_option',
      updates: { selectedSlotIndex: 1 },
    }));

    const result = await interpretAssistantTurnWithLLM(input('El segundo.', draft));

    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.fields.selectedSlotIndex).toBe(1);
    expect(result.intent.fields.slot?.fechaHora).toBe('2026-07-01T09:30:00');
  });

  it('confirms a complete draft through a DraftPatch', async () => {
    const draft = createIntent('create_appointment', {
      patientId: 'patient-carmen-gomez',
      patientDisplayName: 'Carmen Gomez',
      professionalId: 'doctor-cintia',
      treatmentType: 'Limpieza / profilaxis',
      dateRange: 'next_week',
      slot: { fechaHora: '2026-07-01T09:00:00', doctorId: 'doctor-cintia', doctorName: 'Cintia Martin', durationMinutes: 30 },
    }, 0.9);
    vi.mocked(api.post).mockResolvedValueOnce(llmPatch({ action: 'confirm', spokenSummary: 'Confirmo el borrador.' }));

    const result = await interpretAssistantTurnWithLLM(input('si confirma', draft));

    expect(result.kind).toBe('confirm');
  });

  it('does not confirm when the patch asks to confirm but critical fields are missing', async () => {
    const draft = createIntent('create_appointment', {
      patientId: 'patient-ana',
      patientDisplayName: 'Ana Garcia',
      treatmentType: 'Revision',
      dateRange: 'tomorrow',
    }, 0.9);
    vi.mocked(api.post).mockResolvedValueOnce(llmPatch({ action: 'confirm' }));

    const result = await interpretAssistantTurnWithLLM(input('si confirma', draft));

    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.needsClarification).toBe(true);
    expect(result.intent.missingFields).toContain('slot');
  });

  it('cancels through a DraftPatch', async () => {
    const draft = createIntent('create_appointment', {
      patientId: 'patient-ana',
      patientDisplayName: 'Ana Garcia',
      treatmentType: 'Revision',
      dateRange: 'tomorrow',
    }, 0.9);
    vi.mocked(api.post).mockResolvedValueOnce(llmPatch({ action: 'cancel' }));

    const result = await interpretAssistantTurnWithLLM(input('cancela eso', draft));

    expect(result.kind).toBe('cancelled');
  });

  it('preserves the draft when the patch endpoint fails instead of using phrase heuristics', async () => {
    const draft = createIntent('create_appointment', {
      patientId: 'patient-ana',
      patientDisplayName: 'Ana Garcia',
      treatmentType: 'Revision',
      dateRange: 'tomorrow',
    }, 0.9);
    vi.mocked(api.post).mockRejectedValueOnce(new Error('patch unavailable'));

    const result = await interpretAssistantTurnWithLLM(input('con Laura', draft));

    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.id).toBe(draft.id);
    expect(result.intent.fields.professional).toBeUndefined();
    expect(result.responseText).toMatch(/borrador sigue igual/i);
  });

  it('falls back to the local interpreter when the LLM endpoint fails', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('not configured'));

    const result = await interpretAssistantTurnWithLLM(input('Busca a Carmen.'));

    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.intent).toBe('search_patient');
    expect(result.intent.fields.patientQuery).toBe('Carmen');
  });

  it('does not fall back to local execution when backend reports an unsafe LLM response', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      response: {
        data: {
          detail: 'No he podido interpretar eso con seguridad. No se ha ejecutado nada.',
        },
      },
    });

    const result = await interpretAssistantTurnWithLLM(input('Abre la ficha de Carmen Gomez.'));

    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.intent).toBe('unknown');
    expect(result.intent.needsClarification).toBe(true);
    expect(result.responseText).toMatch(/No se ha ejecutado nada/);
  });

  it('shows the Ollama setup message instead of silently using the local interpreter', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      response: {
        data: {
          detail: 'Ollama no está ejecutándose. Instálalo y ejecuta: ollama pull qwen2.5:14b-instruct',
        },
      },
    });

    const result = await interpretAssistantTurnWithLLM(input('Busca a Carmen.'));

    expect(result.kind).toBe('intent');
    if (result.kind !== 'intent') return;
    expect(result.intent.intent).toBe('unknown');
    expect(result.responseText).toContain('ollama pull qwen2.5:14b-instruct');
  });

  it('cleans trailing availability clauses from LLM entity fields', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(llmIntent({
      patientQuery: null,
      treatmentType: null,
      professionalQuery: 'Cinthia Dime Que Opciones Y Huecos Hay',
      dateRange: null,
    }, 'find_available_slots'));

    const result = await interpretLLMAssistantInput(input('dale cita a cesar gutierrez para empastes con cinthia, dime que opciones y huecos hay'));

    expect(result.intent).toBe('find_available_slots');
    expect(result.fields.patientQuery?.toLowerCase()).toBe('cesar gutierrez');
    expect(result.fields.treatmentType).toBe('Empaste');
    expect(result.fields.professionalQuery).toBe('cinthia');
    expect(result.fields.dateRange).toBe('next_available');
  });

  it('keeps LLM budget lines structured and strips appointment fields', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(llmIntent({
      patientQuery: 'cesar gutierrez',
      budgetLines: [
        { treatmentQuery: 'endodoncia', treatmentId: null, description: null, tooth: '24', quantity: 1, unitPrice: null, discount: null, total: null },
        { treatmentQuery: 'endodoncia', treatmentId: null, description: null, tooth: '23', quantity: 1, unitPrice: null, discount: null, total: null },
      ],
      professionalQuery: 'No entendido',
      dateRange: 'next_available',
      durationMinutes: 30,
      budgetStatus: 'draft',
    }, 'create_budget_draft'));

    const result = await interpretLLMAssistantInput(input('hazme un presu para cesar gutierrez de una endodoncia en el 24 y otra en el 23'));

    expect(result.intent).toBe('create_budget_draft');
    expect(result.fields.patientQuery?.toLowerCase()).toBe('cesar gutierrez');
    expect(result.fields.budgetLines).toHaveLength(2);
    expect(result.fields.budgetLines?.[0]).toMatchObject({ treatmentQuery: 'endodoncia', tooth: '24', quantity: 1 });
    expect(result.fields.budgetLines?.[1]).toMatchObject({ treatmentQuery: 'endodoncia', tooth: '23', quantity: 1 });
    expect(result.fields.professionalQuery).toBeUndefined();
    expect(result.fields.dateRange).toBeUndefined();
    expect(result.fields.durationMinutes).toBeUndefined();
  });
});
