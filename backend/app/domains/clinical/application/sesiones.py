"""Clinical session drafts and completion of performed treatments."""

from datetime import date as date_type
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import TokenData, ensure_clinic_access
from app.domains.clinical.application.patient_context import (
    current_user_doctor_id,
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
from app.domains.clinical.persistence.sesion_clinica import SesionClinicaItem
from app.domains.clinical.persistence.tratamiento import TratamientoCatalogo
from app.domains.clinical.schemas.tratamiento import (
    HistorialResponse,
    SesionClinicaItemCreate,
    SesionClinicaItemResponse,
    SesionClinicaItemUpdate,
    SesionTratamientoRealizadoCreate,
)
from app.domains.patients.persistence.paciente import Paciente
from app.domains.scheduling.persistence.cita import Cita
from app.domains.treatment_plans.persistence.presupuesto import PresupuestoLinea, TrabajoPendiente


async def _mark_session_historial_on_odontograma(
    db: AsyncSession,
    *,
    historial: HistorialClinico,
    presupuesto_linea_id: UUID | None,
    current_user: TokenData,
) -> None:
    if not historial.pieza_dental:
        return
    odontograma = await active_odontograma_for_patient(db, historial.paciente_id)
    if not odontograma:
        return
    for surface_name in surfaces_from_caras(historial.caras):
        surface = await get_or_create_odontograma_surface(
            db, odontograma, historial.pieza_dental, surface_name
        )
        old_values = {
            "condicion": surface.condicion,
            "tratamiento_realizado_id": str(surface.tratamiento_realizado_id)
            if surface.tratamiento_realizado_id
            else None,
            "presupuesto_linea_id": str(surface.presupuesto_linea_id)
            if surface.presupuesto_linea_id
            else None,
        }
        surface.condicion = "tratamiento_realizado"
        surface.tratamiento_realizado_id = historial.id
        if presupuesto_linea_id:
            surface.presupuesto_linea_id = presupuesto_linea_id
        db.add(
            OdontogramaEvento(
                odontograma_id=odontograma.id,
                pieza_fdi=historial.pieza_dental,
                superficie=surface_name,
                accion="marcar_tratamiento_realizado_sesion",
                old_values=old_values,
                new_values={
                    "historial_id": str(historial.id),
                    "presupuesto_linea_id": str(presupuesto_linea_id)
                    if presupuesto_linea_id
                    else None,
                    "condicion": surface.condicion,
                },
                usuario_id=current_user.user_id,
            )
        )


SESION_CLINICA_LOAD_OPTIONS = (
    selectinload(SesionClinicaItem.tratamiento),
    selectinload(SesionClinicaItem.doctor),
)


async def _get_sesion_item_or_404(
    db: AsyncSession,
    paciente_id: UUID,
    item_id: UUID,
) -> SesionClinicaItem:
    result = await db.execute(
        select(SesionClinicaItem)
        .options(*SESION_CLINICA_LOAD_OPTIONS)
        .where(SesionClinicaItem.id == item_id, SesionClinicaItem.paciente_id == paciente_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item de sesion no encontrado")
    return item


def _ensure_sesion_role(current_user: TokenData) -> None:
    if current_user.rol not in {"admin", "doctor", "auxiliar"}:
        raise HTTPException(status_code=403, detail="No puede operar sobre la sesion clinica.")


async def listar_sesion_items(
    paciente_id: UUID, db: AsyncSession, current_user: TokenData, incluir_realizados: bool
) -> list[SesionClinicaItemResponse]:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)

    stmt = (
        select(SesionClinicaItem)
        .options(*SESION_CLINICA_LOAD_OPTIONS)
        .where(SesionClinicaItem.paciente_id == paciente_id)
        .order_by(SesionClinicaItem.orden, SesionClinicaItem.created_at)
    )
    if not incluir_realizados:
        stmt = stmt.where(SesionClinicaItem.estado != "realizado")
    result = await db.execute(stmt)
    return [SesionClinicaItemResponse.model_validate(item) for item in result.scalars().all()]


async def crear_sesion_item(
    paciente_id: UUID, data: SesionClinicaItemCreate, db: AsyncSession, current_user: TokenData
) -> SesionClinicaItemResponse:
    _ensure_sesion_role(current_user)

    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)

    if data.tratamiento_id:
        tratamiento = await db.get(TratamientoCatalogo, data.tratamiento_id)
        if not tratamiento:
            raise HTTPException(status_code=404, detail="Tratamiento no encontrado")

    if data.presupuesto_linea_id:
        linea = await db.get(PresupuestoLinea, data.presupuesto_linea_id)
        if not linea:
            raise HTTPException(status_code=404, detail="Linea de presupuesto no encontrada")

    if data.cita_id:
        cita = await db.get(Cita, data.cita_id)
        if not cita or cita.paciente_id != paciente_id:
            raise HTTPException(status_code=404, detail="Cita no encontrada para el paciente")
        ensure_clinic_access(current_user, cita.clinica_id)

    doctor_id = data.doctor_id or await current_user_doctor_id(db, current_user)

    item = SesionClinicaItem(
        paciente_id=paciente_id,
        clinica_id=paciente.clinica_id,
        doctor_id=doctor_id,
        tratamiento_id=data.tratamiento_id,
        presupuesto_linea_id=data.presupuesto_linea_id,
        cita_id=data.cita_id,
        titulo=data.titulo,
        pieza_dental=data.pieza_dental,
        caras=normalize_caras(data.caras),
        observaciones=data.observaciones,
        estado=data.estado,
        origen=data.origen,
        orden=data.orden,
    )
    db.add(item)
    await db.commit()
    result = await db.execute(
        select(SesionClinicaItem)
        .options(*SESION_CLINICA_LOAD_OPTIONS)
        .where(SesionClinicaItem.id == item.id)
    )
    return SesionClinicaItemResponse.model_validate(result.scalar_one())


async def actualizar_sesion_item(
    paciente_id: UUID,
    item_id: UUID,
    data: SesionClinicaItemUpdate,
    db: AsyncSession,
    current_user: TokenData,
) -> SesionClinicaItemResponse:
    _ensure_sesion_role(current_user)

    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)

    item = await _get_sesion_item_or_404(db, paciente_id, item_id)
    if item.estado == "realizado":
        raise HTTPException(
            status_code=409,
            detail="No se puede editar un item de sesion ya finalizado",
        )

    cambios = data.model_dump(exclude_unset=True)
    if "caras" in cambios:
        cambios["caras"] = normalize_caras(cambios["caras"])
    if cambios.get("estado") == "realizado":
        # No permitimos saltar a 'realizado' desde el PATCH: el cierre real
        # debe pasar por POST /historial/sesion-realizada para crear historial.
        raise HTTPException(
            status_code=400,
            detail="Use POST /tratamientos/historial/sesion-realizada para finalizar como realizado",
        )

    for field, value in cambios.items():
        setattr(item, field, value)
    await db.commit()
    result = await db.execute(
        select(SesionClinicaItem)
        .options(*SESION_CLINICA_LOAD_OPTIONS)
        .where(SesionClinicaItem.id == item_id)
    )
    return SesionClinicaItemResponse.model_validate(result.scalar_one())


