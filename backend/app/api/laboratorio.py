"""
Router de laboratorio dental.
- CRUD de laboratorios (catálogo)
- CRUD de trabajos de laboratorio
"""
import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import CurrentUser, RequireAdmin
from app.database import get_db
from app.models.laboratorio import Laboratorio, TrabajoLaboratorio

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class LaboratorioCreate(BaseModel):
    nombre: str
    telefono: str | None = None
    whatsapp: str | None = None
    email: str | None = None
    contacto: str | None = None
    notas: str | None = None


class LaboratorioUpdate(BaseModel):
    nombre: str | None = None
    telefono: str | None = None
    whatsapp: str | None = None
    email: str | None = None
    contacto: str | None = None
    notas: str | None = None
    activo: bool | None = None


class LaboratorioResponse(BaseModel):
    id: uuid.UUID
    nombre: str
    telefono: str | None
    whatsapp: str | None
    email: str | None
    contacto: str | None
    notas: str | None
    activo: bool
    model_config = {"from_attributes": True}


class TrabajoCreate(BaseModel):
    paciente_id: uuid.UUID
    doctor_id: uuid.UUID
    laboratorio_id: uuid.UUID
    historial_id: uuid.UUID | None = None
    tratamiento_id: uuid.UUID | None = None
    presupuesto_id: uuid.UUID | None = None
    factura_id: uuid.UUID | None = None
    referencia: str | None = None
    tipo_trabajo: str | None = None
    descripcion: str
    pieza_dental: int | None = None
    color: str | None = None
    observaciones: str | None = None
    fecha_salida: date | None = None
    fecha_entrega_prevista: date | None = None
    precio: float | None = None
    coste_laboratorio: float | None = None
    precio_paciente: float | None = None
    margen: float | None = None
    comision_doctor_pct: float | None = None
    estado_pago_laboratorio: str = "pendiente"
    estado_cobro_paciente: str = "pendiente"


class TrabajoUpdate(BaseModel):
    laboratorio_id: uuid.UUID | None = None
    historial_id: uuid.UUID | None = None
    tratamiento_id: uuid.UUID | None = None
    presupuesto_id: uuid.UUID | None = None
    factura_id: uuid.UUID | None = None
    referencia: str | None = None
    tipo_trabajo: str | None = None
    descripcion: str | None = None
    pieza_dental: int | None = None
    color: str | None = None
    observaciones: str | None = None
    fecha_salida: date | None = None
    fecha_entrega_prevista: date | None = None
    fecha_recepcion: date | None = None
    fecha_entrega_paciente: date | None = None
    estado: str | None = None
    precio: float | None = None
    coste_laboratorio: float | None = None
    precio_paciente: float | None = None
    margen: float | None = None
    comision_doctor_pct: float | None = None
    estado_pago_laboratorio: str | None = None
    estado_cobro_paciente: str | None = None


class PacienteMin(BaseModel):
    id: uuid.UUID
    nombre: str
    apellidos: str
    num_historial: int
    model_config = {"from_attributes": True}


class DoctorMin(BaseModel):
    id: uuid.UUID
    nombre: str
    model_config = {"from_attributes": True}


class TrabajoResponse(BaseModel):
    id: uuid.UUID
    paciente_id: uuid.UUID
    doctor_id: uuid.UUID
    laboratorio_id: uuid.UUID
    historial_id: uuid.UUID | None
    tratamiento_id: uuid.UUID | None
    presupuesto_id: uuid.UUID | None
    factura_id: uuid.UUID | None
    referencia: str | None
    tipo_trabajo: str | None
    descripcion: str
    pieza_dental: int | None
    color: str | None
    observaciones: str | None
    fecha_salida: date | None
    fecha_entrega_prevista: date | None
    fecha_recepcion: date | None
    fecha_entrega_paciente: date | None
    estado: str
    precio: float | None
    coste_laboratorio: float | None
    precio_paciente: float | None
    margen: float | None
    comision_doctor_pct: float | None
    estado_pago_laboratorio: str
    estado_cobro_paciente: str
    paciente: PacienteMin | None = None
    doctor: DoctorMin | None = None
    laboratorio: LaboratorioResponse | None = None
    model_config = {"from_attributes": True}


ESTADOS_VALIDOS = {
    "pendiente", "pendiente_enviar", "enviado", "en_proceso", "en_fabricacion",
    "recibido", "probado", "finalizado", "entregado", "repetir_corregir",
    "incidencia", "cancelado"
}

# ─── Laboratorios (catálogo) ──────────────────────────────────────────────────

