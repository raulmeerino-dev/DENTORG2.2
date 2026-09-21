"""Application use cases: tenant checks, orchestration and existing transactions."""
from datetime import date as date_type
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import (
    TokenData,
    ensure_clinic_access,
    resolve_clinic_id,
    scope_select_by_clinic,
)
from app.domains.clinical.domain.dental_surfaces import normalize_caras, surfaces_from_caras
from app.domains.clinical.persistence.historial import HistorialClinico
from app.domains.clinical.persistence.odontograma import (
    OdontogramaEvento,
)
from app.domains.clinical.persistence.odontograma_queries import (
    active_odontograma_for_patient,
    get_or_create_odontograma_surface,
)
from app.domains.patients.persistence.paciente import Paciente
from app.domains.treatment_plans.application.queries import PRESUPUESTO_LOAD, get_presupuesto_or_404
from app.domains.treatment_plans.persistence.presupuesto import (
    Presupuesto,
    PresupuestoLinea,
    TrabajoPendiente,
)
from app.domains.treatment_plans.schemas.presupuesto import (
    OdontogramaPlanResponse,
    OdontogramaPlanUpdate,
    PresupuestoAceptarCreate,
    PresupuestoCreate,
    PresupuestoLineaCreate,
    PresupuestoLineaResponse,
    PresupuestoLineaUpdate,
    PresupuestoRechazarCreate,
    PresupuestoResponse,
    PresupuestoUpdate,
    TrabajoPendienteResponse,
)

TRABAJO_PENDIENTE_LOAD = [
    selectinload(TrabajoPendiente.presupuesto_linea).selectinload(PresupuestoLinea.tratamiento),
    selectinload(TrabajoPendiente.tratamiento),
]




















def _budget_line_identity(data: PresupuestoLineaCreate | dict) -> tuple[UUID, int | None, str | None]:
    payload = data.model_dump() if isinstance(data, PresupuestoLineaCreate) else data
    return (
        payload["tratamiento_id"],
        payload.get("pieza_dental"),
        normalize_caras(payload.get("caras")),
    )


async def _ensure_no_duplicate_budget_line(
    db: AsyncSession,
    *,
    presupuesto_id: UUID,
    tratamiento_id: UUID,
    pieza_dental: int | None,
    caras: str | None,
    exclude_linea_id: UUID | None = None,
) -> None:
    stmt = select(PresupuestoLinea.id).where(
        PresupuestoLinea.presupuesto_id == presupuesto_id,
        PresupuestoLinea.tratamiento_id == tratamiento_id,
    )
    if pieza_dental is None:
        stmt = stmt.where(PresupuestoLinea.pieza_dental.is_(None))
    else:
        stmt = stmt.where(PresupuestoLinea.pieza_dental == pieza_dental)
    if caras is None:
        stmt = stmt.where(PresupuestoLinea.caras.is_(None))
    else:
        stmt = stmt.where(PresupuestoLinea.caras == caras)
    if exclude_linea_id:
        stmt = stmt.where(PresupuestoLinea.id != exclude_linea_id)

    duplicate_id = await db.scalar(stmt.limit(1))
    if duplicate_id:
        raise HTTPException(
            status_code=409,
            detail="Ya existe una linea activa igual en este presupuesto.",
        )






