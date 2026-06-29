import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bot, Mic } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { getAssistantLLMHealth } from '../../lib/api';
import { getAssistantPatients } from './PatientAssistantAdapter';
import { getAssistantProfessionals } from './ProfessionalAssistantAdapter';
import { getAssistantTreatments } from './TreatmentAssistantAdapter';
import { getActionDefinition } from './actionRegistry';
import { executeAssistantAction, findAppointmentForIntent } from './actionExecutor';
import { auditAssistantEvent } from './auditLogger';
import { useAssistantContextProvider } from './assistantContext';
import AssistantPanel from './AssistantPanel';
import { applyDraftPatch } from './DraftPatch';
import { cancelIntent, mergeIntentDraft } from './draftStore';
import { FAST_COMMAND_CONFIDENCE_THRESHOLD, logAssistantRouteDebug, normalizeText, roundResponseMs, routeFastCommand } from './FastCommandRouter';
import { interpretAssistantTurnWithLLM } from './LLMIntentInterpreter';
import { resolveOperationalDraft } from './OperationalResolver';
import { canRunAssistantAction, permissionLabel } from './permissionGuard';
import { captureVoiceInput } from './voiceInputService';
import type { AssistantBudgetLine, AssistantContextSnapshot, AssistantDraftEditableField, AssistantIntent, AssistantMessage, AssistantPatientOption, AssistantPhase, AssistantProfessionalOption, AssistantSessionMemory, AssistantSlot, AssistantTreatmentOption, DraftPatch } from './types';
import './assistant.css';

