from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import ROLE_DOCTOR, CurrentUser, ensure_clinic_access
from app.database import get_db
from app.models.notificacion import DoctorNotification
from app.models.usuario import Usuario
from app.schemas.notificacion import DoctorNotificationResponse
from app.services.notificaciones import patient_full_name

router = APIRouter()


async def _current_doctor_id(
    db: AsyncSession,
    current_user: CurrentUser,
) -> UUID:
    if current_user.rol != ROLE_DOCTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo doctores pueden consultar estas notificaciones")
    usuario = await db.get(Usuario, current_user.user_id)
    if not usuario or not usuario.doctor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario doctor sin profesional vinculado")
    return usuario.doctor_id


def _to_response(notification: DoctorNotification) -> DoctorNotificationResponse:
    return DoctorNotificationResponse.model_validate({
        "id": notification.id,
        "recipient_doctor_id": notification.recipient_doctor_id,
        "appointment_id": notification.appointment_id,
        "patient_id": notification.patient_id,
        "clinica_id": notification.clinica_id,
        "title": notification.title,
        "message": notification.message,
        "type": notification.type,
        "read": notification.read,
        "read_at": notification.read_at,
        "created_at": notification.created_at,
        "patient_name": patient_full_name(notification.patient),
        "appointment_time": notification.appointment.fecha_hora,
    })


@router.get("/mias", response_model=list[DoctorNotificationResponse])
async def listar_mis_notificaciones(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    unread_only: bool = Query(False),
    limit: int = Query(30, ge=1, le=100),
) -> list[DoctorNotificationResponse]:
    doctor_id = await _current_doctor_id(db, current_user)
    q = (
        select(DoctorNotification)
        .options(selectinload(DoctorNotification.patient), selectinload(DoctorNotification.appointment))
        .where(DoctorNotification.recipient_doctor_id == doctor_id)
        .order_by(DoctorNotification.read.asc(), DoctorNotification.created_at.desc())
        .limit(limit)
    )
    if unread_only:
        q = q.where(DoctorNotification.read == False)  # noqa: E712
    result = await db.execute(q)
    notifications = result.scalars().all()
    for notification in notifications:
        ensure_clinic_access(current_user, notification.clinica_id)
    return [_to_response(notification) for notification in notifications]


@router.post("/{notification_id}/leer", response_model=DoctorNotificationResponse)
async def marcar_notificacion_leida(
    notification_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> DoctorNotificationResponse:
    doctor_id = await _current_doctor_id(db, current_user)
    result = await db.execute(
        select(DoctorNotification)
        .options(selectinload(DoctorNotification.patient), selectinload(DoctorNotification.appointment))
        .where(DoctorNotification.id == notification_id)
    )
    notification = result.scalar_one_or_none()
    if not notification or notification.recipient_doctor_id != doctor_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificacion no encontrada")
    ensure_clinic_access(current_user, notification.clinica_id)
    if not notification.read:
        notification.read = True
        notification.read_at = datetime.now(timezone.utc)
        await db.commit()
    return _to_response(notification)
