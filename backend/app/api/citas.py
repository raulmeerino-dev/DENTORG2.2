"""
Router de citas — agenda.
Fase 2: CRUD completo + búsqueda de huecos + panel Telefonear.
"""
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.crypto import descifrar_bytes
from app.core.permissions import CurrentUser, RequireAdmin, get_current_user
from app.database import get_db
from app.models.cita import Cita, CitaTelefonear, HistorialFaltas
from app.models.doctor import Doctor
from app.models.paciente import Paciente
from app.schemas.cita import (
    BuscarHuecoRequest,
    CitaCreate,
    CitaResponse,
    CitaTelefonearCreate,
    CitaTelefonearResponse,
    CitaTelefonearUpdate,
    CitaUpdate,
    HuecoLibre,
)
from app.services.agenda_service import buscar_huecos_libres, esta_dentro_disponibilidad, hay_solapamiento

router = APIRouter()


# ─── helpers ─────────────────────────────────────────────────────────────────

async def _get_cita_or_404(db: AsyncSession, cita_id: UUID) -> Cita:
    result = await db.execute(
        select(Cita)
        .options(
            selectinload(Cita.paciente),
            selectinload(Cita.doctor),
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


async def _to_response(db: AsyncSession, cita: Cita) -> CitaResponse:
    return CitaResponse.model_validate(
        {
            "id": cita.id,
            "paciente_id": cita.paciente_id,
            "doctor_id": cita.doctor_id,
            "gabinete_id": cita.gabinete_id,
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


ESTADOS_FALTA = {"falta", "anulada"}
TIPO_FALTA_MAP = {
    "falta": "falta",
    "anulada": "anulacion_paciente",
}


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


# ─── CITAS ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[CitaResponse])
async def listar_citas(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    doctor_id: UUID | None = Query(None),
    paciente_id: UUID | None = Query(None),
    fecha_desde: datetime | None = Query(None),
    fecha_hasta: datetime | None = Query(None),
    estado: str | None = Query(None, pattern=r"^(programada|confirmada|en_clinica|atendida|falta|anulada)$"),
) -> list[CitaResponse]:
    q = (
        select(Cita)
        .options(selectinload(Cita.paciente), selectinload(Cita.doctor))
        .order_by(Cita.fecha_hora)
    )
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
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    # Verificar solapamiento (excepto urgencias)
    if not data.es_urgencia:
        solapamiento = await hay_solapamiento(
            db, data.doctor_id, data.fecha_hora, data.duracion_min
        )
        if solapamiento:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El doctor ya tiene una cita en ese horario",
            )

    # Verificar que paciente y doctor existen
    pac = await db.get(Paciente, data.paciente_id)
    if not pac:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    doc = await db.get(Doctor, data.doctor_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")

    if data.forzar_fuera_horario and current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Solo admin puede forzar una cita fuera de horario")
    if not data.es_urgencia and not data.forzar_fuera_horario:
        dentro_disponibilidad = await esta_dentro_disponibilidad(
            db, data.doctor_id, data.fecha_hora, data.duracion_min
        )
        if not dentro_disponibilidad:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="La cita queda fuera del horario configurado del doctor",
            )

    cita = Cita(**data.model_dump(exclude={"forzar_fuera_horario"}))
    db.add(cita)
    await db.commit()
    await db.refresh(cita)
    return await _to_response(db, await _get_cita_or_404(db, cita.id))


@router.get("/buscar-hueco", response_model=list[HuecoLibre])
async def buscar_hueco(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    doctor_id: UUID = Query(...),
    duracion_min: int = Query(30, ge=10, le=480, multiple_of=10),
    desde: datetime = Query(...),
    hasta: datetime = Query(...),
    solo_manana: bool = Query(False),
    solo_tarde: bool = Query(False),
    max_resultados: int = Query(20, ge=1, le=100),
) -> list[HuecoLibre]:
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
    _: CurrentUser,
) -> list[HuecoLibre]:
    return await buscar_huecos_libres(
        db,
        doctor_id=data.doctor_id,
        duracion_min=data.duracion_min,
        desde=data.desde,
        hasta=data.hasta,
        solo_manana=data.solo_manana,
        solo_tarde=data.solo_tarde,
    )


@router.get("/panel/telefonear/pendientes", response_model=list[CitaTelefonearResponse])
async def listar_telefonear_panel(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    doctor_id: UUID | None = Query(None),
) -> list[CitaTelefonearResponse]:
    q = (
        select(CitaTelefonear)
        .options(selectinload(CitaTelefonear.paciente), selectinload(CitaTelefonear.doctor))
        .where(CitaTelefonear.reubicada == False)  # noqa: E712
        .order_by(CitaTelefonear.created_at)
    )
    if doctor_id:
        q = q.where(CitaTelefonear.doctor_id == doctor_id)
    result = await db.execute(q)
    return [await _to_telefonear_response(db, t) for t in result.scalars().all()]


@router.get("/{cita_id}", response_model=CitaResponse)
async def obtener_cita(
    cita_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> CitaResponse:
    return await _to_response(db, await _get_cita_or_404(db, cita_id))


@router.patch("/{cita_id}", response_model=CitaResponse)
async def actualizar_cita(
    cita_id: UUID,
    data: CitaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> CitaResponse:
    cita = await _get_cita_or_404(db, cita_id)

    # Si cambia fecha/hora o duración, re-verificar solapamiento
    nueva_fecha = data.fecha_hora or cita.fecha_hora
    nueva_duracion = data.duracion_min or cita.duracion_min
    nueva_urgencia = data.es_urgencia if data.es_urgencia is not None else cita.es_urgencia

    doctor_destino = data.doctor_id or cita.doctor_id

    if (data.fecha_hora or data.duracion_min or data.doctor_id) and not nueva_urgencia:
        solapamiento = await hay_solapamiento(
            db, doctor_destino, nueva_fecha, nueva_duracion, excluir_cita_id=cita_id
        )
        if solapamiento:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El doctor ya tiene una cita en ese horario",
            )

    if data.forzar_fuera_horario and current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Solo admin puede forzar una cita fuera de horario")
    if (data.fecha_hora or data.duracion_min or data.doctor_id) and not nueva_urgencia and not data.forzar_fuera_horario:
        dentro_disponibilidad = await esta_dentro_disponibilidad(
            db, doctor_destino, nueva_fecha, nueva_duracion
        )
        if not dentro_disponibilidad:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="La cita queda fuera del horario configurado del doctor",
            )

    # Registrar falta/anulación antes de cambiar el estado
    nuevo_estado = data.estado
    if nuevo_estado and nuevo_estado != cita.estado:
        await _registrar_falta_si_procede(db, cita, nuevo_estado)
        if nuevo_estado == "confirmada" and cita.confirmado_at is None:
            cita.confirmado_at = datetime.now(timezone.utc)
        if nuevo_estado in {"anulada", "falta"} and data.motivo_cancelacion and not cita.motivo_cancelacion:
            cita.motivo_cancelacion = data.motivo_cancelacion

    if data.recordatorio_enviado and cita.recordatorio_at is None and data.recordatorio_at is None:
        cita.recordatorio_at = datetime.now(timezone.utc)

    for field, value in data.model_dump(exclude_none=True, exclude={"forzar_fuera_horario"}).items():
        setattr(cita, field, value)

    await db.commit()
    return await _to_response(db, await _get_cita_or_404(db, cita_id))


@router.delete("/{cita_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def anular_cita(
    cita_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Soft-delete: pone estado = anulada."""
    cita = await _get_cita_or_404(db, cita_id)
    if cita.estado != "anulada":
        await _registrar_falta_si_procede(db, cita, "anulada")
        cita.estado = "anulada"
        await db.commit()


# ─── FALTAS ───────────────────────────────────────────────────────────────────

@router.get("/{cita_id}/faltas-paciente", response_model=list[dict])
async def contar_faltas_paciente(
    cita_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[dict]:
    """Devuelve historial de faltas del paciente dueño de esta cita (para mostrar alerta)."""
    cita = await _get_cita_or_404(db, cita_id)
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
    _: CurrentUser,
    doctor_id: UUID | None = Query(None),
) -> list[CitaTelefonearResponse]:
    return await listar_telefonear_panel(db, _, doctor_id)


@router.post("/telefonear", response_model=CitaTelefonearResponse, status_code=status.HTTP_201_CREATED)
async def crear_telefonear(
    data: CitaTelefonearCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> CitaTelefonearResponse:
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
    _: CurrentUser,
) -> CitaTelefonearResponse:
    result = await db.execute(
        select(CitaTelefonear)
        .options(selectinload(CitaTelefonear.paciente), selectinload(CitaTelefonear.doctor))
        .where(CitaTelefonear.id == entrada_id)
    )
    entrada = result.scalar_one_or_none()
    if not entrada:
        raise HTTPException(status_code=404, detail="Entrada telefonear no encontrada")
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
    _: CurrentUser,
) -> CitaTelefonearResponse:
    result = await db.execute(
        select(CitaTelefonear)
        .options(selectinload(CitaTelefonear.paciente), selectinload(CitaTelefonear.doctor))
        .where(CitaTelefonear.id == entrada_id)
    )
    entrada = result.scalar_one_or_none()
    if not entrada:
        raise HTTPException(status_code=404, detail="Entrada telefonear no encontrada")
    entrada.reubicada = True
    entrada.nueva_cita_id = nueva_cita_id
    await db.commit()
    await db.refresh(entrada)
    result2 = await db.execute(
        select(CitaTelefonear)
        .options(selectinload(CitaTelefonear.paciente), selectinload(CitaTelefonear.doctor))
        .where(CitaTelefonear.id == entrada_id)
    )
    return await _to_telefonear_response(db, result2.scalar_one())
