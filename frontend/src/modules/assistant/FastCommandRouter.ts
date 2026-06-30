import { createIntent } from './draftStore';
import type { AssistantContextSnapshot, AssistantIntent } from './types';

export const FAST_COMMAND_CONFIDENCE_THRESHOLD = 0.85;

export type AssistantRouteDebugRoute = 'fast/local' | 'llm/ollama' | 'llm/openai' | 'mock' | 'llm';

export interface AssistantRouteDebug {
  route: AssistantRouteDebugRoute;
  responseMs: number;
  actionExecuted: string;
  confidence?: number;
  normalizedText?: string;
  matchedVerb?: string | null;
  matchedDestination?: string | null;
  providerUsed?: string;
  modelUsed?: string;
  intentFinal?: string;
}

export type PatientFastAction = 'new' | 'budgets' | 'documents' | 'upload_document';

export type FastCommandAction =
  | {
      type: 'navigate';
      label: string;
      targetPath: string;
      sensitive: false;
    }
  | {
      type: 'open_patient_draft';
      label: string;
      targetPath: '/pacientes';
      patientAction: Extract<PatientFastAction, 'new'>;
      sensitive: true;
    }
  | {
      type: 'open_patient_budgets';
      label: string;
      targetPath: '/pacientes';
      patientAction: Extract<PatientFastAction, 'budgets'>;
      sensitive: false;
    }
  | {
      type: 'open_patient_documents';
      label: string;
      targetPath: '/pacientes';
      patientAction: Extract<PatientFastAction, 'documents'>;
      sensitive: false;
    }
  | {
      type: 'open_appointment_draft';
      label: string;
      intent: AssistantIntent;
      sensitive: true;
    }
  | {
      type: 'open_budget_draft';
      label: string;
      intent: AssistantIntent;
      sensitive: true;
    }
  | {
      type: 'confirm_current_draft';
      label: string;
      sensitive: true;
    }
  | {
      type: 'cancel_current_draft';
      label: string;
      sensitive: false;
    }
  | {
      type: 'show_help';
      label: string;
      sensitive: false;
    };

export interface FastCommandMatch {
  route: 'fast/local';
  confidence: number;
  responseText: string;
  action: FastCommandAction;
  normalizedText: string;
  matchedVerb: string | null;
  matchedDestination: string | null;
}

const STOP_WORDS = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'me', 'mi', 'lo', 'porfa', 'por', 'favor', 'a', 'al', 'de', 'del', 'en']);
const NAVIGATION_VERBS = new Set(['abre', 'abreme', 'abrir', 'entra', 'entrar', 'mira', 'mirame', 've', 'ver', 'ensename', 'muestra', 'muestrame', 'ir', 'vete', 'vamos', 'llevame']);
const NAVIGATION_FILLERS = new Set(['quiero', 'quisiera', 'necesito', 'puedes', 'podrias', 'ahora', 'hoy', 'manana', 'semana', 'mes', 'dia', 'pantalla', 'seccion', 'modulo', 'vista', 'principal']);
const HELP_RESPONSE = 'Puedo abrir agenda, pacientes, caja, documentos, presupuestos y configuracion; crear borradores de cita, paciente o presupuesto; buscar pacientes, proponer huecos y ayudarte a confirmar o cancelar borradores. Las acciones clinicas o economicas se preparan en borrador antes de guardar.';
const DESTINATION_ALIASES = {
  calendar: ['agenda', 'calendario', 'citas'],
  patients: ['pacientes', 'paciente', 'fichas'],
  budgets: ['presupuestos', 'presupuesto', 'presus'],
  payments: ['caja', 'pagos', 'cobros'],
  documents: ['documentos', 'archivos'],
  settings: ['configuracion', 'ajustes'],
} as const;

type DestinationKey = keyof typeof DESTINATION_ALIASES;

const DESTINATION_TARGETS: Record<DestinationKey, string> = {
  calendar: '/agenda',
  patients: '/pacientes',
  budgets: '/pacientes',
  payments: '/caja',
  documents: '/pacientes',
  settings: '/admin-extras?tab=general',
};

const DESTINATION_LABELS: Record<DestinationKey, string> = {
  calendar: 'Agenda abierta.',
  patients: 'Pantalla de pacientes abierta.',
  budgets: 'Presupuestos del paciente abiertos.',
  payments: 'Caja abierta.',
  documents: 'Documentos del paciente abiertos.',
  settings: 'Configuracion abierta.',
};

function normalizeRawText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeText(value?: string | null) {
  return normalizeRawText(value)
    .split(' ')
    .filter((token) => token && !STOP_WORDS.has(token))
    .join(' ');
}

function normalizedTokens(value: string) {
  return normalizeText(value)
    .split(' ')
    .filter(Boolean);
}

function currentPatientFields(context: AssistantContextSnapshot) {
  if (!context.currentPatientId) return {};
  return {
    patientId: context.currentPatientId,
    patientDisplayName: context.currentPatientDisplayName ?? 'Paciente actual',
    patientQuery: context.currentPatientDisplayName ?? 'paciente actual',
  };
}

