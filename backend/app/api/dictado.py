from __future__ import annotations

from datetime import date as date_type
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.permissions import ROLE_ADMIN, ROLE_DOCTOR, CurrentUser, ensure_clinic_access
from app.database import get_db
from app.models.cita import Cita
from app.models.dictado import DictadoClinico
from app.models.historial import HistorialClinico, NotaDental
from app.models.paciente import Paciente
from app.models.usuario import Usuario
from app.schemas.dictado import (
    DictadoGuardarNotaRequest,
    DictadoNotaGuardadaResponse,
    DictadoTranscripcionResponse,
)
from app.services.audio_transcription_service import (
    AudioPayload,
    TranscriptionServiceError,
    TranscriptionServiceNotConfigured,
    transcribe_clinical_audio,
)
from app.services.audit import write_audit_log

router = APIRouter()


def _ensure_dictation_role(current_user: CurrentUser) -> None:
    if current_user.rol not in {ROLE_ADMIN, ROLE_DOCTOR}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo doctor o admin pueden dictar notas clinicas.",
        )


async def _current_user_doctor_id(db: AsyncSession, current_user: CurrentUser) -> UUID | None:
    usuario = await db.get(Usuario, current_user.user_id)
    return usuario.doctor_id if usuario else None


async def _get_patient_for_dictation(
    db: AsyncSession,
    paciente_id: UUID,
    current_user: CurrentUser,
) -> Paciente:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)
    return paciente


def _normalized_content_type(upload: UploadFile) -> str:
    return (upload.content_type or "application/octet-stream").split(";", 1)[0].strip().lower()


async def _read_audio(upload: UploadFile, max_bytes: int) -> bytes:
    content = await upload.read(max_bytes + 1)
    await upload.close()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio demasiado grande.",
        )
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La grabacion esta vacia.")
    return content


