from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.permissions import CurrentUser, ensure_clinic_access, scope_select_by_clinic
from app.database import get_db
from app.models.cita import Cita
from app.models.whatsapp import WhatsAppComunicacion
from app.schemas.whatsapp import (
    WhatsAppActionRequest,
    WhatsAppAppointmentSummary,
    WhatsAppInboxItem,
    WhatsAppPatientSummary,
    WhatsAppRescheduleRequest,
    WhatsAppWebhookPayload,
    WhatsAppWebhookResponse,
)
from app.services.whatsapp_service import (
    apply_whatsapp_action,
    process_inbound_whatsapp,
    reschedule_whatsapp_appointment,
)

router = APIRouter()


async def _read_webhook_payload(request: Request) -> dict[str, Any]:
    content_type = request.headers.get("content-type", "")
    if "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        form = await request.form()
        return dict(form)
    try:
        payload = await request.json()
        return payload if isinstance(payload, dict) else {"body": str(payload)}
    except Exception:
        body = (await request.body()).decode("utf-8", errors="replace")
        return {"body": body}


def _ensure_webhook_token(header_token: str | None, query_token: str | None) -> None:
    settings = get_settings()
    expected = settings.whatsapp_webhook_token.strip()
    provided = (header_token or query_token or "").strip()
    if expected:
        if provided != expected:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de webhook invalido")
        return
    if settings.environment == "production":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Webhook WhatsApp no configurado")


def _to_inbox_item(item: WhatsAppComunicacion) -> WhatsAppInboxItem:
    paciente = item.paciente
    cita = item.cita
    return WhatsAppInboxItem.model_validate({
        "id": item.id,
        "clinica_id": item.clinica_id,
        "patient_id": item.patient_id,
        "appointment_id": item.appointment_id,
        "direction": item.direction,
        "phone": item.phone,
        "message_body": item.message_body,
        "received_at": item.received_at,
        "sent_at": item.sent_at,
        "interpreted_intent": item.interpreted_intent,
        "processed": item.processed,
        "provider_message_id": item.provider_message_id,
        "idempotency_key": item.idempotency_key,
        "raw_payload": item.raw_payload,
        "created_at": item.created_at,
        "patient": WhatsAppPatientSummary.model_validate({
            "id": paciente.id,
            "nombre": paciente.nombre,
            "apellidos": paciente.apellidos,
            "num_historial": paciente.num_historial,
        }) if paciente else None,
        "appointment": WhatsAppAppointmentSummary.model_validate({
            "id": cita.id,
            "fecha_hora": cita.fecha_hora,
            "estado": cita.estado,
            "motivo": cita.motivo,
            "doctor_nombre": cita.doctor.nombre if cita.doctor else None,
            "doctor_id": cita.doctor_id,
            "gabinete_id": cita.gabinete_id,
            "duracion_min": cita.duracion_min,
        }) if cita else None,
    })


@router.post("/webhook", response_model=WhatsAppWebhookResponse)
async def recibir_respuesta_whatsapp(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_webhook_token: str | None = Header(default=None, alias="X-WhatsApp-Webhook-Token"),
    token: str | None = Query(default=None),
) -> WhatsAppWebhookResponse:
    _ensure_webhook_token(x_webhook_token, token)
    raw_payload = await _read_webhook_payload(request)
    payload = WhatsAppWebhookPayload.model_validate(raw_payload)
    result = await process_inbound_whatsapp(db, payload=payload, raw_payload=raw_payload, request=request)
    await db.commit()
    communication = result.communication
    return WhatsAppWebhookResponse(
        status="ok",
        communication_id=communication.id,
        patient_id=communication.patient_id,
        appointment_id=communication.appointment_id,
        interpreted_intent=communication.interpreted_intent,
        applied_status=result.applied_status,
        processed=communication.processed,
        duplicate=result.duplicate,
        detail=result.detail,
    )


