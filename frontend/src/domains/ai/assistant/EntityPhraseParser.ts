import { cleanEntityText, normalizeAssistantText } from './textUtils';

export type StructuredEntityPhrase = {
  patientQuery?: string | null;
  treatmentType?: string | null;
  professionalQuery?: string | null;
};

function value(match: RegExpMatchArray | null, index: number) {
  const text = cleanEntityText(match?.[index] ?? '');
  return text || null;
}

export function extractStructuredEntityPhrase(text: string): StructuredEntityPhrase {
  const normalized = normalizeAssistantText(text);

  const appointment = normalized.match(
    /\b(?:dale\s+)?cita\s+a\s+(.+?)\s+para\s+(.+?)\s+con\s+(.+?)(?:\s+(?:dime|mira|busca|que\s+opciones|que\s+huecos|que\s+disponibilidad|el|la|los|las|hoy|manana|pasado|lunes|martes|miercoles|jueves|viernes|sabado|domingo|por\s+la|a\s+las|semana|dentro|final)\b|$)/,
  );
  if (appointment) {
    return {
      patientQuery: value(appointment, 1),
      treatmentType: value(appointment, 2),
      professionalQuery: value(appointment, 3),
    };
  }

  const availabilityTreatmentFirst = normalized.match(
    /\b(?:busca|mira|quiero|dime)?\s*(?:opciones|huecos|disponibilidad)?\s*para\s+(.+?)\s+con\s+(.+?)\s+para\s+(.+?)(?:\s+(?:dime|mira|busca|que\s+opciones|que\s+huecos|que\s+disponibilidad|el|la|los|las|hoy|manana|pasado|lunes|martes|miercoles|jueves|viernes|sabado|domingo|por\s+la|a\s+las|semana|dentro|final)\b|$)/,
  );
  if (availabilityTreatmentFirst) {
    return {
      treatmentType: value(availabilityTreatmentFirst, 1),
      professionalQuery: value(availabilityTreatmentFirst, 2),
      patientQuery: value(availabilityTreatmentFirst, 3),
    };
  }

  return {};
}
