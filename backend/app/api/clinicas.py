from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import CurrentUser, RequireAdmin, ensure_clinic_access
from app.database import get_db
from app.models.clinica import Clinica
from app.schemas.extras import ClinicaCreate, ClinicaResponse, ClinicaUpdate

router = APIRouter()


@router.get("", response_model=list[ClinicaResponse])
async def listar_clinicas(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[ClinicaResponse]:
    stmt = select(Clinica).where(Clinica.activa == True).order_by(Clinica.nombre)  # noqa: E712
    if current_user.rol != "admin" and current_user.clinica_id:
        stmt = stmt.where(Clinica.id == current_user.clinica_id)
    result = await db.execute(stmt)
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


@router.get("/{clinica_id}", response_model=ClinicaResponse)
async def obtener_clinica(
    clinica_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> ClinicaResponse:
    ensure_clinic_access(current_user, clinica_id)
    clinica = await db.get(Clinica, clinica_id)
    if not clinica or not clinica.activa:
        raise HTTPException(status_code=404, detail="Clínica no encontrada")
    return ClinicaResponse.model_validate(clinica)


@router.patch("/{clinica_id}", response_model=ClinicaResponse, dependencies=[RequireAdmin])
async def actualizar_clinica(
    clinica_id: UUID,
    data: ClinicaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClinicaResponse:
    clinica = await db.get(Clinica, clinica_id)
    if not clinica:
        raise HTTPException(status_code=404, detail="Clínica no encontrada")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(clinica, field, value)
    await db.commit()
    await db.refresh(clinica)
    return ClinicaResponse.model_validate(clinica)


@router.delete("/{clinica_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def desactivar_clinica(
    clinica_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    clinica = await db.get(Clinica, clinica_id)
    if not clinica:
        raise HTTPException(status_code=404, detail="Clínica no encontrada")
    clinica.activa = False
    await db.commit()
