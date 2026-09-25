from types import SimpleNamespace

import pytest

from app.config import Settings
from app.domains.ai.application import audio_transcription_service as service


@pytest.mark.asyncio
async def test_local_transcriber_uses_spanish_vad_without_clinical_invention(monkeypatch):
    calls = []

    def transcribe(audio, **kwargs):
        calls.append(kwargs)
        assert audio.read() == b"recording"
        return iter([SimpleNamespace(text=" Nota dictada."), SimpleNamespace(text=" Pieza 24.")]), SimpleNamespace(duration=10)

    monkeypatch.setattr(service, "_local_model", lambda *_: SimpleNamespace(transcribe=transcribe))
    result = await service.transcribe_clinical_audio(service.AudioPayload(b"recording", "note.wav", "audio/wav"), Settings(clinical_dictation_provider="local_whisper"))
    assert result.text == "Nota dictada. Pieza 24."
    assert result.provider == "local_whisper"
    assert calls[0]["language"] == "es" and calls[0]["vad_filter"] is True
    assert calls[0]["condition_on_previous_text"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize("duration,segments,message", [(181.5, ["Long audio"], "máximo"), (1, [], "voz")])
async def test_local_audio_limits_and_silence(monkeypatch, duration, segments, message):
    model = SimpleNamespace(transcribe=lambda *_args, **_kwargs: (iter(SimpleNamespace(text=text) for text in segments), SimpleNamespace(duration=duration)))
    monkeypatch.setattr(service, "_local_model", lambda *_: model)
    with pytest.raises(service.TranscriptionServiceError, match=message):
        await service.transcribe_clinical_audio(service.AudioPayload(b"audio", "note.wav", "audio/wav"), Settings(clinical_dictation_provider="local_whisper"))


@pytest.mark.asyncio
async def test_busy_local_model_does_not_queue_unbounded_work():
    service._local_lock.acquire()
    try:
        with pytest.raises(service.TranscriptionServiceError, match="otro audio"):
            await service.transcribe_clinical_audio(service.AudioPayload(b"audio", "note.wav", "audio/wav"), Settings(clinical_dictation_provider="local_whisper"))
    finally:
        service._local_lock.release()
