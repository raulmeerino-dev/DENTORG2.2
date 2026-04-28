"""Consentimientos informados del paciente.

Plantillas configurables en una fase posterior; de momento se expone un catalogo
base y el guardado estructurado para poder firmar/archivar desde la ficha.
"""
import uuid
from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import CurrentUser
from app.database import get_db
from app.models.consentimiento import Consentimiento
from app.models.paciente import Paciente

router = APIRouter()


PLANTILLAS_BASE = [
    {"codigo": "implantes", "nombre": "Implantes", "version": "2026.04", "tratamientos": ["implante", "cirugia"]},
    {"codigo": "extracciones", "nombre": "Extracciones", "version": "2026.04", "tratamientos": ["extraccion", "cirugia"]},
    {"codigo": "endodoncia", "nombre": "Endodoncia", "version": "2026.04", "tratamientos": ["endodoncia"]},
    {"codigo": "ortodoncia", "nombre": "Ortodoncia", "version": "2026.04", "tratamientos": ["ortodoncia"]},
    {"codigo": "blanqueamiento", "nombre": "Blanqueamiento", "version": "2026.04", "tratamientos": ["blanqueamiento"]},
    {"codigo": "cirugia", "nombre": "Cirugia", "version": "2026.04", "tratamientos": ["cirugia"]},
    {"codigo": "periodoncia", "nombre": "Periodoncia", "version": "2026.04", "tratamientos": ["periodoncia"]},
    {"codigo": "protesis", "nombre": "Protesis", "version": "2026.04", "tratamientos": ["protesis"]},
    {"codigo": "empastes", "nombre": "Empastes", "version": "2026.04", "tratamientos": ["operatoria", "obturacion"]},
    {"codigo": "limpieza", "nombre": "Limpieza / profilaxis", "version": "2026.04", "tratamientos": ["limpieza", "higiene"]},
    {"codigo": "otros", "nombre": "Otros tratamientos", "version": "2026.04", "tratamientos": ["otros"]},
]


class PlantillaConsentimiento(BaseModel):
    codigo: str
    nombre: str
    version: str
    tratamientos: list[str]


class ConsentimientoCreate(BaseModel):
    tipo: str = Field(..., max_length=100)
    tratamiento_id: uuid.UUID | None = None
    doctor_id: uuid.UUID | None = None
    historial_id: uuid.UUID | None = None
    documento_id: uuid.UUID | None = None
    estado: str = Field("pendiente_firma", pattern=r"^(pendiente_firma|firmado|revocado)$")
    fecha_firma: date | None = None
    documento_path: str | None = Field(None, max_length=500)
    plantilla_version: str | None = Field(None, max_length=30)
    contenido: str | None = None


class ConsentimientoUpdate(BaseModel):
    estado: str | None = Field(None, pattern=r"^(pendiente_firma|firmado|revocado)$")
    documento_id: uuid.UUID | None = None
    documento_path: str | None = Field(None, max_length=500)
    contenido: str | None = None
    revocado: bool | None = None


class ConsentimientoResponse(BaseModel):
    id: uuid.UUID
    paciente_id: uuid.UUID
    tratamiento_id: uuid.UUID | None
    doctor_id: uuid.UUID | None
    historial_id: uuid.UUID | None
    documento_id: uuid.UUID | None
    tipo: str
    estado: str
    fecha_firma: date
    firmado_at: datetime | None
    documento_path: str | None
    plantilla_version: str | None
    revocado: bool
    fecha_revocacion: date | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/consentimientos/plantillas", response_model=list[PlantillaConsentimiento])
async def listar_plantillas_consentimiento(_: CurrentUser) -> list[PlantillaConsentimiento]:
    return [PlantillaConsentimiento.model_validate(p) for p in PLANTILLAS_BASE]


@router.get("/pacientes/{paciente_id}/consentimientos", response_model=list[ConsentimientoResponse])
async def listar_consentimientos_paciente(
    paciente_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[ConsentimientoResponse]:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    result = await db.execute(
        select(Consentimiento)
        .where(Consentimiento.paciente_id == paciente_id)
        .order_by(Consentimiento.created_at.desc())
    )
    return [ConsentimientoResponse.model_validate(c) for c in result.scalars().all()]


@router.post("/pacientes/{paciente_id}/consentimientos", response_model=ConsentimientoResponse, status_code=status.HTTP_201_CREATED)
async def crear_consentimiento_paciente(
    paciente_id: uuid.UUID,
    data: ConsentimientoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> ConsentimientoResponse:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    firmado_at = datetime.now(timezone.utc) if data.estado == "firmado" else None
    consentimiento = Consentimiento(
        paciente_id=paciente_id,
        tipo=data.tipo,
        tratamiento_id=data.tratamiento_id,
        doctor_id=data.doctor_id,
        historial_id=data.historial_id,
        documento_id=data.documento_id,
        estado=data.estado,
        fecha_firma=data.fecha_firma or date.today(),
        firmado_at=firmado_at,
        documento_path=data.documento_path,
        plantilla_version=data.plantilla_version,
        contenido=data.contenido,
    )
    db.add(consentimiento)
    await db.commit()
    await db.refresh(consentimiento)
    return ConsentimientoResponse.model_validate(consentimiento)


@router.patch("/pacientes/{paciente_id}/consentimientos/{consentimiento_id}", response_model=ConsentimientoResponse)
async def actualizar_consentimiento_paciente(
    paciente_id: uuid.UUID,
    consentimiento_id: uuid.UUID,
    data: ConsentimientoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> ConsentimientoResponse:
    consentimiento = await db.get(Consentimiento, consentimiento_id)
    if not consentimiento or consentimiento.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Consentimiento no encontrado")
    cambios = data.model_dump(exclude_none=True)
    if cambios.get("estado") == "firmado" and consentimiento.firmado_at is None:
        consentimiento.firmado_at = datetime.now(timezone.utc)
    if cambios.get("estado") == "revocado" or cambios.get("revocado"):
        consentimiento.revocado = True
        consentimiento.fecha_revocacion = date.today()
    for field, value in cambios.items():
        setattr(consentimiento, field, value)
    await db.commit()
    await db.refresh(consentimiento)
    return ConsentimientoResponse.model_validate(consentimiento)
