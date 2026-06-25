from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.permissions import (
    ROLE_ADMIN,
    ROLE_AUXILIAR,
    ROLE_DOCTOR,
    ROLE_RECEPCION,
    CurrentUser,
)
from app.database import get_db
from app.schemas.assistant import (
    AssistantInterpretRequest,
    AssistantInterpretResponse,
    DraftPatchInterpretRequest,
    DraftPatchInterpretResponse,
)
from app.services.assistant_llm_interpreter import (
    AssistantLLMError,
    AssistantLLMNotConfigured,
    interpret_assistant_intent,
)
from app.services.audit import write_audit_log
from app.services.draft_patch_interpreter import interpret_draft_patch

router = APIRouter()


def _ensure_assistant_role(current_user: CurrentUser) -> None:
    if current_user.rol not in {ROLE_ADMIN, ROLE_DOCTOR, ROLE_RECEPCION, ROLE_AUXILIAR}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos para usar el asistente interno.",
        )


@router.post("/interpret", response_model=AssistantInterpretResponse)
async def interpret_assistant_request(
    data: AssistantInterpretRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> AssistantInterpretResponse:
    _ensure_assistant_role(current_user)
    settings = get_settings()
    try:
        intent = await interpret_assistant_intent(data, settings)
    except AssistantLLMNotConfigured as exc:
        await write_audit_log(
            db,
            user=current_user,
            action="ASSISTANT_INTERPRET_NOT_CONFIGURED",
            entity_type="assistant",
            new_values={"status": "not_configured"},
            request=request,
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Interprete IA no configurado",
        ) from exc
    except AssistantLLMError as exc:
        await write_audit_log(
            db,
            user=current_user,
            action="ASSISTANT_INTERPRET_ERROR",
            entity_type="assistant",
            new_values={"status": "error"},
            request=request,
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No he podido interpretar eso con seguridad. Puedes repetirlo o hacerlo manualmente.",
        ) from exc

    await write_audit_log(
        db,
        user=current_user,
        action="ASSISTANT_INTERPRET_COMPLETED",
        entity_type="assistant",
        new_values={
            "intent": intent.intent,
            "confidence": intent.confidence,
            "riskLevel": intent.risk_level,
            "status": intent.status,
            "confirmed": intent.intent == "confirm_current_draft",
        },
        request=request,
    )
    await db.commit()
    return AssistantInterpretResponse(intent=intent)


@router.post("/patch", response_model=DraftPatchInterpretResponse)
async def interpret_draft_patch_request(
    data: DraftPatchInterpretRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> DraftPatchInterpretResponse:
    _ensure_assistant_role(current_user)
    settings = get_settings()
    try:
        patch = await interpret_draft_patch(data, settings)
    except AssistantLLMNotConfigured as exc:
        await write_audit_log(
            db,
            user=current_user,
            action="ASSISTANT_PATCH_NOT_CONFIGURED",
            entity_type="assistant",
            new_values={"status": "not_configured"},
            request=request,
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Interprete IA de borradores no configurado",
        ) from exc
    except AssistantLLMError as exc:
        await write_audit_log(
            db,
            user=current_user,
            action="ASSISTANT_PATCH_ERROR",
            entity_type="assistant",
            new_values={"status": "error"},
            request=request,
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No he podido interpretar la correccion con seguridad.",
        ) from exc

    await write_audit_log(
        db,
        user=current_user,
        action="ASSISTANT_PATCH_COMPLETED",
        entity_type="assistant",
        new_values={
            "action": patch.action,
            "confidence": patch.confidence,
            "confirmed": patch.action == "confirm",
        },
        request=request,
    )
    await db.commit()
    return DraftPatchInterpretResponse(patch=patch)
