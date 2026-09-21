"""Shared validation of patient, professional and linked clinical records."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import TokenData, ensure_clinic_access
from app.domains.billing.persistence.factura import Factura
from app.domains.clinical.persistence.tratamiento import TratamientoCatalogo
from app.domains.identity.persistence.doctor import Doctor
from app.domains.identity.persistence.usuario import Usuario
from app.domains.patients.persistence.paciente import Paciente
from app.domains.scheduling.persistence.cita import Cita
from app.domains.scheduling.persistence.gabinete import Gabinete
from app.domains.treatment_plans.persistence.presupuesto import PresupuestoLinea


async def current_user_doctor_id(db: AsyncSession, current_user: TokenData) -> UUID | None:
    usuario = await db.get(Usuario, current_user.user_id)
    return usuario.doctor_id if usuario else None


async def get_history_patient_or_404(db: AsyncSession, paciente_id: UUID) -> Paciente:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    return paciente


def ensure_same_clinic(
    paciente: Paciente,
    related_clinic_id: UUID | None,
    *,
    resource_name: str,
) -> None:
    """Impide enlazar recursos de dos clinicas nominales diferentes.

    Los recursos legacy sin clinica permanecen compatibles hasta que P0-003
    asigne su propietario de forma segura.
    """
    if (
        paciente.clinica_id is not None
        and related_clinic_id is not None
        and paciente.clinica_id != related_clinic_id
    ):
        raise HTTPException(
            status_code=409,
            detail=f"{resource_name} pertenece a otra clinica.",
        )


async def validate_history_links(
    db: AsyncSession,
    *,
    paciente: Paciente,
    current_user: TokenData,
    tratamiento_id: UUID | None = None,
    doctor_id: UUID | None = None,
    gabinete_id: UUID | None = None,
    factura_id: UUID | None = None,
    presupuesto_linea_id: UUID | None = None,
    cita_id: UUID | None = None,
) -> None:
    if tratamiento_id is not None and not await db.get(TratamientoCatalogo, tratamiento_id):
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")

    if doctor_id is not None:
        doctor = await db.get(Doctor, doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor no encontrado")
        ensure_clinic_access(current_user, doctor.clinica_id)
        ensure_same_clinic(paciente, doctor.clinica_id, resource_name="El doctor")

    if gabinete_id is not None and not await db.get(Gabinete, gabinete_id):
        raise HTTPException(status_code=404, detail="Gabinete no encontrado")

    if factura_id is not None:
        factura = await db.get(Factura, factura_id)
        if not factura or factura.paciente_id != paciente.id:
            raise HTTPException(status_code=404, detail="Factura no encontrada para el paciente")
        ensure_clinic_access(current_user, factura.clinica_id)
        ensure_same_clinic(paciente, factura.clinica_id, resource_name="La factura")

    if presupuesto_linea_id is not None:
        result = await db.execute(
            select(PresupuestoLinea)
            .options(selectinload(PresupuestoLinea.presupuesto))
            .where(PresupuestoLinea.id == presupuesto_linea_id)
        )
        linea = result.scalar_one_or_none()
        if not linea or not linea.presupuesto or linea.presupuesto.paciente_id != paciente.id:
            raise HTTPException(
                status_code=404,
                detail="Linea de presupuesto no encontrada para el paciente",
            )
        ensure_clinic_access(current_user, linea.presupuesto.clinica_id)
        ensure_same_clinic(
            paciente,
            linea.presupuesto.clinica_id,
            resource_name="El presupuesto",
        )
        if tratamiento_id is not None and linea.tratamiento_id != tratamiento_id:
            raise HTTPException(
                status_code=409,
                detail="La linea de presupuesto no corresponde al tratamiento indicado.",
            )

    if cita_id is not None:
        cita = await db.get(Cita, cita_id)
        if not cita or cita.paciente_id != paciente.id:
            raise HTTPException(status_code=404, detail="Cita no encontrada para el paciente")
        ensure_clinic_access(current_user, cita.clinica_id)
        ensure_same_clinic(paciente, cita.clinica_id, resource_name="La cita")
