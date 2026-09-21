"""Treatment catalog administration; no patient encounter state."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import TokenData
from app.domains.clinical.persistence.tratamiento import FamiliaTratamiento, TratamientoCatalogo
from app.domains.clinical.schemas.tratamiento import (
    FamiliaCreate,
    FamiliaResponse,
    FamiliaUpdate,
    TratamientoCreate,
    TratamientoResponse,
    TratamientoUpdate,
)


async def listar_familias(db: AsyncSession, _: TokenData) -> list[FamiliaResponse]:
    result = await db.execute(
        select(FamiliaTratamiento)
        .where(FamiliaTratamiento.activo == True)  # noqa: E712
        .order_by(FamiliaTratamiento.orden, FamiliaTratamiento.nombre)
    )
    return [FamiliaResponse.model_validate(f) for f in result.scalars().all()]


async def crear_familia(data: FamiliaCreate, db: AsyncSession) -> FamiliaResponse:
    familia = FamiliaTratamiento(**data.model_dump())
    db.add(familia)
    await db.commit()
    await db.refresh(familia)
    return FamiliaResponse.model_validate(familia)


async def actualizar_familia(
    familia_id: UUID, data: FamiliaUpdate, db: AsyncSession
) -> FamiliaResponse:
    result = await db.execute(select(FamiliaTratamiento).where(FamiliaTratamiento.id == familia_id))
    familia = result.scalar_one_or_none()
    if not familia:
        raise HTTPException(status_code=404, detail="Familia no encontrada")
    for f, v in data.model_dump(exclude_none=True).items():
        setattr(familia, f, v)
    await db.commit()
    await db.refresh(familia)
    return FamiliaResponse.model_validate(familia)


async def listar_tratamientos(
    db: AsyncSession, _: TokenData, familia_id: UUID | None, solo_activos: bool, q: str | None
) -> list[TratamientoResponse]:
    stmt = (
        select(TratamientoCatalogo)
        .options(selectinload(TratamientoCatalogo.familia))
        .order_by(TratamientoCatalogo.nombre)
    )
    if solo_activos:
        stmt = stmt.where(TratamientoCatalogo.activo == True)  # noqa: E712
    if familia_id:
        stmt = stmt.where(TratamientoCatalogo.familia_id == familia_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                TratamientoCatalogo.nombre.ilike(like),
                TratamientoCatalogo.codigo.ilike(like),
            )
        )
    result = await db.execute(stmt)
    return [TratamientoResponse.model_validate(t) for t in result.scalars().all()]


async def crear_tratamiento(data: TratamientoCreate, db: AsyncSession) -> TratamientoResponse:
    tratamiento = TratamientoCatalogo(**data.model_dump())
    db.add(tratamiento)
    await db.commit()
    await db.refresh(tratamiento)
    result = await db.execute(
        select(TratamientoCatalogo)
        .options(selectinload(TratamientoCatalogo.familia))
        .where(TratamientoCatalogo.id == tratamiento.id)
    )
    return TratamientoResponse.model_validate(result.scalar_one())


async def actualizar_tratamiento(
    tratamiento_id: UUID, data: TratamientoUpdate, db: AsyncSession
) -> TratamientoResponse:
    result = await db.execute(
        select(TratamientoCatalogo)
        .options(selectinload(TratamientoCatalogo.familia))
        .where(TratamientoCatalogo.id == tratamiento_id)
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    for f, v in data.model_dump(exclude_none=True).items():
        setattr(t, f, v)
    await db.commit()
    await db.refresh(t)
    result2 = await db.execute(
        select(TratamientoCatalogo)
        .options(selectinload(TratamientoCatalogo.familia))
        .where(TratamientoCatalogo.id == tratamiento_id)
    )
    return TratamientoResponse.model_validate(result2.scalar_one())


async def desactivar_tratamiento(tratamiento_id: UUID, db: AsyncSession) -> TratamientoResponse:
    result = await db.execute(
        select(TratamientoCatalogo)
        .options(selectinload(TratamientoCatalogo.familia))
        .where(TratamientoCatalogo.id == tratamiento_id)
    )
    tratamiento = result.scalar_one_or_none()
    if not tratamiento:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    tratamiento.activo = False
    await db.commit()
    await db.refresh(tratamiento)
    result2 = await db.execute(
        select(TratamientoCatalogo)
        .options(selectinload(TratamientoCatalogo.familia))
        .where(TratamientoCatalogo.id == tratamiento_id)
    )
    return TratamientoResponse.model_validate(result2.scalar_one())
