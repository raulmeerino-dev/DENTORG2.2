"""HTTP adapter: request validation, role dependencies and response contracts."""
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.permissions import (
    CurrentUser,
    RequireAdmin,
)
from app.database import get_db
from app.domains.communications.schemas.recordatorio import RecordatorioCreate, RecordatorioResponse
from app.domains.patients.schemas.paciente import PacienteResponse
from app.domains.scheduling.application import citas as use_cases
from app.domains.scheduling.application import jornada
from app.domains.scheduling.schemas.cita import (
    BuscarHuecoRequest,
    CitaCambioResponse,
    CitaCancelar,
    CitaCreate,
    CitaEstadoUpdate,
    CitaReprogramar,
    CitaResponse,
    CitaTelefonearCreate,
    CitaTelefonearResponse,
    CitaTelefonearUpdate,
    CitaUpdate,
    DisponibilidadDia,
    HuecoLibre,
    JornadaConfigResponse,
    PacienteProvisionalCreate,
    ResolverSalida,
)

router = APIRouter()


@router.get("", response_model=list[CitaResponse])
async def listar_citas(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    doctor_id: UUID | None = Query(None),
    paciente_id: UUID | None = Query(None),
    fecha_desde: datetime | None = Query(None),
    fecha_hasta: datetime | None = Query(None),
    pendiente_salida: bool | None = Query(None),
    estado: str | None = Query(None, pattern=r"^(programada|confirmada|en_clinica|en_atencion|atendida|falta|anulada|pending_confirmation|confirmed|reminder_sent|reschedule_requested|cancelled_by_patient|pending_manual_review|rescheduled)$"),
) -> list[CitaResponse]:
    return await use_cases.listar_citas(db=db, current_user=current_user, doctor_id=doctor_id, paciente_id=paciente_id, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, estado=estado, pendiente_salida=pendiente_salida)


