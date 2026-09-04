"""
Router de citas — agenda.
Fase 2: CRUD completo + búsqueda de huecos + panel Telefonear.
"""
from datetime import datetime, timedelta, timezone
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.crypto import descifrar_bytes
from app.core.permissions import (
    CurrentUser,
    RequireAdmin,
    clinic_column_condition,
    ensure_clinic_access,
    resolve_clinic_id,
    scope_select_by_clinic,
)
from app.database import get_db
from app.models.cita import Cita, CitaCambio, CitaTelefonear, HistorialFaltas
from app.models.doctor import Doctor
from app.models.laboratorio import TrabajoLaboratorio
from app.models.paciente import Paciente
from app.models.presupuesto import PresupuestoLinea
from app.schemas.cita import (
    BuscarHuecoRequest,
    CitaCambioResponse,
    CitaCancelar,
    CitaCreate,
    CitaEstadoUpdate,
    CitaReprogramar,
    CitaResponse,
    CitaTelefonearCreate,
    CitaTelefonearResponse,
    CitaTelefonearUpdate,
    CitaUpdate,
    DisponibilidadDia,
    HuecoLibre,
)
from app.schemas.extras import RecordatorioCreate, RecordatorioResponse
from app.services.agenda_service import (
    buscar_huecos_libres,
    esta_dentro_disponibilidad,
    get_horario_dia,
    hay_solapamiento,
    hay_solapamiento_gabinete,
)
from app.services.audit import write_audit_log
from app.services.notificaciones import create_patient_waiting_notification
from app.services.whatsapp_service import record_outbound_whatsapp

router = APIRouter()


# ─── helpers ─────────────────────────────────────────────────────────────────

async def _get_cita_or_404(db: AsyncSession, cita_id: UUID) -> Cita:
    result = await db.execute(
        select(Cita)
        .options(
            selectinload(Cita.paciente),
            selectinload(Cita.doctor),
            selectinload(Cita.trabajos_laboratorio).selectinload(TrabajoLaboratorio.laboratorio),
        )
        .where(Cita.id == cita_id)
    )
    cita = result.scalar_one_or_none()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    return cita


async def _paciente_resumen(db: AsyncSession, paciente: Paciente | None) -> dict | None:
    if not paciente:
        return None

    telefono_claro = None
    if paciente.telefono:
        telefono_claro = await descifrar_bytes(db, paciente.telefono)

    return {
        "id": paciente.id,
        "nombre": paciente.nombre,
        "apellidos": paciente.apellidos,
        "num_historial": paciente.num_historial,
        "telefono": telefono_claro,
    }


def _doctor_resumen(doctor: Doctor | None) -> dict | None:
    if not doctor:
        return None
    return {
        "id": doctor.id,
        "nombre": doctor.nombre,
        "color_agenda": doctor.color_agenda,
    }


def _laboratorio_trabajo_resumen(trabajo: TrabajoLaboratorio) -> dict:
    return {
        "id": trabajo.id,
        "paciente_id": trabajo.paciente_id,
        "doctor_id": trabajo.doctor_id,
        "laboratorio_id": trabajo.laboratorio_id,
        "cita_id": trabajo.cita_id,
        "tratamiento_id": trabajo.tratamiento_id,
        "presupuesto_linea_id": trabajo.presupuesto_linea_id,
        "tipo_trabajo": trabajo.tipo_trabajo,
        "descripcion": trabajo.descripcion,
        "pieza_dental": trabajo.pieza_dental,
        "observaciones": trabajo.observaciones,
        "fecha_salida": trabajo.fecha_salida,
        "fecha_entrega_prevista": trabajo.fecha_entrega_prevista,
        "fecha_recepcion": trabajo.fecha_recepcion,
        "fecha_revision": trabajo.fecha_revision,
        "fecha_entrega_paciente": trabajo.fecha_entrega_paciente,
        "ubicacion_clinica": trabajo.ubicacion_clinica,
        "estado": trabajo.estado,
        "colocado": trabajo.colocado,
        "material_enviado": trabajo.material_enviado,
        "material_devuelto": trabajo.material_devuelto,
        "laboratorio": {
            "id": trabajo.laboratorio.id,
            "nombre": trabajo.laboratorio.nombre,
            "contacto": trabajo.laboratorio.contacto,
        } if trabajo.laboratorio else None,
    }


def _trabajos_laboratorio_de_cita(cita: Cita) -> list[dict]:
    if "trabajos_laboratorio" in inspect(cita).unloaded:
        return []
    return [_laboratorio_trabajo_resumen(trabajo) for trabajo in cita.trabajos_laboratorio]


