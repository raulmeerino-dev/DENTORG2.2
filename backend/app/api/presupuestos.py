"""Presupuestos, planes aceptados y conversion a factura."""
from datetime import date as date_type
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import (
    CurrentUser,
    RequireAdmin,
    ensure_clinic_access,
    resolve_clinic_id,
    scope_select_by_clinic,
)
from app.database import get_db
from app.models.factura import Cobro, Factura, FacturaLinea
from app.models.historial import HistorialClinico
from app.models.odontograma import (
    Odontograma,
    OdontogramaEvento,
    OdontogramaPieza,
    OdontogramaSuperficie,
)
from app.models.paciente import Paciente
from app.models.presupuesto import Presupuesto, PresupuestoLinea, TrabajoPendiente
from app.schemas.factura import FacturaResponse
from app.schemas.presupuesto import (
    OdontogramaPlanResponse,
    OdontogramaPlanUpdate,
    PresupuestoAceptarCreate,
    PresupuestoConvertirFacturaCreate,
    PresupuestoCreate,
    PresupuestoLineaCreate,
    PresupuestoLineaResponse,
    PresupuestoLineaUpdate,
    PresupuestoRechazarCreate,
    PresupuestoResponse,
    PresupuestoUpdate,
    TrabajoPendienteResponse,
)
from app.services.fiscal_document_service import archivar_pdf_factura
from app.services.verifactu_service import (
    registrar_evento_sif,
    registrar_registro_facturacion,
    sellar_factura,
)

router = APIRouter()


PRESUPUESTO_LOAD = [
    selectinload(Presupuesto.paciente),
    selectinload(Presupuesto.doctor),
    selectinload(Presupuesto.lineas).selectinload(PresupuestoLinea.tratamiento),
]

FACTURA_LOAD = [
    selectinload(Factura.paciente),
    selectinload(Factura.entidad),
    selectinload(Factura.forma_pago),
    selectinload(Factura.lineas),
    selectinload(Factura.cobros).selectinload(Cobro.forma_pago),
]

CARAS_TO_SURFACES = {
    "O": "oclusal_incisal",
    "I": "oclusal_incisal",
    "M": "mesial",
    "D": "distal",
    "V": "vestibular",
    "B": "vestibular",
    "L": "lingual_palatina",
    "P": "lingual_palatina",
    "R": "raiz",
}


async def _get_presupuesto_or_404(db: AsyncSession, presupuesto_id: UUID) -> Presupuesto:
    result = await db.execute(
        select(Presupuesto).options(*PRESUPUESTO_LOAD).where(Presupuesto.id == presupuesto_id)
    )
    presupuesto = result.scalar_one_or_none()
    if not presupuesto:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    return presupuesto


async def _get_factura_response(db: AsyncSession, factura_id: UUID) -> Factura:
    result = await db.execute(select(Factura).options(*FACTURA_LOAD).where(Factura.id == factura_id))
    return result.scalar_one()


async def _siguiente_numero_factura(db: AsyncSession, serie: str, clinica_id: UUID | None) -> int:
    stmt = select(func.max(Factura.numero)).where(Factura.serie == serie)
    if clinica_id:
        stmt = stmt.where(Factura.clinica_id == clinica_id)
    result = await db.execute(stmt)
    return (result.scalar_one_or_none() or 0) + 1


def _detalle_factura(factura: Factura) -> dict:
    return {
        "serie": factura.serie,
        "numero": factura.numero,
        "total": str(factura.total),
        "num_registro": factura.num_registro,
        "estado_verifactu": factura.estado_verifactu,
    }


def _importe_linea(linea: PresupuestoLinea) -> tuple[Decimal, Decimal, Decimal]:
    base = (linea.precio_unitario * (Decimal("1.00") - linea.descuento_porcentaje / Decimal("100"))).quantize(Decimal("0.01"))
    iva = (base * linea.tratamiento.iva_porcentaje / Decimal("100")).quantize(Decimal("0.01"))
    return base, iva, base + iva


def _totales_factura(lineas: list[PresupuestoLinea]) -> tuple[Decimal, Decimal, Decimal]:
    subtotal = Decimal("0.00")
    iva_total = Decimal("0.00")
    for linea in lineas:
        base, iva, _ = _importe_linea(linea)
        subtotal += base
        iva_total += iva
    return subtotal, iva_total, subtotal + iva_total


def _normalize_caras(caras: str | None) -> str | None:
    if not caras:
        return None
    return "".join(dict.fromkeys(caras.upper().strip()))


