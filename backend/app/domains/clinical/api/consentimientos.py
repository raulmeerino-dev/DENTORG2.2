"""HTTP adapter: request validation, role dependencies and response contracts."""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    CurrentUser,
    TokenData,
    require_admin,
)
from app.database import get_db
from app.domains.clinical.application import consentimientos as use_cases
from app.domains.clinical.schemas.consentimientos import (
    ConsentimientoCreate,
    ConsentimientoFirmar,
    ConsentimientoResponse,
    ConsentimientoRevocar,
    ConsentimientoUpdate,
    PlantillaConsentimientoCreate,
    PlantillaConsentimientoResponse,
)

router = APIRouter()


@router.get("/consentimientos/plantillas", response_model=list[PlantillaConsentimientoResponse])
async def listar_plantillas_consentimiento(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[PlantillaConsentimientoResponse]:
    return await use_cases.listar_plantillas_consentimiento(db=db, current_user=current_user)


@router.post("/consentimientos/plantillas", response_model=PlantillaConsentimientoResponse, status_code=status.HTTP_201_CREATED)
async def crear_plantilla_consentimiento(
    data: PlantillaConsentimientoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> PlantillaConsentimientoResponse:
    return await use_cases.crear_plantilla_consentimiento(data=data, db=db, current_user=current_user, request=request)


@router.get("/pacientes/{paciente_id}/consentimientos", response_model=list[ConsentimientoResponse])
async def listar_consentimientos_paciente(
    paciente_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[ConsentimientoResponse]:
    return await use_cases.listar_consentimientos_paciente(paciente_id=paciente_id, db=db, current_user=current_user)


@router.post("/pacientes/{paciente_id}/consentimientos", response_model=ConsentimientoResponse, status_code=status.HTTP_201_CREATED)
async def crear_consentimiento_paciente(
    paciente_id: uuid.UUID,
    data: ConsentimientoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> ConsentimientoResponse:
    return await use_cases.crear_consentimiento_paciente(paciente_id=paciente_id, data=data, db=db, current_user=current_user, request=request)


@router.patch("/pacientes/{paciente_id}/consentimientos/{consentimiento_id}", response_model=ConsentimientoResponse)
async def actualizar_consentimiento_paciente(
    paciente_id: uuid.UUID,
    consentimiento_id: uuid.UUID,
    data: ConsentimientoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> ConsentimientoResponse:
    return await use_cases.actualizar_consentimiento_paciente(paciente_id=paciente_id, consentimiento_id=consentimiento_id, data=data, db=db, current_user=current_user, request=request)


@router.post("/consentimientos/{consentimiento_id}/firmar", response_model=ConsentimientoResponse)
async def firmar_consentimiento(
    consentimiento_id: uuid.UUID,
    data: ConsentimientoFirmar,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> ConsentimientoResponse:
    return await use_cases.firmar_consentimiento(consentimiento_id=consentimiento_id, data=data, db=db, current_user=current_user, request=request)


@router.post("/consentimientos/{consentimiento_id}/revocar", response_model=ConsentimientoResponse)
async def revocar_consentimiento(
    consentimiento_id: uuid.UUID,
    data: ConsentimientoRevocar,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> ConsentimientoResponse:
    return await use_cases.revocar_consentimiento(consentimiento_id=consentimiento_id, data=data, db=db, current_user=current_user, request=request)


@router.get("/consentimientos/{consentimiento_id}/pdf")
async def descargar_pdf_consentimiento(
    consentimiento_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
):
    return await use_cases.descargar_pdf_consentimiento(consentimiento_id=consentimiento_id, db=db, current_user=current_user)
