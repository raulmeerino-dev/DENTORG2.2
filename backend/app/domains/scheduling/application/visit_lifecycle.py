"""Atomic visit transitions shared by explicit commands and compatibility APIs."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import TokenData
from app.domains.clinical.persistence.sesion_clinica import SesionClinicaItem
from app.domains.communications.application.notificaciones import (
    create_patient_waiting_notification,
)
from app.domains.patients.persistence.paciente import Paciente
from app.domains.scheduling.domain.visit_states import PRE_VISIT_STATES
from app.domains.scheduling.persistence.cita import Cita

VISIT_STATES = {"en_clinica", "en_atencion", "atendida"}


async def apply_visit_state(db: AsyncSession, cita: Cita, user: TokenData, target: str) -> None:
    """Caller holds the appointment lock and commits the transition with its audit."""
    now = datetime.now(timezone.utc)
    if target in {"en_atencion", "atendida"} and user.rol not in {"admin", "doctor", "auxiliar"}:
        raise HTTPException(
            status_code=403,
            detail="La atención y el cierre clínico requieren un profesional autorizado.",
        )
    if target == "en_clinica":
        if cita.estado not in PRE_VISIT_STATES | {"en_clinica"}:
            raise HTTPException(
                status_code=409, detail="La llegada solo se registra antes de iniciar la atención."
            )
        cita.llegada_at = cita.llegada_at or now
        await create_patient_waiting_notification(db, cita)
    elif target == "en_atencion":
        if cita.estado not in {"en_clinica", "en_atencion"}:
            raise HTTPException(status_code=409, detail="Registre primero la llegada del paciente.")
        cita.llegada_at = cita.llegada_at or now
        cita.atencion_iniciada_at = cita.atencion_iniciada_at or now
    elif target == "atendida":
        if cita.estado not in {"en_atencion", "atendida"}:
            raise HTTPException(
                status_code=409, detail="Inicie la atención antes de finalizar la visita."
            )
        if cita.estado != "atendida":
            # Session writers take this same patient lock, including items that
            # have no appointment yet. Completion cannot race an unfinished act.
            await db.execute(select(Paciente.id).where(Paciente.id == cita.paciente_id).with_for_update())
            unfinished = await db.scalar(
                select(SesionClinicaItem.id)
                .where(
                    SesionClinicaItem.paciente_id == cita.paciente_id,
                    or_(SesionClinicaItem.clinica_id == cita.clinica_id, SesionClinicaItem.clinica_id.is_(None)),
                    SesionClinicaItem.estado == "en_curso",
                    or_(SesionClinicaItem.cita_id == cita.id, SesionClinicaItem.cita_id.is_(None)),
                )
                .limit(1)
            )
            if unfinished:
                raise HTTPException(
                    status_code=409,
                    detail="Hay tratamientos en curso. Finalícelos o pospóngalos antes de cerrar la visita.",
                )
        cita.finalizada_at = cita.finalizada_at or now
    cita.estado = target


def ensure_visit_not_started(cita: Cita) -> None:
    if cita.atencion_iniciada_at or cita.estado in {"en_atencion", "atendida"}:
        raise HTTPException(
            status_code=409,
            detail="La visita ya iniciada conserva su estado clínico. Finalícela desde la sesión.",
        )
