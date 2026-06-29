import type { UserRole } from '../../types/api';

export type AssistantIntentName =
  | 'open_patient_profile'
  | 'search_patient'
  | 'show_today_schedule'
  | 'show_schedule_by_date'
  | 'find_available_slots'
  | 'create_appointment'
  | 'move_appointment'
  | 'cancel_appointment'
  | 'create_task'
  | 'show_patient_pending_items'
  | 'create_budget_draft'
  | 'update_budget_draft'
  | 'register_payment_draft'
  | 'create_clinical_note_draft'
  | 'cancel_current_draft'
  | 'confirm_current_draft'
  | 'unknown';

export type AssistantPhase =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'interpreting'
  | 'draft'
  | 'needs_clarification'
  | 'awaiting_confirmation'
  | 'ready'
  | 'executing'
  | 'completed'
  | 'cancelled'
  | 'error';

export type AssistantRiskLevel = 'low' | 'medium' | 'high';
export type AssistantConfirmationLevel = 'none' | 'light' | 'standard' | 'strong' | 'clinical';
export type AssistantTimePreference = 'morning' | 'afternoon' | 'first_available' | 'last_available';
export type AssistantAppointmentAction = 'cancel' | 'no_show';

export type AssistantPermission =
  | 'read_patients'
  | 'open_patient_profile'
  | 'read_schedule'
  | 'create_appointments'
  | 'move_appointments'
  | 'cancel_appointments'
  | 'create_tasks'
  | 'read_patient_pending'
  | 'create_budget'
  | 'budget:create'
  | 'budget:confirm'
  | 'register_payment'
  | 'create_clinical_note';

export type AssistantFieldKey =
  | 'patientId'
  | 'patientQuery'
  | 'treatmentType'
  | 'professional'
  | 'professionalQuery'
  | 'timePreference'
  | 'dateRange'
  | 'preferredDate'
  | 'preferredTime'
  | 'slot'
  | 'appointmentId'
  | 'taskTitle'
  | 'taskText'
  | 'amount'
  | 'budgetLines'
  | 'durationMinutes'
  | 'noteText';

export type AssistantDraftEditableField =
  | 'patient'
  | 'treatment'
  | 'professional'
  | 'date'
  | 'time'
  | 'duration'
  | 'notes';

export interface AssistantPatientOption {
  id: string;
  displayName: string;
  historyNumber?: number | null;
  phone?: string | null;
}

export interface AssistantSlot {
  fechaHora?: string | null;
  label?: string | null;
  doctorId?: string | null;
  doctorName?: string | null;
  durationMinutes?: number | null;
}

export interface AssistantProfessionalOption {
  id: string;
  displayName: string;
  specialty?: string | null;
}

export interface AssistantTreatmentOption {
  id: string;
  displayName: string;
  code?: string | null;
  familyName?: string | null;
  defaultDurationMinutes?: number | null;
  unitPrice?: number | null;
  requiresTooth?: boolean | null;
}

export type AssistantResolutionStatus = 'resolved' | 'ambiguous' | 'missing' | 'not_found';

export interface AssistantPatientResolution {
  status: AssistantResolutionStatus;
  selected?: { id: string; displayName: string } | null;
  options?: AssistantPatientOption[];
  message?: string;
}

export interface AssistantProfessionalResolution {
  status: AssistantResolutionStatus;
  selected?: { id: string; displayName: string } | null;
  options?: AssistantProfessionalOption[];
  message?: string;
  flexible?: boolean;
}

export interface AssistantTreatmentResolution {
  status: AssistantResolutionStatus;
  selected?: { id: string; name: string; defaultDurationMinutes?: number | null } | null;
  options?: AssistantTreatmentOption[];
  message?: string;
}

export interface AssistantDateResolution {
  status: 'resolved' | 'missing' | 'ambiguous';
  dateRange?: string | null;
  preferredDate?: string | null;
  timePreference?: string | null;
  message?: string;
}

export interface AssistantSlotsResolution {
  status: 'ready' | 'missing_data' | 'no_slots' | 'found';
  slots?: AssistantSlot[];
  message?: string;
}

export type AssistantBudgetStatus = 'draft' | 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface AssistantBudgetLine {
  treatmentQuery?: string | null;
  treatmentId?: string | null;
  treatmentName?: string | null;
  treatmentOptions?: AssistantTreatmentOption[];
  description?: string | null;
  tooth?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  discount?: number | null;
  total?: number | null;
  resolutionStatus?: AssistantResolutionStatus;
  missingFields?: Array<'treatment' | 'tooth' | 'quantity' | 'price'>;
}

export interface AssistantBudgetResolution {
  status: 'ready' | 'missing_lines' | 'incomplete' | 'blocked';
  lines: AssistantBudgetLine[];
  total: number;
  message?: string;
}

export interface AssistantOperationalResolution {
  patientResolution?: AssistantPatientResolution;
  professionalResolution?: AssistantProfessionalResolution;
  treatmentResolution?: AssistantTreatmentResolution;
  dateResolution?: AssistantDateResolution;
  slotsResolution?: AssistantSlotsResolution;
  budgetResolution?: AssistantBudgetResolution;
}

