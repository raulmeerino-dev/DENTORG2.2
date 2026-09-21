"""HTTP adapter: request validation, role dependencies and response contracts."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    CurrentUser,
    RequireDoctor,
)
from app.database import get_db
from app.domains.clinical.application import recetas as use_cases
from app.domains.clinical.schemas.receta import (
    RecetaAnularRequest,
    RecetaCreate,
    RecetaEmitirRequest,
    RecetaFirmaUpdate,
    RecetaPlantillaResponse,
    RecetaPlantillaUpdate,
    RecetaProviderStatus,
    RecetaResponse,
    RecetaUpdate,
)

router = APIRouter()


@router.get("/provider-status", response_model=RecetaProviderStatus)
async def receta_provider_status(_: CurrentUser) -> RecetaProviderStatus:
    return await use_cases.receta_provider_status(_=_)


@router.get("/plantillas", response_model=list[RecetaPlantillaResponse])
async def listar_plantillas(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[RecetaPlantillaResponse]:
    return await use_cases.listar_plantillas(db=db, current_user=current_user)


@router.post("/plantillas", response_model=RecetaPlantillaResponse, status_code=status.HTTP_201_CREATED, dependencies=[RequireDoctor])
async def importar_plantilla(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    archivo: UploadFile = File(...),
    nombre: str = Form(...),
    campos_config: str | None = Form(None),
    requiere_dni: bool = Form(True),
    requiere_fecha_nacimiento: bool = Form(False),
) -> RecetaPlantillaResponse:
    return await use_cases.importar_plantilla(request=request, db=db, current_user=current_user, archivo=archivo, nombre=nombre, campos_config=campos_config, requiere_dni=requiere_dni, requiere_fecha_nacimiento=requiere_fecha_nacimiento)


@router.patch("/plantillas/{plantilla_id}", response_model=RecetaPlantillaResponse, dependencies=[RequireDoctor])
async def actualizar_plantilla(
    plantilla_id: uuid.UUID,
    data: RecetaPlantillaUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaPlantillaResponse:
    return await use_cases.actualizar_plantilla(plantilla_id=plantilla_id, data=data, request=request, db=db, current_user=current_user)


@router.get("", response_model=list[RecetaResponse])
async def listar_recetas(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: uuid.UUID | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> list[RecetaResponse]:
    return await use_cases.listar_recetas(db=db, current_user=current_user, paciente_id=paciente_id, limit=limit)


@router.post("/pacientes/{paciente_id}", response_model=RecetaResponse, status_code=status.HTTP_201_CREATED, dependencies=[RequireDoctor])
async def crear_receta(
    paciente_id: uuid.UUID,
    data: RecetaCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaResponse:
    return await use_cases.crear_receta(paciente_id=paciente_id, data=data, request=request, db=db, current_user=current_user)


@router.get("/{receta_id}", response_model=RecetaResponse)
async def obtener_receta(receta_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)], current_user: CurrentUser) -> RecetaResponse:
    return await use_cases.obtener_receta(receta_id=receta_id, db=db, current_user=current_user)


@router.patch("/{receta_id}", response_model=RecetaResponse, dependencies=[RequireDoctor])
async def actualizar_receta(
    receta_id: uuid.UUID,
    data: RecetaUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaResponse:
    return await use_cases.actualizar_receta(receta_id=receta_id, data=data, request=request, db=db, current_user=current_user)


@router.post("/{receta_id}/firma", response_model=RecetaResponse, dependencies=[RequireDoctor])
async def firmar_receta(receta_id: uuid.UUID, data: RecetaFirmaUpdate, request: Request, db: Annotated[AsyncSession, Depends(get_db)], current_user: CurrentUser) -> RecetaResponse:
    return await use_cases.firmar_receta(receta_id=receta_id, data=data, request=request, db=db, current_user=current_user)


@router.post("/{receta_id}/emitir-local", response_model=RecetaResponse, dependencies=[RequireDoctor])
async def emitir_receta_local(
    receta_id: uuid.UUID,
    data: RecetaEmitirRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaResponse:
    return await use_cases.emitir_receta_local(receta_id=receta_id, data=data, request=request, db=db, current_user=current_user)


@router.post("/{receta_id}/enviar-proveedor", response_model=RecetaResponse, dependencies=[RequireDoctor])
async def enviar_receta_proveedor(
    receta_id: uuid.UUID,
    data: RecetaEmitirRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaResponse:
    return await use_cases.enviar_receta_proveedor(receta_id=receta_id, data=data, request=request, db=db, current_user=current_user)


@router.post("/{receta_id}/anular", response_model=RecetaResponse, dependencies=[RequireDoctor])
async def anular_receta(
    receta_id: uuid.UUID,
    data: RecetaAnularRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaResponse:
    return await use_cases.anular_receta(receta_id=receta_id, data=data, request=request, db=db, current_user=current_user)


@router.get("/{receta_id}/pdf")
async def pdf_receta(
    receta_id: uuid.UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FileResponse:
    return await use_cases.pdf_receta(receta_id=receta_id, request=request, db=db, current_user=current_user)