def _surfaces_from_caras(caras: str | None) -> list[str]:
    normalized = _normalize_caras(caras)
    if not normalized:
        return ["oclusal_incisal"]
    surfaces: list[str] = []
    for char in normalized:
        surface = CARAS_TO_SURFACES.get(char)
        if surface and surface not in surfaces:
            surfaces.append(surface)
    return surfaces or ["oclusal_incisal"]


async def _active_odontograma_for_patient(db: AsyncSession, paciente_id: UUID) -> Odontograma | None:
    result = await db.execute(
        select(Odontograma)
        .options(selectinload(Odontograma.piezas).selectinload(OdontogramaPieza.superficies))
        .where(Odontograma.paciente_id == paciente_id, Odontograma.activo == True)  # noqa: E712
        .order_by(Odontograma.version.desc(), Odontograma.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_or_create_odontograma_surface(
    db: AsyncSession,
    odontograma: Odontograma,
    pieza_fdi: int,
    superficie: str,
) -> OdontogramaSuperficie:
    piece = next((item for item in odontograma.piezas if item.pieza_fdi == pieza_fdi), None)
    if not piece:
        piece = OdontogramaPieza(odontograma_id=odontograma.id, pieza_fdi=pieza_fdi)
        db.add(piece)
        await db.flush()
        odontograma.piezas.append(piece)

    surface = next((item for item in piece.superficies if item.superficie == superficie), None)
    if surface:
        return surface
    surface = OdontogramaSuperficie(pieza_id=piece.id, superficie=superficie)
    db.add(surface)
    await db.flush()
    piece.superficies.append(surface)
    return surface


async def _find_linked_budget_line_for_surfaces(
    db: AsyncSession,
    *,
    paciente_id: UUID,
    pieza_dental: int | None,
    caras: str | None,
) -> PresupuestoLinea | None:
    if not pieza_dental:
        return None
    odontograma = await _active_odontograma_for_patient(db, paciente_id)
    if not odontograma:
        return None
    linked_ids: list[UUID] = []
    for piece in odontograma.piezas:
        if piece.pieza_fdi != pieza_dental:
            continue
        surface_names = set(_surfaces_from_caras(caras))
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
    user: CurrentUser,
) -> None:
    if not linea.pieza_dental:
        return
    odontograma = await _active_odontograma_for_patient(db, presupuesto.paciente_id)
    if not odontograma:
        return
    for surface_name in _surfaces_from_caras(linea.caras):
        surface = await _get_or_create_odontograma_surface(db, odontograma, linea.pieza_dental, surface_name)
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
    user: CurrentUser,
    state: str,
) -> None:
    if not linea.pieza_dental:
        return
    odontograma = await _active_odontograma_for_patient(db, presupuesto.paciente_id)
    if not odontograma:
        return
    for surface_name in _surfaces_from_caras(linea.caras):
        surface = await _get_or_create_odontograma_surface(db, odontograma, linea.pieza_dental, surface_name)
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
    user: CurrentUser,
) -> None:
    if not linea.pieza_dental:
        return
    odontograma = await _active_odontograma_for_patient(db, presupuesto.paciente_id)
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
    user: CurrentUser,
) -> None:
    if not trabajo.pieza_dental:
        return
    odontograma = await _active_odontograma_for_patient(db, trabajo.paciente_id)
    if not odontograma:
        return
    for surface_name in _surfaces_from_caras(trabajo.caras):
        surface = await _get_or_create_odontograma_surface(db, odontograma, trabajo.pieza_dental, surface_name)
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


@router.get("", response_model=list[PresupuestoResponse])
async def listar_presupuestos(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(None),
    estado: str | None = Query(None),
    desde: date_type | None = Query(None),
    hasta: date_type | None = Query(None),
) -> list[PresupuestoResponse]:
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


