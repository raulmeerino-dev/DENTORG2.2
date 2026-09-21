"""Application use cases: tenant checks, orchestration and existing transactions."""
import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit_log import write_audit_log
from app.core.permissions import (
    TokenData,
    clinic_column_condition,
    ensure_clinic_access,
)
from app.domains.identity.persistence.doctor import Doctor
from app.domains.laboratory.persistence.laboratorio import (
    ESTADOS_TRABAJO_LAB,
    Laboratorio,
    TrabajoLaboratorio,
)
from app.domains.laboratory.schemas.laboratorio import (
    AgendaLaboratorioDiaResponse,
    AgendaLaboratorioResumen,
    LaboratorioCreate,
    LaboratorioResponse,
    LaboratorioUpdate,
    TrabajoAsociarCita,
    TrabajoCreate,
    TrabajoEstadoAccion,
    TrabajoResponse,
    TrabajoUpdate,
)
from app.domains.patients.persistence.paciente import Paciente
from app.domains.scheduling.persistence.cita import Cita

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


async def listar_laboratorios(db: AsyncSession, _: TokenData, solo_activos: bool) -> list[LaboratorioResponse]:
    q = select(Laboratorio).order_by(Laboratorio.nombre)
    if solo_activos:
        q = q.where(Laboratorio.activo == True)  # noqa: E712
    result = await db.execute(q)
    return [LaboratorioResponse.model_validate(r) for r in result.scalars().all()]


async def crear_laboratorio(data: LaboratorioCreate, db: AsyncSession) -> LaboratorioResponse:
    lab = Laboratorio(**data.model_dump())
    db.add(lab)
    await db.commit()
    await db.refresh(lab)
    return LaboratorioResponse.model_validate(lab)


async def actualizar_laboratorio(lab_id: uuid.UUID, data: LaboratorioUpdate, db: AsyncSession) -> LaboratorioResponse:
    lab = await db.get(Laboratorio, lab_id)
    if not lab:
        raise HTTPException(status_code=404, detail="Laboratorio no encontrado")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(lab, field, value)
    await db.commit()
    await db.refresh(lab)
    return LaboratorioResponse.model_validate(lab)


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


async def _get_trabajo_or_404(db: AsyncSession, trabajo_id: uuid.UUID, current_user: TokenData) -> TrabajoLaboratorio:
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
    current_user: TokenData,
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


async def listar_trabajos(db: AsyncSession, current_user: TokenData, laboratorio_id: uuid.UUID | None, paciente_id: uuid.UUID | None, cita_id: uuid.UUID | None, doctor_id: uuid.UUID | None, estado: str | None, pendientes: bool, proximos: bool, vencidos: bool) -> list[TrabajoResponse]:
    q = _trabajo_query().order_by(TrabajoLaboratorio.created_at.desc())
    clinic_condition = clinic_column_condition(Paciente.clinica_id, current_user)
    if clinic_condition is not None:
        q = q.join(TrabajoLaboratorio.paciente).where(clinic_condition)
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


async def crear_trabajo(data: TrabajoCreate, request: Request, db: AsyncSession, current_user: TokenData) -> TrabajoResponse:
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
        from app.domains.treatment_plans.persistence.presupuesto import (
            Presupuesto,
            PresupuestoLinea,
        )
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


async def actualizar_trabajo(trabajo_id: uuid.UUID, data: TrabajoUpdate, request: Request, db: AsyncSession, current_user: TokenData) -> TrabajoResponse:
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


async def trabajos_por_cita(cita_id: uuid.UUID, db: AsyncSession, current_user: TokenData) -> list[TrabajoResponse]:
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


async def asociar_trabajo_a_cita(trabajo_id: uuid.UUID, data: TrabajoAsociarCita, request: Request, db: AsyncSession, current_user: TokenData) -> TrabajoResponse:
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
    current_user: TokenData,
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


async def marcar_trabajo_recibido(trabajo_id: uuid.UUID, data: TrabajoEstadoAccion, request: Request, db: AsyncSession, current_user: TokenData) -> TrabajoResponse:
    trabajo = await _get_trabajo_or_404(db, trabajo_id, current_user)
    return await _aplicar_accion_estado(
        trabajo=trabajo,
        data=data,
        request=request,
        db=db,
        current_user=current_user,
        estado="received_in_clinic",
    )


async def marcar_trabajo_revisado(trabajo_id: uuid.UUID, data: TrabajoEstadoAccion, request: Request, db: AsyncSession, current_user: TokenData) -> TrabajoResponse:
    trabajo = await _get_trabajo_or_404(db, trabajo_id, current_user)
    return await _aplicar_accion_estado(
        trabajo=trabajo,
        data=data,
        request=request,
        db=db,
        current_user=current_user,
        estado="checked_in_clinic",
    )


async def marcar_trabajo_entregado(trabajo_id: uuid.UUID, data: TrabajoEstadoAccion, request: Request, db: AsyncSession, current_user: TokenData) -> TrabajoResponse:
    trabajo = await _get_trabajo_or_404(db, trabajo_id, current_user)
    return await _aplicar_accion_estado(
        trabajo=trabajo,
        data=data,
        request=request,
        db=db,
        current_user=current_user,
        estado="delivered_or_placed",
    )


async def trabajos_laboratorio_agenda_dia(db: AsyncSession, current_user: TokenData, fecha: date, doctor_id: uuid.UUID | None) -> AgendaLaboratorioDiaResponse:
    desde = datetime.combine(fecha, time.min, tzinfo=timezone.utc)
    hasta = datetime.combine(fecha, time.max, tzinfo=timezone.utc)
    q = (
        _trabajo_query()
        .join(Cita, TrabajoLaboratorio.cita_id == Cita.id)
        .where(Cita.fecha_hora >= desde, Cita.fecha_hora <= hasta)
        .order_by(Cita.fecha_hora, TrabajoLaboratorio.created_at)
    )
    clinic_condition = clinic_column_condition(Cita.clinica_id, current_user)
    if clinic_condition is not None:
        q = q.where(clinic_condition)
    if doctor_id:
        q = q.where(Cita.doctor_id == doctor_id)
    result = await db.execute(q)
    trabajos = list(result.scalars().all())
    return AgendaLaboratorioDiaResponse(
        fecha=fecha,
        resumen=_resumen_agenda(fecha, trabajos),
        trabajos=[TrabajoResponse.model_validate(t) for t in trabajos],
    )


async def resumen_laboratorio_agenda_dia(db: AsyncSession, current_user: TokenData, fecha: date, doctor_id: uuid.UUID | None) -> AgendaLaboratorioResumen:
    dia = await trabajos_laboratorio_agenda_dia(db, current_user, fecha, doctor_id)
    return dia.resumen


async def eliminar_trabajo(trabajo_id: uuid.UUID, db: AsyncSession, current_user: TokenData) -> None:
    trabajo = await _get_trabajo_or_404(db, trabajo_id, current_user)
    await db.delete(trabajo)
    await db.commit()
