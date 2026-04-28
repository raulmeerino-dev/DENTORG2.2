"""
Router de facturas.

- Formas de pago
- CRUD de facturas
- Cobros
- Controles de inalterabilidad fiscal
- Integridad y eventos del SIF
"""
from datetime import datetime, timezone
import base64
from io import BytesIO
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import CurrentUser, RequireAdmin
from app.database import get_db
from app.models.clinica import Receta
from app.models.factura import Cobro, Factura, FacturaLinea, FormaPago
from app.models.historial import HistorialClinico
from app.models.paciente import Paciente
from app.models.registro_evento_sif import RegistroEventoSIF
from app.models.usuario import Usuario
from app.schemas.factura import (
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
from app.services.fiscal_document_service import archivar_pdf_factura
from app.services.verifactu_service import (
    registrar_evento_sif,
    registrar_registro_facturacion,
    sellar_factura,
    verificar_integridad_eventos_sif,
    verificar_integridad_serie,
)

router = APIRouter()

_LOAD_FACTURA = [
    selectinload(Factura.paciente),
    selectinload(Factura.entidad),
    selectinload(Factura.forma_pago),
    selectinload(Factura.lineas),
    selectinload(Factura.cobros).selectinload(Cobro.forma_pago),
]


async def _get_factura_or_404(db: AsyncSession, factura_id: UUID) -> Factura:
    result = await db.execute(
        select(Factura).options(*_LOAD_FACTURA).where(Factura.id == factura_id)
    )
    factura = result.scalar_one_or_none()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return factura


async def _siguiente_numero(db: AsyncSession, serie: str) -> int:
    result = await db.execute(select(func.max(Factura.numero)).where(Factura.serie == serie))
    max_num = result.scalar_one_or_none()
    return (max_num or 0) + 1


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
        "factura_rectificada_id": str(factura.factura_rectificada_id) if factura.factura_rectificada_id else None,
    }


