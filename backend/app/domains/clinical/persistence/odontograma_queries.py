"""Queries used when clinical sessions and treatment plans update a chart."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domains.clinical.persistence.odontograma import (
    Odontograma,
    OdontogramaPieza,
    OdontogramaSuperficie,
)


async def active_odontograma_for_patient(db: AsyncSession, paciente_id: UUID) -> Odontograma | None:
    result = await db.execute(
        select(Odontograma)
        .options(selectinload(Odontograma.piezas).selectinload(OdontogramaPieza.superficies))
        .where(Odontograma.paciente_id == paciente_id, Odontograma.activo == True)  # noqa: E712
        .order_by(Odontograma.version.desc(), Odontograma.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_or_create_odontograma_surface(
    db: AsyncSession,
    odontograma: Odontograma,
    pieza_fdi: int,
    superficie: str,
) -> OdontogramaSuperficie:
    piece = next((item for item in odontograma.piezas if item.pieza_fdi == pieza_fdi), None)
    if not piece:
        piece = OdontogramaPieza(
            odontograma_id=odontograma.id,
            pieza_fdi=pieza_fdi,
            superficies=[],
        )
        db.add(piece)
        await db.flush()
        odontograma.piezas.append(piece)
    surface = next((item for item in piece.superficies if item.superficie == superficie), None)
    if surface:
        return surface
    surface = OdontogramaSuperficie(pieza_id=piece.id, superficie=superficie)
    db.add(surface)
    await db.flush()
    piece.superficies.append(surface)
    return surface