function messageId() {
  return `assistant-message-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function newMessage(role: AssistantMessage['role'], text: string): AssistantMessage {
  return {
    id: messageId(),
    role,
    text,
    createdAt: new Date().toISOString(),
  };
}

function phaseFromIntent(intent: AssistantIntent): AssistantPhase {
  if (intent.needsClarification) return 'needs_clarification';
  if (intent.requiresConfirmation) return 'awaiting_confirmation';
  return 'ready';
}

function dispatchPatientFastAction(action: 'new' | 'budgets' | 'documents' | 'upload_document') {
  sessionStorage.setItem('dentcore_patient_action', action);
  window.dispatchEvent(new CustomEvent('dentcore:patient-fast-action', { detail: { action } }));
}

export default function AssistantFloatingButton() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const getContextSnapshot = useAssistantContextProvider();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<AssistantPhase>('idle');
  const [input, setInput] = useState('');
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState<AssistantIntent | null>(null);
  const [sessionMemory, setSessionMemory] = useState<AssistantSessionMemory>({});

  const pacientesQuery = useQuery({ queryKey: ['assistant-patients'], queryFn: getAssistantPatients, enabled: open });
  const profesionalesQuery = useQuery({ queryKey: ['assistant-professionals'], queryFn: getAssistantProfessionals, enabled: open });
  const tratamientosQuery = useQuery({ queryKey: ['assistant-treatments'], queryFn: getAssistantTreatments, enabled: open });
  const llmHealthQuery = useQuery({
    queryKey: ['assistant-llm-health'],
    queryFn: getAssistantLLMHealth,
    enabled: open,
    retry: false,
    refetchInterval: open ? 30_000 : false,
  });

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (llmHealthQuery.data?.mode === 'auto' && llmHealthQuery.data.activeProvider === 'openai') {
      console.info('[DentCore Voice Assistant] fallback LLM externo activo', {
        provider: 'openai',
        model: llmHealthQuery.data.openai.model,
      });
    }
  }, [llmHealthQuery.data]);

  const appendMessage = useCallback((role: AssistantMessage['role'], text: string) => {
    setMessages((current) => [...current, newMessage(role, text)]);
  }, []);

  const rememberIntent = useCallback((intent: AssistantIntent | null, question?: string | null) => {
    setSessionMemory((current) => ({
      ...current,
      lastDraft: intent,
      lastIntent: intent?.intent ?? current.lastIntent ?? null,
      lastPatientId: intent?.fields.patientId ?? intent?.fields.patientOptions?.[0]?.id ?? current.lastPatientId ?? null,
      lastAppointmentId: intent?.fields.appointmentId ?? current.lastAppointmentId ?? null,
      lastSlots: intent?.fields.suggestedSlots ?? current.lastSlots,
      lastQuestion: question ?? intent?.clarificationQuestion ?? current.lastQuestion ?? null,
    }));
  }, []);

  const resolveDraft = useCallback(async (intent: AssistantIntent, context: AssistantContextSnapshot) => {
    let workingIntent = intent;
    let contextMessage: string | null = null;

    if (intent.intent === 'cancel_appointment' && !intent.fields.appointmentId && (intent.fields.preferredTime || context.visibleAgendaDate)) {
      try {
        const { matches } = await findAppointmentForIntent(intent, context);
        if (matches.length === 1) {
          const match = matches[0];
          workingIntent = mergeIntentDraft(intent, {
            fields: {
              appointmentId: match.id,
              appointmentQuery: `${match.fecha_hora.slice(0, 16).replace('T', ' ')} ${match.paciente?.nombre ?? ''}`.trim(),
            },
          });
          contextMessage = `He localizado la cita de ${match.fecha_hora.slice(11, 16)}. La dejo en borrador para confirmar.`;
        } else if (matches.length > 1) {
          contextMessage = 'Hay varias citas que encajan. Selecciona una en la agenda o dime paciente/profesional.';
        }
      } catch {
        contextMessage = 'No he podido contrastar la cita visible ahora. Necesito que selecciones la cita o indiques mas datos.';
      }
    }

    const resolved = await resolveOperationalDraft({
      draft: workingIntent,
      safeContext: context,
      patients: pacientesQuery.data ?? [],
      professionals: profesionalesQuery.data ?? [],
      treatments: tratamientosQuery.data ?? [],
    });

    const extraMessage = [
      contextMessage,
      resolved.nextQuestion,
      resolved.resolution.slotsResolution?.status === 'found' && !resolved.nextQuestion
        ? resolved.resolution.slotsResolution.message
        : null,
      resolved.resolution.slotsResolution?.status === 'no_slots'
        ? resolved.resolution.slotsResolution.message
        : null,
    ].filter(Boolean).join('\n') || null;

    return { intent: resolved.draft, extraMessage };
  }, [pacientesQuery.data, profesionalesQuery.data, tratamientosQuery.data]);

  const applyPatchToDraft = useCallback(async (patch: DraftPatch, fallbackMessage: string) => {
    if (!draft) return;
    const context = getContextSnapshot();
    const patched = applyDraftPatch(draft, patch, {
      context,
      patients: pacientesQuery.data ?? [],
      professionals: profesionalesQuery.data ?? [],
      treatments: tratamientosQuery.data ?? [],
      sessionMemory,
    });
    const enriched = await resolveDraft(patched, context);
    setDraft(enriched.intent);
    setPhase(phaseFromIntent(enriched.intent));
    const responseText = [
      enriched.intent.clarificationQuestion ?? patch.spokenSummary ?? fallbackMessage,
      enriched.extraMessage,
    ].filter(Boolean).join('\n');
    if (responseText) appendMessage('assistant', responseText);
    rememberIntent(enriched.intent, responseText);
  }, [
    appendMessage,
    draft,
    getContextSnapshot,
    pacientesQuery.data,
    profesionalesQuery.data,
    rememberIntent,
    resolveDraft,
    sessionMemory,
    tratamientosQuery.data,
  ]);

  const executeIntent = useCallback(async (intent: AssistantIntent, confirmed: boolean) => {
    const context = getContextSnapshot();
    const action = getActionDefinition(intent.intent);
    if (intent.confidence < 0.75 && action.riskLevel !== 'low') {
      const message = 'No ejecuto acciones sensibles con baja confianza. Reformula la peticion o revisa el borrador manualmente.';
      setPhase('needs_clarification');
      appendMessage('assistant', message);
      auditAssistantEvent(context, intent, {
        status: 'needs_clarification',
        confirmed,
        originalText: intent.originalText,
        result: message,
      });
      return;
    }
    const permissionCheck = canRunAssistantAction(context, action);
    const confirmMissing = confirmed
      && (intent.intent === 'create_budget_draft' || intent.intent === 'update_budget_draft')
      && !context.permissions.some((permission) => permission === 'budget:confirm' || permission === 'create_budget')
      ? ['budget:confirm' as const]
      : [];
    const missingPermissions = [...permissionCheck.missingPermissions, ...confirmMissing];
    if (!permissionCheck.allowed || confirmMissing.length) {
      const message = `No tienes permiso para ${missingPermissions.map(permissionLabel).join(', ')}.`;
      setPhase('error');
      appendMessage('assistant', message);
      auditAssistantEvent(context, intent, {
        status: 'error',
        confirmed,
        originalText: intent.originalText,
        result: message,
      });
      return;
    }

    setPhase('executing');
    auditAssistantEvent(context, intent, {
      status: 'executing',
      confirmed,
      originalText: intent.originalText,
    });

    try {
      const result = await executeAssistantAction({
        intent,
        context,
        professionals: profesionalesQuery.data ?? [],
        queryClient,
        navigate,
      });
      appendMessage('assistant', result.details?.length ? `${result.message}\n${result.details.join('\n')}` : result.message);
      auditAssistantEvent(context, intent, {
        status: result.ok ? 'completed' : 'error',
        confirmed,
        originalText: intent.originalText,
        result: result.message,
      });
      setPhase(result.ok ? 'completed' : 'error');
      setDraft(null);
      rememberIntent(null, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo ejecutar la accion.';
      appendMessage('assistant', message);
      auditAssistantEvent(context, intent, {
        status: 'error',
        confirmed,
        originalText: intent.originalText,
        result: message,
      });
      setPhase('error');
    }
  }, [appendMessage, getContextSnapshot, navigate, profesionalesQuery.data, queryClient, rememberIntent]);

  const executeFastCommand = useCallback(async (
    match: NonNullable<ReturnType<typeof routeFastCommand>>,
    context: AssistantContextSnapshot,
    originalText: string,
    startedAt: number,
  ) => {
    const debugAction = match.action.type;

    if (match.action.type === 'navigate') {
      navigate(match.action.targetPath);
      setPhase('completed');
      appendMessage('assistant', match.responseText);
      const responseMs = roundResponseMs(startedAt);
      logAssistantRouteDebug({
        route: 'fast/local',
        responseMs,
        actionExecuted: `${match.action.type}:${match.action.targetPath}`,
        confidence: match.confidence,
        normalizedText: match.normalizedText,
        matchedVerb: match.matchedVerb,
        matchedDestination: match.matchedDestination,
        providerUsed: 'local',
        modelUsed: 'FastCommandRouter',
        intentFinal: match.action.type,
      });
      auditAssistantEvent(context, null, {
        status: 'completed',
        confirmed: false,
        originalText,
        result: match.responseText,
        route: 'fast/local',
        responseMs,
        actionExecuted: `${match.action.type}:${match.action.targetPath}`,
      });
      return;
    }

    if (
      match.action.type === 'open_patient_draft'
      || match.action.type === 'open_patient_budgets'
      || match.action.type === 'open_patient_documents'
    ) {
      dispatchPatientFastAction(match.action.patientAction);
      navigate(match.action.targetPath);
      setPhase('completed');
      appendMessage('assistant', match.responseText);
      const responseMs = roundResponseMs(startedAt);
      logAssistantRouteDebug({
        route: 'fast/local',
        responseMs,
        actionExecuted: `${match.action.type}:${match.action.patientAction}`,
        confidence: match.confidence,
        normalizedText: match.normalizedText,
        matchedVerb: match.matchedVerb,
        matchedDestination: match.matchedDestination,
        providerUsed: 'local',
        modelUsed: 'FastCommandRouter',
        intentFinal: match.action.type,
      });
      auditAssistantEvent(context, null, {
        status: 'completed',
        confirmed: false,
        originalText,
        result: match.responseText,
        route: 'fast/local',
        responseMs,
        actionExecuted: `${match.action.type}:${match.action.patientAction}`,
      });
      return;
    }

    const action = getActionDefinition(match.action.intent.intent);
    const permissionCheck = canRunAssistantAction(context, action);
    if (!permissionCheck.allowed) {
      const message = `No tienes permiso para ${permissionCheck.missingPermissions.map(permissionLabel).join(', ')}.`;
      setPhase('error');
      appendMessage('assistant', message);
      const responseMs = roundResponseMs(startedAt);
      logAssistantRouteDebug({
        route: 'fast/local',
        responseMs,
        actionExecuted: `${debugAction}:blocked_permission`,
        confidence: match.confidence,
        normalizedText: match.normalizedText,
        matchedVerb: match.matchedVerb,
        matchedDestination: match.matchedDestination,
        providerUsed: 'local',
        modelUsed: 'FastCommandRouter',
        intentFinal: `${debugAction}:blocked_permission`,
      });
      auditAssistantEvent(context, match.action.intent, {
        status: 'error',
        confirmed: false,
        originalText,
        result: message,
        route: 'fast/local',
        responseMs,
        actionExecuted: `${debugAction}:blocked_permission`,
      });
      return;
    }

    const enriched = await resolveDraft(match.action.intent, context);
    setDraft(enriched.intent);
    setPhase(phaseFromIntent(enriched.intent));
    const responseText = [match.responseText, enriched.intent.clarificationQuestion ?? enriched.extraMessage].filter(Boolean).join('\n');
    appendMessage('assistant', responseText);
    rememberIntent(enriched.intent, responseText);
    const responseMs = roundResponseMs(startedAt);
    logAssistantRouteDebug({
      route: 'fast/local',
      responseMs,
      actionExecuted: debugAction,
      confidence: match.confidence,
      normalizedText: match.normalizedText,
      matchedVerb: match.matchedVerb,
      matchedDestination: match.matchedDestination,
      providerUsed: 'local',
      modelUsed: 'FastCommandRouter',
      intentFinal: enriched.intent.intent,
    });
    auditAssistantEvent(context, enriched.intent, {
      status: enriched.intent.status,
      confirmed: false,
      originalText,
      result: responseText,
      route: 'fast/local',
      responseMs,
      actionExecuted: debugAction,
    });
  }, [appendMessage, navigate, rememberIntent, resolveDraft]);

  const processText = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    setInput('');
    setTranscript(text);
    appendMessage('user', text);
    setPhase('interpreting');

    const context = getContextSnapshot();
    const fastMatch = routeFastCommand({ text, context, currentDraft: draft });
    if (fastMatch && fastMatch.confidence >= FAST_COMMAND_CONFIDENCE_THRESHOLD) {
      await executeFastCommand(fastMatch, context, text, startedAt);
      return;
    }

    const result = await interpretAssistantTurnWithLLM({
      text,
      context,
      currentDraft: draft,
      patients: pacientesQuery.data ?? [],
      professionals: profesionalesQuery.data ?? [],
      treatments: tratamientosQuery.data ?? [],
      sessionMemory,
    });
    const llmResponseMs = roundResponseMs(startedAt);
    const llmAction = result.kind === 'cancelled' ? 'cancel_current_draft' : result.intent.intent;
    const debug = result.debug ?? {
      route: 'mock' as const,
      providerUsed: 'mock',
      modelUsed: 'MockIntentInterpreter',
      intentFinal: llmAction,
    };
    logAssistantRouteDebug({
      route: debug.route,
      responseMs: debug.responseMs ?? llmResponseMs,
      actionExecuted: llmAction,
      confidence: result.kind === 'cancelled' ? undefined : result.intent.confidence,
      normalizedText: fastMatch?.normalizedText ?? normalizeText(text),
      matchedVerb: fastMatch?.matchedVerb ?? null,
      matchedDestination: fastMatch?.matchedDestination ?? null,
      providerUsed: debug.providerUsed,
      modelUsed: debug.modelUsed,
      intentFinal: debug.intentFinal ?? llmAction,
    });

    if (result.kind === 'cancelled') {
      setDraft(result.intent);
      setPhase('cancelled');
      appendMessage('assistant', result.responseText);
      auditAssistantEvent(context, result.intent, {
        status: 'cancelled',
        confirmed: false,
        originalText: text,
        result: result.responseText,
        route: debug.route,
        responseMs: debug.responseMs ?? llmResponseMs,
        actionExecuted: llmAction,
      });
      window.setTimeout(() => setDraft(null), 0);
      rememberIntent(null, null);
      return;
    }

    const action = getActionDefinition(result.intent.intent);
    const permissionCheck = canRunAssistantAction(context, action);
    if (!permissionCheck.allowed) {
      const message = `No tienes permiso para ${permissionCheck.missingPermissions.map(permissionLabel).join(', ')}.`;
      setPhase('error');
      appendMessage('assistant', message);
      auditAssistantEvent(context, result.intent, {
        status: 'error',
        confirmed: false,
        originalText: text,
        result: message,
        route: debug.route,
        responseMs: debug.responseMs ?? llmResponseMs,
        actionExecuted: llmAction,
      });
      return;
    }

    if (result.kind === 'confirm') {
      const resolvedConfirm = await resolveDraft(result.intent, context);
      if (resolvedConfirm.intent.needsClarification || resolvedConfirm.intent.operationalCanConfirm === false) {
        setDraft(resolvedConfirm.intent);
        setPhase(phaseFromIntent(resolvedConfirm.intent));
        const message = resolvedConfirm.intent.clarificationQuestion
          ?? resolvedConfirm.extraMessage
          ?? 'No puedo confirmar todavia. Falta resolver el borrador.';
        appendMessage('assistant', message);
        rememberIntent(resolvedConfirm.intent, message);
        return;
      }
      appendMessage('assistant', result.responseText);
      await executeIntent(resolvedConfirm.intent, true);
      return;
    }

    const enriched = await resolveDraft(result.intent, context);

    if (enriched.intent.confidence < 0.75 && !enriched.intent.requiresConfirmation) {
      setDraft(enriched.intent);
      setPhase('needs_clarification');
      const message = enriched.intent.intent === 'unknown'
        ? 'No lo tengo claro. Puedes pedirme una accion concreta sobre paciente o agenda.'
        : `No estoy seguro. Confirmame si quieres: ${enriched.intent.summary}.`;
      appendMessage('assistant', message);
      rememberIntent(enriched.intent, message);
      return;
    }

    if (!enriched.intent.needsClarification
      && !enriched.intent.requiresConfirmation
      && enriched.intent.intent === 'find_available_slots'
      && enriched.intent.fields.suggestedSlots?.length) {
      setDraft(enriched.intent);
      setPhase('ready');
      const message = [result.responseText, enriched.extraMessage ?? 'Huecos disponibles. Puedes elegir uno.'].filter(Boolean).join('\n');
      appendMessage('assistant', message);
      rememberIntent(enriched.intent, message);
      return;
    }

    if (!enriched.intent.needsClarification && !enriched.intent.requiresConfirmation) {
      rememberIntent(enriched.intent, null);
      await executeIntent(enriched.intent, false);
      return;
    }

    setDraft(enriched.intent);
    setPhase(phaseFromIntent(enriched.intent));
    const responseText = [result.responseText, enriched.extraMessage].filter(Boolean).join('\n');
    appendMessage('assistant', responseText);
    rememberIntent(enriched.intent, responseText);
  }, [
    appendMessage,
    draft,
    executeIntent,
    executeFastCommand,
    getContextSnapshot,
    pacientesQuery.data,
    profesionalesQuery.data,
    rememberIntent,
    resolveDraft,
    sessionMemory,
    tratamientosQuery.data,
  ]);

  const confirmDraft = useCallback(() => {
    if (!draft) return;
    if (draft.needsClarification || draft.operationalCanConfirm === false) {
      appendMessage('assistant', draft.clarificationQuestion ?? draft.operationalNextQuestion ?? 'No puedo confirmar todavia. Faltan datos del borrador.');
      return;
    }
    void executeIntent(draft, true);
  }, [appendMessage, draft, executeIntent]);

  const cancelDraft = useCallback(() => {
    const cancelled = cancelIntent(draft);
    setDraft(null);
    setPhase('cancelled');
    appendMessage('assistant', cancelled ? 'Borrador cancelado. No se ha guardado nada.' : 'No habia ningun borrador activo.');
    rememberIntent(null, null);
  }, [appendMessage, draft, rememberIntent]);

  const selectPatientOption = useCallback((option: AssistantPatientOption) => {
    if (!draft) return;
    void applyPatchToDraft({
      action: 'select_option',
      confidence: 1,
      updates: { patientId: option.id },
      spokenSummary: `Paciente actualizado: ${option.displayName}.`,
    }, 'Paciente actualizado.');
  }, [applyPatchToDraft, draft]);

  const selectProfessionalOption = useCallback((option: AssistantProfessionalOption) => {
    if (!draft) return;
    void applyPatchToDraft({
      action: 'select_option',
      confidence: 1,
      updates: { professionalId: option.id },
      spokenSummary: `Profesional actualizado: ${option.displayName}.`,
    }, 'Profesional actualizado.');
  }, [applyPatchToDraft, draft]);

  const selectTreatmentOption = useCallback((option: AssistantTreatmentOption) => {
    if (!draft) return;
    void applyPatchToDraft({
      action: 'select_option',
      confidence: 1,
      updates: { treatmentType: option.displayName },
      spokenSummary: `Tratamiento actualizado: ${option.displayName}.`,
    }, 'Tratamiento actualizado.');
  }, [applyPatchToDraft, draft]);

  const selectSlot = useCallback((slot: AssistantSlot) => {
    if (!draft) return;
    const selectedSlotIndex = draft.fields.suggestedSlots?.findIndex((candidate) => candidate === slot || (candidate.fechaHora && candidate.fechaHora === slot.fechaHora));
    void applyPatchToDraft({
      action: 'select_option',
      confidence: 1,
      updates: { selectedSlotIndex: selectedSlotIndex != null && selectedSlotIndex >= 0 ? selectedSlotIndex : null },
      spokenSummary: `Hueco seleccionado: ${slot.label ?? slot.fechaHora}.`,
    }, 'Hueco seleccionado.');
  }, [applyPatchToDraft, draft]);

  const editDraftField = useCallback((field: AssistantDraftEditableField, value: string) => {
    if (!draft) return;
    const trimmed = value.trim();
    const patch: DraftPatch = {
      action: trimmed ? 'update_fields' : 'clear_fields',
      confidence: 1,
      updates: {},
      clearFields: trimmed ? [] : [field],
      spokenSummary: 'Borrador actualizado.',
    };

    if (trimmed) {
      if (field === 'patient') patch.updates = { patientQuery: trimmed };
      if (field === 'professional') patch.updates = { professionalQuery: trimmed };
      if (field === 'treatment') patch.updates = { treatmentType: trimmed };
      if (field === 'date') {
        patch.updates = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
          ? { preferredDate: trimmed }
          : { dateRange: trimmed };
      }
      if (field === 'time') patch.updates = { preferredTime: trimmed };
      if (field === 'duration') {
        const durationMinutes = Number(trimmed);
        patch.updates = { durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : null };
      }
      if (field === 'notes') {
        patch.updates = draft.intent === 'create_clinical_note_draft' ? { noteText: trimmed } : { taskText: trimmed };
      }
    }

    void applyPatchToDraft(patch, 'Borrador actualizado.');
  }, [applyPatchToDraft, draft]);

  const updateBudgetLines = useCallback((lines: AssistantBudgetLine[], message = 'Presupuesto actualizado.') => {
    if (!draft) return;
    void applyPatchToDraft({
      action: 'update_fields',
      confidence: 1,
      updates: { budgetLines: lines },
      clearFields: [],
      spokenSummary: message,
    }, message);
  }, [applyPatchToDraft, draft]);

  const changeBudgetLine = useCallback((index: number, patch: Partial<AssistantBudgetLine>) => {
    const lines = [...(draft?.fields.budgetLines ?? [])];
    if (!lines[index]) return;
    lines[index] = { ...lines[index], ...patch };
    updateBudgetLines(lines);
  }, [draft, updateBudgetLines]);

  const addBudgetLine = useCallback(() => {
    const lines = [
      ...(draft?.fields.budgetLines ?? []),
      { treatmentQuery: '', tooth: null, quantity: 1, unitPrice: null, discount: 0, total: null },
    ];
    updateBudgetLines(lines, 'Anado una linea al presupuesto.');
  }, [draft, updateBudgetLines]);

  const removeBudgetLine = useCallback((index?: number) => {
    const lines = [...(draft?.fields.budgetLines ?? [])];
    if (!lines.length) return;
    const targetIndex = index ?? lines.length - 1;
    lines.splice(targetIndex, 1);
    updateBudgetLines(lines, 'Quito la linea del presupuesto.');
  }, [draft, updateBudgetLines]);

  const selectBudgetTreatmentOption = useCallback((index: number, option: AssistantTreatmentOption) => {
    const lines = [...(draft?.fields.budgetLines ?? [])];
    if (!lines[index]) return;
    lines[index] = {
      ...lines[index],
      treatmentId: option.id,
      treatmentName: option.displayName,
      treatmentQuery: option.displayName,
      treatmentOptions: [],
      unitPrice: option.unitPrice ?? lines[index].unitPrice ?? null,
    };
    updateBudgetLines(lines, `Tratamiento actualizado: ${option.displayName}.`);
  }, [draft, updateBudgetLines]);

  const findSlotsForDraft = useCallback(() => {
    if (!draft) return;
    void (async () => {
      const context = getContextSnapshot();
      const base = draft.fields.dateRange || draft.fields.preferredDate || draft.fields.datePreference
        ? draft
        : applyDraftPatch(draft, {
            action: 'update_fields',
            confidence: 1,
            updates: { dateRange: 'next_available' },
            spokenSummary: 'Busco los proximos huecos disponibles.',
          }, {
            context,
            patients: pacientesQuery.data ?? [],
            professionals: profesionalesQuery.data ?? [],
            treatments: tratamientosQuery.data ?? [],
            sessionMemory,
          });
      setPhase('interpreting');
      const enriched = await resolveDraft(base, context);
      setDraft(enriched.intent);
      setPhase(phaseFromIntent(enriched.intent));
      const message = enriched.extraMessage
        ?? (enriched.intent.fields.suggestedSlots?.length
          ? 'Huecos actualizados.'
          : 'No he encontrado huecos con esos datos. Puedes cambiar profesional, fecha u hora.');
      appendMessage('assistant', message);
      rememberIntent(enriched.intent, message);
    })();
  }, [
    appendMessage,
    draft,
    getContextSnapshot,
    pacientesQuery.data,
    profesionalesQuery.data,
    rememberIntent,
    resolveDraft,
    sessionMemory,
    tratamientosQuery.data,
  ]);

  const promptDraftChange = useCallback((value: string) => {
    setInput(value);
  }, []);

  const handleVoice = useCallback(async () => {
    setPhase('listening');
    const voice = await captureVoiceInput(input);
    setPhase('transcribing');
    setTranscript(voice.transcript);
    await processText(voice.transcript);
  }, [input, processText]);

  if (!user || user.rol === 'paciente') return null;

  const context = getContextSnapshot();
  const loadingData = pacientesQuery.isFetching || profesionalesQuery.isFetching || tratamientosQuery.isFetching;

  return (
    <div className="assistant-widget">
      {open && (
        <AssistantPanel
          phase={phase}
          context={context}
          messages={messages}
          transcript={transcript}
          draft={draft}
          input={input}
          llmHealth={llmHealthQuery.data ?? null}
          loadingData={loadingData}
          onInputChange={setInput}
          onSubmit={(value) => void processText(value)}
          onVoice={() => void handleVoice()}
          onConfirmDraft={confirmDraft}
          onCancelDraft={cancelDraft}
          onSelectPatientOption={selectPatientOption}
          onSelectProfessionalOption={selectProfessionalOption}
          onSelectTreatmentOption={selectTreatmentOption}
          onSelectSlot={selectSlot}
          onEditDraftField={editDraftField}
          onBudgetLineChange={changeBudgetLine}
          onAddBudgetLine={addBudgetLine}
          onRemoveBudgetLine={removeBudgetLine}
          onSelectBudgetTreatmentOption={selectBudgetTreatmentOption}
          onFindSlots={findSlotsForDraft}
          onDraftPrompt={promptDraftChange}
          onClose={() => setOpen(false)}
        />
      )}
      <button
        type="button"
        className={`assistant-fab ${open ? 'open' : ''}`}
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'}
        title={open ? 'Cerrar asistente' : 'Abrir asistente'}
        onClick={() => {
          setOpen((value) => !value);
          setPhase((value) => (value === 'completed' || value === 'cancelled' ? 'idle' : value));
        }}
      >
        {phase === 'listening' ? <Mic size={20} strokeWidth={2.2} /> : <Bot size={21} strokeWidth={2.1} />}
      </button>
    </div>
  );
}