export interface AssistantIntentFields {
  patientQuery?: string | null;
  patientId?: string | null;
  patientDisplayName?: string | null;
  patientOptions?: AssistantPatientOption[];
  treatmentType?: string | null;
  professional?: string | null;
  professionalId?: string | null;
  professionalQuery?: string | null;
  professionalOptions?: AssistantProfessionalOption[];
  treatmentId?: string | null;
  treatmentOptions?: AssistantTreatmentOption[];
  dateRange?: string | null;
  datePreference?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  timePreference?: AssistantTimePreference | null;
  durationMinutes?: number | null;
  slot?: AssistantSlot | null;
  suggestedSlots?: AssistantSlot[];
  selectedSlotIndex?: number | null;
  appointmentQuery?: string | null;
  appointmentId?: string | null;
  appointmentAction?: AssistantAppointmentAction | null;
  taskTitle?: string | null;
  taskText?: string | null;
  taskNotes?: string | null;
  amount?: number | null;
  paymentMethod?: string | null;
  budgetConcept?: string | null;
  budgetLines?: AssistantBudgetLine[] | null;
  budgetStatus?: AssistantBudgetStatus | null;
  budgetTotal?: number | null;
  noteText?: string | null;
}

export type DraftPatchAction =
  | 'update_fields'
  | 'clear_fields'
  | 'select_option'
  | 'confirm'
  | 'cancel'
  | 'start_new'
  | 'ask_clarification'
  | 'unknown';

export interface DraftPatch {
  action: DraftPatchAction;
  confidence: number;
  updates?: {
    patientQuery?: string | null;
    patientId?: string | null;
    professionalQuery?: string | null;
    professionalId?: string | null;
    treatmentType?: string | null;
    dateRange?: string | null;
    preferredDate?: string | null;
    preferredTime?: string | null;
    timePreference?: AssistantTimePreference | null;
    durationMinutes?: number | null;
    selectedSlotIndex?: number | null;
    taskText?: string | null;
    noteText?: string | null;
    amount?: number | null;
    budgetLines?: AssistantBudgetLine[] | null;
    budgetStatus?: AssistantBudgetStatus | null;
  };
  clearFields?: string[];
  clarificationQuestion?: string | null;
  spokenSummary: string;
}

export interface AssistantIntent {
  id: string;
  intent: AssistantIntentName;
  confidence: number;
  status: AssistantPhase;
  fields: AssistantIntentFields;
  missingFields: AssistantFieldKey[];
  needsClarification: boolean;
  clarificationQuestion?: string | null;
  requiresConfirmation: boolean;
  riskLevel: AssistantRiskLevel;
  summary: string;
  spokenSummary: string;
  originalText?: string;
  operationalResolution?: AssistantOperationalResolution;
  operationalNextQuestion?: string | null;
  operationalCanConfirm?: boolean;
  updatedAt: string;
}

export interface AssistantSessionMemory {
  lastDraft?: AssistantIntent | null;
  lastIntent?: AssistantIntentName | null;
  lastPatientId?: string | null;
  lastAppointmentId?: string | null;
  lastSlots?: AssistantSlot[];
  lastQuestion?: string | null;
}

export interface AssistantActionDefinition {
  intent: AssistantIntentName;
  label: string;
  description: string;
  permissions: AssistantPermission[];
  confirmation: AssistantConfirmationLevel;
  riskLevel: AssistantRiskLevel;
  mutatesData: boolean;
  requiredFields: AssistantFieldKey[];
}

export interface AssistantContextSnapshot {
  screen: string;
  path: string;
  currentPatientId: string | null;
  currentPatientDisplayName?: string | null;
  selectedAppointmentId?: string | null;
  visibleAgendaDate?: string | null;
  currentUserId: string | null;
  currentDoctorId?: string | null;
  currentUserRole: UserRole | null;
  permissions: AssistantPermission[];
  recentActions: string[];
}

export interface AssistantInterpreterInput {
  text: string;
  context: AssistantContextSnapshot;
  currentDraft: AssistantIntent | null;
  patients: AssistantPatientOption[];
  professionals: AssistantProfessionalOption[];
  treatments: AssistantTreatmentOption[];
  sessionMemory?: AssistantSessionMemory;
}

export type AssistantTurnResult =
  | { kind: 'intent'; intent: AssistantIntent; responseText: string; debug?: AssistantTurnDebug }
  | { kind: 'confirm'; intent: AssistantIntent; responseText: string; debug?: AssistantTurnDebug }
  | { kind: 'cancelled'; intent: AssistantIntent | null; responseText: string; debug?: AssistantTurnDebug };

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: string;
}

export interface AssistantActionResult {
  ok: boolean;
  message: string;
  details?: string[];
  navigateTo?: string;
  simulated?: boolean;
}

export type AssistantRouteDebugRoute = 'fast/local' | 'llm/ollama' | 'llm/openai' | 'mock' | 'llm';

export interface AssistantTurnDebug {
  route: AssistantRouteDebugRoute;
  providerUsed: string;
  modelUsed: string;
  responseMs?: number;
  intentFinal?: string;
}

export interface AssistantAuditEntry {
  userId: string | null;
  role: UserRole | null;
  timestamp: string;
  originalText?: string;
  interpretedIntent?: AssistantIntentName;
  status: AssistantPhase;
  actionLabel?: string;
  confirmed: boolean;
  result?: string;
  route?: AssistantRouteDebugRoute;
  responseMs?: number;
  actionExecuted?: string;
}
