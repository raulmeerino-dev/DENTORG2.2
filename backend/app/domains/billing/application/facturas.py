"""Application use cases: tenant checks, orchestration and existing transactions."""

import base64
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, Response
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.documents.pdf import generar_receta_pdf, pdf_response_headers, validate_pdf_bytes
from app.core.permissions import (
    TokenData,
    ensure_clinic_access,
    resolve_clinic_id,
    scope_select_by_clinic,
)
from app.domains.billing.application.fiscal_document_service import archivar_pdf_factura
from app.domains.billing.application.invoice_account import (
    invoice_response,
    invoice_responses,
    link_invoice_charges,
    receive_invoice_payment,
    sync_draft_invoice_charge,
)
from app.domains.billing.application.ledger import account_patient
from app.domains.billing.application.verifactu_service import (
    registrar_evento_sif,
    registrar_registro_facturacion,
    sellar_factura,
    verificar_integridad_eventos_sif,
    verificar_integridad_serie,
)
from app.domains.billing.persistence.cuenta import AplicacionPago, CargoPaciente
from app.domains.billing.persistence.factura import Cobro, Factura, FacturaLinea, FormaPago
from app.domains.billing.persistence.receta_factura import RecetaFactura
from app.domains.billing.persistence.registro_evento_sif import RegistroEventoSIF
from app.domains.billing.schemas.factura import (
    CobroAnulacionCreate,
    CobroCreate,
    FacturaCreate,
    FacturaLineaCreate,
    FacturaRectificativaCreate,
    FacturaResponse,
    FacturaUpdate,
    FormaPagoCreate,
    FormaPagoResponse,
    HistorialSinFacturarResponse,
)
from app.domains.clinical.persistence.historial import HistorialClinico
from app.domains.patients.persistence.paciente import Paciente

_LOAD_FACTURA = [
    selectinload(Factura.paciente),
    selectinload(Factura.entidad),
    selectinload(Factura.forma_pago),
    selectinload(Factura.lineas),
    selectinload(Factura.cobros).selectinload(Cobro.forma_pago),
]


async def _get_factura_or_404(db: AsyncSession, factura_id: UUID) -> Factura:
    result = await db.execute(
        select(Factura)
        .options(*_LOAD_FACTURA)
        .where(Factura.id == factura_id)
        .execution_options(populate_existing=True)
    )
    factura = result.scalar_one_or_none()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return factura


async def _siguiente_numero(db: AsyncSession, serie: str) -> int:
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": f"invoice-series:{serie}"})
    result = await db.execute(select(func.max(Factura.numero)).where(Factura.serie == serie))
    max_num = result.scalar_one_or_none()
    return (max_num or 0) + 1


def _estado_por_cobro(total: Decimal, total_cobrado: Decimal) -> str:
    if total_cobrado <= 0:
        return "emitida"
    if total_cobrado >= total:
        return "pagada"
    return "parcial"


def _calcular_linea(linea: FacturaLineaCreate) -> tuple[Decimal, Decimal, Decimal]:
    base = linea.precio_unitario * linea.cantidad
    iva = (base * linea.iva_porcentaje / 100).quantize(Decimal("0.01"))
    total = base + iva
    return base, iva, total


def _detalle_factura_evento(factura: Factura) -> dict:
    return {
        "serie": factura.serie,
        "numero": factura.numero,
        "total": str(factura.total),
        "num_registro": factura.num_registro,
        "estado_verifactu": factura.estado_verifactu,
        "es_rectificativa": factura.es_rectificativa,
        "factura_rectificada_id": str(factura.factura_rectificada_id)
        if factura.factura_rectificada_id
        else None,
    }


async def _registrar_intento_bloqueado(
    db: AsyncSession,
    *,
    factura: Factura,
    current_user: TokenData,
    operacion: str,
) -> None:
    await registrar_evento_sif(
        db,
        tipo_evento="INTENTO_MODIFICACION_RECHAZADO",
        factura_id=factura.id,
        usuario_id=current_user.user_id,
        detalles={
            "operacion": operacion,
            "motivo": "factura_sellada",
            "serie": factura.serie,
            "numero": factura.numero,
            "num_registro": factura.num_registro,
        },
    )


def _asegurar_factura_inalterable(factura: Factura) -> None:
    if factura.huella:
        raise HTTPException(
            status_code=409,
            detail="La factura ya esta emitida y sellada. Debe rectificarse o anularse, no modificarse.",
        )