async def _find_linked_budget_line_for_surfaces(
    db: AsyncSession,
    *,
    paciente_id: UUID,
    pieza_dental: int | None,
    caras: str | None,
) -> PresupuestoLinea | None:
    if not pieza_dental:
        return None
    odontograma = await active_odontograma_for_patient(db, paciente_id)
    if not odontograma:
        return None
    linked_ids: list[UUID] = []
    for piece in odontograma.piezas:
        if piece.pieza_fdi != pieza_dental:
            continue
        surface_names = set(surfaces_from_caras(caras))
        for surface in piece.superficies:
            if surface.superficie in surface_names and surface.presupuesto_linea_id:
                linked_ids.append(surface.presupuesto_linea_id)
    if not linked_ids:
        return None
    result = await db.execute(
        select(PresupuestoLinea)
        .options(selectinload(PresupuestoLinea.tratamiento))
        .where(PresupuestoLinea.id.in_(linked_ids))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _link_budget_line_to_odontograma(
    db: AsyncSession,
    *,
    presupuesto: Presupuesto,
    linea: PresupuestoLinea,
    user: TokenData,
) -> None:
    if not linea.pieza_dental:
        return
    odontograma = await active_odontograma_for_patient(db, presupuesto.paciente_id)
    if not odontograma:
        return
    for surface_name in surfaces_from_caras(linea.caras):
        surface = await get_or_create_odontograma_surface(db, odontograma, linea.pieza_dental, surface_name)
        old_values = {
            "condicion": surface.condicion,
            "tratamiento_planificado_id": str(surface.tratamiento_planificado_id) if surface.tratamiento_planificado_id else None,
            "presupuesto_linea_id": str(surface.presupuesto_linea_id) if surface.presupuesto_linea_id else None,
        }
        if surface.presupuesto_linea_id and surface.presupuesto_linea_id != linea.id:
            raise HTTPException(
                status_code=409,
                detail="La superficie ya esta vinculada a otra linea de presupuesto.",
            )
        surface.condicion = "tratamiento_presupuestado"
        surface.tratamiento_planificado_id = linea.tratamiento_id
        surface.presupuesto_linea_id = linea.id
        db.add(OdontogramaEvento(
            odontograma_id=odontograma.id,
            pieza_fdi=linea.pieza_dental,
            superficie=surface_name,
            accion="vincular_linea_presupuesto",
            old_values=old_values,
            new_values={
                "tratamiento_id": str(linea.tratamiento_id),
                "presupuesto_linea_id": str(linea.id),
                "condicion": surface.condicion,
            },
            usuario_id=user.user_id,
        ))


async def _mark_budget_line_as_pending_state(
    db: AsyncSession,
    *,
    presupuesto: Presupuesto,
    linea: PresupuestoLinea,
    user: TokenData,
    state: str,
) -> None:
    if not linea.pieza_dental:
        return
    odontograma = await active_odontograma_for_patient(db, presupuesto.paciente_id)
    if not odontograma:
        return
    for surface_name in surfaces_from_caras(linea.caras):
        surface = await get_or_create_odontograma_surface(db, odontograma, linea.pieza_dental, surface_name)
        old_values = {
            "condicion": surface.condicion,
            "tratamiento_planificado_id": str(surface.tratamiento_planificado_id) if surface.tratamiento_planificado_id else None,
            "presupuesto_linea_id": str(surface.presupuesto_linea_id) if surface.presupuesto_linea_id else None,
        }
        if surface.presupuesto_linea_id and surface.presupuesto_linea_id != linea.id:
            raise HTTPException(
                status_code=409,
                detail="La superficie ya esta vinculada a otra linea de presupuesto.",
            )
        surface.condicion = state
        surface.tratamiento_planificado_id = linea.tratamiento_id
        surface.presupuesto_linea_id = linea.id
        db.add(OdontogramaEvento(
            odontograma_id=odontograma.id,
            pieza_fdi=linea.pieza_dental,
            superficie=surface_name,
            accion="actualizar_estado_trabajo_presupuesto",
            old_values=old_values,
            new_values={
                "tratamiento_id": str(linea.tratamiento_id),
                "presupuesto_linea_id": str(linea.id),
                "condicion": state,
            },
            usuario_id=user.user_id,
        ))


async def _unlink_budget_line_from_odontograma(
    db: AsyncSession,
    *,
    presupuesto: Presupuesto,
    linea: PresupuestoLinea,
    user: TokenData,
) -> None:
    if not linea.pieza_dental:
        return
    odontograma = await active_odontograma_for_patient(db, presupuesto.paciente_id)
    if not odontograma:
        return
    for piece in odontograma.piezas:
        if piece.pieza_fdi != linea.pieza_dental:
            continue
        for surface in piece.superficies:
            if surface.presupuesto_linea_id != linea.id:
                continue
            old_values = {
                "tratamiento_planificado_id": str(surface.tratamiento_planificado_id) if surface.tratamiento_planificado_id else None,
                "presupuesto_linea_id": str(surface.presupuesto_linea_id),
            }
            if surface.tratamiento_planificado_id == linea.tratamiento_id:
                surface.tratamiento_planificado_id = None
            if surface.condicion in {"tratamiento_presupuestado", "tratamiento_aceptado", "tratamiento_pendiente"}:
                surface.condicion = "sano"
            surface.presupuesto_linea_id = None
            db.add(OdontogramaEvento(
                odontograma_id=odontograma.id,
                pieza_fdi=linea.pieza_dental,
                superficie=surface.superficie,
                accion="desvincular_linea_presupuesto",
                old_values=old_values,
                new_values={"presupuesto_linea_id": None},
                usuario_id=user.user_id,
            ))


async def _mark_odontograma_surface_realized(
    db: AsyncSession,
    *,
    trabajo: TrabajoPendiente,
    user: TokenData,
) -> None:
    if not trabajo.pieza_dental:
        return
    odontograma = await active_odontograma_for_patient(db, trabajo.paciente_id)
    if not odontograma:
        return
    for surface_name in surfaces_from_caras(trabajo.caras):
        surface = await get_or_create_odontograma_surface(db, odontograma, trabajo.pieza_dental, surface_name)
        old_values = {
            "condicion": surface.condicion,
            "tratamiento_realizado_id": str(surface.tratamiento_realizado_id) if surface.tratamiento_realizado_id else None,
            "presupuesto_linea_id": str(surface.presupuesto_linea_id) if surface.presupuesto_linea_id else None,
        }
        surface.condicion = "tratamiento_realizado"
        surface.presupuesto_linea_id = trabajo.presupuesto_linea_id
        if trabajo.historial_id:
            surface.tratamiento_realizado_id = trabajo.historial_id
        db.add(OdontogramaEvento(
            odontograma_id=odontograma.id,
            pieza_fdi=trabajo.pieza_dental,
            superficie=surface_name,
            accion="marcar_tratamiento_realizado",
            old_values=old_values,
            new_values={
                "trabajo_pendiente_id": str(trabajo.id),
                "presupuesto_linea_id": str(trabajo.presupuesto_linea_id),
                "historial_id": str(trabajo.historial_id) if trabajo.historial_id else None,
            },
            usuario_id=user.user_id,
        ))


async def _ensure_historial_for_trabajo_pendiente(
    db: AsyncSession,
    *,
    trabajo: TrabajoPendiente,
) -> None:
    if trabajo.historial_id:
        return
    result = await db.execute(
        select(PresupuestoLinea)
        .options(
            selectinload(PresupuestoLinea.presupuesto),
            selectinload(PresupuestoLinea.tratamiento),
        )
        .where(PresupuestoLinea.id == trabajo.presupuesto_linea_id)
    )
    linea = result.scalar_one_or_none()
    if not linea or not linea.presupuesto:
        return
    entrada = HistorialClinico(
        paciente_id=trabajo.paciente_id,
        tratamiento_id=trabajo.tratamiento_id,
        doctor_id=linea.presupuesto.doctor_id,
        pieza_dental=trabajo.pieza_dental,
        caras=trabajo.caras,
        fecha=date_type.today(),
        diagnostico="Tratamiento aceptado en presupuesto",
        procedimiento=linea.tratamiento.nombre if linea.tratamiento else "Tratamiento realizado",
        observaciones=f"Realizado desde trabajo pendiente del presupuesto {linea.presupuesto.numero}",
        estado="realizado",
        importe=linea.precio_unitario,
        origen="presupuesto_linea",
        presupuesto_linea_id=linea.id,
    )
    db.add(entrada)
    await db.flush()
    trabajo.historial_id = entrada.id


async def listar_presupuestos(db: AsyncSession, current_user: TokenData, paciente_id: UUID | None, estado: str | None, desde: date_type | None, hasta: date_type | None) -> list[PresupuestoResponse]:
    stmt = select(Presupuesto).options(*PRESUPUESTO_LOAD).order_by(Presupuesto.fecha.desc(), Presupuesto.numero.desc())
    stmt = scope_select_by_clinic(stmt, Presupuesto, current_user)
    if paciente_id:
        stmt = stmt.where(Presupuesto.paciente_id == paciente_id)
    if estado:
        stmt = stmt.where(Presupuesto.estado == estado)
    if desde:
        stmt = stmt.where(Presupuesto.fecha >= desde)
    if hasta:
        stmt = stmt.where(Presupuesto.fecha <= hasta)

    result = await db.execute(stmt)
    return [PresupuestoResponse.model_validate(p) for p in result.scalars().all()]


async def crear_presupuesto(data: PresupuestoCreate, db: AsyncSession, current_user: TokenData) -> PresupuestoResponse:
    paciente = await db.get(Paciente, data.paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)
    max_num = await db.execute(select(func.max(Presupuesto.numero)))
    siguiente = (max_num.scalar_one_or_none() or 0) + 1

    presupuesto = Presupuesto(
        paciente_id=data.paciente_id,
        clinica_id=resolve_clinic_id(current_user, paciente.clinica_id),
        doctor_id=data.doctor_id,
        fecha=data.fecha,
        pie_pagina=data.pie_pagina,
        numero=siguiente,
    )
    db.add(presupuesto)
    await db.flush()

    seen_lineas: set[tuple[UUID, int | None, str | None]] = set()
    for linea_data in data.lineas:
        payload = linea_data.model_dump()
        payload["caras"] = normalize_caras(payload.get("caras"))
        identity = _budget_line_identity(payload)
        if identity in seen_lineas:
            raise HTTPException(
                status_code=409,
                detail="El presupuesto contiene lineas duplicadas para el mismo tratamiento, pieza y caras.",
            )
        seen_lineas.add(identity)
        db.add(PresupuestoLinea(presupuesto_id=presupuesto.id, **payload))

    await db.commit()
    return PresupuestoResponse.model_validate(await get_presupuesto_or_404(db, presupuesto.id))


async def obtener_presupuesto(presupuesto_id: UUID, db: AsyncSession, current_user: TokenData) -> PresupuestoResponse:
    presupuesto = await get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    return PresupuestoResponse.model_validate(presupuesto)


async def obtener_odontograma_plan(presupuesto_id: UUID, db: AsyncSession, current_user: TokenData) -> OdontogramaPlanResponse:
    presupuesto = await get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    return OdontogramaPlanResponse(presupuesto_id=presupuesto.id, odontograma=presupuesto.odontograma or {})


async def guardar_odontograma_plan(presupuesto_id: UUID, data: OdontogramaPlanUpdate, db: AsyncSession, current_user: TokenData) -> OdontogramaPlanResponse:
    presupuesto = await get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    presupuesto.odontograma = data.odontograma
    await db.commit()
    return OdontogramaPlanResponse(presupuesto_id=presupuesto.id, odontograma=presupuesto.odontograma or {})


async def actualizar_presupuesto(presupuesto_id: UUID, data: PresupuestoUpdate, db: AsyncSession, current_user: TokenData) -> PresupuestoResponse:
    presupuesto = await get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(presupuesto, field, value)
    await db.commit()
    return PresupuestoResponse.model_validate(await get_presupuesto_or_404(db, presupuesto_id))


async def presentar_presupuesto(presupuesto_id: UUID, db: AsyncSession, current_user: TokenData) -> PresupuestoResponse:
    presupuesto = await get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    presupuesto.estado = "presentado"
    await db.commit()
    return PresupuestoResponse.model_validate(await get_presupuesto_or_404(db, presupuesto_id))


async def aceptar_presupuesto(presupuesto_id: UUID, data: PresupuestoAceptarCreate, db: AsyncSession, current_user: TokenData) -> PresupuestoResponse:
    presupuesto = await get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    selected_ids = set(data.linea_ids or [linea.id for linea in presupuesto.lineas])
    for linea in presupuesto.lineas:
        if linea.id in selected_ids:
            linea.aceptado = True
    aceptadas = [linea for linea in presupuesto.lineas if linea.aceptado]
    presupuesto.estado = "aceptado" if len(aceptadas) == len(presupuesto.lineas) else "parcial"

    if data.pasar_a_trabajo_pendiente:
        for linea in aceptadas:
            if not linea.pasado_trabajo_pendiente:
                db.add(TrabajoPendiente(
                    paciente_id=presupuesto.paciente_id,
                    presupuesto_linea_id=linea.id,
                    tratamiento_id=linea.tratamiento_id,
                    pieza_dental=linea.pieza_dental,
                    caras=linea.caras,
                ))
                linea.pasado_trabajo_pendiente = True
            await _mark_budget_line_as_pending_state(
                db,
                presupuesto=presupuesto,
                linea=linea,
                user=current_user,
                state="tratamiento_pendiente",
            )
    else:
        for linea in aceptadas:
            await _mark_budget_line_as_pending_state(
                db,
                presupuesto=presupuesto,
                linea=linea,
                user=current_user,
                state="tratamiento_aceptado",
            )
    await db.commit()
    return PresupuestoResponse.model_validate(await get_presupuesto_or_404(db, presupuesto_id))


async def rechazar_presupuesto(presupuesto_id: UUID, data: PresupuestoRechazarCreate, db: AsyncSession, current_user: TokenData) -> PresupuestoResponse:
    presupuesto = await get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    presupuesto.estado = "rechazado"
    if data.motivo:
        presupuesto.pie_pagina = f"{presupuesto.pie_pagina or ''}\nRechazado: {data.motivo}".strip()
    await db.commit()
    return PresupuestoResponse.model_validate(await get_presupuesto_or_404(db, presupuesto_id))




async def eliminar_presupuesto(presupuesto_id: UUID, db: AsyncSession) -> None:
    presupuesto = await get_presupuesto_or_404(db, presupuesto_id)
    await db.delete(presupuesto)
    await db.commit()


async def anadir_linea(presupuesto_id: UUID, data: PresupuestoLineaCreate, db: AsyncSession, current_user: TokenData) -> PresupuestoLineaResponse:
    presupuesto = await get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    payload = data.model_dump()
    payload["caras"] = normalize_caras(payload.get("caras"))
    await _ensure_no_duplicate_budget_line(
        db,
        presupuesto_id=presupuesto_id,
        tratamiento_id=payload["tratamiento_id"],
        pieza_dental=payload.get("pieza_dental"),
        caras=payload.get("caras"),
    )
    linked_line = await _find_linked_budget_line_for_surfaces(
        db,
        paciente_id=presupuesto.paciente_id,
        pieza_dental=payload.get("pieza_dental"),
        caras=payload.get("caras"),
    )
    if linked_line:
        raise HTTPException(
            status_code=409,
            detail="La superficie ya tiene una linea de presupuesto vinculada.",
        )

    linea = PresupuestoLinea(presupuesto_id=presupuesto_id, **payload)
    db.add(linea)
    await db.flush()
    await _link_budget_line_to_odontograma(db, presupuesto=presupuesto, linea=linea, user=current_user)
    await db.commit()
    result = await db.execute(
        select(PresupuestoLinea)
        .options(selectinload(PresupuestoLinea.tratamiento))
        .where(PresupuestoLinea.id == linea.id)
    )
    return PresupuestoLineaResponse.model_validate(result.scalar_one())


async def actualizar_linea(presupuesto_id: UUID, linea_id: UUID, data: PresupuestoLineaUpdate, db: AsyncSession, current_user: TokenData) -> PresupuestoLineaResponse:
    presupuesto = await get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    result = await db.execute(
        select(PresupuestoLinea)
        .options(selectinload(PresupuestoLinea.tratamiento))
        .where(and_(PresupuestoLinea.id == linea_id, PresupuestoLinea.presupuesto_id == presupuesto_id))
    )
    linea = result.scalar_one_or_none()
    if not linea:
        raise HTTPException(status_code=404, detail="Linea no encontrada")
    old_pieza = linea.pieza_dental
    old_caras = linea.caras
    old_tratamiento_id = linea.tratamiento_id
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(linea, field, normalize_caras(value) if field == "caras" else value)
    await _ensure_no_duplicate_budget_line(
        db,
        presupuesto_id=presupuesto_id,
        tratamiento_id=linea.tratamiento_id,
        pieza_dental=linea.pieza_dental,
        caras=linea.caras,
        exclude_linea_id=linea.id,
    )
    if (
        old_pieza != linea.pieza_dental
        or old_caras != linea.caras
        or old_tratamiento_id != linea.tratamiento_id
    ):
        old_linea = PresupuestoLinea(
            presupuesto_id=presupuesto_id,
            tratamiento_id=old_tratamiento_id,
            pieza_dental=old_pieza,
            caras=old_caras,
            precio_unitario=linea.precio_unitario,
            descuento_porcentaje=linea.descuento_porcentaje,
        )
        old_linea.id = linea.id
        await _unlink_budget_line_from_odontograma(db, presupuesto=presupuesto, linea=old_linea, user=current_user)
    await _link_budget_line_to_odontograma(db, presupuesto=presupuesto, linea=linea, user=current_user)
    await db.commit()
    result2 = await db.execute(
        select(PresupuestoLinea)
        .options(selectinload(PresupuestoLinea.tratamiento))
        .where(PresupuestoLinea.id == linea_id)
    )
    return PresupuestoLineaResponse.model_validate(result2.scalar_one())


async def eliminar_linea(presupuesto_id: UUID, linea_id: UUID, db: AsyncSession, current_user: TokenData) -> None:
    presupuesto = await get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    result = await db.execute(
        select(PresupuestoLinea).where(and_(PresupuestoLinea.id == linea_id, PresupuestoLinea.presupuesto_id == presupuesto_id))
    )
    linea = result.scalar_one_or_none()
    if not linea:
        raise HTTPException(status_code=404, detail="Linea no encontrada")
    await _unlink_budget_line_from_odontograma(db, presupuesto=presupuesto, linea=linea, user=current_user)
    await db.delete(linea)
    await db.commit()


async def pasar_a_trabajo_pendiente(presupuesto_id: UUID, db: AsyncSession, current_user: TokenData) -> list[TrabajoPendienteResponse]:
    presupuesto = await get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    creadas: list[TrabajoPendiente] = []

    for linea in presupuesto.lineas:
        if linea.aceptado and not linea.pasado_trabajo_pendiente:
            tp = TrabajoPendiente(
                paciente_id=presupuesto.paciente_id,
                presupuesto_linea_id=linea.id,
                tratamiento_id=linea.tratamiento_id,
                pieza_dental=linea.pieza_dental,
                caras=linea.caras,
            )
            db.add(tp)
            linea.pasado_trabajo_pendiente = True
            await _mark_budget_line_as_pending_state(
                db,
                presupuesto=presupuesto,
                linea=linea,
                user=current_user,
                state="tratamiento_pendiente",
            )
            creadas.append(tp)

    await db.commit()
    resultado = []
    for tp in creadas:
        r = await db.execute(
            select(TrabajoPendiente)
            .options(*TRABAJO_PENDIENTE_LOAD)
            .where(TrabajoPendiente.id == tp.id)
        )
        resultado.append(TrabajoPendienteResponse.model_validate(r.scalar_one()))
    return resultado


async def trabajo_pendiente_paciente(paciente_id: UUID, db: AsyncSession, current_user: TokenData, solo_pendiente: bool) -> list[TrabajoPendienteResponse]:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)
    stmt = (
        select(TrabajoPendiente)
        .options(*TRABAJO_PENDIENTE_LOAD)
        .where(TrabajoPendiente.paciente_id == paciente_id)
        .order_by(TrabajoPendiente.created_at)
    )
    if solo_pendiente:
        stmt = stmt.where(TrabajoPendiente.realizado == False)  # noqa: E712
    result = await db.execute(stmt)
    return [TrabajoPendienteResponse.model_validate(tp) for tp in result.scalars().all()]


async def marcar_realizado(tp_id: UUID, db: AsyncSession, current_user: TokenData) -> TrabajoPendienteResponse:
    result = await db.execute(
        select(TrabajoPendiente)
        .options(*TRABAJO_PENDIENTE_LOAD)
        .where(TrabajoPendiente.id == tp_id)
    )
    tp = result.scalar_one_or_none()
    if not tp:
        raise HTTPException(status_code=404, detail="Trabajo pendiente no encontrado")
    paciente = await db.get(Paciente, tp.paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id if paciente else None)
    tp.realizado = True
    await _ensure_historial_for_trabajo_pendiente(db, trabajo=tp)
    await _mark_odontograma_surface_realized(db, trabajo=tp, user=current_user)
    await db.commit()
    refreshed = await db.execute(
        select(TrabajoPendiente)
        .options(*TRABAJO_PENDIENTE_LOAD)
        .where(TrabajoPendiente.id == tp.id)
    )
    return TrabajoPendienteResponse.model_validate(refreshed.scalar_one())