@router.post("/pacientes/{paciente_id}/transcribir", response_model=DictadoTranscripcionResponse)
async def transcribir_dictado_paciente(
    paciente_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    audio: UploadFile = File(...),
    duracion_segundos: float | None = Form(None),
    contexto: str | None = Form("ficha"),
) -> DictadoTranscripcionResponse:
    _ensure_dictation_role(current_user)
    settings = get_settings()
    paciente = await _get_patient_for_dictation(db, paciente_id, current_user)

    content_type = _normalized_content_type(audio)
    if content_type not in settings.clinical_dictation_allowed_mime_types_list:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Formato de audio no permitido.",
        )

    if duracion_segundos is not None and duracion_segundos > settings.clinical_dictation_max_duration_seconds:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"La grabacion supera el maximo de {settings.clinical_dictation_max_duration_seconds} segundos.",
        )

    max_bytes = settings.clinical_dictation_max_audio_mb * 1024 * 1024
    audio_bytes = await _read_audio(audio, max_bytes)
    duration_int = int(duracion_segundos) if duracion_segundos is not None else None
    doctor_id = await _current_user_doctor_id(db, current_user)
    dictado = DictadoClinico(
        paciente_id=paciente.id,
        clinica_id=paciente.clinica_id,
        doctor_id=doctor_id,
        usuario_id=current_user.user_id,
        contexto=(contexto or "ficha")[:40],
        estado="recibido",
        audio_conservado=bool(settings.clinical_dictation_keep_audio),
        mime_type=content_type,
        audio_size_bytes=len(audio_bytes),
        duration_seconds=duration_int,
    )
    db.add(dictado)
    await db.flush()
    await write_audit_log(
        db,
        user=current_user,
        action="DICTADO_TRANSCRIPCION_SOLICITADA",
        entity_type="dictados_clinicos",
        entity_id=dictado.id,
        new_values={
            "paciente_id": str(paciente.id),
            "mime_type": content_type,
            "audio_size_bytes": len(audio_bytes),
            "duration_seconds": duration_int,
            "audio_conservado": dictado.audio_conservado,
        },
        clinica_id=paciente.clinica_id,
        request=request,
    )

    try:
        result = await transcribe_clinical_audio(
            AudioPayload(
                content=audio_bytes,
                filename=audio.filename or "dictado-clinico.webm",
                content_type=content_type,
                duration_seconds=duration_int,
            ),
            settings,
        )
    except TranscriptionServiceNotConfigured as exc:
        dictado.estado = "error"
        dictado.error_message = "Servicio de transcripcion no configurado"
        await write_audit_log(
            db,
            user=current_user,
            action="DICTADO_TRANSCRIPCION_ERROR",
            entity_type="dictados_clinicos",
            entity_id=dictado.id,
            new_values={"motivo": dictado.error_message},
            clinica_id=paciente.clinica_id,
            request=request,
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servicio de transcripcion no configurado",
        ) from exc
    except TranscriptionServiceError as exc:
        dictado.estado = "error"
        dictado.error_message = str(exc)
        await write_audit_log(
            db,
            user=current_user,
            action="DICTADO_TRANSCRIPCION_ERROR",
            entity_type="dictados_clinicos",
            entity_id=dictado.id,
            new_values={"motivo": dictado.error_message},
            clinica_id=paciente.clinica_id,
            request=request,
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    dictado.estado = "transcrito"
    dictado.transcripcion_raw = result.text
    dictado.proveedor = result.provider
    await write_audit_log(
        db,
        user=current_user,
        action="DICTADO_TRANSCRIPCION_COMPLETADA",
        entity_type="dictados_clinicos",
        entity_id=dictado.id,
        new_values={
            "proveedor": result.provider,
            "transcripcion_chars": len(result.text),
            "audio_conservado": dictado.audio_conservado,
        },
        clinica_id=paciente.clinica_id,
        request=request,
    )
    await db.commit()
    return DictadoTranscripcionResponse(
        dictado_id=dictado.id,
        paciente_id=paciente.id,
        transcripcion=result.text,
        estado="transcrito",
        proveedor=result.provider,
        audio_conservado=dictado.audio_conservado,
    )


@router.post("/pacientes/{paciente_id}/guardar-nota", response_model=DictadoNotaGuardadaResponse, status_code=201)
async def guardar_dictado_como_nota(
    paciente_id: UUID,
    data: DictadoGuardarNotaRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> DictadoNotaGuardadaResponse:
    _ensure_dictation_role(current_user)
    paciente = await _get_patient_for_dictation(db, paciente_id, current_user)
    texto = data.texto.strip()
    if not texto:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La nota no puede estar vacia.")

    dictado: DictadoClinico | None = None
    if data.dictado_id:
        dictado = await db.get(DictadoClinico, data.dictado_id)
        if not dictado or dictado.paciente_id != paciente.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dictado no encontrado para el paciente")
        ensure_clinic_access(current_user, dictado.clinica_id)
        if dictado.nota_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este dictado ya fue guardado como nota clinica.")

    doctor_id = dictado.doctor_id if dictado else None
    if data.cita_id:
        cita = await db.get(Cita, data.cita_id)
        if not cita or cita.paciente_id != paciente.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cita no encontrada para el paciente")
        ensure_clinic_access(current_user, cita.clinica_id)
        doctor_id = doctor_id or cita.doctor_id

    if data.historial_id:
        historial = await db.get(HistorialClinico, data.historial_id)
        if not historial or historial.paciente_id != paciente.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entrada de historial no encontrada para el paciente")
        doctor_id = doctor_id or historial.doctor_id

    doctor_id = doctor_id or await _current_user_doctor_id(db, current_user)
    nota = NotaDental(
        paciente_id=paciente.id,
        doctor_id=doctor_id,
        cita_id=data.cita_id,
        historial_id=data.historial_id,
        pieza_dental=None,
        caras=None,
        texto=texto,
        fecha=data.fecha or date_type.today(),
        origen="dictado_clinico",
    )
    db.add(nota)
    await db.flush()

    if dictado:
        dictado.transcripcion_editada = texto
        dictado.estado = "guardado"
        dictado.nota_id = nota.id
        dictado.saved_at = datetime.now(timezone.utc)

    await write_audit_log(
        db,
        user=current_user,
        action="DICTADO_NOTA_GUARDADA",
        entity_type="notas_dentales",
        entity_id=nota.id,
        new_values={
            "paciente_id": str(paciente.id),
            "dictado_id": str(dictado.id) if dictado else None,
            "texto_chars": len(texto),
            "origen": "dictado_clinico",
        },
        clinica_id=paciente.clinica_id,
        request=request,
    )
    await db.commit()
    return DictadoNotaGuardadaResponse(
        dictado_id=dictado.id if dictado else None,
        nota_id=nota.id,
        paciente_id=paciente.id,
        texto=nota.texto,
        fecha=nota.fecha,
    )
