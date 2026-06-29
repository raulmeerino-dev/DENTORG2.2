"""
Router de laboratorio dental.
- CRUD de laboratorios (catálogo)
- CRUD de trabajos de laboratorio
"""
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import CurrentUser, RequireAdmin, ensure_clinic_access
from app.database import get_db
from app.models.cita import Cita
from app.models.doctor import Doctor
from app.models.laboratorio import ESTADOS_TRABAJO_LAB, Laboratorio, TrabajoLaboratorio
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
    cita_id: uuid.UUID | None = None
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
    estado: str = "pending_to_send"
    ubicacion_clinica: str | None = Field(None, max_length=120)
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
    cita_id: uuid.UUID | None = None
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
    fecha_revision: date | None = None
    fecha_entrega_paciente: date | None = None
    ubicacion_clinica: str | None = Field(None, max_length=120)
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


class TrabajoAsociarCita(BaseModel):
    cita_id: uuid.UUID | None = None


class TrabajoEstadoAccion(BaseModel):
    fecha: date | None = None
    ubicacion_clinica: str | None = Field(None, max_length=120)
    observaciones: str | None = Field(None, max_length=1000)


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
    cita_id: uuid.UUID | None
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
    fecha_revision: date | None
    fecha_entrega_paciente: date | None
    ubicacion_clinica: str | None
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


class AgendaLaboratorioResumen(BaseModel):
    fecha: date
    total: int
    listos: int
    pendientes: int
    retrasados: int


class AgendaLaboratorioDiaResponse(BaseModel):
    fecha: date
    resumen: AgendaLaboratorioResumen
    trabajos: list[TrabajoResponse]


