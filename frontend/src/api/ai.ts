import { api } from './client';
import type {
  DictadoGuardarNotaInput,
  DictadoNotaGuardadaResponse,
  DictadoTranscripcionResponse,
} from './types';

export async function getAssistantLLMHealth() {
  const { data } = await api.get<{
    mode: string;
    activeProvider: 'ollama' | 'openai' | 'mock' | 'none';
    ollama: {
      available: boolean;
      model: string;
      message: string;
    };
    openai: {
      available: boolean;
      model: string;
      message: string;
    };
  }>('/assistant/llm-health');
  return data;
}

export async function transcribeClinicalDictation(
  pacienteId: string,
  audio: Blob,
  options: { durationSeconds?: number | null; contexto?: 'ficha' | 'sesion' | 'historial' } = {},
) {
  const form = new FormData();
  const extension = audio.type.includes('wav') ? 'wav' : audio.type.includes('mpeg') || audio.type.includes('mp3') ? 'mp3' : audio.type.includes('mp4') || audio.type.includes('m4a') ? 'm4a' : 'webm';
  form.append('audio', audio, `dictado-clinico.${extension}`);
  if (options.durationSeconds != null) form.append('duracion_segundos', String(Math.round(options.durationSeconds)));
  form.append('contexto', options.contexto ?? 'ficha');
  const { data } = await api.post<DictadoTranscripcionResponse>(
    `/dictado/pacientes/${pacienteId}/transcribir`,
    form,
    { timeout: 180_000 },
  );
  return data;
}

export async function editClinicalDictationNote(pacienteId: string, notaId: string, texto: string, previousText: string) {
  return (await api.patch<DictadoNotaGuardadaResponse>(`/dictado/pacientes/${pacienteId}/notas/${notaId}`, {
    texto, texto_anterior: previousText,
  })).data;
}

export async function saveClinicalDictationNote(pacienteId: string, payload: DictadoGuardarNotaInput) {
  const { data } = await api.post<DictadoNotaGuardadaResponse>(
    `/dictado/pacientes/${pacienteId}/guardar-nota`,
    payload,
  );
  return data;
}
