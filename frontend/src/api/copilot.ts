import { api } from './client';
export interface CopilotContext {
  module: 'jornada' | 'agenda' | 'pacientes' | 'caja' | 'registros' | 'archivos' | 'administracion' | 'ajustes' | 'otro';
  patient_id?: string; appointment_id?: string; day?: string; section?: string;
}
export interface CopilotProposal {
  id: string; label: string;
  steps: { title: string; risk: 'medium' | 'high'; fields: { label: string; value: string }[] }[];
}
export interface CopilotResult {
  message: string; sources: { label: string; path: string }[];
  proposal?: CopilotProposal | null; navigation?: string | null; unavailable?: boolean; saved?: boolean;
}
export interface CopilotRequest { session_id: string; request_id: string; text: string; context: CopilotContext }
export async function askCopilot(request: CopilotRequest, signal?: AbortSignal) {
  return (await api.post<CopilotResult>('/assistant/turn', request, { signal, timeout: 100_000 })).data;
}
export async function confirmCopilot(sessionId: string, proposalId: string, decision: 'confirm' | 'cancel') {
  return (await api.post<CopilotResult>(`/assistant/sessions/${sessionId}/confirm`, { proposal_id: proposalId, decision }, { timeout: 30_000 })).data;
}