ESTADOS_VALIDOS = set(ESTADOS_TRABAJO_LAB)
ESTADOS_RECIBIDOS = {
    "recibido",
    "recepcionado",
    "finalizado",
    "entregado",
    "colocado",
    "completado",
    "received_in_clinic",
    "checked_in_clinic",
    "tried_in_patient",
    "delivered_or_placed",
}
ESTADOS_LISTOS_CITA = {
    "received_in_clinic",
    "checked_in_clinic",
    "tried_in_patient",
    "delivered_or_placed",
    "recibido",
    "probado",
    "finalizado",
    "entregado",
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
            selectinload(TrabajoLaboratorio.cita),
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


def _normalizar_estado_lab(estado: str | None) -> str:
    aliases = {
        "pendiente": "pending_to_send",
        "pendiente_enviar": "pending_to_send",
        "enviado": "sent_to_lab",
        "en_proceso": "in_progress_at_lab",
        "en_fabricacion": "in_progress_at_lab",
        "recibido": "received_in_clinic",
        "probado": "tried_in_patient",
        "finalizado": "delivered_or_placed",
        "entregado": "delivered_or_placed",
        "repetir_corregir": "remake_required",
        "incidencia": "returned_to_lab",
        "cancelado": "cancelled",
    }
    return aliases.get((estado or "").lower(), (estado or "").lower())


def _is_recibido(trabajo: TrabajoLaboratorio, cambios: dict | None = None) -> bool:
    cambios = cambios or {}
    estado = _normalizar_estado_lab(cambios.get("estado", trabajo.estado))
    fecha_recepcion = cambios.get("fecha_recepcion", trabajo.fecha_recepcion)
    return bool(fecha_recepcion) or estado in ESTADOS_RECIBIDOS


def _is_listo_para_cita(trabajo: TrabajoLaboratorio) -> bool:
    return bool(trabajo.fecha_recepcion) or _normalizar_estado_lab(trabajo.estado) in ESTADOS_LISTOS_CITA


def _is_retrasado(trabajo: TrabajoLaboratorio, fecha_referencia: date) -> bool:
    return (
        bool(trabajo.fecha_entrega_prevista)
        and trabajo.fecha_entrega_prevista < fecha_referencia
        and not _is_recibido(trabajo)
        and _normalizar_estado_lab(trabajo.estado) not in {"cancelled"}
    )


def _validar_estado(estado: str | None) -> None:
    if estado is not None and estado not in ESTADOS_VALIDOS:
        raise HTTPException(
            status_code=422,
            detail=f"Estado invalido. Validos: {', '.join(sorted(ESTADOS_VALIDOS))}",
        )


def _validar_fechas_trabajo(data: dict) -> None:
    fecha_salida = data.get("fecha_salida")
    fecha_entrega_prevista = data.get("fecha_entrega_prevista")
    fecha_recepcion = data.get("fecha_recepcion")
    fecha_revision = data.get("fecha_revision")
    fecha_entrega_paciente = data.get("fecha_entrega_paciente")
    if fecha_salida and fecha_entrega_prevista and fecha_entrega_prevista < fecha_salida:
        raise HTTPException(status_code=422, detail="La entrega prevista no puede ser anterior al envio")
    if fecha_salida and fecha_recepcion and fecha_recepcion < fecha_salida:
        raise HTTPException(status_code=422, detail="La recepcion no puede ser anterior al envio")
    if fecha_recepcion and fecha_revision and fecha_revision < fecha_recepcion:
        raise HTTPException(status_code=422, detail="La revision no puede ser anterior a la recepcion")
    if fecha_recepcion and fecha_entrega_paciente and fecha_entrega_paciente < fecha_recepcion:
        raise HTTPException(status_code=422, detail="La entrega al paciente no puede ser anterior a la recepcion")


async def _get_cita_para_trabajo(
    db: AsyncSession,
    cita_id: uuid.UUID | None,
    paciente_id: uuid.UUID,
    current_user: CurrentUser,
) -> Cita | None:
    if cita_id is None:
        return None
    cita = await db.get(Cita, cita_id)
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    ensure_clinic_access(current_user, cita.clinica_id)
    if cita.paciente_id != paciente_id:
        raise HTTPException(
            status_code=409,
            detail="La cita no pertenece al paciente del trabajo de laboratorio",
        )
    return cita


def _resumen_agenda(fecha: date, trabajos: list[TrabajoLaboratorio]) -> AgendaLaboratorioResumen:
    retrasados = sum(1 for trabajo in trabajos if _is_retrasado(trabajo, fecha))
    listos = sum(1 for trabajo in trabajos if _is_listo_para_cita(trabajo))
    return AgendaLaboratorioResumen(
        fecha=fecha,
        total=len(trabajos),
        listos=listos,
        pendientes=max(0, len(trabajos) - listos - retrasados),
        retrasados=retrasados,
    )


@router.get("/laboratorio/trabajos", response_model=list[TrabajoResponse])
async def listar_trabajos(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    laboratorio_id: uuid.UUID | None = Query(None),
    paciente_id: uuid.UUID | None = Query(None),
    cita_id: uuid.UUID | None = Query(None),
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
    if cita_id:
        q = q.where(TrabajoLaboratorio.cita_id == cita_id)
    if doctor_id:
        q = q.where(TrabajoLaboratorio.doctor_id == doctor_id)
    if estado:
        q = q.where(TrabajoLaboratorio.estado == estado)
    if pendientes:
        q = q.where(TrabajoLaboratorio.estado.in_([
            "pendiente",
            "pendiente_enviar",
            "enviado",
            "en_proceso",
            "en_fabricacion",
            "pending_to_send",
            "sent_to_lab",
            "in_progress_at_lab",
            "ready_at_lab",
            "delayed",
        ]))
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
    _validar_estado(data.estado)
    _validar_fechas_trabajo(data.model_dump(exclude_none=True))
    await _get_cita_para_trabajo(db, data.cita_id, paciente.id, current_user)

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
    if payload.get("material_enviado") and payload.get("estado") in {"pending_to_send", "pendiente", "pendiente_enviar"}:
        payload["estado"] = "sent_to_lab"
        payload.setdefault("fecha_salida", date.today())
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
            "cita_id": str(trabajo.cita_id) if trabajo.cita_id else None,
        },
        clinica_id=paciente.clinica_id,
        request=request,
    )
    await db.commit()
    result = await db.execute(_trabajo_query().where(TrabajoLaboratorio.id == trabajo.id))
    return TrabajoResponse.model_validate(result.scalar_one())


