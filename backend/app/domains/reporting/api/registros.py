"""HTTP adapter for permission-aware, server-paginated read models."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import CurrentUser, RequireStaff
from app.database import get_db
from app.domains.identity.schemas.admin import AuditLogResponse
from app.domains.reporting.application import registros as service
from app.domains.reporting.application.registros_catalogo import catalog_for_user
from app.domains.reporting.schemas.registros import (
    RegistroCatalogo,
    RegistroFilters,
    RegistroLookup,
    RegistroResult,
)

router = APIRouter(dependencies=[RequireStaff])


@router.get("/catalogo", response_model=RegistroCatalogo)
async def catalogo(current_user: CurrentUser, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return RegistroCatalogo(views=catalog_for_user(current_user))


@router.get("/opciones/{tipo}", response_model=list[RegistroLookup])
async def opciones(tipo: str, db: Annotated[AsyncSession, Depends(get_db)], current_user: CurrentUser,
                   response: Response, q: str = Query("", max_length=200), limit: int = Query(30, ge=1, le=50)):
    response.headers["Cache-Control"] = "no-store"
    return await service.opciones(db, current_user, tipo, q, limit)


@router.get("/{vista}", response_model=RegistroResult)
async def registros(vista: str, db: Annotated[AsyncSession, Depends(get_db)], current_user: CurrentUser,
                    filters: Annotated[RegistroFilters, Query()], response: Response):
    response.headers["Cache-Control"] = "no-store"
    return await service.consultar_registros(db, current_user, vista, filters)


@router.get("/auditoria/{registro_id:int}", response_model=AuditLogResponse)
async def detalle_auditoria(registro_id: Annotated[int, Path(ge=1)], db: Annotated[AsyncSession, Depends(get_db)],
                           current_user: CurrentUser, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return await service.detalle_auditoria(db, current_user, registro_id)
