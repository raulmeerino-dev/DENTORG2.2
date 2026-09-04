"""
Router de generación de PDFs: facturas y presupuestos.
Devuelve application/pdf para descarga directa o visualización en navegador.
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import CurrentUser, RequireBilling, ensure_clinic_access
from app.database import get_db
from app.models.factura import Cobro, DocumentoFiscal, Factura
from app.models.presupuesto import Presupuesto, PresupuestoLinea
from app.services.fiscal_document_service import (
    build_factura_pdf_bytes,
    cargar_factura_para_pdf,
    read_archived_pdf,
)
from app.services.pdf_service import (
    generar_presupuesto_pdf,
    generar_recibo_pdf,
    pdf_response_headers,
    validate_pdf_bytes,
)

router = APIRouter()


def _pdf_response(data: bytes, filename: str) -> Response:
    validate_pdf_bytes(data)
    return Response(
        content=data,
        media_type="application/pdf",
        headers=pdf_response_headers(filename),
    )


# Factura PDF

@router.get("/facturas/{factura_id}", dependencies=[RequireBilling])
async def pdf_factura(
    factura_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> Response:
    """Genera y devuelve el PDF de una factura."""
    factura = await cargar_factura_para_pdf(db, factura_id)
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    ensure_clinic_access(current_user, factura.clinica_id)

    archived = next((d for d in factura.documentos_fiscales if d.tipo == "factura_pdf"), None)
    pdf_bytes = read_archived_pdf(archived) if archived else None
    if pdf_bytes is not None:
        try:
            validate_pdf_bytes(pdf_bytes)
        except ValueError:
            pdf_bytes = None
    if pdf_bytes is None:
        pdf_bytes = build_factura_pdf_bytes(factura)

    filename = f"factura_{factura.serie}{factura.numero:04d}_{factura.fecha.strftime('%Y%m%d')}.pdf"
    return _pdf_response(pdf_bytes, filename)


@router.get("/facturas/{factura_id}/archivo", dependencies=[RequireBilling])
async def pdf_factura_archivado_info(
    factura_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> dict:
    factura = await cargar_factura_para_pdf(db, factura_id)
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    ensure_clinic_access(current_user, factura.clinica_id)
    documento = await db.scalar(
        select(DocumentoFiscal)
        .where(DocumentoFiscal.factura_id == factura_id, DocumentoFiscal.tipo == "factura_pdf")
        .order_by(DocumentoFiscal.created_at.desc())
        .limit(1)
    )
    if not documento:
        raise HTTPException(status_code=404, detail="PDF fiscal archivado no encontrado")
    return {
        "id": str(documento.id),
        "factura_id": str(documento.factura_id),
        "paciente_id": str(documento.paciente_id),
        "tipo": documento.tipo,
        "hash_pdf": documento.hash_pdf,
        "plantilla_version": documento.plantilla_version,
        "created_at": documento.created_at.isoformat(),
    }


# Presupuesto PDF

@router.get("/presupuestos/{presupuesto_id}")
async def pdf_presupuesto(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> Response:
    """Genera y devuelve el PDF de un presupuesto."""
    result = await db.execute(
        select(Presupuesto)
        .options(
            selectinload(Presupuesto.paciente),
            selectinload(Presupuesto.doctor),
            selectinload(Presupuesto.lineas).selectinload(PresupuestoLinea.tratamiento),
        )
        .where(Presupuesto.id == presupuesto_id)
    )
    pres = result.scalar_one_or_none()
    if not pres:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    ensure_clinic_access(current_user, pres.clinica_id)

    pac = pres.paciente
    lineas_data = []
    for linea in pres.lineas:
        importe_neto = float(linea.precio_unitario) * (1 - float(linea.descuento_porcentaje or 0) / 100)
        lineas_data.append({
            "tratamiento_nombre": linea.tratamiento.nombre if linea.tratamiento else "-",
            "pieza_dental": linea.pieza_dental,
            "caras": linea.caras,
            "precio_unitario": linea.precio_unitario,
            "descuento_porcentaje": linea.descuento_porcentaje,
            "importe_neto": importe_neto,
            "aceptado": linea.aceptado,
        })

    total = sum(linea["importe_neto"] for linea in lineas_data)
    total_aceptado = sum(linea["importe_neto"] for linea in lineas_data if linea["aceptado"])

    pdf_bytes = generar_presupuesto_pdf(
        numero=pres.numero,
        fecha=pres.fecha,
        estado=pres.estado,
        paciente_nombre=pac.nombre if pac else "",
        paciente_apellidos=pac.apellidos if pac else "",
        paciente_num_historial=pac.num_historial if pac else 0,
        doctor_nombre=pres.doctor.nombre if pres.doctor else None,
        lineas=lineas_data,
        total=total,
        total_aceptado=total_aceptado,
        pie_pagina=pres.pie_pagina,
    )

    filename = f"presupuesto_{pres.numero:04d}_{pres.fecha.strftime('%Y%m%d')}.pdf"
    return _pdf_response(pdf_bytes, filename)


@router.get("/cobros/{cobro_id}", dependencies=[RequireBilling])
async def pdf_recibo_cobro(
    cobro_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> Response:
    result = await db.execute(
        select(Cobro)
        .options(
            selectinload(Cobro.forma_pago),
            selectinload(Cobro.usuario),
            selectinload(Cobro.factura).selectinload(Factura.paciente),
        )
        .where(Cobro.id == cobro_id)
    )
    cobro = result.scalar_one_or_none()
    if not cobro:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")
    ensure_clinic_access(current_user, cobro.factura.clinica_id if cobro.factura else None)
    paciente = cobro.factura.paciente if cobro.factura else None
    paciente_nombre = " ".join(
        part for part in [getattr(paciente, "nombre", ""), getattr(paciente, "apellidos", "")] if part
    ).strip()
    factura_codigo = f"{cobro.factura.serie}-{cobro.factura.numero:04d}" if cobro.factura else "-"
    pdf_bytes = generar_recibo_pdf(
        numero_recibo=str(cobro.id),
        fecha=cobro.fecha,
        paciente_nombre=paciente_nombre,
        factura_codigo=factura_codigo,
        importe=cobro.importe,
        forma_pago=cobro.forma_pago.nombre if cobro.forma_pago else "",
        usuario=cobro.usuario.username if cobro.usuario else None,
        notas=cobro.notas,
        anulado=cobro.anulado_at is not None,
    )
    return _pdf_response(pdf_bytes, f"recibo_{cobro.id}.pdf")
