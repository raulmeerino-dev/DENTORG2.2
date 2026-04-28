"""
Router de presupuestos — Fase 5.
CRUD presupuestos + líneas + pasar líneas aceptadas a trabajo pendiente.
"""
from datetime import date as date_type
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import CurrentUser, RequireAdmin, get_current_user
from app.database import get_db
from app.models.presupuesto import Presupuesto, PresupuestoLinea, TrabajoPendiente
from app.schemas.presupuesto import (
    OdontogramaPlanResponse,
    OdontogramaPlanUpdate,
    PresupuestoCreate,
    PresupuestoLineaCreate,
    PresupuestoLineaResponse,
    PresupuestoLineaUpdate,
    PresupuestoResponse,
    PresupuestoUpdate,
    TrabajoPendienteResponse,
)

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_presupuesto_or_404(db: AsyncSession, pid: UUID) -> Presupuesto:
    result = await db.execute(
        select(Presupuesto)
        .options(
            selectinload(Presupuesto.paciente),
            selectinload(Presupuesto.doctor),
            selectinload(Presupuesto.lineas).selectinload(PresupuestoLinea.tratamiento),
        )
        .where(Presupuesto.id == pid)
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    return p


# ─── PRESUPUESTOS ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[PresupuestoResponse])
async def listar_presupuestos(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    paciente_id: UUID | None = Query(None),
    estado: str | None = Query(None),
    desde: date_type | None = Query(None),
    hasta: date_type | None = Query(None),
) -> list[PresupuestoResponse]:
    stmt = (
        select(Presupuesto)
        .options(
            selectinload(Presupuesto.paciente),
            selectinload(Presupuesto.doctor),
            selectinload(Presupuesto.lineas).selectinload(PresupuestoLinea.tratamiento),
        )
        .order_by(Presupuesto.fecha.desc(), Presupuesto.numero.desc())
    )
    if paciente_id:
        stmt = stmt.where(Presupuesto.paciente_id == paciente_id)
    if estado:
        stmt = stmt.where(Presupuesto.estado == estado)
    if desde:
        stmt = stmt.where(Presupuesto.fecha >= desde)
    if hasta:
        stmt = stmt.where(Presupuesto.fecha <= hasta)

    result = await db.execute(stmt)
    return [PresupuestoResponse.model_validate(p) for p in result.scalars().all()]


@router.post("", response_model=PresupuestoResponse, status_code=201)
async def crear_presupuesto(
    data: PresupuestoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> PresupuestoResponse:
    # Calcular próximo número
    from sqlalchemy import func
    max_num = await db.execute(select(func.max(Presupuesto.numero)))
    siguiente = (max_num.scalar_one_or_none() or 0) + 1

    presupuesto = Presupuesto(
        paciente_id=data.paciente_id,
        doctor_id=data.doctor_id,
        fecha=data.fecha,
        pie_pagina=data.pie_pagina,
        numero=siguiente,
    )
    db.add(presupuesto)
    await db.flush()  # obtener ID

    for linea_data in data.lineas:
        linea = PresupuestoLinea(
            presupuesto_id=presupuesto.id,
            **linea_data.model_dump(),
        )
        db.add(linea)

    await db.commit()
    return PresupuestoResponse.model_validate(await _get_presupuesto_or_404(db, presupuesto.id))


@router.get("/{presupuesto_id}", response_model=PresupuestoResponse)
async def obtener_presupuesto(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> PresupuestoResponse:
    return PresupuestoResponse.model_validate(await _get_presupuesto_or_404(db, presupuesto_id))


@router.get("/{presupuesto_id}/odontograma", response_model=OdontogramaPlanResponse)
async def obtener_odontograma_plan(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> OdontogramaPlanResponse:
    p = await _get_presupuesto_or_404(db, presupuesto_id)
    return OdontogramaPlanResponse(presupuesto_id=p.id, odontograma=p.odontograma or {})


@router.put("/{presupuesto_id}/odontograma", response_model=OdontogramaPlanResponse)
async def guardar_odontograma_plan(
    presupuesto_id: UUID,
    data: OdontogramaPlanUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> OdontogramaPlanResponse:
    p = await _get_presupuesto_or_404(db, presupuesto_id)
    p.odontograma = data.odontograma
    await db.commit()
    return OdontogramaPlanResponse(presupuesto_id=p.id, odontograma=p.odontograma or {})


@router.patch("/{presupuesto_id}", response_model=PresupuestoResponse)
async def actualizar_presupuesto(
    presupuesto_id: UUID,
    data: PresupuestoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> PresupuestoResponse:
    p = await _get_presupuesto_or_404(db, presupuesto_id)
    for f, v in data.model_dump(exclude_none=True).items():
        setattr(p, f, v)
    await db.commit()
    return PresupuestoResponse.model_validate(await _get_presupuesto_or_404(db, presupuesto_id))


@router.delete("/{presupuesto_id}", status_code=204, dependencies=[RequireAdmin])
async def eliminar_presupuesto(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    p = await _get_presupuesto_or_404(db, presupuesto_id)
    await db.delete(p)
    await db.commit()


# ─── LÍNEAS ───────────────────────────────────────────────────────────────────

@router.post("/{presupuesto_id}/lineas", response_model=PresupuestoLineaResponse, status_code=201)
async def añadir_linea(
    presupuesto_id: UUID,
    data: PresupuestoLineaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> PresupuestoLineaResponse:
    await _get_presupuesto_or_404(db, presupuesto_id)
    linea = PresupuestoLinea(presupuesto_id=presupuesto_id, **data.model_dump())
    db.add(linea)
    await db.commit()
    result = await db.execute(
        select(PresupuestoLinea)
        .options(selectinload(PresupuestoLinea.tratamiento))
        .where(PresupuestoLinea.id == linea.id)
    )
    return PresupuestoLineaResponse.model_validate(result.scalar_one())


@router.patch("/{presupuesto_id}/lineas/{linea_id}", response_model=PresupuestoLineaResponse)
async def actualizar_linea(
    presupuesto_id: UUID,
    linea_id: UUID,
    data: PresupuestoLineaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> PresupuestoLineaResponse:
    result = await db.execute(
        select(PresupuestoLinea)
        .options(selectinload(PresupuestoLinea.tratamiento))
        .where(and_(PresupuestoLinea.id == linea_id, PresupuestoLinea.presupuesto_id == presupuesto_id))
    )
    linea = result.scalar_one_or_none()
    if not linea:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    for f, v in data.model_dump(exclude_none=True).items():
        setattr(linea, f, v)
    await db.commit()
    result2 = await db.execute(
        select(PresupuestoLinea)
        .options(selectinload(PresupuestoLinea.tratamiento))
        .where(PresupuestoLinea.id == linea_id)
    )
    return PresupuestoLineaResponse.model_validate(result2.scalar_one())


@router.delete("/{presupuesto_id}/lineas/{linea_id}", status_code=204)
async def eliminar_linea(
    presupuesto_id: UUID,
    linea_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> None:
    result = await db.execute(
        select(PresupuestoLinea).where(
            and_(PresupuestoLinea.id == linea_id, PresupuestoLinea.presupuesto_id == presupuesto_id)
        )
    )
    linea = result.scalar_one_or_none()
    if not linea:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    await db.delete(linea)
    await db.commit()


# ─── PASAR A TRABAJO PENDIENTE ────────────────────────────────────────────────

@router.post("/{presupuesto_id}/pasar-trabajo-pendiente", response_model=list[TrabajoPendienteResponse])
async def pasar_a_trabajo_pendiente(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[TrabajoPendienteResponse]:
    """
    Pasa todas las líneas aceptadas (y no pasadas aún) a trabajo_pendiente.
    Marca cada línea como pasado_trabajo_pendiente = True.
    """
    p = await _get_presupuesto_or_404(db, presupuesto_id)
    creadas: list[TrabajoPendiente] = []

    for linea in p.lineas:
        if linea.aceptado and not linea.pasado_trabajo_pendiente:
            tp = TrabajoPendiente(
                paciente_id=p.paciente_id,
                presupuesto_linea_id=linea.id,
                tratamiento_id=linea.tratamiento_id,
                pieza_dental=linea.pieza_dental,
                caras=linea.caras,
            )
            db.add(tp)
            linea.pasado_trabajo_pendiente = True
            creadas.append(tp)

    await db.commit()

    # Reload con relaciones
    resultado = []
    for tp in creadas:
        r = await db.execute(
            select(TrabajoPendiente)
            .options(selectinload(TrabajoPendiente.tratamiento))
            .where(TrabajoPendiente.id == tp.id)
        )
        resultado.append(TrabajoPendienteResponse.model_validate(r.scalar_one()))
    return resultado


# ─── TRABAJO PENDIENTE (por paciente) ────────────────────────────────────────

@router.get("/trabajo-pendiente/{paciente_id}", response_model=list[TrabajoPendienteResponse])
async def trabajo_pendiente_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    solo_pendiente: bool = Query(True),
) -> list[TrabajoPendienteResponse]:
    stmt = (
        select(TrabajoPendiente)
        .options(selectinload(TrabajoPendiente.tratamiento))
        .where(TrabajoPendiente.paciente_id == paciente_id)
        .order_by(TrabajoPendiente.created_at)
    )
    if solo_pendiente:
        stmt = stmt.where(TrabajoPendiente.realizado == False)  # noqa: E712
    result = await db.execute(stmt)
    return [TrabajoPendienteResponse.model_validate(tp) for tp in result.scalars().all()]


@router.patch("/trabajo-pendiente/{tp_id}/realizar", response_model=TrabajoPendienteResponse)
async def marcar_realizado(
    tp_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> TrabajoPendienteResponse:
    """Marca un trabajo pendiente como realizado."""
    result = await db.execute(
        select(TrabajoPendiente)
        .options(selectinload(TrabajoPendiente.tratamiento))
        .where(TrabajoPendiente.id == tp_id)
    )
    tp = result.scalar_one_or_none()
    if not tp:
        raise HTTPException(status_code=404, detail="Trabajo pendiente no encontrado")
    tp.realizado = True
    await db.commit()
    await db.refresh(tp)
    return TrabajoPendienteResponse.model_validate(tp)
