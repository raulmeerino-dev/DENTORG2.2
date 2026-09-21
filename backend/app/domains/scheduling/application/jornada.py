"""Daily arrival, clinical handoff and reception checkout commands."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import TokenData, ensure_clinic_access
from app.domains.patients.application.pacientes import crear_paciente
from app.domains.patients.schemas.paciente import PacienteCreate, PacienteResponse
from app.domains.scheduling.application.citas import (
    _get_cita_or_404,
    _registrar_cambio_cita,
    _snapshot_cita,
    _to_response,
)
from app.domains.scheduling.application.visit_lifecycle import apply_visit_state
from app.domains.scheduling.schemas.cita import CitaResponse, PacienteProvisionalCreate


async def transition_visit(
    db: AsyncSession, cita_id: UUID, user: TokenData, request: Request, *, target: str, action: str
) -> CitaResponse:
    cita = await _get_cita_or_404(db, cita_id, lock=True)
    ensure_clinic_access(user, cita.clinica_id)
    old = _snapshot_cita(cita)
    await apply_visit_state(db, cita, user, target)
    new = _snapshot_cita(cita)
    if old != new:
        await _registrar_cambio_cita(
            db,
            cita=cita,
            current_user=user,
            accion=action,
            old_values=old,
            new_values=new,
            request=request,
        )
    await db.commit()
    return await _to_response(db, await _get_cita_or_404(db, cita_id))


async def resolve_checkout(
    db: AsyncSession, cita_id: UUID, user: TokenData, request: Request, observaciones: str | None
) -> CitaResponse:
    if user.rol not in {"admin", "recepcion"}:
        raise HTTPException(
            status_code=403, detail="Solo recepción o administración puede resolver la salida."
        )
    cita = await _get_cita_or_404(db, cita_id, lock=True)
    ensure_clinic_access(user, cita.clinica_id)
    if cita.estado != "atendida" or not cita.finalizada_at:
        raise HTTPException(status_code=409, detail="La visita clínica todavía no ha finalizado.")
    if not cita.salida_resuelta_at:
        old = _snapshot_cita(cita)
        cita.salida_resuelta_at = datetime.now(timezone.utc)
        await _registrar_cambio_cita(
            db,
            cita=cita,
            current_user=user,
            accion="resolver_salida",
            old_values=old,
            new_values=_snapshot_cita(cita),
            motivo=observaciones,
            request=request,
        )
    await db.commit()
    return await _to_response(db, await _get_cita_or_404(db, cita_id))


class _ProvisionalPatient(PacienteCreate):
    """A real patient can start without surnames and complete the record later."""

    apellidos: str = ""


async def create_provisional_patient(
    db: AsyncSession, user: TokenData, data: PacienteProvisionalCreate
) -> PacienteResponse:
    return await crear_paciente(
        data=_ProvisionalPatient(
            nombre=data.nombre,
            telefono=data.telefono,
            observaciones="Paciente provisional: completar ficha.",
        ),
        db=db,
        current_user=user,
    )
