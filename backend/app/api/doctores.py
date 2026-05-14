"""
Router de doctores y gabinetes.
Fase 2: CRUD completo + horarios de agenda.
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    CurrentUser,
    RequireAdmin,
    ensure_clinic_access,
    resolve_clinic_id,
    scope_select_by_clinic,
)
from app.database import get_db
from app.models.doctor import Doctor
from app.models.gabinete import Gabinete
from app.models.horario import HorarioDoctor, HorarioExcepcion
from app.schemas.doctor import (
    DoctorCreate,
    DoctorResponse,
    DoctorUpdate,
    GabineteCreate,
    GabineteResponse,
    GabineteUpdate,
)
from app.schemas.horario import (
    HorarioDoctorCreate,
    HorarioDoctorResponse,
    HorarioDoctorUpdate,
    HorarioExcepcionCreate,
    HorarioExcepcionResponse,
)

router = APIRouter()

# ─── DOCTORES ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DoctorResponse])
async def listar_doctores(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    solo_activos: bool = True,
) -> list[DoctorResponse]:
    q = select(Doctor).order_by(Doctor.nombre)
    q = scope_select_by_clinic(q, Doctor, current_user)
    if solo_activos:
        q = q.where(Doctor.activo == True)  # noqa: E712
    result = await db.execute(q)
    return [DoctorResponse.model_validate(d) for d in result.scalars().all()]


@router.post("", response_model=DoctorResponse, status_code=status.HTTP_201_CREATED, dependencies=[RequireAdmin])
async def crear_doctor(
    data: DoctorCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> DoctorResponse:
    values = data.model_dump()
    values["clinica_id"] = resolve_clinic_id(current_user, values.get("clinica_id"))
    doctor = Doctor(**values)
    db.add(doctor)
    await db.commit()
    await db.refresh(doctor)
    return DoctorResponse.model_validate(doctor)


@router.get("/{doctor_id}", response_model=DoctorResponse)
async def obtener_doctor(
    doctor_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> DoctorResponse:
    result = await db.execute(select(Doctor).where(Doctor.id == doctor_id))
    doctor = result.scalar_one_or_none()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    ensure_clinic_access(current_user, doctor.clinica_id)
    return DoctorResponse.model_validate(doctor)


@router.patch("/{doctor_id}", response_model=DoctorResponse, dependencies=[RequireAdmin])
async def actualizar_doctor(
    doctor_id: UUID,
    data: DoctorUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> DoctorResponse:
    result = await db.execute(select(Doctor).where(Doctor.id == doctor_id))
    doctor = result.scalar_one_or_none()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    ensure_clinic_access(current_user, doctor.clinica_id)
    for field, value in data.model_dump(exclude_none=True).items():
        if field == "clinica_id":
            value = resolve_clinic_id(current_user, value)
        setattr(doctor, field, value)
    await db.commit()
    await db.refresh(doctor)
    return DoctorResponse.model_validate(doctor)


# ─── GABINETES ───────────────────────────────────────────────────────────────

@router.get("/gabinetes/", response_model=list[GabineteResponse])
async def listar_gabinetes(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[GabineteResponse]:
    result = await db.execute(select(Gabinete).where(Gabinete.activo == True).order_by(Gabinete.nombre))  # noqa: E712
    return [GabineteResponse.model_validate(g) for g in result.scalars().all()]


@router.post("/gabinetes/", response_model=GabineteResponse, status_code=201, dependencies=[RequireAdmin])
async def crear_gabinete(
    data: GabineteCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GabineteResponse:
    gabinete = Gabinete(**data.model_dump())
    db.add(gabinete)
    await db.commit()
    await db.refresh(gabinete)
    return GabineteResponse.model_validate(gabinete)


@router.patch("/gabinetes/{gabinete_id}", response_model=GabineteResponse, dependencies=[RequireAdmin])
async def actualizar_gabinete(
    gabinete_id: UUID,
    data: GabineteUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GabineteResponse:
    result = await db.execute(select(Gabinete).where(Gabinete.id == gabinete_id))
    gabinete = result.scalar_one_or_none()
    if not gabinete:
        raise HTTPException(status_code=404, detail="Gabinete no encontrado")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(gabinete, field, value)
    await db.commit()
    await db.refresh(gabinete)
    return GabineteResponse.model_validate(gabinete)


# ─── HORARIOS ────────────────────────────────────────────────────────────────

@router.get("/{doctor_id}/horarios", response_model=list[HorarioDoctorResponse])
async def listar_horarios(
    doctor_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[HorarioDoctorResponse]:
    doctor = await db.get(Doctor, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    ensure_clinic_access(current_user, doctor.clinica_id)
    result = await db.execute(
        select(HorarioDoctor)
        .where(HorarioDoctor.doctor_id == doctor_id)
        .order_by(HorarioDoctor.dia_semana)
    )
    return [HorarioDoctorResponse.model_validate(h) for h in result.scalars().all()]


@router.put("/{doctor_id}/horarios/{dia_semana}", response_model=HorarioDoctorResponse, dependencies=[RequireAdmin])
async def upsert_horario(
    doctor_id: UUID,
    dia_semana: int,
    data: HorarioDoctorUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> HorarioDoctorResponse:
    """Crea o actualiza el horario de un día concreto."""
    from sqlalchemy import and_
    doctor = await db.get(Doctor, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    ensure_clinic_access(current_user, doctor.clinica_id)
    result = await db.execute(
        select(HorarioDoctor).where(
            and_(HorarioDoctor.doctor_id == doctor_id, HorarioDoctor.dia_semana == dia_semana)
        )
    )
    horario = result.scalar_one_or_none()
    if horario:
        for field, value in data.model_dump(exclude_none=True).items():
            val = [b.model_dump() for b in value] if field == "bloques" and value else value
            setattr(horario, field, val)
    else:
        create_data = HorarioDoctorCreate(
            doctor_id=doctor_id,
            dia_semana=dia_semana,
            **(data.model_dump(exclude_none=True)),
        )
        horario = HorarioDoctor(
            doctor_id=doctor_id,
            dia_semana=dia_semana,
            tipo_dia=create_data.tipo_dia,
            bloques=[b.model_dump() for b in create_data.bloques],
            intervalo_min=create_data.intervalo_min,
        )
        db.add(horario)
    await db.commit()
    await db.refresh(horario)
    return HorarioDoctorResponse.model_validate(horario)


@router.get("/{doctor_id}/excepciones", response_model=list[HorarioExcepcionResponse])
async def listar_excepciones(
    doctor_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[HorarioExcepcionResponse]:
    doctor = await db.get(Doctor, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    ensure_clinic_access(current_user, doctor.clinica_id)
    result = await db.execute(
        select(HorarioExcepcion)
        .where(HorarioExcepcion.doctor_id == doctor_id)
        .order_by(HorarioExcepcion.fecha)
    )
    return [HorarioExcepcionResponse.model_validate(e) for e in result.scalars().all()]


@router.post("/{doctor_id}/excepciones", response_model=HorarioExcepcionResponse, status_code=201, dependencies=[RequireAdmin])
async def crear_excepcion(
    doctor_id: UUID,
    data: HorarioExcepcionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> HorarioExcepcionResponse:
    doctor = await db.get(Doctor, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    ensure_clinic_access(current_user, doctor.clinica_id)
    excepcion = HorarioExcepcion(
        doctor_id=doctor_id,
        fecha=data.fecha,
        tipo_dia=data.tipo_dia,
        bloques=[b.model_dump() for b in data.bloques] if data.bloques else None,
        no_trabaja=data.no_trabaja,
    )
    db.add(excepcion)
    await db.commit()
    await db.refresh(excepcion)
    return HorarioExcepcionResponse.model_validate(excepcion)
