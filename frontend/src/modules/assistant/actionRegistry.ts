import type { AssistantActionDefinition, AssistantFieldKey, AssistantIntent, AssistantIntentName } from './types';

export const ASSISTANT_ACTIONS: Record<AssistantIntentName, AssistantActionDefinition> = {
  open_patient_profile: {
    intent: 'open_patient_profile',
    label: 'Abrir ficha',
    description: 'Abre la ficha de un paciente cuando hay una coincidencia clara.',
    permissions: ['read_patients', 'open_patient_profile'],
    confirmation: 'none',
    riskLevel: 'low',
    mutatesData: false,
    requiredFields: ['patientId'],
  },
  search_patient: {
    intent: 'search_patient',
    label: 'Buscar paciente',
    description: 'Busca pacientes por nombre, telefono, historia o referencia permitida.',
    permissions: ['read_patients'],
    confirmation: 'none',
    riskLevel: 'low',
    mutatesData: false,
    requiredFields: ['patientQuery'],
  },
  show_today_schedule: {
    intent: 'show_today_schedule',
    label: 'Agenda de hoy',
    description: 'Abre la agenda del dia actual.',
    permissions: ['read_schedule'],
    confirmation: 'none',
    riskLevel: 'low',
    mutatesData: false,
    requiredFields: [],
  },
  show_schedule_by_date: {
    intent: 'show_schedule_by_date',
    label: 'Agenda por fecha',
    description: 'Abre la agenda en una fecha o rango solicitado.',
    permissions: ['read_schedule'],
    confirmation: 'none',
    riskLevel: 'low',
    mutatesData: false,
    requiredFields: ['dateRange'],
  },
  find_available_slots: {
    intent: 'find_available_slots',
    label: 'Buscar huecos',
    description: 'Busca huecos disponibles segun tratamiento, duracion, profesional y fecha.',
    permissions: ['read_schedule'],
    confirmation: 'none',
    riskLevel: 'low',
    mutatesData: false,
    requiredFields: ['treatmentType', 'dateRange'],
  },
  create_appointment: {
    intent: 'create_appointment',
    label: 'Preparar cita',
    description: 'Prepara una cita en borrador y exige confirmacion antes de actuar.',
    permissions: ['read_patients', 'read_schedule', 'create_appointments'],
    confirmation: 'standard',
    riskLevel: 'medium',
    mutatesData: true,
    requiredFields: ['patientId', 'treatmentType', 'dateRange', 'professional', 'slot'],
  },
  move_appointment: {
    intent: 'move_appointment',
    label: 'Mover cita',
    description: 'Prepara el cambio de una cita existente.',
    permissions: ['read_schedule', 'move_appointments'],
    confirmation: 'strong',
    riskLevel: 'medium',
    mutatesData: true,
    requiredFields: ['appointmentId', 'dateRange'],
  },
  cancel_appointment: {
    intent: 'cancel_appointment',
    label: 'Cancelar cita',
    description: 'Prepara la anulacion de una cita existente.',
    permissions: ['read_schedule', 'cancel_appointments'],
    confirmation: 'strong',
    riskLevel: 'high',
    mutatesData: true,
    requiredFields: ['appointmentId'],
  },
  create_task: {
    intent: 'create_task',
    label: 'Crear tarea',
    description: 'Prepara una tarea interna de seguimiento.',
    permissions: ['create_tasks'],
    confirmation: 'light',
    riskLevel: 'medium',
    mutatesData: true,
    requiredFields: ['taskTitle'],
  },
  show_patient_pending_items: {
    intent: 'show_patient_pending_items',
    label: 'Pendientes del paciente',
    description: 'Consulta pendientes operativos del paciente activo segun permisos.',
    permissions: ['read_patients', 'read_patient_pending'],
    confirmation: 'none',
    riskLevel: 'low',
    mutatesData: false,
    requiredFields: ['patientId'],
  },
  create_budget_draft: {
    intent: 'create_budget_draft',
    label: 'Preparar presupuesto',
    description: 'Prepara un presupuesto en borrador sin guardarlo directamente.',
    permissions: ['read_patients', 'budget:create'],
    confirmation: 'standard',
    riskLevel: 'high',
    mutatesData: true,
    requiredFields: ['patientId', 'budgetLines'],
  },
  update_budget_draft: {
    intent: 'update_budget_draft',
    label: 'Actualizar presupuesto',
    description: 'Actualiza un presupuesto en borrador sin guardarlo directamente.',
    permissions: ['read_patients', 'budget:create'],
    confirmation: 'standard',
    riskLevel: 'high',
    mutatesData: true,
    requiredFields: ['patientId', 'budgetLines'],
  },
  register_payment_draft: {
    intent: 'register_payment_draft',
    label: 'Preparar cobro',
    description: 'Prepara un registro de pago con confirmacion previa.',
    permissions: ['read_patients', 'register_payment'],
    confirmation: 'standard',
    riskLevel: 'high',
    mutatesData: true,
    requiredFields: ['patientId', 'amount'],
  },
  create_clinical_note_draft: {
    intent: 'create_clinical_note_draft',
    label: 'Preparar nota clinica',
    description: 'Prepara una nota clinica estructurada; nunca se guarda sin confirmacion clinica.',
    permissions: ['read_patients', 'create_clinical_note'],
    confirmation: 'clinical',
    riskLevel: 'high',
    mutatesData: true,
    requiredFields: ['patientId', 'noteText'],
  },
  cancel_current_draft: {
    intent: 'cancel_current_draft',
    label: 'Cancelar borrador',
    description: 'Descarta el borrador activo sin tocar datos.',
    permissions: [],
    confirmation: 'none',
    riskLevel: 'low',
    mutatesData: false,
    requiredFields: [],
  },
  confirm_current_draft: {
    intent: 'confirm_current_draft',
    label: 'Confirmar borrador',
    description: 'Confirma el borrador activo despues de validarlo.',
    permissions: [],
    confirmation: 'none',
    riskLevel: 'low',
    mutatesData: false,
    requiredFields: [],
  },
  unknown: {
    intent: 'unknown',
    label: 'No entendido',
    description: 'Intencion no reconocida con confianza suficiente.',
    permissions: [],
    confirmation: 'none',
    riskLevel: 'low',
    mutatesData: false,
    requiredFields: [],
  },
};

