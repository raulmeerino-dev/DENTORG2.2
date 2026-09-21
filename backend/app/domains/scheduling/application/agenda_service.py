"""
Servicio de agenda — lógica de negocio para citas y horarios.

Responsabilidades:
- Validar que no se solapen citas de un mismo doctor (excepto urgencias)
- Calcular huecos libres dentro del horario configurado
- Respetar excepciones de horario (días festivos, vacaciones)
"""
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import TokenData
from app.domains.identity.persistence.doctor import Doctor
from app.domains.scheduling.domain.visit_states import BLOCKING_STATES
from app.domains.scheduling.persistence.cita import Cita
from app.domains.scheduling.persistence.gabinete import Gabinete
from app.domains.scheduling.persistence.horario import HorarioDoctor, HorarioExcepcion
from app.domains.scheduling.schemas.cita import HuecoLibre


async def hay_solapamiento(
    db: AsyncSession,
    doctor_id: UUID,
    fecha_hora: datetime,
    duracion_min: int,
    excluir_cita_id: UUID | None = None,
) -> bool:
    """
    Comprueba si existe solapamiento con citas ya programadas/confirmadas/en_clinica
    del mismo doctor en ese bloque horario.
    Incluye urgencias y citas con flags de mensajería; ignora citas anuladas/faltas.
    """
    fecha_fin = fecha_hora + timedelta(minutes=duracion_min)

    q = select(Cita).where(
        and_(
            Cita.doctor_id == doctor_id,
            Cita.estado.in_(BLOCKING_STATES),
            # Overlap: inicio de nueva < fin de existente AND fin de nueva > inicio de existente
            Cita.fecha_hora < fecha_fin,
            (Cita.fecha_hora + timedelta(minutes=1) * Cita.duracion_min) > fecha_hora,
        )
    )
    if excluir_cita_id:
        q = q.where(Cita.id != excluir_cita_id)

    result = await db.execute(q)
    return result.scalars().first() is not None


async def hay_solapamiento_gabinete(
    db: AsyncSession,
    gabinete_id: UUID | None,
    fecha_hora: datetime,
    duracion_min: int,
    excluir_cita_id: UUID | None = None,
) -> bool:
    """Comprueba solapamiento de un gabinete/sillon cuando la cita lo usa."""
    if not gabinete_id:
        return False
    fecha_fin = fecha_hora + timedelta(minutes=duracion_min)
    q = select(Cita).where(
        and_(
            Cita.gabinete_id == gabinete_id,
            Cita.estado.in_(BLOCKING_STATES),
            Cita.fecha_hora < fecha_fin,
            (Cita.fecha_hora + timedelta(minutes=1) * Cita.duracion_min) > fecha_hora,
        )
    )
    if excluir_cita_id:
        q = q.where(Cita.id != excluir_cita_id)
    result = await db.execute(q)
    return result.scalars().first() is not None


async def get_horario_dia(
    db: AsyncSession,
    doctor_id: UUID,
    fecha: datetime,
) -> tuple[list[dict], int]:
    """
    Devuelve (bloques, intervalo_min) para un doctor en una fecha concreta.
    Primero busca excepción para esa fecha; si no existe, usa el horario semanal.
    Devuelve ([], 10) si el doctor no trabaja ese día.
    """
    fecha_date = fecha.date()
    dia_semana = fecha_date.weekday()  # 0=Lunes

    # 1. Buscar excepción para esa fecha exacta
    exc_result = await db.execute(
        select(HorarioExcepcion).where(
            and_(
                HorarioExcepcion.doctor_id == doctor_id,
                HorarioExcepcion.fecha == fecha_date,
            )
        )
    )
    excepcion = exc_result.scalar_one_or_none()
    if excepcion:
        if excepcion.no_trabaja:
            return [], 10
        bloques = excepcion.bloques or []
        return bloques, 10

    # 2. Horario base semanal
    hor_result = await db.execute(
        select(HorarioDoctor).where(
            and_(
                HorarioDoctor.doctor_id == doctor_id,
                HorarioDoctor.dia_semana == dia_semana,
            )
        )
    )
    horario = hor_result.scalar_one_or_none()
    if not horario or horario.tipo_dia == "festivo":
        return [], 10

    return horario.bloques or [], horario.intervalo_min


def _parse_hora(hora_str: str, fecha: datetime) -> datetime:
    """Convierte "HH:MM" en datetime con la fecha dada (UTC-aware si fecha lo es)."""
    h, m = map(int, hora_str.split(":"))
    dt = fecha.replace(hour=h, minute=m, second=0, microsecond=0)
    return dt


async def esta_dentro_disponibilidad(
    db: AsyncSession,
    doctor_id: UUID,
    fecha_hora: datetime,
    duracion_min: int,
) -> bool:
    bloques, _ = await get_horario_dia(db, doctor_id, fecha_hora)
    if not bloques:
        return False

    fecha_fin = fecha_hora + timedelta(minutes=duracion_min)
    for bloque in bloques:
        inicio_bloque = _parse_hora(bloque["inicio"], fecha_hora)
        fin_bloque = _parse_hora(bloque["fin"], fecha_hora)
        if fecha_hora >= inicio_bloque and fecha_fin <= fin_bloque:
            return True
    return False


