"""HTTP adapter: request validation, role dependencies and response contracts."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import CurrentUser, RequireAdmin
from app.database import get_db
from app.domains.clinical.application import catalogo, historial, sesiones
from app.domains.clinical.schemas.tratamiento import (
    FamiliaCreate,
    FamiliaResponse,
    FamiliaUpdate,
    HistorialCreate,
    HistorialResponse,
    HistorialUpdate,
    NotaDentalCreate,
    NotaDentalResponse,
    SesionClinicaItemCreate,
    SesionClinicaItemResponse,
    SesionClinicaItemUpdate,
    SesionTratamientoRealizadoCreate,
    TratamientoCreate,
    TratamientoResponse,
    TratamientoUpdate,
)

router = APIRouter()


@router.get("/familias", response_model=list[FamiliaResponse])
async def listar_familias(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[FamiliaResponse]:
    return await catalogo.listar_familias(db=db, _=_)


@router.post("/familias", response_model=FamiliaResponse, status_code=201, dependencies=[RequireAdmin])
async def crear_familia(
    data: FamiliaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FamiliaResponse:
    return await catalogo.crear_familia(data=data, db=db)


@router.patch("/familias/{familia_id}", response_model=FamiliaResponse, dependencies=[RequireAdmin])
async def actualizar_familia(
    familia_id: UUID,
    data: FamiliaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FamiliaResponse:
    return await catalogo.actualizar_familia(familia_id=familia_id, data=data, db=db)


@router.get("", response_model=list[TratamientoResponse])
async def listar_tratamientos(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    familia_id: UUID | None = Query(None),
    solo_activos: bool = Query(True),
    q: str | None = Query(None),
) -> list[TratamientoResponse]:
    return await catalogo.listar_tratamientos(db=db, _=_, familia_id=familia_id, solo_activos=solo_activos, q=q)


@router.post("", response_model=TratamientoResponse, status_code=201, dependencies=[RequireAdmin])
async def crear_tratamiento(
    data: TratamientoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TratamientoResponse:
    return await catalogo.crear_tratamiento(data=data, db=db)


@router.patch("/{tratamiento_id}", response_model=TratamientoResponse, dependencies=[RequireAdmin])
async def actualizar_tratamiento(
    tratamiento_id: UUID,
    data: TratamientoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TratamientoResponse:
    return await catalogo.actualizar_tratamiento(tratamiento_id=tratamiento_id, data=data, db=db)


@router.delete("/{tratamiento_id}", response_model=TratamientoResponse, dependencies=[RequireAdmin])
async def desactivar_tratamiento(
    tratamiento_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TratamientoResponse:
    return await catalogo.desactivar_tratamiento(tratamiento_id=tratamiento_id, db=db)


@router.get("/historial/{paciente_id}", response_model=list[HistorialResponse])
async def historial_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    pieza: int | None = Query(None, description="Filtrar por pieza FDI"),
) -> list[HistorialResponse]:
    return await historial.historial_paciente(paciente_id=paciente_id, db=db, current_user=current_user, pieza=pieza)


@router.post("/historial", response_model=HistorialResponse, status_code=201)
async def registrar_tratamiento(
    data: HistorialCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> HistorialResponse:
    return await historial.registrar_tratamiento(data=data, db=db, current_user=current_user, request=request)


@router.get("/notas-dentales/{paciente_id}", response_model=list[NotaDentalResponse])
async def notas_dentales_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    pieza: int | None = Query(None, description="Filtrar por pieza FDI"),
) -> list[NotaDentalResponse]:
    return await historial.notas_dentales_paciente(paciente_id=paciente_id, db=db, current_user=current_user, pieza=pieza)


@router.post("/notas-dentales", response_model=NotaDentalResponse, status_code=201)
async def crear_nota_dental(
    data: NotaDentalCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> NotaDentalResponse:
    return await historial.crear_nota_dental(data=data, db=db, current_user=current_user)


@router.get(
    "/pacientes/{paciente_id}/sesion-items",
    response_model=list[SesionClinicaItemResponse],
)
async def listar_sesion_items(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    incluir_realizados: bool = Query(
        False,
        description="Si es false, devuelve solo los items con estado != 'realizado'.",
    ),
) -> list[SesionClinicaItemResponse]:
    return await sesiones.listar_sesion_items(paciente_id=paciente_id, db=db, current_user=current_user, incluir_realizados=incluir_realizados)


@router.post(
    "/pacientes/{paciente_id}/sesion-items",
    response_model=SesionClinicaItemResponse,
    status_code=201,
)
async def crear_sesion_item(
    paciente_id: UUID,
    data: SesionClinicaItemCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> SesionClinicaItemResponse:
    return await sesiones.crear_sesion_item(paciente_id=paciente_id, data=data, db=db, current_user=current_user)


@router.patch(
    "/pacientes/{paciente_id}/sesion-items/{item_id}",
    response_model=SesionClinicaItemResponse,
)
async def actualizar_sesion_item(
    paciente_id: UUID,
    item_id: UUID,
    data: SesionClinicaItemUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> SesionClinicaItemResponse:
    return await sesiones.actualizar_sesion_item(paciente_id=paciente_id, item_id=item_id, data=data, db=db, current_user=current_user)


@router.delete(
    "/pacientes/{paciente_id}/sesion-items/{item_id}",
    status_code=204,
)
async def eliminar_sesion_item(
    paciente_id: UUID,
    item_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    return await sesiones.eliminar_sesion_item(paciente_id=paciente_id, item_id=item_id, db=db, current_user=current_user)


@router.post("/historial/sesion-realizada", response_model=HistorialResponse, status_code=201)
async def finalizar_tratamiento_sesion(
    data: SesionTratamientoRealizadoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> HistorialResponse:
    return await sesiones.finalizar_tratamiento_sesion(data=data, db=db, current_user=current_user)


@router.patch("/historial/{entrada_id}", response_model=HistorialResponse)
async def actualizar_entrada_historial(
    entrada_id: UUID,
    data: HistorialUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> HistorialResponse:
    return await historial.actualizar_entrada_historial(entrada_id=entrada_id, data=data, db=db, current_user=current_user, request=request)


@router.delete("/historial/{entrada_id}", status_code=204, dependencies=[RequireAdmin])
async def eliminar_entrada_historial(
    entrada_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    return await historial.eliminar_entrada_historial(entrada_id=entrada_id, db=db, current_user=current_user)