@router.get("/laboratorios", response_model=list[LaboratorioResponse])
async def listar_laboratorios(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    solo_activos: bool = Query(True),
) -> list[LaboratorioResponse]:
    q = select(Laboratorio).order_by(Laboratorio.nombre)
    if solo_activos:
        q = q.where(Laboratorio.activo == True)  # noqa: E712
    result = await db.execute(q)
    return [LaboratorioResponse.model_validate(r) for r in result.scalars().all()]


@router.post("/laboratorios", response_model=LaboratorioResponse, status_code=status.HTTP_201_CREATED, dependencies=[RequireAdmin])
async def crear_laboratorio(
    data: LaboratorioCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LaboratorioResponse:
    lab = Laboratorio(**data.model_dump())
    db.add(lab)
    await db.commit()
    await db.refresh(lab)
    return LaboratorioResponse.model_validate(lab)


@router.patch("/laboratorios/{lab_id}", response_model=LaboratorioResponse, dependencies=[RequireAdmin])
async def actualizar_laboratorio(
    lab_id: uuid.UUID,
    data: LaboratorioUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LaboratorioResponse:
    lab = await db.get(Laboratorio, lab_id)
    if not lab:
        raise HTTPException(status_code=404, detail="Laboratorio no encontrado")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(lab, field, value)
    await db.commit()
    await db.refresh(lab)
    return LaboratorioResponse.model_validate(lab)


# ─── Trabajos de laboratorio ──────────────────────────────────────────────────

def _trabajo_query():
    return (
        select(TrabajoLaboratorio)
        .options(
            selectinload(TrabajoLaboratorio.paciente),
            selectinload(TrabajoLaboratorio.doctor),
            selectinload(TrabajoLaboratorio.laboratorio),
        )
    )


@router.get("/laboratorio/trabajos", response_model=list[TrabajoResponse])
async def listar_trabajos(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    laboratorio_id: uuid.UUID | None = Query(None),
    paciente_id: uuid.UUID | None = Query(None),
    doctor_id: uuid.UUID | None = Query(None),
    estado: str | None = Query(None),
    pendientes: bool = Query(False),  # solo estados activos (pendiente/enviado/en_proceso)
) -> list[TrabajoResponse]:
    q = _trabajo_query().order_by(TrabajoLaboratorio.created_at.desc())
    if laboratorio_id:
        q = q.where(TrabajoLaboratorio.laboratorio_id == laboratorio_id)
    if paciente_id:
        q = q.where(TrabajoLaboratorio.paciente_id == paciente_id)
    if doctor_id:
        q = q.where(TrabajoLaboratorio.doctor_id == doctor_id)
    if estado:
        q = q.where(TrabajoLaboratorio.estado == estado)
    if pendientes:
        q = q.where(TrabajoLaboratorio.estado.in_(["pendiente", "enviado", "en_proceso"]))
    result = await db.execute(q)
    return [TrabajoResponse.model_validate(t) for t in result.scalars().all()]


@router.post("/laboratorio/trabajos", response_model=TrabajoResponse, status_code=status.HTTP_201_CREATED)
async def crear_trabajo(
    data: TrabajoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> TrabajoResponse:
    trabajo = TrabajoLaboratorio(**data.model_dump())
    db.add(trabajo)
    await db.commit()
    await db.refresh(trabajo)
    result = await db.execute(_trabajo_query().where(TrabajoLaboratorio.id == trabajo.id))
    return TrabajoResponse.model_validate(result.scalar_one())


@router.patch("/laboratorio/trabajos/{trabajo_id}", response_model=TrabajoResponse)
async def actualizar_trabajo(
    trabajo_id: uuid.UUID,
    data: TrabajoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> TrabajoResponse:
    trabajo = await db.get(TrabajoLaboratorio, trabajo_id)
    if not trabajo:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    cambios = data.model_dump(exclude_none=True)
    if "estado" in cambios and cambios["estado"] not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Válidos: {', '.join(ESTADOS_VALIDOS)}")
    for field, value in cambios.items():
        setattr(trabajo, field, value)
    await db.commit()
    result = await db.execute(_trabajo_query().where(TrabajoLaboratorio.id == trabajo_id))
    return TrabajoResponse.model_validate(result.scalar_one())


@router.delete("/laboratorio/trabajos/{trabajo_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def eliminar_trabajo(
    trabajo_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    trabajo = await db.get(TrabajoLaboratorio, trabajo_id)
    if not trabajo:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    await db.delete(trabajo)
    await db.commit()
