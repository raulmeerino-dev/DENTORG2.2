"""HTTP adapter: request validation, role dependencies and response contracts."""
import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    CurrentUser,
    RequireAdmin,
)
from app.database import get_db
from app.domains.laboratory.application import laboratorio as use_cases
from app.domains.laboratory.schemas.laboratorio import (
    AgendaLaboratorioDiaResponse,
    AgendaLaboratorioResumen,
    LaboratorioCreate,
    LaboratorioResponse,
    LaboratorioUpdate,
    TrabajoAsociarCita,
    TrabajoCreate,
    TrabajoEstadoAccion,
    TrabajoResponse,
    TrabajoUpdate,
)

router = APIRouter()


@router.get("/laboratorios", response_model=list[LaboratorioResponse])
async def listar_laboratorios(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    solo_activos: bool = Query(True),
) -> list[LaboratorioResponse]:
    return await use_cases.listar_laboratorios(db=db, _=_, solo_activos=solo_activos)


@router.post("/laboratorios", response_model=LaboratorioResponse, status_code=status.HTTP_201_CREATED, dependencies=[RequireAdmin])
async def crear_laboratorio(
    data: LaboratorioCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LaboratorioResponse:
    return await use_cases.crear_laboratorio(data=data, db=db)


@router.patch("/laboratorios/{lab_id}", response_model=LaboratorioResponse, dependencies=[RequireAdmin])
async def actualizar_laboratorio(
    lab_id: uuid.UUID,
    data: LaboratorioUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LaboratorioResponse:
    return await use_cases.actualizar_laboratorio(lab_id=lab_id, data=data, db=db)


@router.get("/laboratorio/trabajos", response_model=list[TrabajoResponse])
async def listar_trabajos(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    laboratorio_id: uuid.UUID | None = Query(None),
    paciente_id: uuid.UUID | None = Query(None),
    cita_id: uuid.UUID | None = Query(None),
    doctor_id: uuid.UUID | None = Query(None),
    estado: str | None = Query(None),
    pendientes: bool = Query(False),  # solo estados activos (pendiente/enviado/en_proceso)
    proximos: bool = Query(False),    # con entrega prevista en proximos 7 dias y aun no recibidos
    vencidos: bool = Query(False),    # entrega prevista pasada y aun no recibidos
) -> list[TrabajoResponse]:
    return await use_cases.listar_trabajos(db=db, current_user=current_user, laboratorio_id=laboratorio_id, paciente_id=paciente_id, cita_id=cita_id, doctor_id=doctor_id, estado=estado, pendientes=pendientes, proximos=proximos, vencidos=vencidos)


@router.post("/laboratorio/trabajos", response_model=TrabajoResponse, status_code=status.HTTP_201_CREATED)
async def crear_trabajo(
    data: TrabajoCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> TrabajoResponse:
    return await use_cases.crear_trabajo(data=data, request=request, db=db, current_user=current_user)


@router.patch("/laboratorio/trabajos/{trabajo_id}", response_model=TrabajoResponse)
async def actualizar_trabajo(
    trabajo_id: uuid.UUID,
    data: TrabajoUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> TrabajoResponse:
    return await use_cases.actualizar_trabajo(trabajo_id=trabajo_id, data=data, request=request, db=db, current_user=current_user)


@router.get("/laboratorio/citas/{cita_id}/trabajos", response_model=list[TrabajoResponse])
async def trabajos_por_cita(
    cita_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[TrabajoResponse]:
    return await use_cases.trabajos_por_cita(cita_id=cita_id, db=db, current_user=current_user)


@router.patch("/laboratorio/trabajos/{trabajo_id}/asociar-cita", response_model=TrabajoResponse)
async def asociar_trabajo_a_cita(
    trabajo_id: uuid.UUID,
    data: TrabajoAsociarCita,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> TrabajoResponse:
    return await use_cases.asociar_trabajo_a_cita(trabajo_id=trabajo_id, data=data, request=request, db=db, current_user=current_user)


@router.post("/laboratorio/trabajos/{trabajo_id}/recibir", response_model=TrabajoResponse)
async def marcar_trabajo_recibido(
    trabajo_id: uuid.UUID,
    data: TrabajoEstadoAccion,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> TrabajoResponse:
    return await use_cases.marcar_trabajo_recibido(trabajo_id=trabajo_id, data=data, request=request, db=db, current_user=current_user)


@router.post("/laboratorio/trabajos/{trabajo_id}/revisar", response_model=TrabajoResponse)
async def marcar_trabajo_revisado(
    trabajo_id: uuid.UUID,
    data: TrabajoEstadoAccion,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> TrabajoResponse:
    return await use_cases.marcar_trabajo_revisado(trabajo_id=trabajo_id, data=data, request=request, db=db, current_user=current_user)


@router.post("/laboratorio/trabajos/{trabajo_id}/entregar", response_model=TrabajoResponse)
async def marcar_trabajo_entregado(
    trabajo_id: uuid.UUID,
    data: TrabajoEstadoAccion,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> TrabajoResponse:
    return await use_cases.marcar_trabajo_entregado(trabajo_id=trabajo_id, data=data, request=request, db=db, current_user=current_user)


@router.get("/laboratorio/agenda/dia", response_model=AgendaLaboratorioDiaResponse)
async def trabajos_laboratorio_agenda_dia(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    fecha: date = Query(...),
    doctor_id: uuid.UUID | None = Query(None),
) -> AgendaLaboratorioDiaResponse:
    return await use_cases.trabajos_laboratorio_agenda_dia(db=db, current_user=current_user, fecha=fecha, doctor_id=doctor_id)


@router.get("/laboratorio/agenda/resumen", response_model=AgendaLaboratorioResumen)
async def resumen_laboratorio_agenda_dia(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    fecha: date = Query(...),
    doctor_id: uuid.UUID | None = Query(None),
) -> AgendaLaboratorioResumen:
    return await use_cases.resumen_laboratorio_agenda_dia(db=db, current_user=current_user, fecha=fecha, doctor_id=doctor_id)


@router.delete("/laboratorio/trabajos/{trabajo_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def eliminar_trabajo(
    trabajo_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    return await use_cases.eliminar_trabajo(trabajo_id=trabajo_id, db=db, current_user=current_user)
