"""HTTP adapter: request validation, role dependencies and response contracts."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    CurrentUser,
)
from app.database import get_db
from app.domains.clinical.application import odontograma as use_cases
from app.domains.clinical.schemas.odontograma import (
    OdontogramaContextMode,
    OdontogramaContextResponse,
    OdontogramaEventoResponse,
    OdontogramaPiezaResponse,
    OdontogramaPiezaUpdate,
    OdontogramaResponse,
    OdontogramaSuperficieResponse,
    OdontogramaSuperficieUpdate,
    PlanTratamientoCreate,
    PlanTratamientoResponse,
    SuperficieDental,
)

router = APIRouter()


@router.get("/pacientes/{paciente_id}/odontograma", response_model=OdontogramaResponse)
async def obtener_odontograma_paciente(
    paciente_id: UUID,
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> OdontogramaResponse:
    return await use_cases.obtener_odontograma_paciente(paciente_id=paciente_id, request=request, current_user=current_user, db=db)


@router.get("/pacientes/{paciente_id}/odontograma/contexto", response_model=OdontogramaContextResponse)
async def obtener_odontograma_contexto(
    paciente_id: UUID,
    request: Request,
    current_user: CurrentUser,
    mode: OdontogramaContextMode = Query("lectura"),
    context_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> OdontogramaContextResponse:
    return await use_cases.obtener_odontograma_contexto(paciente_id=paciente_id, request=request, current_user=current_user, mode=mode, context_id=context_id, db=db)


@router.post("/pacientes/{paciente_id}/odontograma", response_model=OdontogramaResponse, status_code=201)
async def crear_odontograma_paciente(
    paciente_id: UUID,
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> OdontogramaResponse:
    return await use_cases.crear_odontograma_paciente(paciente_id=paciente_id, request=request, current_user=current_user, db=db)


@router.patch("/odontograma/{odontograma_id}/pieza/{pieza_fdi}", response_model=OdontogramaPiezaResponse)
@router.patch("/odontogramas/{odontograma_id}/piezas/{pieza_fdi}", response_model=OdontogramaPiezaResponse)
async def actualizar_pieza(
    odontograma_id: UUID,
    pieza_fdi: int,
    data: OdontogramaPiezaUpdate,
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> OdontogramaPiezaResponse:
    return await use_cases.actualizar_pieza(odontograma_id=odontograma_id, pieza_fdi=pieza_fdi, data=data, request=request, current_user=current_user, db=db)


@router.patch(
    "/odontograma/{odontograma_id}/pieza/{pieza_fdi}/superficie/{superficie}",
    response_model=OdontogramaSuperficieResponse,
)
@router.patch(
    "/odontogramas/{odontograma_id}/piezas/{pieza_fdi}/superficies/{superficie}",
    response_model=OdontogramaSuperficieResponse,
)
async def actualizar_superficie(
    odontograma_id: UUID,
    pieza_fdi: int,
    superficie: SuperficieDental,
    data: OdontogramaSuperficieUpdate,
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> OdontogramaSuperficieResponse:
    return await use_cases.actualizar_superficie(odontograma_id=odontograma_id, pieza_fdi=pieza_fdi, superficie=superficie, data=data, request=request, current_user=current_user, db=db)


@router.post("/odontograma/{odontograma_id}/plan-tratamiento", response_model=PlanTratamientoResponse, status_code=201)
@router.post("/odontogramas/{odontograma_id}/generar-presupuesto", response_model=PlanTratamientoResponse, status_code=201)
async def crear_presupuesto_desde_plan(
    odontograma_id: UUID,
    data: PlanTratamientoCreate,
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> PlanTratamientoResponse:
    return await use_cases.crear_presupuesto_desde_plan(odontograma_id=odontograma_id, data=data, request=request, current_user=current_user, db=db)


@router.get("/odontograma/{odontograma_id}/historial", response_model=list[OdontogramaEventoResponse])
@router.get("/odontogramas/{odontograma_id}/historial", response_model=list[OdontogramaEventoResponse])
async def historial_odontograma(
    odontograma_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[OdontogramaEventoResponse]:
    return await use_cases.historial_odontograma(odontograma_id=odontograma_id, current_user=current_user, db=db)


@router.post("/odontograma/{odontograma_id}/duplicar-version", response_model=OdontogramaResponse, status_code=201)
async def duplicar_version_odontograma(
    odontograma_id: UUID,
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> OdontogramaResponse:
    return await use_cases.duplicar_version_odontograma(odontograma_id=odontograma_id, request=request, current_user=current_user, db=db)