@router.post("", response_model=CitaResponse, status_code=status.HTTP_201_CREATED)
async def crear_cita(
    data: CitaCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    # Verificar que paciente y doctor existen
    return await use_cases.crear_cita(data=data, request=request, db=db, current_user=current_user)


@router.get("/buscar-hueco", response_model=list[HuecoLibre])
async def buscar_hueco(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    doctor_id: UUID = Query(...),
    duracion_min: int = Query(30, ge=5, le=480, multiple_of=5),
    desde: datetime = Query(...),
    hasta: datetime = Query(...),
    solo_manana: bool = Query(False),
    solo_tarde: bool = Query(False),
    max_resultados: int = Query(20, ge=1, le=100),
    gabinete_id: UUID | None = Query(None),
) -> list[HuecoLibre]:
    return await use_cases.buscar_hueco(db=db, current_user=current_user, doctor_id=doctor_id, duracion_min=duracion_min, desde=desde, hasta=hasta, solo_manana=solo_manana, solo_tarde=solo_tarde, max_resultados=max_resultados, gabinete_id=gabinete_id)


@router.post("/buscar-hueco", response_model=list[HuecoLibre])
async def buscar_hueco_post(
    data: BuscarHuecoRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[HuecoLibre]:
    return await use_cases.buscar_hueco_post(data=data, db=db, current_user=current_user)


@router.get("/disponibilidad", response_model=list[DisponibilidadDia])
async def disponibilidad_doctor(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    doctor_id: UUID = Query(...),
    desde: datetime = Query(...),
    dias: int = Query(7, ge=1, le=60),
) -> list[DisponibilidadDia]:
    return await use_cases.disponibilidad_doctor(db=db, current_user=current_user, doctor_id=doctor_id, desde=desde, dias=dias)


@router.patch("/{cita_id}/reprogramar", response_model=CitaResponse)
async def reprogramar_cita(
    cita_id: UUID,
    data: CitaReprogramar,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    return await use_cases.reprogramar_cita(cita_id=cita_id, data=data, request=request, db=db, current_user=current_user)


@router.patch("/{cita_id}/estado", response_model=CitaResponse)
async def cambiar_estado_cita(
    cita_id: UUID,
    data: CitaEstadoUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    return await use_cases.cambiar_estado_cita(cita_id=cita_id, data=data, request=request, db=db, current_user=current_user)


@router.post("/{cita_id}/confirmar", response_model=CitaResponse)
async def confirmar_cita(
    cita_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    return await use_cases.confirmar_cita(cita_id=cita_id, request=request, db=db, current_user=current_user)


@router.post("/{cita_id}/cancelar", response_model=CitaResponse)
async def cancelar_cita(
    cita_id: UUID,
    data: CitaCancelar,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    return await use_cases.cancelar_cita(cita_id=cita_id, data=data, request=request, db=db, current_user=current_user)


@router.post("/{cita_id}/marcar-falta", response_model=CitaResponse)
async def marcar_falta_cita(
    cita_id: UUID,
    data: CitaCancelar,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    return await use_cases.marcar_falta_cita(cita_id=cita_id, data=data, request=request, db=db, current_user=current_user)


@router.get("/{cita_id}/cambios", response_model=list[CitaCambioResponse])
async def historial_cambios_cita(
    cita_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[CitaCambioResponse]:
    return await use_cases.historial_cambios_cita(cita_id=cita_id, db=db, current_user=current_user)


@router.get("/panel/telefonear/pendientes", response_model=list[CitaTelefonearResponse])
async def listar_telefonear_panel(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    doctor_id: UUID | None = Query(None),
) -> list[CitaTelefonearResponse]:
    return await use_cases.listar_telefonear_panel(db=db, current_user=current_user, doctor_id=doctor_id)


@router.post("/paciente-provisional", response_model=PacienteResponse, status_code=201)
async def crear_paciente_provisional(data: PacienteProvisionalCreate, db: Annotated[AsyncSession, Depends(get_db)], current_user: CurrentUser) -> PacienteResponse:
    return await jornada.create_provisional_patient(db, current_user, data)


@router.get("/jornada/config", response_model=JornadaConfigResponse)
async def jornada_config(_: CurrentUser) -> JornadaConfigResponse:
    settings = get_settings()
    return JornadaConfigResponse(espera_aviso_min=settings.waiting_room_warning_minutes, espera_critica_min=max(settings.waiting_room_warning_minutes + 1, settings.waiting_room_critical_minutes), duracion_habitual_min=settings.appointment_default_duration_minutes)


@router.post("/{cita_id}/llegada", response_model=CitaResponse)
async def registrar_llegada(cita_id: UUID, request: Request, db: Annotated[AsyncSession, Depends(get_db)], current_user: CurrentUser) -> CitaResponse:
    return await jornada.transition_visit(db, cita_id, current_user, request, target="en_clinica", action="llegada")


@router.post("/{cita_id}/iniciar-atencion", response_model=CitaResponse)
async def iniciar_atencion(cita_id: UUID, request: Request, db: Annotated[AsyncSession, Depends(get_db)], current_user: CurrentUser) -> CitaResponse:
    return await jornada.transition_visit(db, cita_id, current_user, request, target="en_atencion", action="iniciar_atencion")


@router.post("/{cita_id}/finalizar-visita", response_model=CitaResponse)
async def finalizar_visita(cita_id: UUID, request: Request, db: Annotated[AsyncSession, Depends(get_db)], current_user: CurrentUser) -> CitaResponse:
    return await jornada.transition_visit(db, cita_id, current_user, request, target="atendida", action="finalizar_visita")


@router.post("/{cita_id}/resolver-salida", response_model=CitaResponse)
async def resolver_salida(cita_id: UUID, request: Request, db: Annotated[AsyncSession, Depends(get_db)], current_user: CurrentUser, data: ResolverSalida | None = None) -> CitaResponse:
    return await jornada.resolve_checkout(db, cita_id, current_user, request, data.observaciones if data else None)


@router.get("/{cita_id}", response_model=CitaResponse)
async def obtener_cita(
    cita_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    return await use_cases.obtener_cita(cita_id=cita_id, db=db, current_user=current_user)


@router.post("/{cita_id}/recordatorio", response_model=RecordatorioResponse)
async def enviar_recordatorio(
    cita_id: UUID,
    data: RecordatorioCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecordatorioResponse:
    return await use_cases.enviar_recordatorio(cita_id=cita_id, data=data, request=request, db=db, current_user=current_user)


@router.patch("/{cita_id}", response_model=CitaResponse)
async def actualizar_cita(
    cita_id: UUID,
    data: CitaUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    return await use_cases.actualizar_cita(cita_id=cita_id, data=data, request=request, db=db, current_user=current_user)


@router.delete("/{cita_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def anular_cita(
    cita_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    return await use_cases.anular_cita(cita_id=cita_id, db=db, current_user=current_user)


@router.get("/{cita_id}/faltas-paciente", response_model=list[dict])
async def contar_faltas_paciente(
    cita_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[dict]:
    return await use_cases.contar_faltas_paciente(cita_id=cita_id, db=db, current_user=current_user)


@router.get("/telefonear/pendientes", response_model=list[CitaTelefonearResponse])
async def listar_telefonear(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    doctor_id: UUID | None = Query(None),
) -> list[CitaTelefonearResponse]:
    return await use_cases.listar_telefonear(db=db, current_user=current_user, doctor_id=doctor_id)


@router.post("/telefonear", response_model=CitaTelefonearResponse, status_code=status.HTTP_201_CREATED)
async def crear_telefonear(
    data: CitaTelefonearCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaTelefonearResponse:
    return await use_cases.crear_telefonear(data=data, db=db, current_user=current_user)


@router.patch("/telefonear/{entrada_id}", response_model=CitaTelefonearResponse)
async def actualizar_telefonear(
    entrada_id: UUID,
    data: CitaTelefonearUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaTelefonearResponse:
    return await use_cases.actualizar_telefonear(entrada_id=entrada_id, data=data, db=db, current_user=current_user)


@router.patch("/telefonear/{entrada_id}/reubicar", response_model=CitaTelefonearResponse)
async def marcar_reubicada(
    entrada_id: UUID,
    nueva_cita_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaTelefonearResponse:
    return await use_cases.marcar_reubicada(entrada_id=entrada_id, nueva_cita_id=nueva_cita_id, db=db, current_user=current_user)