@router.get("/comunicaciones", response_model=list[WhatsAppInboxItem])
async def listar_comunicaciones_whatsapp(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    patient_id: UUID | None = Query(None),
    appointment_id: UUID | None = Query(None),
    direction: str | None = Query(None, pattern=r"^(inbound|outbound)$"),
    processed: bool | None = Query(None),
    intent: str | None = Query(None),
    limit: int = Query(100, ge=1, le=300),
) -> list[WhatsAppInboxItem]:
    q = (
        select(WhatsAppComunicacion)
        .options(
            selectinload(WhatsAppComunicacion.paciente),
            selectinload(WhatsAppComunicacion.cita).selectinload(Cita.doctor),
        )
        .order_by(WhatsAppComunicacion.created_at.desc())
        .limit(limit)
    )
    q = scope_select_by_clinic(q, WhatsAppComunicacion, current_user)
    if current_user.rol != "admin" and current_user.clinica_id:
        q = q.where(
            or_(
                WhatsAppComunicacion.clinica_id == current_user.clinica_id,
                WhatsAppComunicacion.clinica_id.is_(None),
            )
        )
    if patient_id:
        q = q.where(WhatsAppComunicacion.patient_id == patient_id)
    if appointment_id:
        q = q.where(WhatsAppComunicacion.appointment_id == appointment_id)
    if direction:
        q = q.where(WhatsAppComunicacion.direction == direction)
    if processed is not None:
        q = q.where(WhatsAppComunicacion.processed == processed)
    if intent:
        q = q.where(WhatsAppComunicacion.interpreted_intent == intent)
    result = await db.execute(q)
    return [_to_inbox_item(item) for item in result.scalars().all()]


@router.post("/comunicaciones/{communication_id}/accion", response_model=WhatsAppInboxItem)
async def aplicar_accion_whatsapp(
    communication_id: UUID,
    data: WhatsAppActionRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> WhatsAppInboxItem:
    result = await db.execute(
        select(WhatsAppComunicacion)
        .options(
            selectinload(WhatsAppComunicacion.paciente),
            selectinload(WhatsAppComunicacion.cita).selectinload(Cita.doctor),
        )
        .where(WhatsAppComunicacion.id == communication_id)
    )
    communication = result.scalar_one_or_none()
    if not communication:
        raise HTTPException(status_code=404, detail="Comunicacion WhatsApp no encontrada")
    ensure_clinic_access(current_user, communication.clinica_id)
    if communication.paciente:
        ensure_clinic_access(current_user, communication.paciente.clinica_id)

    await apply_whatsapp_action(
        db,
        communication=communication,
        action=data.action,
        note=data.note,
        user=current_user,
        request=request,
    )
    await db.commit()
    refreshed = await db.execute(
        select(WhatsAppComunicacion)
        .options(
            selectinload(WhatsAppComunicacion.paciente),
            selectinload(WhatsAppComunicacion.cita).selectinload(Cita.doctor),
        )
        .where(WhatsAppComunicacion.id == communication_id)
    )
    return _to_inbox_item(refreshed.scalar_one())


@router.post("/comunicaciones/{communication_id}/reprogramar", response_model=WhatsAppInboxItem)
async def reprogramar_desde_whatsapp(
    communication_id: UUID,
    data: WhatsAppRescheduleRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> WhatsAppInboxItem:
    result = await db.execute(
        select(WhatsAppComunicacion)
        .options(
            selectinload(WhatsAppComunicacion.paciente),
            selectinload(WhatsAppComunicacion.cita).selectinload(Cita.doctor),
        )
        .where(WhatsAppComunicacion.id == communication_id)
    )
    communication = result.scalar_one_or_none()
    if not communication:
        raise HTTPException(status_code=404, detail="Comunicacion WhatsApp no encontrada")
    ensure_clinic_access(current_user, communication.clinica_id)
    if communication.cita:
        ensure_clinic_access(current_user, communication.cita.clinica_id)
    try:
        await reschedule_whatsapp_appointment(
            db,
            communication=communication,
            data=data,
            user=current_user,
            request=request,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    await db.commit()
    refreshed = await db.execute(
        select(WhatsAppComunicacion)
        .options(
            selectinload(WhatsAppComunicacion.paciente),
            selectinload(WhatsAppComunicacion.cita).selectinload(Cita.doctor),
        )
        .where(WhatsAppComunicacion.id == communication_id)
    )
    return _to_inbox_item(refreshed.scalar_one())