function navigateMatch(
  targetPath: string,
  label: string,
  responseText: string,
  debug: Pick<FastCommandMatch, 'normalizedText' | 'matchedVerb' | 'matchedDestination'>,
  confidence = 0.96,
): FastCommandMatch {
  return {
    route: 'fast/local',
    confidence,
    responseText,
    action: {
      type: 'navigate',
      label,
      targetPath,
      sensitive: false,
    },
    ...debug,
  };
}

function patientActionMatch(
  type: 'open_patient_draft',
  patientAction: 'new',
  label: string,
  responseText: string,
  debug: Pick<FastCommandMatch, 'normalizedText' | 'matchedVerb' | 'matchedDestination'>,
  confidence?: number,
): FastCommandMatch;
function patientActionMatch(
  type: 'open_patient_budgets',
  patientAction: 'budgets',
  label: string,
  responseText: string,
  debug: Pick<FastCommandMatch, 'normalizedText' | 'matchedVerb' | 'matchedDestination'>,
  confidence?: number,
): FastCommandMatch;
function patientActionMatch(
  type: 'open_patient_documents',
  patientAction: 'documents',
  label: string,
  responseText: string,
  debug: Pick<FastCommandMatch, 'normalizedText' | 'matchedVerb' | 'matchedDestination'>,
  confidence?: number,
): FastCommandMatch;
function patientActionMatch(
  type: 'open_patient_draft' | 'open_patient_budgets' | 'open_patient_documents',
  _patientAction: 'new' | 'budgets' | 'documents',
  label: string,
  responseText: string,
  debug: Pick<FastCommandMatch, 'normalizedText' | 'matchedVerb' | 'matchedDestination'>,
  confidence = 0.96,
): FastCommandMatch {
  let action: FastCommandAction;
  if (type === 'open_patient_draft') {
    action = { type, label, targetPath: '/pacientes', patientAction: 'new', sensitive: true };
  } else if (type === 'open_patient_budgets') {
    action = { type, label, targetPath: '/pacientes', patientAction: 'budgets', sensitive: false };
  } else {
    action = { type, label, targetPath: '/pacientes', patientAction: 'documents', sensitive: false };
  }

  return {
    route: 'fast/local',
    confidence,
    responseText,
    action,
    ...debug,
  };
}

function appointmentDraftMatch(
  text: string,
  context: AssistantContextSnapshot,
  debug: Pick<FastCommandMatch, 'normalizedText' | 'matchedVerb' | 'matchedDestination'>,
): FastCommandMatch {
  return {
    route: 'fast/local',
    confidence: 0.96,
    responseText: 'Cita abierta en borrador. No he guardado nada.',
    action: {
      type: 'open_appointment_draft',
      label: 'Abrir borrador de cita',
      intent: createIntent('create_appointment', currentPatientFields(context), 0.96, text),
      sensitive: true,
    },
    ...debug,
  };
}

function budgetDraftMatch(
  text: string,
  context: AssistantContextSnapshot,
  debug: Pick<FastCommandMatch, 'normalizedText' | 'matchedVerb' | 'matchedDestination'>,
): FastCommandMatch {
  return {
    route: 'fast/local',
    confidence: 0.96,
    responseText: 'Presupuesto abierto en borrador. No he guardado nada.',
    action: {
      type: 'open_budget_draft',
      label: 'Abrir borrador de presupuesto',
      intent: createIntent('create_budget_draft', {
        ...currentPatientFields(context),
        budgetLines: [],
        budgetStatus: 'draft',
      }, 0.96, text),
      sensitive: true,
    },
    ...debug,
  };
}

function currentDraftActionMatch(
  type: 'confirm_current_draft' | 'cancel_current_draft',
  responseText: string,
  debug: Pick<FastCommandMatch, 'normalizedText' | 'matchedVerb' | 'matchedDestination'>,
): FastCommandMatch {
  const action: FastCommandAction = type === 'confirm_current_draft'
    ? {
        type: 'confirm_current_draft',
        label: 'Confirmar borrador actual',
        sensitive: true,
      }
    : {
        type: 'cancel_current_draft',
        label: 'Cancelar borrador actual',
        sensitive: false,
      };

  return {
    route: 'fast/local',
    confidence: 0.97,
    responseText,
    action,
    ...debug,
  };
}

function helpMatch(
  debug: Pick<FastCommandMatch, 'normalizedText' | 'matchedVerb' | 'matchedDestination'>,
): FastCommandMatch {
  return {
    route: 'fast/local',
    confidence: 0.96,
    responseText: HELP_RESPONSE,
    action: {
      type: 'show_help',
      label: 'Mostrar ayuda del asistente',
      sensitive: false,
    },
    ...debug,
  };
}

function findNavigationVerb(tokens: string[]) {
  return tokens.find((token) => NAVIGATION_VERBS.has(token)) ?? null;
}

