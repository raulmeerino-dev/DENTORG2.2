"""
Router de laboratorio dental.
- CRUD de laboratorios (catálogo)
- CRUD de trabajos de laboratorio
"""
import uuid
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import CurrentUser, RequireAdmin, ensure_clinic_access
from app.database import get_db
from app.models.doctor import Doctor
from app.models.laboratorio import Laboratorio, TrabajoLaboratorio
from app.models.paciente import Paciente
from app.services.audit import write_audit_log

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
    presupuesto_linea_id: uuid.UUID | None = None
    factura_id: uuid.UUID | None = None
    referencia: str | None = None
    referencia_interna: str | None = None
    referencia_proveedor: str | None = None
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
    material_enviado: bool | None = None


class TrabajoUpdate(BaseModel):
    laboratorio_id: uuid.UUID | None = None
    historial_id: uuid.UUID | None = None
    tratamiento_id: uuid.UUID | None = None
    presupuesto_id: uuid.UUID | None = None
    presupuesto_linea_id: uuid.UUID | None = None
    factura_id: uuid.UUID | None = None
    referencia: str | None = None
    referencia_interna: str | None = None
    referencia_proveedor: str | None = None
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
    colocado: bool | None = None
    material_enviado: bool | None = None
    material_devuelto: bool | None = None


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
    presupuesto_linea_id: uuid.UUID | None
    factura_id: uuid.UUID | None
    numero_orden: int | None
    referencia: str | None
    referencia_interna: str | None
    referencia_proveedor: str | None
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
    colocado: bool
    material_enviado: bool
    material_devuelto: bool
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


async def _get_trabajo_or_404(db: AsyncSession, trabajo_id: uuid.UUID, current_user: CurrentUser) -> TrabajoLaboratorio:
    result = await db.execute(
        _trabajo_query().where(TrabajoLaboratorio.id == trabajo_id)
    )
    trabajo = result.scalar_one_or_none()
    if not trabajo:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    ensure_clinic_access(current_user, trabajo.paciente.clinica_id if trabajo.paciente else None)
    return trabajo


@router.get("/laboratorio/trabajos", response_model=list[TrabajoResponse])
async def listar_trabajos(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    laboratorio_id: uuid.UUID | None = Query(None),
    paciente_id: uuid.UUID | None = Query(None),
    doctor_id: uuid.UUID | None = Query(None),
    estado: str | None = Query(None),
    pendientes: bool = Query(False),  # solo estados activos (pendiente/enviado/en_proceso)
    proximos: bool = Query(False),    # con entrega prevista en proximos 7 dias y aun no recibidos
    vencidos: bool = Query(False),    # entrega prevista pasada y aun no recibidos
) -> list[TrabajoResponse]:
    q = _trabajo_query().order_by(TrabajoLaboratorio.created_at.desc())
    if current_user.rol != "admin" and current_user.clinica_id:
        q = q.join(TrabajoLaboratorio.paciente).where(
            or_(Paciente.clinica_id == current_user.clinica_id, Paciente.clinica_id.is_(None))
        )
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
    if proximos:
        hoy = date.today()
        q = q.where(
            TrabajoLaboratorio.fecha_entrega_prevista.isnot(None),
            TrabajoLaboratorio.fecha_entrega_prevista >= hoy,
            TrabajoLaboratorio.fecha_entrega_prevista <= hoy + timedelta(days=7),
            TrabajoLaboratorio.fecha_recepcion.is_(None),
        )
    if vencidos:
        q = q.where(
            TrabajoLaboratorio.fecha_entrega_prevista.isnot(None),
            TrabajoLaboratorio.fecha_entrega_prevista < date.today(),
            TrabajoLaboratorio.fecha_recepcion.is_(None),
        )
    result = await db.execute(q)
    return [TrabajoResponse.model_validate(t) for t in result.scalars().all()]


