import { describe, expect, it } from 'vitest';
import { buildAssistantContext } from './assistantContext';
import { routeFastCommand, FAST_COMMAND_CONFIDENCE_THRESHOLD } from './FastCommandRouter';
import type { AssistantContextSnapshot } from './types';

const baseContext = buildAssistantContext('/hoy', {
  id: 'user-1',
  username: 'recepcion',
  nombre: 'Recepcion',
  rol: 'recepcion',
  doctor_id: null,
});

const patientContext: AssistantContextSnapshot = {
  ...baseContext,
  path: '/pacientes',
  screen: 'patient_profile',
  currentPatientId: 'patient-1',
  currentPatientDisplayName: 'Carmen Gomez',
};

function fast(text: string, context = baseContext) {
  return routeFastCommand({ text, context, currentDraft: null });
}

describe('FastCommandRouter', () => {
  it('routes simple navigation commands locally with high confidence', () => {
    const agenda = fast('abre agenda');
    expect(agenda?.route).toBe('fast/local');
    expect(agenda?.confidence).toBeGreaterThanOrEqual(FAST_COMMAND_CONFIDENCE_THRESHOLD);
    expect(agenda?.action).toMatchObject({ type: 'navigate', targetPath: '/agenda' });
    expect(agenda?.matchedVerb).toBe('abre');
    expect(agenda?.matchedDestination).toBe('calendar');

    const caja = fast('abre caja por favor');
    expect(caja?.action).toMatchObject({ type: 'navigate', targetPath: '/caja' });
  });

  it('understands natural calendar navigation variants without exact phrase rules', () => {
    [
      'abre la agenda',
      'mirame la agenda',
      'ensename la agenda',
      'quiero ver la agenda',
      'vete a agenda',
      'muestrame el calendario',
      'abre calendario',
    ].forEach((text) => {
      const result = fast(text);
      expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result?.action).toMatchObject({ type: 'navigate', targetPath: '/agenda' });
      expect(result?.matchedDestination).toBe('calendar');
    });
  });

  it('opens patient workspace areas without using an LLM route', () => {
    const budgets = fast('abre presupuestos', patientContext);
    expect(budgets?.action).toMatchObject({
      type: 'open_patient_budgets',
      targetPath: '/pacientes',
      patientAction: 'budgets',
    });

    const documents = fast('abre documentos', patientContext);
    expect(documents?.action).toMatchObject({
      type: 'open_patient_documents',
      targetPath: '/pacientes',
      patientAction: 'documents',
    });
  });

  it('creates sensitive actions as drafts and never as saved operations', () => {
    const appointment = fast('nueva cita', patientContext);
    expect(appointment?.action.type).toBe('open_appointment_draft');
    if (appointment?.action.type !== 'open_appointment_draft') return;
    expect(appointment.action.sensitive).toBe(true);
    expect(appointment.action.intent.intent).toBe('create_appointment');
    expect(appointment.action.intent.fields.patientId).toBe('patient-1');
    expect(appointment.responseText).toMatch(/borrador/i);

    const budget = fast('nuevo presupuesto', patientContext);
    expect(budget?.action.type).toBe('open_budget_draft');
    if (budget?.action.type !== 'open_budget_draft') return;
    expect(budget.action.sensitive).toBe(true);
    expect(budget.action.intent.intent).toBe('create_budget_draft');
    expect(budget.action.intent.fields.budgetStatus).toBe('draft');
    expect(budget.action.intent.fields.budgetLines).toEqual([]);
  });

  it('leaves entity-rich or unclear commands for the LLM path', () => {
    expect(fast('dale cita a Carmen para limpieza manana')).toBeNull();
    expect(fast('abre presupuestos de Carmen Gomez')).toBeNull();
    expect(fast('haz presupuesto para Cesar de endodoncia en 24 y 23')).toBeNull();
    expect(fast('cobra 50 euros a Carmen')).toBeNull();
  });

  it('keeps destination-only navigation below the local execution threshold', () => {
    const result = fast('agenda');

    expect(result?.confidence).toBe(0.75);
    expect(result?.confidence).toBeLessThan(FAST_COMMAND_CONFIDENCE_THRESHOLD);
    expect(result?.matchedVerb).toBeNull();
    expect(result?.matchedDestination).toBe('calendar');
  });

  it('does not replace an active draft with a new sensitive draft', () => {
    const current = fast('nueva cita', patientContext);
    if (current?.action.type !== 'open_appointment_draft') throw new Error('Expected appointment draft');

    const next = routeFastCommand({
      text: 'nuevo presupuesto',
      context: patientContext,
      currentDraft: current.action.intent,
    });

    expect(next).toBeNull();
  });
});