_TRABAJO_CAMPOS_AUDITABLES = (
    "estado",
    "cita_id",
    "fecha_salida",
    "fecha_entrega_prevista",
    "fecha_recepcion",
    "fecha_revision",
    "fecha_entrega_paciente",
    "ubicacion_clinica",
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
        elif isinstance(valor, uuid.UUID):
            snap[campo] = str(valor)
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
    _validar_estado(cambios.get("estado"))
    if "laboratorio_id" in cambios and cambios["laboratorio_id"] is not None:
        laboratorio = await db.get(Laboratorio, cambios["laboratorio_id"])
        if not laboratorio:
            raise HTTPException(status_code=404, detail="Laboratorio no encontrado")
    if "cita_id" in cambios:
        await _get_cita_para_trabajo(db, cambios["cita_id"], trabajo.paciente_id, current_user)
    fechas_candidatas = {
        "fecha_salida": trabajo.fecha_salida,
        "fecha_entrega_prevista": trabajo.fecha_entrega_prevista,
        "fecha_recepcion": trabajo.fecha_recepcion,
        "fecha_revision": trabajo.fecha_revision,
        "fecha_entrega_paciente": trabajo.fecha_entrega_paciente,
        **{k: v for k, v in cambios.items() if k.startswith("fecha_")},
    }
    _validar_fechas_trabajo(fechas_candidatas)
    estado_candidato = _normalizar_estado_lab(cambios.get("estado", trabajo.estado))
    if estado_candidato == "checked_in_clinic" and not _is_recibido(trabajo, cambios):
        raise HTTPException(status_code=409, detail="No se puede marcar como revisado sin recepcion previa")
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


@router.get("/laboratorio/citas/{cita_id}/trabajos", response_model=list[TrabajoResponse])
async def trabajos_por_cita(
    cita_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[TrabajoResponse]:
    cita = await db.get(Cita, cita_id)
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    ensure_clinic_access(current_user, cita.clinica_id)
    result = await db.execute(
        _trabajo_query()
        .where(TrabajoLaboratorio.cita_id == cita_id)
        .order_by(TrabajoLaboratorio.created_at.desc())
    )
    return [TrabajoResponse.model_validate(t) for t in result.scalars().all()]


@router.patch("/laboratorio/trabajos/{trabajo_id}/asociar-cita", response_model=TrabajoResponse)
async def asociar_trabajo_a_cita(
    trabajo_id: uuid.UUID,
    data: TrabajoAsociarCita,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> TrabajoResponse:
    trabajo = await _get_trabajo_or_404(db, trabajo_id, current_user)
    old_snapshot = _snapshot_trabajo(trabajo)
    await _get_cita_para_trabajo(db, data.cita_id, trabajo.paciente_id, current_user)
    trabajo.cita_id = data.cita_id
    await write_audit_log(
        db,
        user=current_user,
        action="laboratorio_trabajo_asociar_cita",
        entity_type="trabajos_laboratorio",
        entity_id=trabajo.id,
        old_values=old_snapshot,
        new_values=_snapshot_trabajo(trabajo),
        clinica_id=trabajo.paciente.clinica_id if trabajo.paciente else None,
        request=request,
    )
    await db.commit()
    result = await db.execute(_trabajo_query().where(TrabajoLaboratorio.id == trabajo_id))
    return TrabajoResponse.model_validate(result.scalar_one())


async def _aplicar_accion_estado(
    *,
    trabajo: TrabajoLaboratorio,
    data: TrabajoEstadoAccion,
    request: Request,
    db: AsyncSession,
    current_user: CurrentUser,
    estado: str,
) -> TrabajoResponse:
    old_snapshot = _snapshot_trabajo(trabajo)
    fecha = data.fecha or date.today()
    if estado == "received_in_clinic":
        trabajo.estado = estado
        trabajo.fecha_recepcion = trabajo.fecha_recepcion or fecha
        if data.ubicacion_clinica:
            trabajo.ubicacion_clinica = data.ubicacion_clinica
    elif estado == "checked_in_clinic":
        if not _is_recibido(trabajo):
            raise HTTPException(status_code=409, detail="No se puede marcar como revisado sin recepcion previa")
        trabajo.estado = estado
        trabajo.fecha_revision = trabajo.fecha_revision or fecha
        if data.ubicacion_clinica:
            trabajo.ubicacion_clinica = data.ubicacion_clinica
    elif estado == "delivered_or_placed":
        trabajo.estado = estado
        trabajo.fecha_entrega_paciente = trabajo.fecha_entrega_paciente or fecha
        trabajo.colocado = True
    else:
        trabajo.estado = estado
    if data.observaciones:
        trabajo.observaciones = f"{trabajo.observaciones or ''}\n{data.observaciones}".strip()
    await write_audit_log(
        db,
        user=current_user,
        action=f"laboratorio_trabajo_{estado}",
        entity_type="trabajos_laboratorio",
        entity_id=trabajo.id,
        old_values=old_snapshot,
        new_values=_snapshot_trabajo(trabajo),
        clinica_id=trabajo.paciente.clinica_id if trabajo.paciente else None,
        request=request,
    )
    await db.commit()
    result = await db.execute(_trabajo_query().where(TrabajoLaboratorio.id == trabajo.id))
    return TrabajoResponse.model_validate(result.scalar_one())


@router.post("/laboratorio/trabajos/{trabajo_id}/recibir", response_model=TrabajoResponse)
async def marcar_trabajo_recibido(
    trabajo_id: uuid.UUID,
    data: TrabajoEstadoAccion,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> TrabajoResponse:
    trabajo = await _get_trabajo_or_404(db, trabajo_id, current_user)
    return await _aplicar_accion_estado(
        trabajo=trabajo,
        data=data,
        request=request,
        db=db,
        current_user=current_user,
        estado="received_in_clinic",
    )


@router.post("/laboratorio/trabajos/{trabajo_id}/revisar", response_model=TrabajoResponse)
async def marcar_trabajo_revisado(
    trabajo_id: uuid.UUID,
    data: TrabajoEstadoAccion,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> TrabajoResponse:
    trabajo = await _get_trabajo_or_404(db, trabajo_id, current_user)
    return await _aplicar_accion_estado(
        trabajo=trabajo,
        data=data,
        request=request,
        db=db,
        current_user=current_user,
        estado="checked_in_clinic",
    )


@router.post("/laboratorio/trabajos/{trabajo_id}/entregar", response_model=TrabajoResponse)
async def marcar_trabajo_entregado(
    trabajo_id: uuid.UUID,
    data: TrabajoEstadoAccion,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> TrabajoResponse:
    trabajo = await _get_trabajo_or_404(db, trabajo_id, current_user)
    return await _aplicar_accion_estado(
        trabajo=trabajo,
        data=data,
        request=request,
        db=db,
        current_user=current_user,
        estado="delivered_or_placed",
    )


@router.get("/laboratorio/agenda/dia", response_model=AgendaLaboratorioDiaResponse)
async def trabajos_laboratorio_agenda_dia(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    fecha: date = Query(...),
    doctor_id: uuid.UUID | None = Query(None),
) -> AgendaLaboratorioDiaResponse:
    desde = datetime.combine(fecha, time.min, tzinfo=timezone.utc)
    hasta = datetime.combine(fecha, time.max, tzinfo=timezone.utc)
    q = (
        _trabajo_query()
        .join(Cita, TrabajoLaboratorio.cita_id == Cita.id)
        .where(Cita.fecha_hora >= desde, Cita.fecha_hora <= hasta)
        .order_by(Cita.fecha_hora, TrabajoLaboratorio.created_at)
    )
    if current_user.rol != "admin" and current_user.clinica_id:
        q = q.where(or_(Cita.clinica_id == current_user.clinica_id, Cita.clinica_id.is_(None)))
    if doctor_id:
        q = q.where(Cita.doctor_id == doctor_id)
    result = await db.execute(q)
    trabajos = list(result.scalars().all())
    return AgendaLaboratorioDiaResponse(
        fecha=fecha,
        resumen=_resumen_agenda(fecha, trabajos),
        trabajos=[TrabajoResponse.model_validate(t) for t in trabajos],
    )


@router.get("/laboratorio/agenda/resumen", response_model=AgendaLaboratorioResumen)
async def resumen_laboratorio_agenda_dia(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    fecha: date = Query(...),
    doctor_id: uuid.UUID | None = Query(None),
) -> AgendaLaboratorioResumen:
    dia = await trabajos_laboratorio_agenda_dia(db, current_user, fecha, doctor_id)
    return dia.resumen


@router.delete("/laboratorio/trabajos/{trabajo_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def eliminar_trabajo(
    trabajo_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    trabajo = await _get_trabajo_or_404(db, trabajo_id, current_user)
    await db.delete(trabajo)
    await db.commit()