@router.post("", response_model=PresupuestoResponse, status_code=201)
async def crear_presupuesto(
    data: PresupuestoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoResponse:
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

    for linea_data in data.lineas:
        db.add(PresupuestoLinea(presupuesto_id=presupuesto.id, **linea_data.model_dump()))

    await db.commit()
    return PresupuestoResponse.model_validate(await _get_presupuesto_or_404(db, presupuesto.id))


@router.get("/{presupuesto_id}", response_model=PresupuestoResponse)
async def obtener_presupuesto(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoResponse:
    presupuesto = await _get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    return PresupuestoResponse.model_validate(presupuesto)


@router.get("/{presupuesto_id}/odontograma", response_model=OdontogramaPlanResponse)
async def obtener_odontograma_plan(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> OdontogramaPlanResponse:
    presupuesto = await _get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    return OdontogramaPlanResponse(presupuesto_id=presupuesto.id, odontograma=presupuesto.odontograma or {})


@router.put("/{presupuesto_id}/odontograma", response_model=OdontogramaPlanResponse)
async def guardar_odontograma_plan(
    presupuesto_id: UUID,
    data: OdontogramaPlanUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> OdontogramaPlanResponse:
    presupuesto = await _get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    presupuesto.odontograma = data.odontograma
    await db.commit()
    return OdontogramaPlanResponse(presupuesto_id=presupuesto.id, odontograma=presupuesto.odontograma or {})


@router.patch("/{presupuesto_id}", response_model=PresupuestoResponse)
async def actualizar_presupuesto(
    presupuesto_id: UUID,
    data: PresupuestoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoResponse:
    presupuesto = await _get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(presupuesto, field, value)
    await db.commit()
    return PresupuestoResponse.model_validate(await _get_presupuesto_or_404(db, presupuesto_id))


@router.post("/{presupuesto_id}/presentar", response_model=PresupuestoResponse)
async def presentar_presupuesto(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoResponse:
    presupuesto = await _get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    presupuesto.estado = "presentado"
    await db.commit()
    return PresupuestoResponse.model_validate(await _get_presupuesto_or_404(db, presupuesto_id))


@router.post("/{presupuesto_id}/aceptar", response_model=PresupuestoResponse)
async def aceptar_presupuesto(
    presupuesto_id: UUID,
    data: PresupuestoAceptarCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoResponse:
    presupuesto = await _get_presupuesto_or_404(db, presupuesto_id)
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
    return PresupuestoResponse.model_validate(await _get_presupuesto_or_404(db, presupuesto_id))


@router.post("/{presupuesto_id}/rechazar", response_model=PresupuestoResponse)
async def rechazar_presupuesto(
    presupuesto_id: UUID,
    data: PresupuestoRechazarCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoResponse:
    presupuesto = await _get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    presupuesto.estado = "rechazado"
    if data.motivo:
        presupuesto.pie_pagina = f"{presupuesto.pie_pagina or ''}\nRechazado: {data.motivo}".strip()
    await db.commit()
    return PresupuestoResponse.model_validate(await _get_presupuesto_or_404(db, presupuesto_id))


@router.post("/{presupuesto_id}/convertir-a-factura", response_model=FacturaResponse, status_code=201)
async def convertir_presupuesto_a_factura(
    presupuesto_id: UUID,
    data: PresupuestoConvertirFacturaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    presupuesto = await _get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    if presupuesto.estado == "facturado":
        raise HTTPException(status_code=409, detail="El presupuesto ya esta facturado")

    lineas = [linea for linea in presupuesto.lineas if linea.aceptado] if data.solo_aceptadas else list(presupuesto.lineas)
    if not lineas:
        raise HTTPException(status_code=409, detail="No hay lineas aceptadas para facturar")

    subtotal, iva_total, total = _totales_factura(lineas)
    numero = await _siguiente_numero_factura(db, data.serie, presupuesto.clinica_id)
    factura = Factura(
        paciente_id=presupuesto.paciente_id,
        clinica_id=presupuesto.clinica_id,
        serie=data.serie,
        numero=numero,
        fecha=data.fecha,
        tipo="paciente",
        subtotal=subtotal,
        iva_total=iva_total,
        total=total,
        estado="emitida",
        forma_pago_id=data.forma_pago_id,
        observaciones=f"Factura generada desde presupuesto {presupuesto.numero}",
    )
    db.add(factura)
    await db.flush()

    trabajos_result = await db.execute(
        select(TrabajoPendiente).where(TrabajoPendiente.presupuesto_linea_id.in_([linea.id for linea in lineas]))
    )
    trabajos_por_linea = {trabajo.presupuesto_linea_id: trabajo for trabajo in trabajos_result.scalars().all()}

    for linea in lineas:
        base, iva, total_linea = _importe_linea(linea)
        trabajo = trabajos_por_linea.get(linea.id)
        historial_id = trabajo.historial_id if trabajo else None
        db.add(FacturaLinea(
            factura_id=factura.id,
            historial_id=historial_id,
            concepto=linea.tratamiento.nombre,
            cantidad=1,
            precio_unitario=base,
            iva_porcentaje=linea.tratamiento.iva_porcentaje,
            subtotal=total_linea,
        ))
        if historial_id:
            historial = await db.get(HistorialClinico, historial_id)
            if historial and historial.factura_id is None:
                historial.factura_id = factura.id

    presupuesto.estado = "facturado"
    await sellar_factura(db, factura)
    await registrar_registro_facturacion(
        db,
        factura=factura,
        tipo_registro="alta",
        usuario_id=current_user.user_id,
        detalles={**_detalle_factura(factura), "presupuesto_id": str(presupuesto.id)},
    )
    await registrar_evento_sif(
        db,
        tipo_evento="FACTURA_ALTA_DESDE_PRESUPUESTO",
        factura_id=factura.id,
        usuario_id=current_user.user_id,
        detalles={**_detalle_factura(factura), "presupuesto_id": str(presupuesto.id)},
    )
    await db.flush()
    factura_pdf = await _get_factura_response(db, factura.id)
    await archivar_pdf_factura(db, factura=factura_pdf, created_by_id=current_user.user_id)
    await db.commit()
    return FacturaResponse.model_validate(await _get_factura_response(db, factura.id))


@router.delete("/{presupuesto_id}", status_code=204, dependencies=[RequireAdmin])
async def eliminar_presupuesto(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    presupuesto = await _get_presupuesto_or_404(db, presupuesto_id)
    await db.delete(presupuesto)
    await db.commit()


@router.post("/{presupuesto_id}/lineas", response_model=PresupuestoLineaResponse, status_code=201)
async def anadir_linea(
    presupuesto_id: UUID,
    data: PresupuestoLineaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoLineaResponse:
    presupuesto = await _get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    payload = data.model_dump()
    payload["caras"] = _normalize_caras(payload.get("caras"))
    duplicate_stmt = select(PresupuestoLinea).options(selectinload(PresupuestoLinea.tratamiento)).where(
        PresupuestoLinea.presupuesto_id == presupuesto_id,
        PresupuestoLinea.tratamiento_id == payload["tratamiento_id"],
        PresupuestoLinea.pieza_dental == payload.get("pieza_dental"),
    )
    if payload.get("caras") is None:
        duplicate_stmt = duplicate_stmt.where(PresupuestoLinea.caras.is_(None))
    else:
        duplicate_stmt = duplicate_stmt.where(PresupuestoLinea.caras == payload["caras"])
    duplicate = await db.scalar(duplicate_stmt)
    if duplicate:
        return PresupuestoLineaResponse.model_validate(duplicate)
    linked_line = await _find_linked_budget_line_for_surfaces(
        db,
        paciente_id=presupuesto.paciente_id,
        pieza_dental=payload.get("pieza_dental"),
        caras=payload.get("caras"),
    )
    if linked_line:
        if linked_line.presupuesto_id == presupuesto_id:
            return PresupuestoLineaResponse.model_validate(linked_line)
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


@router.patch("/{presupuesto_id}/lineas/{linea_id}", response_model=PresupuestoLineaResponse)
async def actualizar_linea(
    presupuesto_id: UUID,
    linea_id: UUID,
    data: PresupuestoLineaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PresupuestoLineaResponse:
    presupuesto = await _get_presupuesto_or_404(db, presupuesto_id)
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
        setattr(linea, field, _normalize_caras(value) if field == "caras" else value)
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


@router.delete("/{presupuesto_id}/lineas/{linea_id}", status_code=204)
async def eliminar_linea(
    presupuesto_id: UUID,
    linea_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    presupuesto = await _get_presupuesto_or_404(db, presupuesto_id)
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


@router.post("/{presupuesto_id}/pasar-trabajo-pendiente", response_model=list[TrabajoPendienteResponse])
async def pasar_a_trabajo_pendiente(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[TrabajoPendienteResponse]:
    presupuesto = await _get_presupuesto_or_404(db, presupuesto_id)
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
            .options(selectinload(TrabajoPendiente.tratamiento))
            .where(TrabajoPendiente.id == tp.id)
        )
        resultado.append(TrabajoPendienteResponse.model_validate(r.scalar_one()))
    return resultado


@router.get("/trabajo-pendiente/{paciente_id}", response_model=list[TrabajoPendienteResponse])
async def trabajo_pendiente_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    solo_pendiente: bool = Query(True),
) -> list[TrabajoPendienteResponse]:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)
    stmt = (
        select(TrabajoPendiente)
        .options(selectinload(TrabajoPendiente.tratamiento))
        .where(TrabajoPendiente.paciente_id == paciente_id)
        .order_by(TrabajoPendiente.created_at)
    )
    if solo_pendiente:
        stmt = stmt.where(TrabajoPendiente.realizado == False)  # noqa: E712
    result = await db.execute(stmt)
    return [TrabajoPendienteResponse.model_validate(tp) for tp in result.scalars().all()]


@router.patch("/trabajo-pendiente/{tp_id}/realizar", response_model=TrabajoPendienteResponse)
async def marcar_realizado(
    tp_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> TrabajoPendienteResponse:
    result = await db.execute(
        select(TrabajoPendiente)
        .options(selectinload(TrabajoPendiente.tratamiento))
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
    await db.refresh(tp)
    return TrabajoPendienteResponse.model_validate(tp)
