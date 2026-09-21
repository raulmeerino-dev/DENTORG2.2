"""HTTP adapter: request validation, role dependencies and response contracts."""
from datetime import date as date_type
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    CurrentUser,
    RequireAdmin,
)
from app.database import get_db
from app.domains.billing.application import plan_invoicing
from app.domains.billing.schemas.factura import FacturaResponse
from app.domains.treatment_plans.application import presupuestos as use_cases
from app.domains.treatment_plans.schemas.presupuesto import (
    OdontogramaPlanResponse,
    OdontogramaPlanUpdate,
    PresupuestoAceptarCreate,
    PresupuestoConvertirFacturaCreate,
    PresupuestoCreate,
    PresupuestoLineaCreate,
    PresupuestoLineaResponse,
    PresupuestoLineaUpdate,
    PresupuestoRechazarCreate,
    PresupuestoResponse,
    PresupuestoUpdate,
    TrabajoPendienteResponse,
)

router = APIRouter()


@router.get("", response_model=list[PresupuestoResponse])
async def listar_presupuestos(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(None),
    estado: str | None = Query(None),
    desde: date_type | None = Query(None),
    hasta: date_type | None = Query(None),
) -> list[PresupuestoResponse]:
    return await use_cases.listar_presupuestos(db=db, current_user=current_user, paciente_id=paciente_id, estado=estado, desde=desde, hasta=hasta)


@router.post("", response_model=PresupuestoResponse, status_code=201)
async def crear_presupuesto(
    data: PresupuestoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoResponse:
    return await use_cases.crear_presupuesto(data=data, db=db, current_user=current_user)


@router.get("/{presupuesto_id}", response_model=PresupuestoResponse)
async def obtener_presupuesto(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoResponse:
    return await use_cases.obtener_presupuesto(presupuesto_id=presupuesto_id, db=db, current_user=current_user)


@router.get("/{presupuesto_id}/odontograma", response_model=OdontogramaPlanResponse)
async def obtener_odontograma_plan(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> OdontogramaPlanResponse:
    return await use_cases.obtener_odontograma_plan(presupuesto_id=presupuesto_id, db=db, current_user=current_user)


@router.put("/{presupuesto_id}/odontograma", response_model=OdontogramaPlanResponse)
async def guardar_odontograma_plan(
    presupuesto_id: UUID,
    data: OdontogramaPlanUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> OdontogramaPlanResponse:
    return await use_cases.guardar_odontograma_plan(presupuesto_id=presupuesto_id, data=data, db=db, current_user=current_user)


@router.patch("/{presupuesto_id}", response_model=PresupuestoResponse)
async def actualizar_presupuesto(
    presupuesto_id: UUID,
    data: PresupuestoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoResponse:
    return await use_cases.actualizar_presupuesto(presupuesto_id=presupuesto_id, data=data, db=db, current_user=current_user)


@router.post("/{presupuesto_id}/presentar", response_model=PresupuestoResponse)
async def presentar_presupuesto(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoResponse:
    return await use_cases.presentar_presupuesto(presupuesto_id=presupuesto_id, db=db, current_user=current_user)


@router.post("/{presupuesto_id}/aceptar", response_model=PresupuestoResponse)
async def aceptar_presupuesto(
    presupuesto_id: UUID,
    data: PresupuestoAceptarCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoResponse:
    return await use_cases.aceptar_presupuesto(presupuesto_id=presupuesto_id, data=data, db=db, current_user=current_user)


@router.post("/{presupuesto_id}/rechazar", response_model=PresupuestoResponse)
async def rechazar_presupuesto(
    presupuesto_id: UUID,
    data: PresupuestoRechazarCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoResponse:
    return await use_cases.rechazar_presupuesto(presupuesto_id=presupuesto_id, data=data, db=db, current_user=current_user)


@router.post("/{presupuesto_id}/convertir-a-factura", response_model=FacturaResponse, status_code=201)
async def convertir_presupuesto_a_factura(
    presupuesto_id: UUID,
    data: PresupuestoConvertirFacturaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    return await plan_invoicing.convertir_presupuesto_a_factura(presupuesto_id=presupuesto_id, data=data, db=db, current_user=current_user)


@router.delete("/{presupuesto_id}", status_code=204, dependencies=[RequireAdmin])
async def eliminar_presupuesto(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    return await use_cases.eliminar_presupuesto(presupuesto_id=presupuesto_id, db=db)


@router.post("/{presupuesto_id}/lineas", response_model=PresupuestoLineaResponse, status_code=201)
async def anadir_linea(
    presupuesto_id: UUID,
    data: PresupuestoLineaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoLineaResponse:
    return await use_cases.anadir_linea(presupuesto_id=presupuesto_id, data=data, db=db, current_user=current_user)


@router.patch("/{presupuesto_id}/lineas/{linea_id}", response_model=PresupuestoLineaResponse)
async def actualizar_linea(
    presupuesto_id: UUID,
    linea_id: UUID,
    data: PresupuestoLineaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoLineaResponse:
    return await use_cases.actualizar_linea(presupuesto_id=presupuesto_id, linea_id=linea_id, data=data, db=db, current_user=current_user)


@router.delete("/{presupuesto_id}/lineas/{linea_id}", status_code=204)
async def eliminar_linea(
    presupuesto_id: UUID,
    linea_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    return await use_cases.eliminar_linea(presupuesto_id=presupuesto_id, linea_id=linea_id, db=db, current_user=current_user)


@router.post("/{presupuesto_id}/pasar-trabajo-pendiente", response_model=list[TrabajoPendienteResponse])
async def pasar_a_trabajo_pendiente(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[TrabajoPendienteResponse]:
    return await use_cases.pasar_a_trabajo_pendiente(presupuesto_id=presupuesto_id, db=db, current_user=current_user)


@router.get("/trabajo-pendiente/{paciente_id}", response_model=list[TrabajoPendienteResponse])
async def trabajo_pendiente_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    solo_pendiente: bool = Query(True),
) -> list[TrabajoPendienteResponse]:
    return await use_cases.trabajo_pendiente_paciente(paciente_id=paciente_id, db=db, current_user=current_user, solo_pendiente=solo_pendiente)


@router.patch("/trabajo-pendiente/{tp_id}/realizar", response_model=TrabajoPendienteResponse)
async def marcar_realizado(
    tp_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> TrabajoPendienteResponse:
    return await use_cases.marcar_realizado(tp_id=tp_id, db=db, current_user=current_user)
