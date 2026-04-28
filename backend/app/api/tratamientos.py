"""
Router de tratamientos — Fase 4.
- Catálogo: familias + tratamientos (CRUD, admin)
- Historial clínico: registro de tratamientos por paciente
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import CurrentUser, RequireAdmin, get_current_user
from app.database import get_db
from app.models.historial import HistorialClinico
from app.models.tratamiento import FamiliaTratamiento, TratamientoCatalogo
from app.schemas.tratamiento import (
    FamiliaCreate, FamiliaResponse, FamiliaUpdate,
    HistorialCreate, HistorialResponse, HistorialUpdate,
    TratamientoCreate, TratamientoResponse, TratamientoUpdate,
)

router = APIRouter()


# ─── FAMILIAS ────────────────────────────────────────────────────────────────

@router.get("/familias", response_model=list[FamiliaResponse])
async def listar_familias(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[FamiliaResponse]:
    result = await db.execute(
        select(FamiliaTratamiento)
        .where(FamiliaTratamiento.activo == True)  # noqa: E712
        .order_by(FamiliaTratamiento.orden, FamiliaTratamiento.nombre)
    )
    return [FamiliaResponse.model_validate(f) for f in result.scalars().all()]


@router.post("/familias", response_model=FamiliaResponse, status_code=201, dependencies=[RequireAdmin])
async def crear_familia(
    data: FamiliaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FamiliaResponse:
    familia = FamiliaTratamiento(**data.model_dump())
    db.add(familia)
    await db.commit()
    await db.refresh(familia)
    return FamiliaResponse.model_validate(familia)


@router.patch("/familias/{familia_id}", response_model=FamiliaResponse, dependencies=[RequireAdmin])
async def actualizar_familia(
    familia_id: UUID,
    data: FamiliaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
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


# ─── CATÁLOGO ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TratamientoResponse])
async def listar_tratamientos(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    familia_id: UUID | None = Query(None),
    solo_activos: bool = Query(True),
    q: str | None = Query(None),
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


@router.post("", response_model=TratamientoResponse, status_code=201, dependencies=[RequireAdmin])
async def crear_tratamiento(
    data: TratamientoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TratamientoResponse:
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


@router.patch("/{tratamiento_id}", response_model=TratamientoResponse, dependencies=[RequireAdmin])
async def actualizar_tratamiento(
    tratamiento_id: UUID,
    data: TratamientoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
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


@router.delete("/{tratamiento_id}", response_model=TratamientoResponse, dependencies=[RequireAdmin])
async def desactivar_tratamiento(
    tratamiento_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TratamientoResponse:
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


# ─── HISTORIAL CLÍNICO ────────────────────────────────────────────────────────

@router.get("/historial/{paciente_id}", response_model=list[HistorialResponse])
async def historial_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    pieza: int | None = Query(None, description="Filtrar por pieza FDI"),
) -> list[HistorialResponse]:
    stmt = (
        select(HistorialClinico)
        .options(
            selectinload(HistorialClinico.tratamiento),
            selectinload(HistorialClinico.doctor),
        )
        .where(HistorialClinico.paciente_id == paciente_id)
        .order_by(HistorialClinico.fecha.desc())
    )
    if pieza:
        stmt = stmt.where(HistorialClinico.pieza_dental == pieza)
    result = await db.execute(stmt)
    return [HistorialResponse.model_validate(h) for h in result.scalars().all()]


@router.post("/historial", response_model=HistorialResponse, status_code=201)
async def registrar_tratamiento(
    data: HistorialCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> HistorialResponse:
    entrada = HistorialClinico(**data.model_dump())
    db.add(entrada)
    await db.commit()
    await db.refresh(entrada)
    result = await db.execute(
        select(HistorialClinico)
        .options(
            selectinload(HistorialClinico.tratamiento),
            selectinload(HistorialClinico.doctor),
        )
        .where(HistorialClinico.id == entrada.id)
    )
    return HistorialResponse.model_validate(result.scalar_one())


@router.patch("/historial/{entrada_id}", response_model=HistorialResponse)
async def actualizar_entrada_historial(
    entrada_id: UUID,
    data: HistorialUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> HistorialResponse:
    result = await db.execute(
        select(HistorialClinico)
        .options(
            selectinload(HistorialClinico.tratamiento),
            selectinload(HistorialClinico.doctor),
        )
        .where(HistorialClinico.id == entrada_id)
    )
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Entrada de historial no encontrada")
    for f, v in data.model_dump(exclude_none=True).items():
        setattr(h, f, v)
    await db.commit()
    result2 = await db.execute(
        select(HistorialClinico)
        .options(
            selectinload(HistorialClinico.tratamiento),
            selectinload(HistorialClinico.doctor),
        )
        .where(HistorialClinico.id == entrada_id)
    )
    return HistorialResponse.model_validate(result2.scalar_one())


@router.delete("/historial/{entrada_id}", status_code=204, dependencies=[RequireAdmin])
async def eliminar_entrada_historial(
    entrada_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Elimina una entrada de historial (solo admin, por error de registro)."""
    result = await db.execute(select(HistorialClinico).where(HistorialClinico.id == entrada_id))
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")
    await db.delete(h)
    await db.commit()
