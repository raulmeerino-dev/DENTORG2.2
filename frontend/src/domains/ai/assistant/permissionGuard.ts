import type { AssistantActionDefinition, AssistantContextSnapshot, AssistantPermission } from './types';

export function canRunAssistantAction(context: AssistantContextSnapshot, action: AssistantActionDefinition) {
  const missingPermissions = action.permissions.filter((permission) => !context.permissions.includes(permission));
  return {
    allowed: missingPermissions.length === 0,
    missingPermissions,
  };
}

export function permissionLabel(permission: AssistantPermission) {
  const labels: Record<AssistantPermission, string> = {
    read_patients: 'leer pacientes',
    open_patient_profile: 'abrir fichas',
    read_schedule: 'leer agenda',
    create_appointments: 'crear citas',
    move_appointments: 'mover citas',
    cancel_appointments: 'cancelar citas',
    create_tasks: 'crear tareas',
    read_patient_pending: 'ver pendientes',
    create_budget: 'crear presupuestos',
    'budget:create': 'crear presupuestos',
    'budget:confirm': 'confirmar presupuestos',
    register_payment: 'registrar cobros',
    create_clinical_note: 'crear notas clinicas',
  };
  return labels[permission];
}