async def listar_formas_pago(db: AsyncSession, _: TokenData) -> list[FormaPagoResponse]:
    result = await db.execute(
        select(FormaPago).where(FormaPago.activo == True).order_by(FormaPago.nombre)  # noqa: E712
    )
    return [FormaPagoResponse.model_validate(fp) for fp in result.scalars().all()]


async def crear_forma_pago(data: FormaPagoCreate, db: AsyncSession) -> FormaPagoResponse:
    forma_pago = FormaPago(nombre=data.nombre)
    db.add(forma_pago)
    await db.commit()
    await db.refresh(forma_pago)
    return FormaPagoResponse.model_validate(forma_pago)


async def listar_facturas(
    db: AsyncSession,
    current_user: TokenData,
    paciente_id: UUID | None,
    estado: str | None,
    fecha_desde: str | None,
    fecha_hasta: str | None,
    serie: str | None,
    limit: int,
    offset: int,
) -> list[FacturaResponse]:
    stmt = (
        select(Factura)
        .options(*_LOAD_FACTURA)
        .order_by(Factura.fecha.desc(), Factura.serie, Factura.numero.desc())
        .limit(limit)
        .offset(offset)
    )
    stmt = scope_select_by_clinic(stmt, Factura, current_user)
    if paciente_id:
        stmt = stmt.where(Factura.paciente_id == paciente_id)
    if estado:
        stmt = stmt.where(Factura.estado == estado)
    if fecha_desde:
        stmt = stmt.where(Factura.fecha >= fecha_desde)
    if fecha_hasta:
        stmt = stmt.where(Factura.fecha <= fecha_hasta)
    if serie:
        stmt = stmt.where(Factura.serie == serie)

    result = await db.execute(stmt)
    return await invoice_responses(db, result.scalars().all())


async def crear_factura(
    data: FacturaCreate, db: AsyncSession, current_user: TokenData, *, commit=True, cargo_ids=None
) -> FacturaResponse:
    paciente = await account_patient(db, data.paciente_id, current_user, lock=True)

    subtotal = Decimal("0.00")
    iva_total = Decimal("0.00")
    for linea in data.lineas:
        base, iva, _ = _calcular_linea(linea)
        subtotal += base
        iva_total += iva
    total = subtotal + iva_total

    numero = await _siguiente_numero(db, data.serie)

    factura = Factura(
        paciente_id=data.paciente_id,
        entidad_id=data.entidad_id,
        clinica_id=resolve_clinic_id(current_user, paciente.clinica_id),
        serie=data.serie,
        numero=numero,
        fecha=data.fecha,
        tipo=data.tipo,
        subtotal=subtotal,
        iva_total=iva_total,
        total=total,
        estado="emitida",
        forma_pago_id=data.forma_pago_id,
        observaciones=data.observaciones,
    )
    db.add(factura)
    await db.flush()

    for linea in data.lineas:
        _, _, subtotal_linea = _calcular_linea(linea)
        db.add(
            FacturaLinea(
                factura_id=factura.id,
                historial_id=linea.historial_id,
                concepto=linea.concepto,
                concepto_ficticio=linea.concepto_ficticio,
                cantidad=linea.cantidad,
                precio_unitario=linea.precio_unitario,
                iva_porcentaje=linea.iva_porcentaje,
                subtotal=subtotal_linea,
            )
        )

    await db.flush()
    await link_invoice_charges(db, factura, cargo_ids=cargo_ids, user=current_user)
    await sellar_factura(db, factura)
    await registrar_registro_facturacion(
        db,
        factura=factura,
        tipo_registro="alta",
        usuario_id=current_user.user_id,
        detalles=_detalle_factura_evento(factura),
    )
    await registrar_evento_sif(
        db,
        tipo_evento="FACTURA_ALTA",
        factura_id=factura.id,
        usuario_id=current_user.user_id,
        detalles=_detalle_factura_evento(factura),
    )
    await db.flush()
    factura_para_pdf = await _get_factura_or_404(db, factura.id)
    await archivar_pdf_factura(
        db,
        factura=factura_para_pdf,
        created_by_id=current_user.user_id,
    )

    if commit:
        await db.commit()
    return await invoice_response(db, await _get_factura_or_404(db, factura.id))


