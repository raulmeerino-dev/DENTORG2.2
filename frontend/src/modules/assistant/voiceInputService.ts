type SpeechRecognitionResultLike = {
  transcript: string;
  confidence: number;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export type AssistantTranscriptionResult = {
  transcript: string;
  confidence: number;
  provider: 'web-speech' | 'openai-stt' | 'mock';
};

export interface AssistantTranscriptionProvider {
  transcribe(fallbackText: string): Promise<AssistantTranscriptionResult>;
}

function getSpeechRecognition() {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export class WebSpeechTranscriptionProvider implements AssistantTranscriptionProvider {
  async transcribe(fallbackText: string): Promise<AssistantTranscriptionResult> {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      return {
        transcript: fallbackText.trim() || 'Abre la agenda de hoy',
        confidence: fallbackText.trim() ? 0.88 : 0.62,
        provider: 'mock',
      };
    }

    return new Promise<AssistantTranscriptionResult>((resolve) => {
      const recognition = new Recognition();
      let settled = false;
      recognition.lang = 'es-ES';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const result = event.results[0]?.[0];
        settled = true;
        recognition.stop();
        resolve({
          transcript: result?.transcript ?? fallbackText,
          confidence: result?.confidence ?? 0.7,
          provider: 'web-speech',
        });
      };
      recognition.onerror = () => {
        settled = true;
        resolve({ transcript: fallbackText, confidence: 0.45, provider: 'web-speech' });
      };
      recognition.onend = () => {
        if (!settled) resolve({ transcript: fallbackText, confidence: 0.45, provider: 'web-speech' });
      };
      recognition.start();
    });
  }
}

export class OpenAISpeechToTextProvider implements AssistantTranscriptionProvider {
  async transcribe(fallbackText: string): Promise<AssistantTranscriptionResult> {
    await Promise.resolve();
    return {
      transcript: fallbackText,
      confidence: fallbackText.trim() ? 0.5 : 0,
      provider: 'openai-stt',
    };
  }
}

const defaultProvider = new WebSpeechTranscriptionProvider();

export async function captureVoiceInput(fallbackText: string) {
  return defaultProvider.transcribe(fallbackText);
}