async def _registrar_intento_bloqueado(
    db: AsyncSession,
    *,
    factura: Factura,
    current_user: CurrentUser,
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


@router.get("/formas-pago", response_model=list[FormaPagoResponse])
async def listar_formas_pago(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[FormaPagoResponse]:
    result = await db.execute(
        select(FormaPago).where(FormaPago.activo == True).order_by(FormaPago.nombre)  # noqa: E712
    )
    return [FormaPagoResponse.model_validate(fp) for fp in result.scalars().all()]


@router.post("/formas-pago", response_model=FormaPagoResponse, status_code=201, dependencies=[RequireAdmin])
async def crear_forma_pago(
    data: FormaPagoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FormaPagoResponse:
    forma_pago = FormaPago(nombre=data.nombre)
    db.add(forma_pago)
    await db.commit()
    await db.refresh(forma_pago)
    return FormaPagoResponse.model_validate(forma_pago)


@router.get("", response_model=list[FacturaResponse])
async def listar_facturas(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    paciente_id: UUID | None = Query(None),
    estado: str | None = Query(None, pattern=r"^(emitida|cobrada|parcial|anulada)$"),
    fecha_desde: str | None = Query(None),
    fecha_hasta: str | None = Query(None),
    serie: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[FacturaResponse]:
    stmt = (
        select(Factura)
        .options(*_LOAD_FACTURA)
        .order_by(Factura.fecha.desc(), Factura.serie, Factura.numero.desc())
        .limit(limit)
        .offset(offset)
    )
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
    return [FacturaResponse.model_validate(f) for f in result.scalars().all()]


@router.post("", response_model=FacturaResponse, status_code=status.HTTP_201_CREATED)
async def crear_factura(
    data: FacturaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    paciente = await db.get(Paciente, data.paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

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
        clinica_id=current_user.clinica_id or paciente.clinica_id,
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

    await db.commit()
    return FacturaResponse.model_validate(await _get_factura_or_404(db, factura.id))


@router.get("/{factura_id}", response_model=FacturaResponse)
async def obtener_factura(
    factura_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> FacturaResponse:
    return FacturaResponse.model_validate(await _get_factura_or_404(db, factura_id))


@router.post("/{factura_id}/receta")
async def generar_receta(
    factura_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> Response:
    factura = await _get_factura_or_404(db, factura_id)
    result = await db.execute(select(Receta).where(Receta.factura_id == factura_id))
    receta = result.scalar_one_or_none()
    if not receta:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas

        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=A4)
        pdf.setTitle(f"Receta factura {factura.serie}-{factura.numero}")
        pdf.setFont("Helvetica-Bold", 16)
        pdf.drawString(50, 800, "RECETA ELECTRONICA")
        pdf.setFont("Helvetica", 10)
        pdf.drawString(50, 780, "Formato interno DentOrg2. Validar integracion oficial antes de uso sanitario real.")
        pdf.drawString(50, 750, f"Paciente: {factura.paciente.nombre} {factura.paciente.apellidos}")
        pdf.drawString(50, 730, f"Factura: {factura.serie}-{factura.numero}  Fecha: {factura.fecha.isoformat()}")
        y = 700
        for linea in factura.lineas:
            pdf.drawString(60, y, f"- {linea.concepto} ({linea.cantidad})")
            y -= 18
        pdf.drawString(50, 120, f"Emitida por usuario: {current_user.username}")
        pdf.showPage()
        pdf.save()
        contenido = base64.b64encode(buffer.getvalue()).decode("ascii")
        receta = Receta(factura_id=factura_id, contenido_base64=contenido)
        db.add(receta)
        factura.tiene_receta_electronica = True
        await db.commit()
    return Response(
        content=base64.b64decode(receta.contenido_base64),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="receta-{factura.serie}-{factura.numero}.pdf"'},
    )


@router.patch("/{factura_id}", response_model=FacturaResponse)
async def actualizar_factura(
    factura_id: UUID,
    data: FacturaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    factura = await _get_factura_or_404(db, factura_id)
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
    return FacturaResponse.model_validate(await _get_factura_or_404(db, factura_id))


async def _anular_factura_emitida(
    factura_id: UUID,
    db: AsyncSession,
    current_user: CurrentUser,
) -> None:
    factura = await _get_factura_or_404(db, factura_id)
    if factura.estado == "anulada":
        return
    if not factura.huella:
        raise HTTPException(
            status_code=409,
            detail="Solo se pueden anular facturas emitidas y selladas",
        )

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


@router.post("/{factura_id}/anular", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def anular_factura_post(
    factura_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    await _anular_factura_emitida(factura_id, db, current_user)


@router.delete("/{factura_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def anular_factura(
    factura_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    await _anular_factura_emitida(factura_id, db, current_user)


@router.post("/{factura_id}/rectificar", response_model=FacturaResponse, status_code=status.HTTP_201_CREATED)
async def rectificar_factura(
    factura_id: UUID,
    data: FacturaRectificativaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    original = await _get_factura_or_404(db, factura_id)
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
    observaciones = f"{observaciones}\n{nota_rectificacion}".strip() if observaciones else nota_rectificacion

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
        forma_pago_id=data.forma_pago_id if data.forma_pago_id is not None else original.forma_pago_id,
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
    return FacturaResponse.model_validate(await _get_factura_or_404(db, factura_rectificativa.id))


@router.get("/historial-sin-facturar", response_model=list[HistorialSinFacturarResponse])
async def historial_sin_facturar(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[HistorialSinFacturarResponse]:
    facturados_sq = select(FacturaLinea.historial_id).where(
        FacturaLinea.historial_id.is_not(None)
    ).scalar_subquery()

    stmt = (
        select(HistorialClinico)
        .options(
            selectinload(HistorialClinico.tratamiento),
            selectinload(HistorialClinico.doctor),
        )
        .where(
            HistorialClinico.paciente_id == paciente_id,
            HistorialClinico.id.not_in(facturados_sq),
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
            tratamiento_precio=h.tratamiento.precio,
            tratamiento_iva=h.tratamiento.iva_porcentaje,
            doctor_id=h.doctor_id,
            doctor_nombre=h.doctor.nombre,
        )
        for h in rows
    ]


@router.post("/{factura_id}/lineas", response_model=FacturaResponse, status_code=201)
async def anadir_linea(
    factura_id: UUID,
    data: FacturaLineaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    factura = await _get_factura_or_404(db, factura_id)
    if factura.estado == "anulada":
        raise HTTPException(status_code=400, detail="No se pueden anadir lineas a una factura anulada")
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

    await db.commit()
    return FacturaResponse.model_validate(await _get_factura_or_404(db, factura_id))


@router.delete("/{factura_id}/lineas/{linea_id}", status_code=204)
async def eliminar_linea(
    factura_id: UUID,
    linea_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    factura = await _get_factura_or_404(db, factura_id)
    if factura.estado == "anulada":
        raise HTTPException(status_code=400, detail="No se pueden eliminar lineas de una factura anulada")
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

    await db.delete(linea)
    await db.commit()


@router.post("/{factura_id}/cobros", response_model=FacturaResponse, status_code=201)
async def registrar_cobro(
    factura_id: UUID,
    data: CobroCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    factura = await _get_factura_or_404(db, factura_id)
    if factura.estado == "anulada":
        raise HTTPException(status_code=400, detail="No se puede cobrar una factura anulada")

    forma_pago = await db.get(FormaPago, data.forma_pago_id)
    if not forma_pago:
        raise HTTPException(status_code=404, detail="Forma de pago no encontrada")

    result = await db.execute(select(Usuario).where(Usuario.username == current_user.username))
    usuario = result.scalar_one_or_none()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    cobro = Cobro(
        factura_id=factura_id,
        fecha=datetime.now(timezone.utc),
        importe=data.importe,
        forma_pago_id=data.forma_pago_id,
        usuario_id=usuario.id,
        notas=data.notas,
    )
    db.add(cobro)

    await db.flush()
    total_cobrado = sum(c.importe for c in factura.cobros if c.anulado_at is None) + data.importe
    factura.estado = "cobrada" if total_cobrado >= factura.total else "parcial"
    await registrar_evento_sif(
        db,
        tipo_evento="COBRO_ALTA",
        factura_id=factura.id,
        usuario_id=current_user.user_id,
        detalles={
            "cobro_id": str(cobro.id),
            "importe": str(cobro.importe),
            "forma_pago_id": str(cobro.forma_pago_id),
        },
    )
    await db.commit()

    return FacturaResponse.model_validate(await _get_factura_or_404(db, factura_id))


async def _anular_cobro_emitido(
    factura_id: UUID,
    cobro_id: UUID,
    data: CobroAnulacionCreate,
    db: AsyncSession,
    current_user: CurrentUser,
) -> None:
    result = await db.execute(select(Cobro).where(Cobro.id == cobro_id, Cobro.factura_id == factura_id))
    cobro = result.scalar_one_or_none()
    if not cobro:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")
    if cobro.anulado_at is not None:
        return

    cobro.anulado_at = datetime.now(timezone.utc)
    cobro.anulado_por_id = current_user.user_id
    cobro.motivo_anulacion = data.motivo

    factura = await _get_factura_or_404(db, factura_id)
    total_cobrado = sum(c.importe for c in factura.cobros if c.anulado_at is None)
    if total_cobrado <= 0:
        factura.estado = "emitida"
    elif total_cobrado >= factura.total:
        factura.estado = "cobrada"
    else:
        factura.estado = "parcial"
    await registrar_evento_sif(
        db,
        tipo_evento="COBRO_ANULACION",
        factura_id=factura.id,
        usuario_id=current_user.user_id,
        detalles={
            "cobro_id": str(cobro.id),
            "importe": str(cobro.importe),
            "motivo": data.motivo,
        },
    )

    await db.commit()


@router.post("/{factura_id}/cobros/{cobro_id}/anular", status_code=204, dependencies=[RequireAdmin])
async def anular_cobro_post(
    factura_id: UUID,
    cobro_id: UUID,
    data: CobroAnulacionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    await _anular_cobro_emitido(factura_id, cobro_id, data, db, current_user)


@router.delete("/{factura_id}/cobros/{cobro_id}", status_code=204, dependencies=[RequireAdmin])
async def anular_cobro(
    factura_id: UUID,
    cobro_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    await _anular_cobro_emitido(
        factura_id,
        cobro_id,
        CobroAnulacionCreate(motivo="Anulacion administrativa"),
        db,
        current_user,
    )


@router.get("/verifactu/integridad/{serie}", dependencies=[RequireAdmin])
async def verificar_integridad(
    serie: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    return await verificar_integridad_serie(db, serie)


@router.get("/verifactu/eventos/integridad", dependencies=[RequireAdmin])
async def verificar_integridad_eventos(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    return await verificar_integridad_eventos_sif(db)


@router.get("/verifactu/eventos", dependencies=[RequireAdmin])
async def listar_eventos_sif(
    db: Annotated[AsyncSession, Depends(get_db)],
    factura_id: UUID | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> list[dict]:
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