async def _to_response(db: AsyncSession, cita: Cita) -> CitaResponse:
    return CitaResponse.model_validate(
        {
            "id": cita.id,
            "paciente_id": cita.paciente_id,
            "clinica_id": cita.clinica_id,
            "doctor_id": cita.doctor_id,
            "gabinete_id": cita.gabinete_id,
            "presupuesto_linea_id": cita.presupuesto_linea_id,
            "fecha_hora": cita.fecha_hora,
            "duracion_min": cita.duracion_min,
            "estado": cita.estado,
            "es_urgencia": cita.es_urgencia,
            "motivo": cita.motivo,
            "observaciones": cita.observaciones,
            "recordatorio_enviado": cita.recordatorio_enviado,
            "recordatorio_canal": cita.recordatorio_canal,
            "recordatorio_estado": cita.recordatorio_estado,
            "recordatorio_at": cita.recordatorio_at,
            "confirmado_at": cita.confirmado_at,
            "motivo_cancelacion": cita.motivo_cancelacion,
            "paciente": await _paciente_resumen(db, cita.paciente),
            "doctor": _doctor_resumen(cita.doctor),
            "laboratorio": _trabajos_laboratorio_de_cita(cita),
        }
    )


async def _to_telefonear_response(
    db: AsyncSession,
    entrada: CitaTelefonear,
) -> CitaTelefonearResponse:
    return CitaTelefonearResponse.model_validate(
        {
            "id": entrada.id,
            "cita_original_id": entrada.cita_original_id,
            "paciente_id": entrada.paciente_id,
            "doctor_id": entrada.doctor_id,
            "motivo": entrada.motivo,
            "notas": entrada.notas,
            "estado_contacto": entrada.estado_contacto,
            "ultimo_intento_at": entrada.ultimo_intento_at,
            "proximo_intento_at": entrada.proximo_intento_at,
            "reubicada": entrada.reubicada,
            "nueva_cita_id": entrada.nueva_cita_id,
            "paciente": await _paciente_resumen(db, entrada.paciente),
            "doctor": _doctor_resumen(entrada.doctor),
        }
    )


ESTADOS_FALTA = {"falta", "anulada", "cancelled_by_patient"}
TIPO_FALTA_MAP = {
    "falta": "falta",
    "anulada": "anulacion_paciente",
    "cancelled_by_patient": "anulacion_paciente",
}


def _snapshot_cita(cita: Cita) -> dict:
    return {
        "doctor_id": str(cita.doctor_id),
        "gabinete_id": str(cita.gabinete_id) if cita.gabinete_id else None,
        "presupuesto_linea_id": str(cita.presupuesto_linea_id) if cita.presupuesto_linea_id else None,
        "fecha_hora": cita.fecha_hora.isoformat(),
        "duracion_min": cita.duracion_min,
        "estado": cita.estado,
        "motivo": cita.motivo,
        "observaciones": cita.observaciones,
        "motivo_cancelacion": cita.motivo_cancelacion,
        "recordatorio_enviado": cita.recordatorio_enviado,
        "recordatorio_canal": cita.recordatorio_canal,
        "recordatorio_estado": cita.recordatorio_estado,
        "recordatorio_at": cita.recordatorio_at.isoformat() if cita.recordatorio_at else None,
    }


async def _registrar_cambio_cita(
    db: AsyncSession,
    *,
    cita: Cita,
    current_user: CurrentUser,
    accion: str,
    old_values: dict | None = None,
    new_values: dict | None = None,
    motivo: str | None = None,
    request: Request | None = None,
) -> None:
    old_values = old_values or {}
    new_values = new_values or {}
    db.add(CitaCambio(
        cita_id=cita.id,
        usuario_id=current_user.user_id,
        accion=accion,
        estado_anterior=old_values.get("estado"),
        estado_nuevo=new_values.get("estado"),
        fecha_anterior=datetime.fromisoformat(old_values["fecha_hora"]) if old_values.get("fecha_hora") else None,
        fecha_nueva=datetime.fromisoformat(new_values["fecha_hora"]) if new_values.get("fecha_hora") else None,
        doctor_anterior_id=UUID(old_values["doctor_id"]) if old_values.get("doctor_id") else None,
        doctor_nuevo_id=UUID(new_values["doctor_id"]) if new_values.get("doctor_id") else None,
        motivo=motivo,
        datos={"antes": old_values, "despues": new_values},
    ))
    await write_audit_log(
        db,
        user=current_user,
        action=f"CITA_{accion.upper()}",
        entity_type="citas",
        entity_id=cita.id,
        old_values=old_values,
        new_values=new_values,
        clinica_id=cita.clinica_id,
        request=request,
    )


