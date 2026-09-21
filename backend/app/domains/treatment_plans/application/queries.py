"""Treatment plan loading shared by plan editing and invoicing use cases."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domains.treatment_plans.persistence.presupuesto import (
    Presupuesto,
    PresupuestoLinea,
)

PRESUPUESTO_LOAD = [
    selectinload(Presupuesto.paciente),
    selectinload(Presupuesto.doctor),
    selectinload(Presupuesto.lineas).selectinload(PresupuestoLinea.tratamiento),
]


async def get_presupuesto_or_404(db: AsyncSession, presupuesto_id: UUID) -> Presupuesto:
    result = await db.execute(
        select(Presupuesto).options(*PRESUPUESTO_LOAD).where(Presupuesto.id == presupuesto_id)
    )
    presupuesto = result.scalar_one_or_none()
    if not presupuesto:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    return presupuesto