async def buscar_huecos_libres(
    db: AsyncSession,
    doctor_id: UUID,
    duracion_min: int,
    desde: datetime,
    hasta: datetime,
    solo_manana: bool = False,
    solo_tarde: bool = False,
    max_resultados: int = 20,
    gabinete_id: UUID | None = None,
) -> list[HuecoLibre]:
    """
    Busca huecos de `duracion_min` minutos dentro del horario del doctor
    entre `desde` y `hasta`. Devuelve hasta `max_resultados` huecos.
    Si el doctor no tiene horario configurado, no devuelve huecos.
    solo_manana: solo huecos en bloques que empiezan antes de las 14h.
    solo_tarde: solo huecos en bloques que empiezan desde las 14h.
    """
    huecos: list[HuecoLibre] = []
    # Normalizar: empezar desde el inicio del día `desde`
    fecha_actual = desde.replace(hour=0, minute=0, second=0, microsecond=0)
    hasta_normalizado = hasta.replace(hour=23, minute=59, second=59, microsecond=0)

    while fecha_actual <= hasta_normalizado and len(huecos) < max_resultados:
        bloques, intervalo = await get_horario_dia(db, doctor_id, fecha_actual)

        if not bloques:
            fecha_actual += timedelta(days=1)
            continue

        for bloque in bloques:
            inicio_bloque = _parse_hora(bloque["inicio"], fecha_actual)
            fin_bloque = _parse_hora(bloque["fin"], fecha_actual)

            # Filtrar por mañana/tarde según el inicio del bloque
            if solo_manana and inicio_bloque.hour >= 14:
                continue
            if solo_tarde and inicio_bloque.hour < 14:
                continue

            # Recorrer el bloque en intervalos
            slot_inicio = inicio_bloque
            while slot_inicio + timedelta(minutes=duracion_min) <= fin_bloque:
                slot_fin = slot_inicio + timedelta(minutes=duracion_min)

                # Filtro de rango: el inicio del hueco debe respetar `desde`.
                if slot_inicio >= desde and slot_inicio <= hasta_normalizado:
                    # Verificar que no está ocupado
                    ocupado = await hay_solapamiento(
                        db, doctor_id, slot_inicio, duracion_min
                    )
                    if not ocupado and gabinete_id:
                        ocupado = await hay_solapamiento_gabinete(db, gabinete_id, slot_inicio, duracion_min)
                    if not ocupado:
                        huecos.append(
                            HuecoLibre(
                                doctor_id=doctor_id,
                                fecha_hora_inicio=slot_inicio,
                                fecha_hora_fin=slot_fin,
                                duracion_min=duracion_min,
                            )
                        )
                        if len(huecos) >= max_resultados:
                            return huecos

                slot_inicio += timedelta(minutes=intervalo)

        fecha_actual += timedelta(days=1)

    return huecos


async def validar_reserva(
    db: AsyncSession,
    *,
    current_user: TokenData,
    cita_id: UUID | None,
    doctor_id: UUID,
    gabinete_id: UUID | None,
    fecha_hora: datetime,
    duracion_min: int,
    es_urgencia: bool,
    forzar_fuera_horario: bool,
) -> dict[str, bool]:
    if forzar_fuera_horario and current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Solo admin puede forzar una cita fuera de horario")
    # Serialize booking the same resource so simultaneous requests cannot both
    # pass availability checks before committing their appointment.
    await db.execute(select(Doctor.id).where(Doctor.id == doctor_id).with_for_update())
    if gabinete_id:
        gabinete = await db.scalar(select(Gabinete).where(Gabinete.id == gabinete_id, Gabinete.activo.is_(True)).with_for_update())
        if not gabinete:
            raise HTTPException(status_code=404, detail="Gabinete no encontrado o inactivo")
    solapamiento = await hay_solapamiento(db, doctor_id, fecha_hora, duracion_min, excluir_cita_id=cita_id)
    gabinete_ocupado = await hay_solapamiento_gabinete(db, gabinete_id, fecha_hora, duracion_min, excluir_cita_id=cita_id)
    if not es_urgencia:
        if solapamiento:
            raise HTTPException(status_code=409, detail="El doctor ya tiene una cita en ese horario")
        if gabinete_ocupado:
            raise HTTPException(status_code=409, detail="El gabinete ya tiene una cita en ese horario")
    if not es_urgencia and not forzar_fuera_horario:
        dentro_disponibilidad = await esta_dentro_disponibilidad(db, doctor_id, fecha_hora, duracion_min)
        if not dentro_disponibilidad:
            raise HTTPException(status_code=409, detail="La cita queda fuera del horario configurado del doctor")
    return {"doctor": solapamiento, "gabinete": gabinete_ocupado}
