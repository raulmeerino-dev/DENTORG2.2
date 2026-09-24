import { getActionDefinition } from './actionRegistry';
import type { AssistantAuditEntry, AssistantContextSnapshot, AssistantIntent } from './types';

export function auditAssistantEvent(
  context: AssistantContextSnapshot,
  intent: AssistantIntent | null,
  entry: Omit<AssistantAuditEntry, 'userId' | 'role' | 'timestamp' | 'interpretedIntent' | 'actionLabel'>,
) {
  const action = intent ? getActionDefinition(intent.intent) : null;
  const payload: AssistantAuditEntry = {
    userId: context.currentUserId,
    role: context.currentUserRole,
    timestamp: new Date().toISOString(),
    interpretedIntent: intent?.intent,
    actionLabel: action?.label,
    ...entry,
  };

  console.info('[DentCore Voice Assistant audit]', payload);
  window.dispatchEvent(new CustomEvent('dentcore:assistant-audit', { detail: payload }));
}