async def historial_sin_facturar(
    paciente_id: UUID, db: AsyncSession, current_user: TokenData
) -> list[HistorialSinFacturarResponse]:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)

    facturados_sq = (
        select(FacturaLinea.historial_id)
        .where(FacturaLinea.historial_id.is_not(None))
        .scalar_subquery()
    )

    stmt = (
        select(HistorialClinico)
        .options(
            selectinload(HistorialClinico.tratamiento),
            selectinload(HistorialClinico.doctor),
        )
        .where(
            HistorialClinico.paciente_id == paciente_id,
            HistorialClinico.id.not_in(facturados_sq),
            HistorialClinico.estado == "realizado",
            HistorialClinico.tratamiento_id.is_not(None),
        )
        .order_by(HistorialClinico.fecha.desc())
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    return [
        HistorialSinFacturarResponse(
            id=h.id,
            fecha=h.fecha,
            pieza_dental=h.pieza_dental,
            caras=h.caras,
            observaciones=h.observaciones,
            tratamiento_id=h.tratamiento_id,
            tratamiento_nombre=h.tratamiento.nombre,
            tratamiento_precio=h.importe if h.importe is not None else h.tratamiento.precio,
            tratamiento_iva=h.tratamiento.iva_porcentaje,
            doctor_id=h.doctor_id,
            doctor_nombre=h.doctor.nombre,
        )
        for h in rows
    ]


async def obtener_factura(
    factura_id: UUID, db: AsyncSession, current_user: TokenData
) -> FacturaResponse:
    factura = await _get_factura_or_404(db, factura_id)
    ensure_clinic_access(current_user, factura.clinica_id)
    return await invoice_response(db, factura)


async def emitir_factura(
    factura_id: UUID, db: AsyncSession, current_user: TokenData
) -> FacturaResponse:
    factura = await _get_factura_or_404(db, factura_id)
    ensure_clinic_access(current_user, factura.clinica_id)
    await account_patient(db, factura.paciente_id, current_user, lock=True)
    factura = await _get_factura_or_404(db, factura_id)
    if factura.estado == "anulada":
        raise HTTPException(status_code=409, detail="No se puede emitir una factura anulada")
    if factura.huella:
        return await invoice_response(db, factura)

    await sync_draft_invoice_charge(db, factura)
    factura.estado = "emitida"
    await sellar_factura(db, factura)
    await registrar_registro_facturacion(
        db,
        factura=factura,
        tipo_registro="alta",
        usuario_id=current_user.user_id,
        detalles=_detalle_factura_evento(factura),
    )
    await registrar_evento_sif(
        db,
        tipo_evento="FACTURA_ALTA",
        factura_id=factura.id,
        usuario_id=current_user.user_id,
        detalles=_detalle_factura_evento(factura),
    )
    await db.flush()
    factura_pdf = await _get_factura_or_404(db, factura.id)
    await archivar_pdf_factura(db, factura=factura_pdf, created_by_id=current_user.user_id)
    await db.commit()
    return await invoice_response(db, await _get_factura_or_404(db, factura_id))


async def generar_receta(factura_id: UUID, db: AsyncSession, current_user: TokenData) -> Response:
    factura = await _get_factura_or_404(db, factura_id)
    ensure_clinic_access(current_user, factura.clinica_id)
    result = await db.execute(select(RecetaFactura).where(RecetaFactura.factura_id == factura_id))
    receta = result.scalar_one_or_none()
    if not receta:
        paciente_nombre = " ".join(
            part for part in [factura.paciente.nombre, factura.paciente.apellidos] if part
        ).strip()
        pdf_bytes = generar_receta_pdf(
            paciente_nombre=paciente_nombre,
            factura_codigo=f"{factura.serie}-{factura.numero}",
            fecha=factura.fecha,
            lineas=[
                {"concepto": linea.concepto, "cantidad": linea.cantidad} for linea in factura.lineas
            ],
            usuario=current_user.username,
        )
        contenido = base64.b64encode(pdf_bytes).decode("ascii")
        receta = RecetaFactura(factura_id=factura_id, contenido_base64=contenido)
        db.add(receta)
        factura.tiene_receta_electronica = True
        await db.commit()
    pdf_bytes = base64.b64decode(receta.contenido_base64)
    validate_pdf_bytes(pdf_bytes)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers=pdf_response_headers(f"receta-{factura.serie}-{factura.numero}.pdf", inline=False),
    )