async def _validate_presupuesto_linea_for_cita(
    db: AsyncSession,
    *,
    paciente_id: UUID,
    presupuesto_linea_id: UUID | None,
    current_user: CurrentUser,
) -> None:
    if not presupuesto_linea_id:
        return
    result = await db.execute(
        select(PresupuestoLinea)
        .options(selectinload(PresupuestoLinea.presupuesto))
        .where(PresupuestoLinea.id == presupuesto_linea_id)
    )
    linea = result.scalar_one_or_none()
    if not linea:
        raise HTTPException(status_code=404, detail="Linea de presupuesto no encontrada")
    presupuesto = linea.presupuesto
    if not presupuesto or presupuesto.paciente_id != paciente_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La linea de presupuesto no pertenece al paciente de la cita",
        )
    ensure_clinic_access(current_user, presupuesto.clinica_id)


async def _validar_cita_operativa(
    db: AsyncSession,
    *,
    current_user: CurrentUser,
    cita_id: UUID | None,
    doctor_id: UUID,
    gabinete_id: UUID | None,
    fecha_hora: datetime,
    duracion_min: int,
    es_urgencia: bool,
    forzar_fuera_horario: bool,
) -> None:
    if forzar_fuera_horario and current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Solo admin puede forzar una cita fuera de horario")
    if not es_urgencia:
        solapamiento = await hay_solapamiento(db, doctor_id, fecha_hora, duracion_min, excluir_cita_id=cita_id)
        if solapamiento:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El doctor ya tiene una cita en ese horario")
        gabinete_ocupado = await hay_solapamiento_gabinete(db, gabinete_id, fecha_hora, duracion_min, excluir_cita_id=cita_id)
        if gabinete_ocupado:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El gabinete ya tiene una cita en ese horario")
    if not es_urgencia and not forzar_fuera_horario:
        dentro_disponibilidad = await esta_dentro_disponibilidad(db, doctor_id, fecha_hora, duracion_min)
        if not dentro_disponibilidad:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La cita queda fuera del horario configurado del doctor")


async def _registrar_falta_si_procede(
    db: AsyncSession,
    cita: Cita,
    nuevo_estado: str,
) -> None:
    """Crea un registro en historial_faltas si el nuevo estado lo requiere."""
    if nuevo_estado not in ESTADOS_FALTA:
        return
    tipo = TIPO_FALTA_MAP.get(nuevo_estado, "anulacion_paciente")
    falta = HistorialFaltas(
        paciente_id=cita.paciente_id,
        cita_id=cita.id,
        tipo=tipo,
        fecha=datetime.now(timezone.utc),
    )
    db.add(falta)


async def _notificar_llegada_si_procede(
    db: AsyncSession,
    cita: Cita,
    estado_anterior: str | None,
    estado_nuevo: str,
) -> None:
    if estado_nuevo != "en_clinica" or estado_anterior == "en_clinica":
        return
    await create_patient_waiting_notification(db, cita)


# ─── CITAS ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[CitaResponse])
async def listar_citas(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    doctor_id: UUID | None = Query(None),
    paciente_id: UUID | None = Query(None),
    fecha_desde: datetime | None = Query(None),
    fecha_hasta: datetime | None = Query(None),
    estado: str | None = Query(None, pattern=r"^(programada|confirmada|en_clinica|atendida|falta|anulada|pending_confirmation|confirmed|reminder_sent|reschedule_requested|cancelled_by_patient|pending_manual_review|rescheduled)$"),
) -> list[CitaResponse]:
    q = (
        select(Cita)
        .options(
            selectinload(Cita.paciente),
            selectinload(Cita.doctor),
            selectinload(Cita.trabajos_laboratorio).selectinload(TrabajoLaboratorio.laboratorio),
        )
        .order_by(Cita.fecha_hora)
    )
    q = scope_select_by_clinic(q, Cita, current_user)
    if doctor_id:
        q = q.where(Cita.doctor_id == doctor_id)
    if paciente_id:
        q = q.where(Cita.paciente_id == paciente_id)
    if fecha_desde:
        q = q.where(Cita.fecha_hora >= fecha_desde)
    if fecha_hasta:
        q = q.where(Cita.fecha_hora <= fecha_hasta)
    if estado:
        q = q.where(Cita.estado == estado)

    result = await db.execute(q)
    citas_orm = result.scalars().all()

    # Descifrar teléfono de cada paciente en paralelo (una query por paciente con teléfono)
    respuestas = []
    for c in citas_orm:
        respuestas.append(await _to_response(db, c))
    return respuestas


