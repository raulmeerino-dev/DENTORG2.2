"""
Servicio de agenda — lógica de negocio para citas y horarios.

Responsabilidades:
- Validar que no se solapen citas de un mismo doctor (excepto urgencias)
- Calcular huecos libres dentro del horario configurado
- Respetar excepciones de horario (días festivos, vacaciones)
"""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cita import Cita
from app.models.horario import HorarioDoctor, HorarioExcepcion
from app.schemas.cita import HuecoLibre


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
    Ignora urgencias y citas anuladas/faltas.
    """
    fecha_fin = fecha_hora + timedelta(minutes=duracion_min)

    q = select(Cita).where(
        and_(
            Cita.doctor_id == doctor_id,
            Cita.estado.in_(["programada", "confirmada", "en_clinica"]),
            Cita.es_urgencia == False,  # noqa: E712 — urgencias no bloquean
            # Overlap: inicio de nueva < fin de existente AND fin de nueva > inicio de existente
            Cita.fecha_hora < fecha_fin,
            (Cita.fecha_hora + timedelta(minutes=1) * Cita.duracion_min) > fecha_hora,
        )
    )
    if excluir_cita_id:
        q = q.where(Cita.id != excluir_cita_id)

    result = await db.execute(q)
    return result.scalar_one_or_none() is not None


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

                # Filtro de rango: el slot debe solapar con el rango pedido
                if slot_fin > desde and slot_inicio <= hasta_normalizado:
                    # Verificar que no está ocupado
                    ocupado = await hay_solapamiento(
                        db, doctor_id, slot_inicio, duracion_min
                    )
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
