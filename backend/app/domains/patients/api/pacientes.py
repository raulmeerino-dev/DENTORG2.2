"""HTTP adapter: request validation, role dependencies and response contracts."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    CurrentUser,
    RequireAdmin,
    RequireDoctor,
)
from app.database import get_db
from app.domains.billing.schemas.factura import (
    PagoAnticipadoCreate,
    PagoAnticipadoResponse,
    PagoAnticipadoUpdate,
    SaldoPacienteResponse,
)
from app.domains.patients.application import pacientes as use_cases
from app.domains.patients.schemas.paciente import (
    AsignarReferenciasRequest,
    PacienteCreate,
    PacienteResponse,
    PacienteResumen,
    PacienteUpdate,
    ReferenciaCreate,
    ReferenciaResponse,
)
from app.domains.scheduling.schemas.cita import CitaResponse

router = APIRouter()


@router.get("", response_model=list[PacienteResumen])
async def listar_pacientes(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    q: str | None = Query(None, description="Texto libre: nombre, apellidos o código"),
    solo_activos: bool = Query(True),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[PacienteResumen]:
    return await use_cases.listar_pacientes(db=db, current_user=current_user, q=q, solo_activos=solo_activos, limit=limit, offset=offset)


@router.post("", response_model=PacienteResponse, status_code=status.HTTP_201_CREATED)
async def crear_paciente(
    data: PacienteCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PacienteResponse:
    # Cifrar campos sensibles
    return await use_cases.crear_paciente(data=data, db=db, current_user=current_user)


@router.get("/{paciente_id}", response_model=PacienteResponse)
async def obtener_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PacienteResponse:
    return await use_cases.obtener_paciente(paciente_id=paciente_id, db=db, current_user=current_user)


@router.patch("/{paciente_id}", response_model=PacienteResponse)
async def actualizar_paciente(
    paciente_id: UUID,
    data: PacienteUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PacienteResponse:
    return await use_cases.actualizar_paciente(paciente_id=paciente_id, data=data, request=request, db=db, current_user=current_user)


@router.delete("/{paciente_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def desactivar_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    return await use_cases.desactivar_paciente(paciente_id=paciente_id, db=db, current_user=current_user)


@router.get("/{paciente_id}/salud")
async def get_salud(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    __=RequireDoctor,
) -> dict:
    return await use_cases.get_salud(paciente_id=paciente_id, db=db, _=_, __=__)


@router.patch("/{paciente_id}/salud")
async def actualizar_salud(
    paciente_id: UUID,
    data: dict,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    __=RequireDoctor,
) -> dict:
    return await use_cases.actualizar_salud(paciente_id=paciente_id, data=data, db=db, _=_, __=__)


@router.get("/{paciente_id}/citas", response_model=list[CitaResponse])
async def proximas_citas_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[CitaResponse]:
    return await use_cases.proximas_citas_paciente(paciente_id=paciente_id, db=db, current_user=current_user)


@router.get("/{paciente_id}/saldo", response_model=SaldoPacienteResponse)
async def saldo_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> SaldoPacienteResponse:
    return await use_cases.saldo_paciente(paciente_id=paciente_id, db=db, current_user=current_user)


@router.get("/{paciente_id}/pagos-anticipados", response_model=list[PagoAnticipadoResponse])
async def listar_pagos_anticipados(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[PagoAnticipadoResponse]:
    return await use_cases.listar_pagos_anticipados(paciente_id=paciente_id, db=db, current_user=current_user)


@router.post("/{paciente_id}/pagos-anticipados", response_model=PagoAnticipadoResponse, status_code=201)
async def crear_pago_anticipado(
    paciente_id: UUID,
    data: PagoAnticipadoCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PagoAnticipadoResponse:
    return await use_cases.crear_pago_anticipado(paciente_id=paciente_id, data=data, request=request, db=db, current_user=current_user)


@router.patch("/{paciente_id}/pagos-anticipados/{pago_id}", response_model=PagoAnticipadoResponse)
async def actualizar_pago_anticipado(
    paciente_id: UUID,
    pago_id: UUID,
    data: PagoAnticipadoUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PagoAnticipadoResponse:
    return await use_cases.actualizar_pago_anticipado(paciente_id=paciente_id, pago_id=pago_id, data=data, request=request, db=db, current_user=current_user)


@router.get("/{paciente_id}/faltas", response_model=list[dict])
async def historial_faltas_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[dict]:
    return await use_cases.historial_faltas_paciente(paciente_id=paciente_id, db=db, current_user=current_user)


@router.get("/{paciente_id}/referencias", response_model=list[ReferenciaResponse])
async def listar_referencias_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[ReferenciaResponse]:
    return await use_cases.listar_referencias_paciente(paciente_id=paciente_id, db=db, current_user=current_user)


@router.put("/{paciente_id}/referencias", response_model=list[ReferenciaResponse])
async def asignar_referencias(
    paciente_id: UUID,
    data: AsignarReferenciasRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[ReferenciaResponse]:
    return await use_cases.asignar_referencias(paciente_id=paciente_id, data=data, db=db, current_user=current_user)


@router.get("/referencias/catalogo", response_model=list[ReferenciaResponse])
async def listar_catalogo_referencias(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[ReferenciaResponse]:
    return await use_cases.listar_catalogo_referencias(db=db, _=_)


@router.post("/referencias/catalogo", response_model=ReferenciaResponse, status_code=201, dependencies=[RequireAdmin])
async def crear_referencia(
    data: ReferenciaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReferenciaResponse:
    return await use_cases.crear_referencia(data=data, db=db)
