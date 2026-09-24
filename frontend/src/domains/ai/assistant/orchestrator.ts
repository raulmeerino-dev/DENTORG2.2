import { cancelIntent, finalizeIntent } from './draftStore';
import { isCancelDraftCommand, isConfirmCommand, interpretMockAssistantInput } from './mockInterpreter';
import type { AssistantInterpreterInput, AssistantTurnResult } from './types';

export function interpretAssistantTurn(input: AssistantInterpreterInput): AssistantTurnResult {
  if (input.currentDraft) {
    return {
      kind: 'intent',
      intent: input.currentDraft,
      responseText: 'No he podido interpretar la modificacion con seguridad. El borrador sigue igual; puedes editar un campo manualmente.',
    };
  }

  if (isCancelDraftCommand(input.text)) {
    return {
      kind: 'cancelled',
      intent: cancelIntent(input.currentDraft),
      responseText: input.currentDraft ? 'Borrador cancelado. No se ha guardado nada.' : 'No habia ningun borrador activo.',
    };
  }

  if (isConfirmCommand(input.text) && input.currentDraft) {
    const intent = finalizeIntent(input.currentDraft);
    if (intent.needsClarification) {
      return {
        kind: 'intent',
        intent,
        responseText: intent.clarificationQuestion ?? 'Antes de confirmar necesito completar el borrador.',
      };
    }
    return {
      kind: 'confirm',
      intent,
      responseText: 'Confirmacion recibida. Valido permisos y preparo la ejecucion.',
    };
  }

  const intent = interpretMockAssistantInput(input);
  return {
    kind: 'intent',
    intent,
    responseText: intent.clarificationQuestion ?? intent.summary,
  };
}
