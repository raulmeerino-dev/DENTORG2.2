from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import CurrentUser, RequireAdmin
from app.database import get_db
from app.models.clinica import Clinica
from app.schemas.extras import ClinicaCreate, ClinicaResponse

router = APIRouter()


@router.get("", response_model=list[ClinicaResponse])
async def listar_clinicas(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[ClinicaResponse]:
    result = await db.execute(select(Clinica).where(Clinica.activa == True).order_by(Clinica.nombre))  # noqa: E712
    return [ClinicaResponse.model_validate(item) for item in result.scalars().all()]


@router.post("", response_model=ClinicaResponse, status_code=status.HTTP_201_CREATED, dependencies=[RequireAdmin])
async def crear_clinica(
    data: ClinicaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClinicaResponse:
    clinica = Clinica(**data.model_dump())
    db.add(clinica)
    await db.commit()
    await db.refresh(clinica)
    return ClinicaResponse.model_validate(clinica)