export function getActionDefinition(intent: AssistantIntentName) {
  return ASSISTANT_ACTIONS[intent];
}

export function hasField(intent: AssistantIntent, field: AssistantFieldKey) {
  const value = intent.fields[field as keyof typeof intent.fields];
  if (field === 'dateRange') {
    return Boolean(intent.fields.dateRange || intent.fields.datePreference || intent.fields.preferredDate || intent.fields.slot?.fechaHora);
  }
  if (field === 'professional') {
    return Boolean(intent.fields.professionalId || intent.fields.slot?.doctorId);
  }
  if (field === 'professionalQuery') {
    return Boolean(intent.fields.professionalQuery || intent.fields.professional || intent.fields.professionalId);
  }
  if (field === 'preferredDate') {
    return Boolean(intent.fields.preferredDate || intent.fields.dateRange || intent.fields.datePreference || intent.fields.slot?.fechaHora);
  }
  if (field === 'preferredTime') {
    return Boolean(intent.fields.preferredTime || intent.fields.slot?.fechaHora);
  }
  if (field === 'taskText') {
    return Boolean(intent.fields.taskText || intent.fields.taskTitle);
  }
  if (field === 'amount') {
    return typeof intent.fields.amount === 'number' && Number.isFinite(intent.fields.amount) && intent.fields.amount > 0;
  }
  if (field === 'budgetLines') {
    return Boolean(intent.fields.budgetLines?.length);
  }
  if (field === 'durationMinutes') {
    return typeof intent.fields.durationMinutes === 'number' && Number.isFinite(intent.fields.durationMinutes) && intent.fields.durationMinutes > 0;
  }
  return value !== undefined && value !== null && value !== '';
}

export function getMissingFields(intent: AssistantIntent) {
  return getActionDefinition(intent.intent).requiredFields.filter((field) => !hasField(intent, field));
}