async def eliminar_sesion_item(
    paciente_id: UUID, item_id: UUID, db: AsyncSession, current_user: TokenData
) -> None:
    _ensure_sesion_role(current_user)

    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)

    item = await _get_sesion_item_or_404(db, paciente_id, item_id)
    if item.estado == "realizado":
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar un item de sesion ya finalizado",
        )
    await db.delete(item)
    await db.commit()


async def finalizar_tratamiento_sesion(
    data: SesionTratamientoRealizadoCreate, db: AsyncSession, current_user: TokenData
) -> HistorialResponse:
    if current_user.rol not in {"admin", "doctor", "auxiliar"}:
        raise HTTPException(status_code=403, detail="No puede finalizar tratamientos clinicos.")

    paciente = await db.get(Paciente, data.paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)

    tratamiento = await db.get(TratamientoCatalogo, data.tratamiento_id)
    if not tratamiento:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")

    cita: Cita | None = None
    doctor_id = data.doctor_id
    gabinete_id = data.gabinete_id
    if data.cita_id:
        cita = await db.get(Cita, data.cita_id)
        if not cita or cita.paciente_id != data.paciente_id:
            raise HTTPException(status_code=404, detail="Cita no encontrada para el paciente")
        ensure_clinic_access(current_user, cita.clinica_id)
        doctor_id = doctor_id or cita.doctor_id
        gabinete_id = gabinete_id if gabinete_id is not None else cita.gabinete_id

    linea: PresupuestoLinea | None = None
    trabajo: TrabajoPendiente | None = None
    historial: HistorialClinico | None = None
    if data.presupuesto_linea_id:
        linea_result = await db.execute(
            select(PresupuestoLinea)
            .options(
                selectinload(PresupuestoLinea.presupuesto),
                selectinload(PresupuestoLinea.tratamiento),
            )
            .where(PresupuestoLinea.id == data.presupuesto_linea_id)
        )
        linea = linea_result.scalar_one_or_none()
        if not linea or not linea.presupuesto or linea.presupuesto.paciente_id != data.paciente_id:
            raise HTTPException(
                status_code=404, detail="Linea de presupuesto no encontrada para el paciente"
            )
        ensure_clinic_access(current_user, linea.presupuesto.clinica_id)
        doctor_id = doctor_id or linea.presupuesto.doctor_id

        trabajo_result = await db.execute(
            select(TrabajoPendiente).where(TrabajoPendiente.presupuesto_linea_id == linea.id)
        )
        trabajo = trabajo_result.scalar_one_or_none()
        if not trabajo:
            trabajo = TrabajoPendiente(
                paciente_id=data.paciente_id,
                presupuesto_linea_id=linea.id,
                tratamiento_id=linea.tratamiento_id,
                pieza_dental=data.pieza_dental
                if data.pieza_dental is not None
                else linea.pieza_dental,
                caras=normalize_caras(data.caras) if data.caras is not None else linea.caras,
            )
            db.add(trabajo)
            linea.pasado_trabajo_pendiente = True
            await db.flush()
        elif trabajo.historial_id:
            historial = await db.get(HistorialClinico, trabajo.historial_id)

        if historial is None:
            existing_result = await db.execute(
                select(HistorialClinico)
                .where(HistorialClinico.presupuesto_linea_id == linea.id)
                .order_by(HistorialClinico.created_at.desc())
                .limit(1)
            )
            historial = existing_result.scalar_one_or_none()

    doctor_id = doctor_id or await current_user_doctor_id(db, current_user)
    if not doctor_id:
        raise HTTPException(
            status_code=400, detail="No se pudo determinar el doctor del tratamiento"
        )

    pieza_dental = (
        data.pieza_dental
        if data.pieza_dental is not None
        else (linea.pieza_dental if linea else None)
    )
    caras = (
        normalize_caras(data.caras) if data.caras is not None else (linea.caras if linea else None)
    )
    procedimiento = data.procedimiento or (
        linea.tratamiento.nombre if linea and linea.tratamiento else tratamiento.nombre
    )
    importe = (
        data.importe
        if data.importe is not None
        else (linea.precio_unitario if linea else tratamiento.precio)
    )
    fecha = data.fecha or date_type.today()
    origen = data.origen or ("presupuesto_linea" if linea else "cita" if cita else "manual")

    if historial:
        historial.tratamiento_id = data.tratamiento_id
        historial.doctor_id = doctor_id
        historial.gabinete_id = gabinete_id
        historial.pieza_dental = pieza_dental
        historial.caras = caras
        historial.fecha = fecha
        historial.procedimiento = procedimiento
        historial.observaciones = data.observaciones
        historial.estado = "realizado"
        historial.importe = importe
        historial.origen = origen
        historial.presupuesto_linea_id = data.presupuesto_linea_id
        historial.cita_id = data.cita_id
    else:
        historial = HistorialClinico(
            paciente_id=data.paciente_id,
            tratamiento_id=data.tratamiento_id,
            doctor_id=doctor_id,
            gabinete_id=gabinete_id,
            pieza_dental=pieza_dental,
            caras=caras,
            fecha=fecha,
            diagnostico="Tratamiento realizado en sesion clinica",
            procedimiento=procedimiento,
            observaciones=data.observaciones,
            estado="realizado",
            importe=importe,
            origen=origen,
            presupuesto_linea_id=data.presupuesto_linea_id,
            cita_id=data.cita_id,
        )
        db.add(historial)
        await db.flush()

    if trabajo:
        trabajo.realizado = True
        trabajo.historial_id = historial.id
        trabajo.pieza_dental = pieza_dental
        trabajo.caras = caras

    sesion_item: SesionClinicaItem | None = None
    if data.sesion_item_id:
        sesion_item = await db.get(SesionClinicaItem, data.sesion_item_id)
        if not sesion_item or sesion_item.paciente_id != data.paciente_id:
            raise HTTPException(
                status_code=404,
                detail="Item de sesion no encontrado para el paciente",
            )
    if sesion_item:
        sesion_item.estado = "realizado"
        sesion_item.historial_id = historial.id
        sesion_item.tratamiento_id = data.tratamiento_id
        sesion_item.doctor_id = doctor_id
        sesion_item.pieza_dental = pieza_dental
        sesion_item.caras = caras
        if data.observaciones is not None:
            sesion_item.observaciones = data.observaciones

    await _mark_session_historial_on_odontograma(
        db,
        historial=historial,
        presupuesto_linea_id=data.presupuesto_linea_id,
        current_user=current_user,
    )
    await db.commit()
    result = await db.execute(
        select(HistorialClinico)
        .options(
            selectinload(HistorialClinico.tratamiento),
            selectinload(HistorialClinico.doctor),
        )
        .where(HistorialClinico.id == historial.id)
    )
    return HistorialResponse.model_validate(result.scalar_one())