@router.post("", response_model=CitaResponse, status_code=status.HTTP_201_CREATED)
async def crear_cita(
    data: CitaCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    # Verificar que paciente y doctor existen
    pac = await db.get(Paciente, data.paciente_id)
    if not pac:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    doc = await db.get(Doctor, data.doctor_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    ensure_clinic_access(current_user, pac.clinica_id)
    ensure_clinic_access(current_user, doc.clinica_id)
    if pac.clinica_id and doc.clinica_id and pac.clinica_id != doc.clinica_id:
        raise HTTPException(status_code=409, detail="Paciente y doctor pertenecen a clínicas distintas")
    await _validate_presupuesto_linea_for_cita(
        db,
        paciente_id=data.paciente_id,
        presupuesto_linea_id=data.presupuesto_linea_id,
        current_user=current_user,
    )

    await _validar_cita_operativa(
        db,
        current_user=current_user,
        cita_id=None,
        doctor_id=data.doctor_id,
        gabinete_id=data.gabinete_id,
        fecha_hora=data.fecha_hora,
        duracion_min=data.duracion_min,
        es_urgencia=data.es_urgencia,
        forzar_fuera_horario=data.forzar_fuera_horario,
    )

    campos = data.model_dump(exclude={"forzar_fuera_horario"})
    campos["clinica_id"] = resolve_clinic_id(current_user, pac.clinica_id or doc.clinica_id)
    cita = Cita(**campos)
    db.add(cita)
    await db.flush()
    await _registrar_cambio_cita(
        db,
        cita=cita,
        current_user=current_user,
        accion="crear",
        new_values=_snapshot_cita(cita),
        request=request,
    )
    await db.commit()
    await db.refresh(cita)
    return await _to_response(db, await _get_cita_or_404(db, cita.id))


@router.get("/buscar-hueco", response_model=list[HuecoLibre])
async def buscar_hueco(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    doctor_id: UUID = Query(...),
    duracion_min: int = Query(30, ge=10, le=480, multiple_of=10),
    desde: datetime = Query(...),
    hasta: datetime = Query(...),
    solo_manana: bool = Query(False),
    solo_tarde: bool = Query(False),
    max_resultados: int = Query(20, ge=1, le=100),
) -> list[HuecoLibre]:
    doctor = await db.get(Doctor, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    ensure_clinic_access(current_user, doctor.clinica_id)
    return await buscar_huecos_libres(
        db,
        doctor_id=doctor_id,
        duracion_min=duracion_min,
        desde=desde,
        hasta=hasta,
        solo_manana=solo_manana,
        solo_tarde=solo_tarde,
        max_resultados=max_resultados,
    )


@router.post("/buscar-hueco", response_model=list[HuecoLibre])
async def buscar_hueco_post(
    data: BuscarHuecoRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[HuecoLibre]:
    doctor = await db.get(Doctor, data.doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    ensure_clinic_access(current_user, doctor.clinica_id)
    return await buscar_huecos_libres(
        db,
        doctor_id=data.doctor_id,
        duracion_min=data.duracion_min,
        desde=data.desde,
        hasta=data.hasta,
        solo_manana=data.solo_manana,
        solo_tarde=data.solo_tarde,
    )


@router.get("/disponibilidad", response_model=list[DisponibilidadDia])
async def disponibilidad_doctor(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    doctor_id: UUID = Query(...),
    desde: datetime = Query(...),
    dias: int = Query(7, ge=1, le=60),
) -> list[DisponibilidadDia]:
    doctor = await db.get(Doctor, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    ensure_clinic_access(current_user, doctor.clinica_id)
    disponibilidad = []
    fecha_base = desde.replace(hour=0, minute=0, second=0, microsecond=0)
    for index in range(dias):
        fecha = fecha_base + timedelta(days=index)
        bloques, intervalo = await get_horario_dia(db, doctor_id, fecha)
        disponibilidad.append(DisponibilidadDia(
            doctor_id=doctor_id,
            fecha=fecha,
            bloques=bloques,
            intervalo_min=intervalo,
            trabaja=bool(bloques),
        ))
    return disponibilidad


@router.patch("/{cita_id}/reprogramar", response_model=CitaResponse)
async def reprogramar_cita(
    cita_id: UUID,
    data: CitaReprogramar,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    cita = await _get_cita_or_404(db, cita_id)
    ensure_clinic_access(current_user, cita.clinica_id)
    old = _snapshot_cita(cita)
    doctor_destino = data.doctor_id or cita.doctor_id
    doctor = await db.get(Doctor, doctor_destino)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    ensure_clinic_access(current_user, doctor.clinica_id)
    nueva_duracion = data.duracion_min or cita.duracion_min
    nuevo_gabinete = data.gabinete_id if data.gabinete_id is not None else cita.gabinete_id
    await _validar_cita_operativa(
        db,
        current_user=current_user,
        cita_id=cita.id,
        doctor_id=doctor_destino,
        gabinete_id=nuevo_gabinete,
        fecha_hora=data.fecha_hora,
        duracion_min=nueva_duracion,
        es_urgencia=cita.es_urgencia,
        forzar_fuera_horario=data.forzar_fuera_horario,
    )
    cita.doctor_id = doctor_destino
    cita.gabinete_id = nuevo_gabinete
    cita.fecha_hora = data.fecha_hora
    cita.duracion_min = nueva_duracion
    if cita.estado in {"reschedule_requested", "pending_manual_review"}:
        cita.estado = "rescheduled"
        cita.recordatorio_estado = "reprogramada_manual"
    if data.motivo:
        cita.observaciones = f"{cita.observaciones or ''}\nReprogramada: {data.motivo}".strip()
    await _registrar_cambio_cita(
        db,
        cita=cita,
        current_user=current_user,
        accion="reprogramar",
        old_values=old,
        new_values=_snapshot_cita(cita),
        motivo=data.motivo,
        request=request,
    )
    await db.commit()
    return await _to_response(db, await _get_cita_or_404(db, cita_id))


@router.patch("/{cita_id}/estado", response_model=CitaResponse)
async def cambiar_estado_cita(
    cita_id: UUID,
    data: CitaEstadoUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    cita = await _get_cita_or_404(db, cita_id)
    ensure_clinic_access(current_user, cita.clinica_id)
    old = _snapshot_cita(cita)
    nuevo_estado = data.estado.value
    if nuevo_estado != cita.estado:
        await _registrar_falta_si_procede(db, cita, nuevo_estado)
        await _notificar_llegada_si_procede(db, cita, cita.estado, nuevo_estado)
    cita.estado = nuevo_estado
    if nuevo_estado == "confirmada" and cita.confirmado_at is None:
        cita.confirmado_at = datetime.now(timezone.utc)
    if data.motivo:
        cita.observaciones = f"{cita.observaciones or ''}\nCambio estado: {data.motivo}".strip()
    await _registrar_cambio_cita(
        db,
        cita=cita,
        current_user=current_user,
        accion="estado",
        old_values=old,
        new_values=_snapshot_cita(cita),
        motivo=data.motivo,
        request=request,
    )
    await db.commit()
    return await _to_response(db, await _get_cita_or_404(db, cita_id))


@router.post("/{cita_id}/confirmar", response_model=CitaResponse)
async def confirmar_cita(
    cita_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    return await cambiar_estado_cita(
        cita_id,
        CitaEstadoUpdate(estado="confirmada", motivo="Confirmada desde agenda"),
        request,
        db,
        current_user,
    )


@router.post("/{cita_id}/cancelar", response_model=CitaResponse)
async def cancelar_cita(
    cita_id: UUID,
    data: CitaCancelar,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    cita = await _get_cita_or_404(db, cita_id)
    ensure_clinic_access(current_user, cita.clinica_id)
    old = _snapshot_cita(cita)
    cita.estado = "anulada"
    cita.motivo_cancelacion = data.motivo_cancelacion
    cita.observaciones = f"{cita.observaciones or ''}\nCancelada: {data.motivo_cancelacion}".strip()
    tipo_falta = "anulacion_clinica" if data.tipo == "anulacion_clinica" else "anulacion_paciente"
    db.add(HistorialFaltas(
        paciente_id=cita.paciente_id,
        cita_id=cita.id,
        tipo=tipo_falta,
        fecha=datetime.now(timezone.utc),
        notas=data.motivo_cancelacion,
    ))
    if data.crear_telefonear or data.tipo == "reprogramada":
        db.add(CitaTelefonear(
            cita_original_id=cita.id,
            paciente_id=cita.paciente_id,
            doctor_id=cita.doctor_id,
            motivo="Reprogramar cita cancelada",
            notas=data.motivo_cancelacion,
            proximo_intento_at=data.proximo_intento_at,
        ))
    await _registrar_cambio_cita(
        db,
        cita=cita,
        current_user=current_user,
        accion="cancelar",
        old_values=old,
        new_values=_snapshot_cita(cita),
        motivo=data.motivo_cancelacion,
        request=request,
    )
    await db.commit()
    return await _to_response(db, await _get_cita_or_404(db, cita_id))


@router.post("/{cita_id}/marcar-falta", response_model=CitaResponse)
async def marcar_falta_cita(
    cita_id: UUID,
    data: CitaCancelar,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    cita = await _get_cita_or_404(db, cita_id)
    ensure_clinic_access(current_user, cita.clinica_id)
    old = _snapshot_cita(cita)
    cita.estado = "falta"
    cita.motivo_cancelacion = data.motivo_cancelacion
    db.add(HistorialFaltas(
        paciente_id=cita.paciente_id,
        cita_id=cita.id,
        tipo="falta",
        fecha=datetime.now(timezone.utc),
        notas=data.motivo_cancelacion,
    ))
    await _registrar_cambio_cita(
        db,
        cita=cita,
        current_user=current_user,
        accion="falta",
        old_values=old,
        new_values=_snapshot_cita(cita),
        motivo=data.motivo_cancelacion,
        request=request,
    )
    await db.commit()
    return await _to_response(db, await _get_cita_or_404(db, cita_id))


@router.get("/{cita_id}/cambios", response_model=list[CitaCambioResponse])
async def historial_cambios_cita(
    cita_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[CitaCambioResponse]:
    cita = await _get_cita_or_404(db, cita_id)
    ensure_clinic_access(current_user, cita.clinica_id)
    result = await db.execute(
        select(CitaCambio)
        .where(CitaCambio.cita_id == cita_id)
        .order_by(CitaCambio.created_at.desc())
    )
    return [CitaCambioResponse.model_validate(item) for item in result.scalars().all()]


@router.get("/panel/telefonear/pendientes", response_model=list[CitaTelefonearResponse])
async def listar_telefonear_panel(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    doctor_id: UUID | None = Query(None),
) -> list[CitaTelefonearResponse]:
    q = (
        select(CitaTelefonear)
        .options(selectinload(CitaTelefonear.paciente), selectinload(CitaTelefonear.doctor))
        .where(CitaTelefonear.reubicada == False)  # noqa: E712
        .order_by(CitaTelefonear.created_at)
    )
    clinic_condition = clinic_column_condition(Paciente.clinica_id, current_user)
    if clinic_condition is not None:
        q = q.join(Paciente, CitaTelefonear.paciente_id == Paciente.id).where(clinic_condition)
    if doctor_id:
        q = q.where(CitaTelefonear.doctor_id == doctor_id)
    result = await db.execute(q)
    return [await _to_telefonear_response(db, t) for t in result.scalars().all()]


@router.get("/{cita_id}", response_model=CitaResponse)
async def obtener_cita(
    cita_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    cita = await _get_cita_or_404(db, cita_id)
    ensure_clinic_access(current_user, cita.clinica_id)
    return await _to_response(db, cita)


@router.post("/{cita_id}/recordatorio", response_model=RecordatorioResponse)
async def enviar_recordatorio(
    cita_id: UUID,
    data: RecordatorioCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecordatorioResponse:
    cita = await _get_cita_or_404(db, cita_id)
    ensure_clinic_access(current_user, cita.clinica_id)
    old = _snapshot_cita(cita)
    paciente = cita.paciente or await db.get(Paciente, cita.paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    telefono = await descifrar_bytes(db, paciente.telefono) if paciente.telefono else None
    email = await descifrar_bytes(db, paciente.email) if paciente.email else None
    nombre = f"{paciente.nombre} {paciente.apellidos}".strip()
    fecha = cita.fecha_hora.strftime("%d/%m/%Y %H:%M")
    mensaje = data.mensaje or (
        f"Hola {nombre}, le recordamos su cita en la clinica dental el {fecha}. "
        "Por favor confirme o avise si necesita cambiarla."
    )

    whatsapp_url = None
    email_url = None
    if data.canal in {"whatsapp", "ambos"} and telefono:
        phone = "".join(ch for ch in telefono if ch.isdigit())
        whatsapp_url = f"https://wa.me/{phone}?text={quote(mensaje)}"
    if data.canal in {"email", "ambos"} and email:
        email_url = f"mailto:{email}?subject={quote('Recordatorio de cita dental')}&body={quote(mensaje)}"

    cita.recordatorio_enviado = True
    cita.recordatorio_canal = data.canal
    cita.recordatorio_estado = "enviado"
    cita.recordatorio_at = datetime.now(timezone.utc)
    if data.canal in {"whatsapp", "ambos"}:
        await record_outbound_whatsapp(db, cita=cita, message_body=mensaje)
        if cita.estado in {"programada", "pending_confirmation"}:
            cita.estado = "reminder_sent"
    new = _snapshot_cita(cita)
    if old != new:
        await _registrar_cambio_cita(
            db,
            cita=cita,
            current_user=current_user,
            accion="recordatorio",
            old_values=old,
            new_values=new,
            motivo=f"Recordatorio {data.canal}",
            request=request,
        )
    await db.commit()
    return RecordatorioResponse(
        citaId=cita_id,
        canal=data.canal,
        estado="enviado",
        whatsappUrl=whatsapp_url,
        emailUrl=email_url,
    )


@router.patch("/{cita_id}", response_model=CitaResponse)
async def actualizar_cita(
    cita_id: UUID,
    data: CitaUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    cita = await _get_cita_or_404(db, cita_id)
    ensure_clinic_access(current_user, cita.clinica_id)
    old = _snapshot_cita(cita)
    if "presupuesto_linea_id" in data.model_fields_set:
        await _validate_presupuesto_linea_for_cita(
            db,
            paciente_id=cita.paciente_id,
            presupuesto_linea_id=data.presupuesto_linea_id,
            current_user=current_user,
        )

    # Si cambia fecha/hora o duración, re-verificar solapamiento
    nueva_fecha = data.fecha_hora or cita.fecha_hora
    nueva_duracion = data.duracion_min or cita.duracion_min
    nueva_urgencia = data.es_urgencia if data.es_urgencia is not None else cita.es_urgencia
    nuevo_gabinete = data.gabinete_id if data.gabinete_id is not None else cita.gabinete_id

    doctor_destino = data.doctor_id or cita.doctor_id
    doctor = await db.get(Doctor, doctor_destino)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    ensure_clinic_access(current_user, doctor.clinica_id)

    if data.fecha_hora or data.duracion_min or data.doctor_id or data.gabinete_id is not None:
        await _validar_cita_operativa(
            db,
            current_user=current_user,
            cita_id=cita_id,
            doctor_id=doctor_destino,
            gabinete_id=nuevo_gabinete,
            fecha_hora=nueva_fecha,
            duracion_min=nueva_duracion,
            es_urgencia=nueva_urgencia,
            forzar_fuera_horario=bool(data.forzar_fuera_horario),
        )

    # Registrar falta/anulación antes de cambiar el estado
    nuevo_estado = data.estado.value if data.estado else None
    if nuevo_estado and nuevo_estado != cita.estado:
        await _registrar_falta_si_procede(db, cita, nuevo_estado)
        await _notificar_llegada_si_procede(db, cita, cita.estado, nuevo_estado)
        if nuevo_estado == "confirmada" and cita.confirmado_at is None:
            cita.confirmado_at = datetime.now(timezone.utc)
        if nuevo_estado in {"anulada", "falta"} and data.motivo_cancelacion and not cita.motivo_cancelacion:
            cita.motivo_cancelacion = data.motivo_cancelacion

    if data.recordatorio_enviado and cita.recordatorio_at is None and data.recordatorio_at is None:
        cita.recordatorio_at = datetime.now(timezone.utc)

    for field, value in data.model_dump(exclude_unset=True, exclude={"forzar_fuera_horario"}).items():
        setattr(cita, field, value)

    new = _snapshot_cita(cita)
    if old != new:
        await _registrar_cambio_cita(
            db,
            cita=cita,
            current_user=current_user,
            accion="actualizar",
            old_values=old,
            new_values=new,
            motivo=data.motivo_cancelacion,
            request=request,
        )
    await db.commit()
    return await _to_response(db, await _get_cita_or_404(db, cita_id))


@router.delete("/{cita_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def anular_cita(
    cita_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    """Soft-delete: pone estado = anulada."""
    cita = await _get_cita_or_404(db, cita_id)
    ensure_clinic_access(current_user, cita.clinica_id)
    if cita.estado != "anulada":
        await _registrar_falta_si_procede(db, cita, "anulada")
        cita.estado = "anulada"
        await db.commit()


# ─── FALTAS ───────────────────────────────────────────────────────────────────

@router.get("/{cita_id}/faltas-paciente", response_model=list[dict])
async def contar_faltas_paciente(
    cita_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[dict]:
    """Devuelve historial de faltas del paciente dueño de esta cita (para mostrar alerta)."""
    cita = await _get_cita_or_404(db, cita_id)
    ensure_clinic_access(current_user, cita.clinica_id)
    result = await db.execute(
        select(HistorialFaltas)
        .where(HistorialFaltas.paciente_id == cita.paciente_id)
        .order_by(HistorialFaltas.fecha.desc())
    )
    faltas = result.scalars().all()
    return [
        {"tipo": f.tipo, "fecha": f.fecha.isoformat(), "cita_id": str(f.cita_id)}
        for f in faltas
    ]


# ─── TELEFONEAR ───────────────────────────────────────────────────────────────

@router.get("/telefonear/pendientes", response_model=list[CitaTelefonearResponse])
async def listar_telefonear(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    doctor_id: UUID | None = Query(None),
) -> list[CitaTelefonearResponse]:
    return await listar_telefonear_panel(db, current_user, doctor_id)


@router.post("/telefonear", response_model=CitaTelefonearResponse, status_code=status.HTTP_201_CREATED)
async def crear_telefonear(
    data: CitaTelefonearCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaTelefonearResponse:
    paciente = await db.get(Paciente, data.paciente_id)
    doctor = await db.get(Doctor, data.doctor_id)
    if not paciente or not doctor:
        raise HTTPException(status_code=404, detail="Paciente o doctor no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)
    ensure_clinic_access(current_user, doctor.clinica_id)
    entrada = CitaTelefonear(
        cita_original_id=data.cita_original_id,
        paciente_id=data.paciente_id,
        doctor_id=data.doctor_id,
        motivo=data.motivo,
        notas=data.notas,
        estado_contacto=data.estado_contacto,
        ultimo_intento_at=data.ultimo_intento_at,
        proximo_intento_at=data.proximo_intento_at,
    )
    db.add(entrada)
    await db.commit()
    await db.refresh(entrada)
    result = await db.execute(
        select(CitaTelefonear)
        .options(selectinload(CitaTelefonear.paciente), selectinload(CitaTelefonear.doctor))
        .where(CitaTelefonear.id == entrada.id)
    )
    return await _to_telefonear_response(db, result.scalar_one())


@router.patch("/telefonear/{entrada_id}", response_model=CitaTelefonearResponse)
async def actualizar_telefonear(
    entrada_id: UUID,
    data: CitaTelefonearUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaTelefonearResponse:
    result = await db.execute(
        select(CitaTelefonear)
        .options(selectinload(CitaTelefonear.paciente), selectinload(CitaTelefonear.doctor))
        .where(CitaTelefonear.id == entrada_id)
    )
    entrada = result.scalar_one_or_none()
    if not entrada:
        raise HTTPException(status_code=404, detail="Entrada telefonear no encontrada")
    ensure_clinic_access(current_user, entrada.paciente.clinica_id if entrada.paciente else None)
    cambios = data.model_dump(exclude_none=True)
    if cambios.get("estado_contacto") in {"contactado", "no_responde", "cita_dada", "rechazado"} and not cambios.get("ultimo_intento_at"):
        entrada.ultimo_intento_at = datetime.now(timezone.utc)
    for field, value in cambios.items():
        setattr(entrada, field, value)
    await db.commit()
    await db.refresh(entrada)
    return await _to_telefonear_response(db, entrada)


@router.patch("/telefonear/{entrada_id}/reubicar", response_model=CitaTelefonearResponse)
async def marcar_reubicada(
    entrada_id: UUID,
    nueva_cita_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaTelefonearResponse:
    result = await db.execute(
        select(CitaTelefonear)
        .options(selectinload(CitaTelefonear.paciente), selectinload(CitaTelefonear.doctor))
        .where(CitaTelefonear.id == entrada_id)
    )
    entrada = result.scalar_one_or_none()
    if not entrada:
        raise HTTPException(status_code=404, detail="Entrada telefonear no encontrada")
    ensure_clinic_access(current_user, entrada.paciente.clinica_id if entrada.paciente else None)
    nueva_cita = await _get_cita_or_404(db, nueva_cita_id)
    ensure_clinic_access(current_user, nueva_cita.clinica_id)
    entrada.reubicada = True
    entrada.nueva_cita_id = nueva_cita_id
    entrada.estado_contacto = "cita_dada"
    entrada.ultimo_intento_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(entrada)
    result2 = await db.execute(
        select(CitaTelefonear)
        .options(selectinload(CitaTelefonear.paciente), selectinload(CitaTelefonear.doctor))
        .where(CitaTelefonear.id == entrada_id)
    )
    return await _to_telefonear_response(db, result2.scalar_one())