async def actualizar_factura(
    factura_id: UUID, data: FacturaUpdate, db: AsyncSession, current_user: TokenData
) -> FacturaResponse:
    factura = await _get_factura_or_404(db, factura_id)
    ensure_clinic_access(current_user, factura.clinica_id)
    if factura.estado == "anulada":
        raise HTTPException(status_code=400, detail="No se puede modificar una factura anulada")
    if factura.huella:
        await _registrar_intento_bloqueado(
            db,
            factura=factura,
            current_user=current_user,
            operacion="actualizar_factura",
        )
        await db.commit()
        _asegurar_factura_inalterable(factura)

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(factura, field, value)

    await db.commit()
    return await invoice_response(db, await _get_factura_or_404(db, factura_id))


async def _anular_factura_emitida(
    factura_id: UUID,
    db: AsyncSession,
    current_user: TokenData,
) -> None:
    factura = await _get_factura_or_404(db, factura_id)
    await account_patient(db, factura.paciente_id, current_user, lock=True)
    factura = await _get_factura_or_404(db, factura_id)
    if factura.estado == "anulada":
        return
    if not factura.huella:
        raise HTTPException(
            status_code=409,
            detail="Solo se pueden anular facturas emitidas y selladas",
        )

    charges = (await db.scalars(select(CargoPaciente).where(CargoPaciente.factura_id == factura.id))).all()
    for charge in charges:
        if charge.historial_id:
            # Cancelling the document does not undo the performed clinical service.
            charge.factura_id = None
            charge.factura_linea_id = None
            history = await db.get(HistorialClinico, charge.historial_id)
            if history and history.factura_id == factura.id:
                history.factura_id = None
                history.estado = "realizado"
        else:
            # Legacy/manual invoice charges are retained, with their original links.
            charge.estado = "anulado"
    factura.estado = "anulada"
    factura.estado_verifactu = "anulacion_pendiente"

    await registrar_registro_facturacion(
        db,
        factura=factura,
        tipo_registro="anulacion",
        usuario_id=current_user.user_id,
        detalles=_detalle_factura_evento(factura),
    )

    await registrar_evento_sif(
        db,
        tipo_evento="FACTURA_ANULACION",
        factura_id=factura.id,
        usuario_id=current_user.user_id,
        detalles=_detalle_factura_evento(factura),
    )
    await db.commit()


async def anular_factura_post(factura_id: UUID, db: AsyncSession, current_user: TokenData) -> None:
    await _anular_factura_emitida(factura_id, db, current_user)


async def anular_factura(factura_id: UUID, db: AsyncSession, current_user: TokenData) -> None:
    await _anular_factura_emitida(factura_id, db, current_user)