function findDestination(tokens: string[]): DestinationKey | null {
  const matches = (Object.entries(DESTINATION_ALIASES) as Array<[DestinationKey, readonly string[]]>)
    .filter(([, aliases]) => aliases.some((alias) => tokens.includes(alias)))
    .map(([destination]) => destination);
  return matches.length === 1 ? matches[0] : null;
}

function isDestinationAlias(token: string, destination: DestinationKey) {
  return (DESTINATION_ALIASES[destination] as readonly string[]).includes(token);
}

function semanticNavigationMatch(
  text: string,
  debug: Pick<FastCommandMatch, 'normalizedText' | 'matchedVerb' | 'matchedDestination'>,
): FastCommandMatch | null {
  const tokens = normalizedTokens(text);
  const matchedVerb = findNavigationVerb(tokens);
  const matchedDestination = findDestination(tokens);
  if (!matchedDestination) return null;
  const hasUnexpectedTokens = tokens.some((token) => (
    token !== matchedVerb
    && !isDestinationAlias(token, matchedDestination)
    && !NAVIGATION_FILLERS.has(token)
  ));
  if (hasUnexpectedTokens) return null;
  const confidence = matchedVerb ? 0.92 : 0.75;
  const nextDebug = {
    ...debug,
    matchedVerb,
    matchedDestination,
  };

  if (matchedDestination === 'budgets') {
    return patientActionMatch('open_patient_budgets', 'budgets', 'Abrir presupuestos', DESTINATION_LABELS.budgets, nextDebug, confidence);
  }
  if (matchedDestination === 'documents') {
    return patientActionMatch('open_patient_documents', 'documents', 'Abrir documentos', DESTINATION_LABELS.documents, nextDebug, confidence);
  }
  return navigateMatch(
    DESTINATION_TARGETS[matchedDestination],
    `Abrir ${matchedDestination}`,
    DESTINATION_LABELS[matchedDestination],
    nextDebug,
    confidence,
  );
}

function isLocalDraftConfirm(normalized: string) {
  return /^(si|s|ok|vale|perfecto|adelante|confirmo|confirmar|confirma|acepto|aceptar|acepta|guardar|guarda|guardalo|ejecuta|ejecutar|hazlo)(\s+(esto|eso|borrador|accion|orden|cita|presupuesto))?$/.test(normalized)
    || /^si\s+(confirma|confirmar|guarda|guardalo|ejecuta|hazlo)$/.test(normalized);
}

function isLocalDraftCancel(normalized: string) {
  return /^(cancela|cancelar|descarta|descartar|olvida|olvidalo|anula|anular)(\s+(esto|eso|borrador|accion|orden|cita|presupuesto))?$/.test(normalized)
    || /^(no\s+guardar|no\s+guardes|no\s+lo\s+guardes)$/.test(normalized);
}

function isLocalHelpRequest(normalized: string) {
  return /^(ayuda|ayudame|comandos|opciones)$/.test(normalized)
    || /^(que|q)\s+(puedes|sabes)\s+hacer$/.test(normalized)
    || /^como\s+(me\s+)?ayudas?$/.test(normalized);
}

export function routeFastCommand({
  text,
  context,
  currentDraft,
}: {
  text: string;
  context: AssistantContextSnapshot;
  currentDraft: AssistantIntent | null;
}): FastCommandMatch | null {
  const normalized = normalizeText(text);
  const tokens = normalizedTokens(text);
  const baseDebug = {
    normalizedText: tokens.join(' '),
    matchedVerb: null,
    matchedDestination: null,
  };
  if (!normalized) return null;

  const navigation = semanticNavigationMatch(text, baseDebug);
  if (navigation) return navigation;

  if (isLocalHelpRequest(normalized)) {
    return helpMatch(baseDebug);
  }

  if (currentDraft && isLocalDraftCancel(normalized)) {
    return currentDraftActionMatch('cancel_current_draft', 'Borrador cancelado. No he guardado nada.', baseDebug);
  }

  if (currentDraft && isLocalDraftConfirm(normalized)) {
    return currentDraftActionMatch('confirm_current_draft', 'Confirmacion recibida. Valido el borrador antes de ejecutar.', baseDebug);
  }

  if (/^(nuevo|nueva|crear|alta|dar alta)\s+paciente$/.test(normalized)) {
    return patientActionMatch('open_patient_draft', 'new', 'Abrir borrador de paciente', 'Ficha de paciente abierta en borrador.', baseDebug);
  }

  if (!currentDraft && /^(nueva|nuevo|crear|preparar|abrir)\s+cita$/.test(normalized)) {
    return appointmentDraftMatch(text, context, baseDebug);
  }

  if (!currentDraft && /^(nuevo|nueva|crear|preparar|abrir)\s+presupuesto$/.test(normalized)) {
    return budgetDraftMatch(text, context, baseDebug);
  }

  return null;
}

export function roundResponseMs(startedAt: number) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return Math.round((now - startedAt) * 10) / 10;
}

export function logAssistantRouteDebug(debug: AssistantRouteDebug) {
  console.info('[DentCore Voice Assistant debug]', debug);
  window.dispatchEvent(new CustomEvent('dentcore:assistant-debug', { detail: debug }));
}
