"""Archivo inmutable de PDFs fiscales emitidos."""
from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.models.factura import Cobro, DocumentoFiscal, Factura
from app.services.pdf_service import generar_factura_pdf
from app.services.verifactu_service import (
    _get_nif_emisor,
    generar_identificador_fiscal,
    generar_url_qr_verificacion,
    obtener_estado_remision,
    obtener_leyenda_factura,
)


FACTURA_TEMPLATE_VERSION = "factura-reportlab-v2"


async def cargar_factura_para_pdf(db: AsyncSession, factura_id: UUID) -> Factura | None:
    result = await db.execute(
        select(Factura)
        .options(
            selectinload(Factura.paciente),
            selectinload(Factura.entidad),
            selectinload(Factura.forma_pago),
            selectinload(Factura.lineas),
            selectinload(Factura.cobros).selectinload(Cobro.forma_pago),
            selectinload(Factura.documentos_fiscales),
        )
        .where(Factura.id == factura_id)
    )
    return result.scalar_one_or_none()


def build_factura_pdf_bytes(factura: Factura) -> bytes:
    pac = factura.paciente
    url_qr = None
    if factura.huella:
        url_qr = generar_url_qr_verificacion(
            nif_emisor=_get_nif_emisor(),
            serie=factura.serie,
            numero=factura.numero,
            fecha=factura.fecha,
            total=factura.total,
        )

    cobros_data = [
        {
            "fecha": c.fecha,
            "importe": c.importe,
            "forma_pago": c.forma_pago.nombre if c.forma_pago else "",
        }
        for c in factura.cobros
        if c.anulado_at is None
    ]
    lineas_data = [
        {
            "concepto": l.concepto,
            "concepto_ficticio": l.concepto_ficticio,
            "cantidad": l.cantidad,
            "precio_unitario": l.precio_unitario,
            "iva_porcentaje": l.iva_porcentaje,
            "subtotal": l.subtotal,
        }
        for l in factura.lineas
    ]

    return generar_factura_pdf(
        serie=factura.serie,
        numero=factura.numero,
        fecha=factura.fecha,
        subtotal=factura.subtotal,
        iva_total=factura.iva_total,
        total=factura.total,
        estado=factura.estado,
        observaciones=factura.observaciones,
        paciente_nombre=pac.nombre if pac else "",
        paciente_apellidos=pac.apellidos if pac else "",
        paciente_num_historial=pac.num_historial if pac else 0,
        paciente_dni=None,
        paciente_direccion=pac.direccion if pac else None,
        lineas=lineas_data,
        cobros=cobros_data,
        huella=factura.huella,
        url_qr=url_qr,
        identificador_fiscal=generar_identificador_fiscal(factura),
        leyenda_fiscal=obtener_leyenda_factura(factura),
        estado_remision=obtener_estado_remision(factura),
    )


def _path_for_factura(factura: Factura) -> Path:
    return Path("uploads") / "fiscales" / "facturas" / str(factura.paciente_id) / (
        f"{factura.serie}-{factura.numero:04d}-{factura.id}.pdf"
    )


async def archivar_pdf_factura(
    db: AsyncSession,
    *,
    factura: Factura,
    created_by_id,
) -> DocumentoFiscal:
    existing = await db.scalar(
        select(DocumentoFiscal)
        .where(DocumentoFiscal.factura_id == factura.id, DocumentoFiscal.tipo == "factura_pdf")
        .order_by(DocumentoFiscal.created_at.desc())
        .limit(1)
    )
    if existing:
        return existing

    pdf_bytes = build_factura_pdf_bytes(factura)
    ruta = _path_for_factura(factura)
    settings = get_settings()
    base_path = Path(getattr(settings, "storage_root", "."))
    full_path = base_path / ruta
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(pdf_bytes)

    documento = DocumentoFiscal(
        factura_id=factura.id,
        paciente_id=factura.paciente_id,
        tipo="factura_pdf",
        ruta=str(ruta).replace("\\", "/"),
        hash_pdf=hashlib.sha256(pdf_bytes).hexdigest(),
        plantilla_version=FACTURA_TEMPLATE_VERSION,
        created_by_id=created_by_id,
    )
    db.add(documento)
    await db.flush()
    return documento


def read_archived_pdf(documento: DocumentoFiscal) -> bytes | None:
    settings = get_settings()
    base_path = Path(getattr(settings, "storage_root", "."))
    path = base_path / documento.ruta
    if not path.exists():
        return None
    return path.read_bytes()