async def rectificar_factura(
    factura_id: UUID, data: FacturaRectificativaCreate, db: AsyncSession, current_user: TokenData
) -> FacturaResponse:
    original = await _get_factura_or_404(db, factura_id)
    await account_patient(db, original.paciente_id, current_user, lock=True)
    if not original.huella:
        raise HTTPException(
            status_code=409,
            detail="Solo se pueden rectificar facturas ya emitidas y selladas",
        )
    if original.estado == "anulada":
        raise HTTPException(status_code=400, detail="No se puede rectificar una factura anulada")

    subtotal = Decimal("0.00")
    iva_total = Decimal("0.00")
    for linea in data.lineas:
        base, iva, _ = _calcular_linea(linea)
        subtotal += base
        iva_total += iva
    total = subtotal + iva_total

    serie = data.serie or original.serie
    numero = await _siguiente_numero(db, serie)
    observaciones = data.observaciones or original.observaciones
    nota_rectificacion = (
        f"Rectificativa de {original.serie}-{original.numero}. Motivo: {data.motivo}"
    )
    observaciones = (
        f"{observaciones}\n{nota_rectificacion}".strip() if observaciones else nota_rectificacion
    )

    factura_rectificativa = Factura(
        paciente_id=original.paciente_id,
        entidad_id=original.entidad_id,
        clinica_id=original.clinica_id,
        serie=serie,
        numero=numero,
        fecha=data.fecha,
        tipo=original.tipo,
        subtotal=subtotal,
        iva_total=iva_total,
        total=total,
        estado="emitida",
        forma_pago_id=data.forma_pago_id
        if data.forma_pago_id is not None
        else original.forma_pago_id,
        observaciones=observaciones,
        es_rectificativa=True,
        factura_rectificada_id=original.id,
    )
    db.add(factura_rectificativa)
    await db.flush()

    for linea in data.lineas:
        _, _, subtotal_linea = _calcular_linea(linea)
        db.add(
            FacturaLinea(
                factura_id=factura_rectificativa.id,
                historial_id=linea.historial_id,
                concepto=linea.concepto,
                concepto_ficticio=linea.concepto_ficticio,
                cantidad=linea.cantidad,
                precio_unitario=linea.precio_unitario,
                iva_porcentaje=linea.iva_porcentaje,
                subtotal=subtotal_linea,
            )
        )

    # Preserve the existing additive rectification contract; no new clinical act.
    db.add(CargoPaciente(paciente_id=original.paciente_id, clinica_id=original.clinica_id,
        factura_id=factura_rectificativa.id, factura_legacy_id=factura_rectificativa.id,
        concepto=f"Rectificativa {serie}-{numero}", fecha=data.fecha, base=subtotal,
        iva_porcentaje=0, descuento_porcentaje=0, importe=total, estado="activo", origen="rectificacion"))
    await sellar_factura(db, factura_rectificativa)
    await registrar_registro_facturacion(
        db,
        factura=factura_rectificativa,
        tipo_registro="alta",
        usuario_id=current_user.user_id,
        detalles={
            **_detalle_factura_evento(factura_rectificativa),
            "factura_original_id": str(original.id),
            "factura_original_serie": original.serie,
            "factura_original_numero": original.numero,
            "motivo": data.motivo,
        },
    )
    await registrar_evento_sif(
        db,
        tipo_evento="FACTURA_RECTIFICATIVA_ALTA",
        factura_id=factura_rectificativa.id,
        usuario_id=current_user.user_id,
        detalles={
            **_detalle_factura_evento(factura_rectificativa),
            "factura_original_id": str(original.id),
            "factura_original_serie": original.serie,
            "factura_original_numero": original.numero,
            "motivo": data.motivo,
        },
    )
    await db.flush()
    factura_pdf = await _get_factura_or_404(db, factura_rectificativa.id)
    await archivar_pdf_factura(
        db,
        factura=factura_pdf,
        created_by_id=current_user.user_id,
    )
    await registrar_evento_sif(
        db,
        tipo_evento="FACTURA_RECTIFICADA_REFERENCIADA",
        factura_id=original.id,
        usuario_id=current_user.user_id,
        detalles={
            **_detalle_factura_evento(original),
            "factura_rectificativa_id": str(factura_rectificativa.id),
            "factura_rectificativa_serie": factura_rectificativa.serie,
            "factura_rectificativa_numero": factura_rectificativa.numero,
            "motivo": data.motivo,
        },
    )
    await db.commit()
    return await invoice_response(db, await _get_factura_or_404(db, factura_rectificativa.id))


async def anadir_linea(
    factura_id: UUID, data: FacturaLineaCreate, db: AsyncSession, current_user: TokenData
) -> FacturaResponse:
    factura = await _get_factura_or_404(db, factura_id)
    ensure_clinic_access(current_user, factura.clinica_id)
    await account_patient(db, factura.paciente_id, current_user, lock=True)
    factura = await _get_factura_or_404(db, factura_id)
    if factura.estado == "anulada":
        raise HTTPException(
            status_code=400, detail="No se pueden anadir lineas a una factura anulada"
        )
    if factura.huella:
        await _registrar_intento_bloqueado(
            db,
            factura=factura,
            current_user=current_user,
            operacion="anadir_linea",
        )
        await db.commit()
        _asegurar_factura_inalterable(factura)

    base, iva, subtotal_linea = _calcular_linea(data)
    db.add(
        FacturaLinea(
            factura_id=factura.id,
            historial_id=data.historial_id,
            concepto=data.concepto,
            concepto_ficticio=data.concepto_ficticio,
            cantidad=data.cantidad,
            precio_unitario=data.precio_unitario,
            iva_porcentaje=data.iva_porcentaje,
            subtotal=subtotal_linea,
        )
    )

    factura.subtotal += base
    factura.iva_total += iva
    factura.total += subtotal_linea
    await db.flush()
    await sync_draft_invoice_charge(db, factura)
    await db.commit()
    return await invoice_response(db, await _get_factura_or_404(db, factura_id))


