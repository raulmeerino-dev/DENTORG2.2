"""
Router de generación de PDFs — facturas y presupuestos.
Devuelve application/pdf para descarga directa o visualización en navegador.
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import CurrentUser
from app.database import get_db
from app.models.factura import DocumentoFiscal
from app.models.presupuesto import Presupuesto
from app.services.fiscal_document_service import (
    build_factura_pdf_bytes,
    cargar_factura_para_pdf,
    read_archived_pdf,
)
from app.services.pdf_service import generar_presupuesto_pdf

router = APIRouter()


def _pdf_response(data: bytes, filename: str) -> Response:
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# ─── Factura PDF ──────────────────────────────────────────────────────────────

@router.get("/facturas/{factura_id}")
async def pdf_factura(
    factura_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> Response:
    """Genera y devuelve el PDF de una factura."""
    factura = await cargar_factura_para_pdf(db, factura_id)
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    archived = next((d for d in factura.documentos_fiscales if d.tipo == "factura_pdf"), None)
    pdf_bytes = read_archived_pdf(archived) if archived else None
    if pdf_bytes is None:
        pdf_bytes = build_factura_pdf_bytes(factura)

    filename = f"factura_{factura.serie}{factura.numero:04d}_{factura.fecha.strftime('%Y%m%d')}.pdf"
    return _pdf_response(pdf_bytes, filename)


@router.get("/facturas/{factura_id}/archivo")
async def pdf_factura_archivado_info(
    factura_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> dict:
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


# ─── Presupuesto PDF ──────────────────────────────────────────────────────────

@router.get("/presupuestos/{presupuesto_id}")
async def pdf_presupuesto(
    presupuesto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> Response:
    """Genera y devuelve el PDF de un presupuesto."""
    from app.models.presupuesto import PresupuestoLinea

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

    pac = pres.paciente
    lineas_data = []
    for l in pres.lineas:
        importe_neto = float(l.precio_unitario) * (1 - float(l.descuento_porcentaje or 0) / 100)
        lineas_data.append({
            "tratamiento_nombre": l.tratamiento.nombre if l.tratamiento else "—",
            "pieza_dental": l.pieza_dental,
            "caras": l.caras,
            "precio_unitario": l.precio_unitario,
            "descuento_porcentaje": l.descuento_porcentaje,
            "importe_neto": importe_neto,
            "aceptado": l.aceptado,
        })

    total = sum(l["importe_neto"] for l in lineas_data)
    total_aceptado = sum(l["importe_neto"] for l in lineas_data if l["aceptado"])

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
