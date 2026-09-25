from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from threading import Lock

import httpx
from starlette.concurrency import run_in_threadpool

from app.config import Settings


class TranscriptionServiceNotConfigured(Exception):
    pass


class TranscriptionServiceError(Exception):
    pass


@dataclass(frozen=True)
class AudioPayload:
    content: bytes
    filename: str
    content_type: str
    duration_seconds: int | None = None


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    provider: str


class ExternalHttpTranscriptionProvider:
    def __init__(self, settings: Settings):
        self.endpoint = settings.clinical_dictation_endpoint.strip()
        self.api_key = settings.clinical_dictation_api_key.strip()
        self.timeout = settings.clinical_dictation_timeout_seconds

    async def transcribe(self, audio: AudioPayload) -> TranscriptionResult:
        if not self.endpoint:
            raise TranscriptionServiceNotConfigured("Servicio de transcripcion no configurado")

        headers: dict[str, str] = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        files = {
            "file": (audio.filename, audio.content, audio.content_type),
        }
        form_data: dict[str, str] = {"language": "es"}
        if audio.duration_seconds is not None:
            form_data["duration_seconds"] = str(audio.duration_seconds)

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(self.endpoint, headers=headers, files=files, data=form_data)
            response.raise_for_status()
            payload = response.json()
        except httpx.TimeoutException as exc:
            raise TranscriptionServiceError("Tiempo de espera agotado al transcribir el audio") from exc
        except httpx.HTTPStatusError as exc:
            raise TranscriptionServiceError(f"Error del proveedor de transcripcion ({exc.response.status_code})") from exc
        except httpx.HTTPError as exc:
            raise TranscriptionServiceError("No se pudo conectar con el proveedor de transcripcion") from exc
        except ValueError as exc:
            raise TranscriptionServiceError("Respuesta invalida del proveedor de transcripcion") from exc

        if not isinstance(payload, dict):
            raise TranscriptionServiceError("Respuesta invalida del proveedor de transcripcion")
        text = payload.get("text") or payload.get("transcription") or payload.get("transcripcion")
        if not isinstance(text, str) or not text.strip():
            raise TranscriptionServiceError("El proveedor no devolvio una transcripcion valida")

        provider_name = str(payload.get("provider") or "external_http")
        return TranscriptionResult(text=text.strip(), provider=provider_name)


_local_lock = Lock()


@lru_cache(maxsize=1)
def _local_model(model: str, threads: int):
    try:
        from faster_whisper import WhisperModel
        # Models are provisioned explicitly; a clinical request never downloads software.
        return WhisperModel(model, device="cpu", compute_type="int8", cpu_threads=threads,
                            num_workers=1, local_files_only=True)
    except (ImportError, OSError, ValueError, RuntimeError) as exc:
        raise TranscriptionServiceNotConfigured(
            "El transcriptor local no está preparado. Instala el modelo de dictado en el servidor."
        ) from exc


class LocalWhisperTranscriptionProvider:
    def __init__(self, settings: Settings):
        self.model = settings.clinical_dictation_local_model
        self.threads = max(1, min(8, settings.clinical_dictation_local_threads))
        self.max_duration = settings.clinical_dictation_max_duration_seconds

    def _transcribe(self, audio: AudioPayload) -> TranscriptionResult:
        if not _local_lock.acquire(blocking=False):
            raise TranscriptionServiceError("Hay otro audio transcribiéndose. Reintenta en unos segundos.")
        try:
            model = _local_model(self.model, self.threads)
            segments, info = model.transcribe(BytesIO(audio.content), language="es", beam_size=5,
                                              vad_filter=True, condition_on_previous_text=False,
                                              temperature=0)
            if info.duration > self.max_duration + 1:
                raise TranscriptionServiceError(f"El audio supera el máximo de {self.max_duration} segundos.")
            text = " ".join(segment.text.strip() for segment in segments).strip()
            if not text:
                raise TranscriptionServiceError("No se ha detectado voz. Revisa el audio y vuelve a intentarlo.")
            if len(text) > 10000:
                raise TranscriptionServiceError("La transcripción es demasiado larga. Divide la grabación.")
            return TranscriptionResult(text=text, provider="local_whisper")
        except (TranscriptionServiceError, TranscriptionServiceNotConfigured):
            raise
        except Exception as exc:
            raise TranscriptionServiceError("No se pudo leer o transcribir el audio. Revisa la grabación.") from exc
        finally:
            _local_lock.release()

    async def transcribe(self, audio: AudioPayload) -> TranscriptionResult:
        return await run_in_threadpool(self._transcribe, audio)


def build_transcription_provider(settings: Settings) -> ExternalHttpTranscriptionProvider | LocalWhisperTranscriptionProvider:
    provider = settings.clinical_dictation_provider.strip().lower()
    if not provider:
        raise TranscriptionServiceNotConfigured("Servicio de transcripcion no configurado")
    if provider == "external_http":
        return ExternalHttpTranscriptionProvider(settings)
    if provider == "local_whisper":
        return LocalWhisperTranscriptionProvider(settings)
    raise TranscriptionServiceNotConfigured("Servicio de transcripcion no configurado")


async def transcribe_clinical_audio(audio: AudioPayload, settings: Settings) -> TranscriptionResult:
    provider = build_transcription_provider(settings)
    return await provider.transcribe(audio)