async def eliminar_linea(
    factura_id: UUID, linea_id: UUID, db: AsyncSession, current_user: TokenData
) -> None:
    factura = await _get_factura_or_404(db, factura_id)
    ensure_clinic_access(current_user, factura.clinica_id)
    await account_patient(db, factura.paciente_id, current_user, lock=True)
    factura = await _get_factura_or_404(db, factura_id)
    if factura.estado == "anulada":
        raise HTTPException(
            status_code=400, detail="No se pueden eliminar lineas de una factura anulada"
        )
    if factura.huella:
        await _registrar_intento_bloqueado(
            db,
            factura=factura,
            current_user=current_user,
            operacion="eliminar_linea",
        )
        await db.commit()
        _asegurar_factura_inalterable(factura)

    result = await db.execute(
        select(FacturaLinea).where(
            FacturaLinea.id == linea_id,
            FacturaLinea.factura_id == factura_id,
        )
    )
    linea = result.scalar_one_or_none()
    if not linea:
        raise HTTPException(status_code=404, detail="Linea no encontrada")

    base = linea.precio_unitario * linea.cantidad
    iva = (base * linea.iva_porcentaje / 100).quantize(Decimal("0.01"))
    subtotal_linea = base + iva

    factura.subtotal -= base
    factura.iva_total -= iva
    factura.total -= subtotal_linea

    charge = await db.scalar(select(CargoPaciente).where(CargoPaciente.factura_linea_id == linea.id))
    if charge:
        raise HTTPException(409, "La línea ya tiene un cargo trazable y no se puede eliminar.")
    await db.delete(linea)
    await db.flush()
    await sync_draft_invoice_charge(db, factura)
    await db.commit()


async def registrar_cobro(
    factura_id: UUID, data: CobroCreate, db: AsyncSession, current_user: TokenData
) -> FacturaResponse:
    return await receive_invoice_payment(db, factura_id, data, current_user)


async def registrar_pago(
    factura_id: UUID, data: CobroCreate, db: AsyncSession, current_user: TokenData
) -> FacturaResponse:
    return await registrar_cobro(factura_id, data, db, current_user)


async def _anular_cobro_emitido(
    factura_id: UUID,
    cobro_id: UUID,
    data: CobroAnulacionCreate,
    db: AsyncSession,
    current_user: TokenData,
) -> None:
    from app.domains.billing.application.checkout import cancel_payment
    factura = await _get_factura_or_404(db, factura_id)
    ensure_clinic_access(current_user, factura.clinica_id)
    linked = await db.scalar(select(Cobro.id).where(Cobro.id == cobro_id, Cobro.factura_id == factura_id))
    if not linked:
        linked = await db.scalar(select(AplicacionPago.id).join(CargoPaciente).where(
            AplicacionPago.cobro_id == cobro_id, CargoPaciente.factura_id == factura_id).limit(1))
    if not linked:
        raise HTTPException(404, "Cobro no encontrado en esta factura")
    await cancel_payment(db, factura.paciente_id, cobro_id, data, current_user, None)


async def anular_cobro_post(
    factura_id: UUID,
    cobro_id: UUID,
    data: CobroAnulacionCreate,
    db: AsyncSession,
    current_user: TokenData,
) -> None:
    await _anular_cobro_emitido(factura_id, cobro_id, data, db, current_user)


async def anular_cobro(
    factura_id: UUID, cobro_id: UUID, db: AsyncSession, current_user: TokenData
) -> None:
    await _anular_cobro_emitido(
        factura_id,
        cobro_id,
        CobroAnulacionCreate(motivo="Anulacion administrativa"),
        db,
        current_user,
    )


async def verificar_integridad(serie: str, db: AsyncSession) -> dict:
    return await verificar_integridad_serie(db, serie)


async def verificar_integridad_eventos(db: AsyncSession) -> dict:
    return await verificar_integridad_eventos_sif(db)


async def listar_eventos_sif(db: AsyncSession, factura_id: UUID | None, limit: int) -> list[dict]:
    stmt = select(RegistroEventoSIF).order_by(RegistroEventoSIF.created_at.desc()).limit(limit)
    if factura_id:
        stmt = stmt.where(RegistroEventoSIF.factura_id == factura_id)

    result = await db.execute(stmt)
    eventos = result.scalars().all()
    return [
        {
            "id": str(evento.id),
            "tipo_evento": evento.tipo_evento,
            "factura_id": str(evento.factura_id) if evento.factura_id else None,
            "usuario_id": str(evento.usuario_id) if evento.usuario_id else None,
            "sistema_codigo": evento.sistema_codigo,
            "sistema_version": evento.sistema_version,
            "detalles": evento.detalles,
            "previous_hash": evento.previous_hash,
            "event_hash": evento.event_hash,
            "created_at": evento.created_at.isoformat(),
        }
        for evento in eventos
    ]
