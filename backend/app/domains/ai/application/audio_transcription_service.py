from __future__ import annotations

from dataclasses import dataclass

import httpx

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

        text = payload.get("text") or payload.get("transcription") or payload.get("transcripcion")
        if not isinstance(text, str) or not text.strip():
            raise TranscriptionServiceError("El proveedor no devolvio una transcripcion valida")

        provider_name = str(payload.get("provider") or "external_http")
        return TranscriptionResult(text=text.strip(), provider=provider_name)


def build_transcription_provider(settings: Settings) -> ExternalHttpTranscriptionProvider:
    provider = settings.clinical_dictation_provider.strip().lower()
    if not provider:
        raise TranscriptionServiceNotConfigured("Servicio de transcripcion no configurado")
    if provider == "external_http":
        return ExternalHttpTranscriptionProvider(settings)
    raise TranscriptionServiceNotConfigured("Servicio de transcripcion no configurado")


async def transcribe_clinical_audio(audio: AudioPayload, settings: Settings) -> TranscriptionResult:
    provider = build_transcription_provider(settings)
    return await provider.transcribe(audio)