@router.post("/laboratorio/trabajos", response_model=TrabajoResponse, status_code=status.HTTP_201_CREATED)
async def crear_trabajo(
    data: TrabajoCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> TrabajoResponse:
    paciente = await db.get(Paciente, data.paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)
    doctor = await db.get(Doctor, data.doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    if doctor.clinica_id is not None and paciente.clinica_id is not None and doctor.clinica_id != paciente.clinica_id:
        raise HTTPException(status_code=400, detail="Doctor de otra clínica")
    if doctor.clinica_id is not None:
        ensure_clinic_access(current_user, doctor.clinica_id)
    laboratorio = await db.get(Laboratorio, data.laboratorio_id)
    if not laboratorio:
        raise HTTPException(status_code=404, detail="Laboratorio no encontrado")

    if data.presupuesto_linea_id is not None:
        from app.models.presupuesto import Presupuesto, PresupuestoLinea
        linea = await db.scalar(
            select(PresupuestoLinea)
            .join(Presupuesto, Presupuesto.id == PresupuestoLinea.presupuesto_id)
            .where(
                PresupuestoLinea.id == data.presupuesto_linea_id,
                Presupuesto.paciente_id == paciente.id,
            )
        )
        if linea is None:
            raise HTTPException(
                status_code=400,
                detail="La línea de presupuesto no pertenece a este paciente",
            )

    payload = data.model_dump(exclude_none=True)
    trabajo = TrabajoLaboratorio(**payload)
    db.add(trabajo)
    await db.flush()
    # numero_orden lo asigna la BD via sequence (migration 0029)
    await db.refresh(trabajo, ["numero_orden"])
    await write_audit_log(
        db,
        user=current_user,
        action="laboratorio_trabajo_creado",
        entity_type="trabajos_laboratorio",
        entity_id=trabajo.id,
        new_values={
            "paciente_id": str(paciente.id),
            "laboratorio_id": str(laboratorio.id),
            "numero_orden": trabajo.numero_orden,
            "descripcion": trabajo.descripcion[:120],
            "estado": trabajo.estado,
            "fecha_entrega_prevista": trabajo.fecha_entrega_prevista.isoformat() if trabajo.fecha_entrega_prevista else None,
            "presupuesto_linea_id": str(trabajo.presupuesto_linea_id) if trabajo.presupuesto_linea_id else None,
        },
        clinica_id=paciente.clinica_id,
        request=request,
    )
    await db.commit()
    result = await db.execute(_trabajo_query().where(TrabajoLaboratorio.id == trabajo.id))
    return TrabajoResponse.model_validate(result.scalar_one())


_TRABAJO_CAMPOS_AUDITABLES = (
    "estado",
    "fecha_salida",
    "fecha_entrega_prevista",
    "fecha_recepcion",
    "fecha_entrega_paciente",
    "colocado",
    "material_enviado",
    "material_devuelto",
    "estado_pago_laboratorio",
    "estado_cobro_paciente",
    "referencia",
    "referencia_interna",
    "referencia_proveedor",
)


def _snapshot_trabajo(trabajo: TrabajoLaboratorio) -> dict:
    snap: dict = {}
    for campo in _TRABAJO_CAMPOS_AUDITABLES:
        valor = getattr(trabajo, campo, None)
        if isinstance(valor, date):
            snap[campo] = valor.isoformat()
        else:
            snap[campo] = valor
    return snap


@router.patch("/laboratorio/trabajos/{trabajo_id}", response_model=TrabajoResponse)
async def actualizar_trabajo(
    trabajo_id: uuid.UUID,
    data: TrabajoUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> TrabajoResponse:
    trabajo = await _get_trabajo_or_404(db, trabajo_id, current_user)
    old_snapshot = _snapshot_trabajo(trabajo)
    cambios = data.model_dump(exclude_unset=True)
    if "estado" in cambios and cambios["estado"] is not None and cambios["estado"] not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Válidos: {', '.join(ESTADOS_VALIDOS)}")
    for field, value in cambios.items():
        setattr(trabajo, field, value)

    new_snapshot = _snapshot_trabajo(trabajo)
    diff_old = {k: old_snapshot[k] for k in _TRABAJO_CAMPOS_AUDITABLES if old_snapshot[k] != new_snapshot[k]}
    diff_new = {k: new_snapshot[k] for k in _TRABAJO_CAMPOS_AUDITABLES if old_snapshot[k] != new_snapshot[k]}
    if diff_old or diff_new:
        await write_audit_log(
            db,
            user=current_user,
            action="laboratorio_trabajo_actualizado",
            entity_type="trabajos_laboratorio",
            entity_id=trabajo.id,
            old_values=diff_old or None,
            new_values=diff_new or None,
            clinica_id=trabajo.paciente.clinica_id if trabajo.paciente else None,
            request=request,
        )
    await db.commit()
    result = await db.execute(_trabajo_query().where(TrabajoLaboratorio.id == trabajo_id))
    return TrabajoResponse.model_validate(result.scalar_one())


@router.delete("/laboratorio/trabajos/{trabajo_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def eliminar_trabajo(
    trabajo_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    trabajo = await _get_trabajo_or_404(db, trabajo_id, current_user)
    await db.delete(trabajo)
    await db.commit()
