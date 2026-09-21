"""Servicios de generacion PDF para documentos clinicos y economicos.

Se mantiene ReportLab porque ya forma parte del proyecto y permite generar PDFs
estables sin meter un renderizador pesado. El objetivo de este modulo es que
facturas, presupuestos, recetas y documentos clinicos compartan saneado de texto,
tablas con salto de pagina y cabeceras/pies consistentes.
"""
from __future__ import annotations

import base64
import binascii
import io
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from html import escape
from pathlib import Path
from typing import Any
from urllib.parse import quote

from PIL import Image as PILImage
from PIL import ImageChops, UnidentifiedImageError
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.platypus import (
    HRFlowable,
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

AZUL = colors.HexColor("#0f6f93")
AZUL_OSCURO = colors.HexColor("#0f3146")
AZUL_CLARO = colors.HexColor("#e7f4f8")
GRIS = colors.HexColor("#60717f")
GRIS_CLARO = colors.HexColor("#f5f8fa")
BORDE = colors.HexColor("#d8e3ea")
NEGRO = colors.HexColor("#102f43")
VERDE = colors.HexColor("#16835f")
ROJO = colors.HexColor("#b4232e")

PAGE_WIDTH = A4[0] - 30 * mm
PDF_TEMPLATE_VERSION = "reportlab-clinica-v3"
MAX_SIGNATURE_BYTES = 1_500_000


class InvalidSignatureError(ValueError):
    """Raised when a provided signature data URL is not a usable image."""


def _clean(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).replace("\x00", "").strip()
    return text or fallback


def _safe(value: Any, fallback: str = "") -> str:
    return escape(_clean(value, fallback), quote=False)


def _decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value or "0"))
    except (InvalidOperation, ValueError):
        return Decimal("0")


def _money(value: Any) -> str:
    return f"{_decimal(value):.2f} EUR"


def _format_date(value: Any) -> str:
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    return _clean(value, "-")


def _datos_clinica() -> dict[str, str]:
    try:
        from app.config import get_settings

        settings = get_settings()
        return {
            "nombre": _clean(getattr(settings, "clinica_nombre", None), "Clinica Dental"),
            "direccion": _clean(getattr(settings, "clinica_direccion", None)),
            "ciudad": _clean(getattr(settings, "clinica_ciudad", None)),
            "telefono": _clean(getattr(settings, "clinica_telefono", None)),
            "email": _clean(getattr(settings, "clinica_email", None)),
            "nif": _clean(getattr(settings, "nif_emisor", None)),
        }
    except Exception:
        return {
            "nombre": "Clinica Dental",
            "direccion": "",
            "ciudad": "",
            "telefono": "",
            "email": "",
            "nif": "",
        }


def _estilos() -> dict[str, ParagraphStyle]:
    sample = getSampleStyleSheet()
    return {
        "clinica": ParagraphStyle(
            "clinica",
            parent=sample["Normal"],
            fontSize=14,
            leading=16,
            fontName="Helvetica-Bold",
            textColor=AZUL_OSCURO,
            spaceAfter=2,
        ),
        "clinica_sub": ParagraphStyle(
            "clinica_sub",
            parent=sample["Normal"],
            fontSize=8,
            leading=10,
            fontName="Helvetica",
            textColor=GRIS,
        ),
        "titulo_doc": ParagraphStyle(
            "titulo_doc",
            parent=sample["Normal"],
            fontSize=17,
            leading=20,
            fontName="Helvetica-Bold",
            textColor=AZUL,
            alignment=TA_RIGHT,
        ),
        "num_doc": ParagraphStyle(
            "num_doc",
            parent=sample["Normal"],
            fontSize=9,
            leading=11,
            fontName="Helvetica",
            textColor=GRIS,
            alignment=TA_RIGHT,
        ),
        "seccion": ParagraphStyle(
            "seccion",
            parent=sample["Normal"],
            fontSize=8,
            leading=10,
            fontName="Helvetica-Bold",
            textColor=AZUL,
            spaceAfter=3,
            spaceBefore=5,
        ),
        "dato": ParagraphStyle(
            "dato",
            parent=sample["Normal"],
            fontSize=8,
            leading=10,
            fontName="Helvetica",
            textColor=NEGRO,
            wordWrap="CJK",
        ),
        "dato_bold": ParagraphStyle(
            "dato_bold",
            parent=sample["Normal"],
            fontSize=8,
            leading=10,
            fontName="Helvetica-Bold",
            textColor=NEGRO,
            wordWrap="CJK",
        ),
        "td": ParagraphStyle(
            "td",
            parent=sample["Normal"],
            fontSize=7.5,
            leading=9,
            fontName="Helvetica",
            textColor=NEGRO,
            wordWrap="CJK",
        ),
        "td_center": ParagraphStyle(
            "td_center",
            parent=sample["Normal"],
            fontSize=7.5,
            leading=9,
            fontName="Helvetica",
            textColor=NEGRO,
            alignment=TA_CENTER,
            wordWrap="CJK",
        ),
        "td_right": ParagraphStyle(
            "td_right",
            parent=sample["Normal"],
            fontSize=7.5,
            leading=9,
            fontName="Helvetica",
            textColor=NEGRO,
            alignment=TA_RIGHT,
            wordWrap="CJK",
        ),
        "th": ParagraphStyle(
            "th",
            parent=sample["Normal"],
            fontSize=7.5,
            leading=9,
            fontName="Helvetica-Bold",
            textColor=colors.white,
            alignment=TA_CENTER,
        ),
        "pie": ParagraphStyle(
            "pie",
            parent=sample["Normal"],
            fontSize=7,
            leading=9,
            fontName="Helvetica",
            textColor=GRIS,
            alignment=TA_CENTER,
            wordWrap="CJK",
        ),
        "qr_label": ParagraphStyle(
            "qr_label",
            parent=sample["Normal"],
            fontSize=6,
            leading=7,
            fontName="Helvetica",
            textColor=GRIS,
            alignment=TA_CENTER,
            wordWrap="CJK",
        ),
    }


def _p(value: Any, style: ParagraphStyle, *, bold: bool = False) -> Paragraph:
    text = _safe(value)
    if bold:
        text = f"<b>{text}</b>"
    return Paragraph(text or "&nbsp;", style)


def _paragraphs_from_text(text: str | None, style: ParagraphStyle) -> list[Paragraph | Spacer]:
    flowables: list[Paragraph | Spacer] = []
    for block in _clean(text).replace("\r\n", "\n").split("\n\n"):
        lines = [_safe(line.strip()) for line in block.split("\n") if line.strip()]
        if not lines:
            continue
        flowables.append(Paragraph("<br/>".join(lines), style))
        flowables.append(Spacer(1, 3 * mm))
    return flowables


def _generar_qr_image(url: str) -> object | None:
    try:
        import qrcode

        qr = qrcode.make(url)
        buf = io.BytesIO()
        qr.save(buf, format="PNG")
        buf.seek(0)
        return Image(buf, width=24 * mm, height=24 * mm)
    except Exception:
        return None


def validate_signature_data_url(data_url: str | None, *, require_visible: bool = False) -> bytes | None:
    if not data_url:
        return None
    prefix = "data:image/png;base64,"
    if not data_url.startswith(prefix):
        raise InvalidSignatureError("La firma debe ser una imagen PNG en data URL")
    try:
        raw = base64.b64decode(data_url[len(prefix):], validate=True)
    except (ValueError, binascii.Error):
        raise InvalidSignatureError("Firma digital no valida") from None
    if not raw or len(raw) > MAX_SIGNATURE_BYTES:
        raise InvalidSignatureError("Firma digital vacia o demasiado grande")

    try:
        image = PILImage.open(io.BytesIO(raw))
        image.verify()
        image = PILImage.open(io.BytesIO(raw)).convert("RGBA")
    except (OSError, SyntaxError, UnidentifiedImageError, ValueError):
        raise InvalidSignatureError("Firma digital corrupta o no legible") from None

    if image.width < 2 or image.height < 2:
        raise InvalidSignatureError("Firma digital vacia")
    if image.width > 2000 or image.height > 1000:
        raise InvalidSignatureError("Firma digital demasiado grande")

    if require_visible:
        alpha = image.getchannel("A")
        visible_bbox = alpha.getbbox()
        if visible_bbox is None:
            raise InvalidSignatureError("La firma esta vacia")

        visible = image.crop(visible_bbox)
        opaque_mask = alpha.crop(visible_bbox).point(lambda value: 255 if value > 20 else 0)
        white = PILImage.new("RGBA", visible.size, (255, 255, 255, 255))
        ink_diff = ImageChops.difference(visible, white).convert("L")
        ink_mask = ImageChops.multiply(ink_diff.point(lambda value: 255 if value > 10 else 0), opaque_mask)
        ink_bbox = ink_mask.getbbox()
        ink_pixels = ink_mask.point(lambda value: 1 if value else 0).convert("L")
        if ink_bbox is None or sum(ink_pixels.histogram()[1:]) < 10:
            raise InvalidSignatureError("La firma esta vacia")

        bbox_width = ink_bbox[2] - ink_bbox[0]
        bbox_height = ink_bbox[3] - ink_bbox[1]
        if bbox_width < 8 and bbox_height < 8:
            raise InvalidSignatureError("La firma esta vacia")

    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def signature_png_data_url(signature_png: bytes | None) -> str | None:
    if not signature_png:
        return None
    return "data:image/png;base64," + base64.b64encode(signature_png).decode("ascii")


def _firma_png_bytes(data_url: str | None) -> bytes | None:
    return validate_signature_data_url(data_url, require_visible=False)


def _draw_footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(GRIS)
    canvas.drawRightString(A4[0] - 15 * mm, 10 * mm, f"Pagina {doc.page}")
    canvas.restoreState()


def _build_pdf(story: list[Any], *, title: str) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=14 * mm,
        bottomMargin=17 * mm,
        title=title,
    )
    doc.build(story, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    pdf_bytes = buffer.getvalue()
    validate_pdf_bytes(pdf_bytes)
    return pdf_bytes


def validate_pdf_bytes(data: bytes) -> None:
    if not data.startswith(b"%PDF-"):
        raise ValueError("La salida generada no es un PDF valido")
    if len(data) < 600:
        raise ValueError("El PDF generado esta incompleto")


def safe_pdf_filename(filename: str | None, fallback: str = "documento.pdf") -> str:
    raw = _clean(filename, fallback)
    cleaned = raw.replace("\\", "_").replace("/", "_").replace('"', "")
    cleaned = re.sub(r"[\x00-\x1f\x7f]+", "_", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    if not cleaned:
        cleaned = fallback
    if not cleaned.lower().endswith(".pdf"):
        cleaned = f"{cleaned}.pdf"
    if len(cleaned) > 180:
        cleaned = f"{cleaned[:176].rstrip(' .')}.pdf"
    return cleaned


def pdf_response_headers(filename: str, *, inline: bool = True) -> dict[str, str]:
    disposition = "inline" if inline else "attachment"
    safe_filename = safe_pdf_filename(filename)
    ascii_filename = "".join(char if 32 <= ord(char) < 127 else "_" for char in safe_filename)
    ascii_filename = ascii_filename.replace("\\", "_").replace("/", "_").replace('"', "") or "documento.pdf"
    encoded_filename = quote(safe_filename)
    return {
        "Content-Disposition": f'{disposition}; filename="{ascii_filename}"; filename*=UTF-8\'\'{encoded_filename}',
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
    }


def _header_doc(tipo: str, numero: str, fecha_doc: date, estado: str | None = None) -> list[Any]:
    estilos = _estilos()
    clinica = _datos_clinica()
    ciudad_tel = "  -  ".join(
        part for part in [clinica["ciudad"], f"Tel. {clinica['telefono']}" if clinica["telefono"] else ""] if part
    )
    left = [
        _p(clinica["nombre"], estilos["clinica"]),
        _p(clinica["direccion"], estilos["clinica_sub"]),
        _p(ciudad_tel, estilos["clinica_sub"]),
        _p(f"NIF: {clinica['nif']}", estilos["clinica_sub"]) if clinica["nif"] else _p("", estilos["clinica_sub"]),
    ]
    right = [
        _p(tipo.upper(), estilos["titulo_doc"]),
        _p(numero, estilos["num_doc"]),
        _p(f"Fecha: {_format_date(fecha_doc)}", estilos["num_doc"]),
    ]
    if estado:
        right.append(_p(f"Estado: {_clean(estado).upper()}", estilos["num_doc"]))

    table = Table([[left, right]], colWidths=[PAGE_WIDTH * 0.58, PAGE_WIDTH * 0.42])
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return [table, HRFlowable(width="100%", thickness=1.2, color=AZUL, spaceAfter=5)]


def _table_style(*, header_rows: int = 1) -> TableStyle:
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, header_rows - 1), AZUL),
            ("TEXTCOLOR", (0, 0), (-1, header_rows - 1), colors.white),
            ("FONTNAME", (0, 0), (-1, header_rows - 1), "Helvetica-Bold"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, header_rows), (-1, -1), [colors.white, GRIS_CLARO]),
            ("GRID", (0, 0), (-1, -1), 0.25, BORDE),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]
    )


def generar_factura_pdf(
    *,
    serie: str,
    numero: int,
    fecha: date,
    subtotal: Decimal,
    iva_total: Decimal,
    total: Decimal,
    estado: str,
    observaciones: str | None,
    paciente_nombre: str,
    paciente_apellidos: str,
    paciente_num_historial: int,
    paciente_dni: str | None,
    paciente_direccion: str | None,
    lineas: list[dict[str, Any]],
    cobros: list[dict[str, Any]],
    huella: str | None = None,
    url_qr: str | None = None,
    identificador_fiscal: str | None = None,
    leyenda_fiscal: str | None = None,
    estado_remision: str | None = None,
    pie_pagina: str | None = None,
) -> bytes:
    estilos = _estilos()
    story: list[Any] = []

    if url_qr:
        qr_block: list[Any] = []
        qr_img = _generar_qr_image(url_qr)
        if qr_img:
            qr_block.append(qr_img)
        qr_block.extend(
            [
                _p("Codigo QR de verificacion fiscal", estilos["qr_label"]),
                _p(url_qr, estilos["qr_label"]),
            ]
        )
        if identificador_fiscal:
            qr_block.append(_p(f"ID SIF: {identificador_fiscal}", estilos["qr_label"]))
        if huella:
            qr_block.append(_p(f"Huella: {huella[:40]}...", estilos["qr_label"]))
        qr_table = Table([[qr_block]], colWidths=[PAGE_WIDTH])
        qr_table.setStyle(
            TableStyle(
                [
                    ("BOX", (0, 0), (0, 0), 0.5, BORDE),
                    ("BACKGROUND", (0, 0), (0, 0), GRIS_CLARO),
                    ("ALIGN", (0, 0), (0, 0), "CENTER"),
                    ("TOPPADDING", (0, 0), (0, 0), 5),
                    ("BOTTOMPADDING", (0, 0), (0, 0), 5),
                ]
            )
        )
        story.extend([qr_table, Spacer(1, 3 * mm)])

    story.extend(_header_doc("Factura", f"{_clean(serie)}-{numero:04d}", fecha, estado))

    story.append(_p("CLIENTE", estilos["seccion"]))
    paciente_lines = [
        _p(f"{_clean(paciente_apellidos)}, {_clean(paciente_nombre)}", estilos["dato"], bold=True),
        _p(f"N. Historial: {paciente_num_historial}", estilos["dato"]),
    ]
    if paciente_dni:
        paciente_lines.append(_p(f"DNI/NIE: {paciente_dni}", estilos["dato"]))
    if paciente_direccion:
        paciente_lines.append(_p(paciente_direccion, estilos["dato"]))
    pac_table = Table([[paciente_lines]], colWidths=[PAGE_WIDTH])
    pac_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), GRIS_CLARO),
                ("BOX", (0, 0), (0, 0), 0.5, BORDE),
                ("LEFTPADDING", (0, 0), (0, 0), 6),
                ("TOPPADDING", (0, 0), (0, 0), 4),
                ("BOTTOMPADDING", (0, 0), (0, 0), 4),
            ]
        )
    )
    story.extend([pac_table, Spacer(1, 4 * mm)])

    story.append(_p("CONCEPTOS", estilos["seccion"]))
    rows: list[list[Any]] = [
        [
            _p("Concepto", estilos["th"]),
            _p("Cant.", estilos["th"]),
            _p("P. Unit.", estilos["th"]),
            _p("IVA", estilos["th"]),
            _p("Importe", estilos["th"]),
        ]
    ]
    for line in lineas:
        concept = line.get("concepto_ficticio") or line.get("concepto") or ""
        rows.append(
            [
                _p(concept, estilos["td"]),
                _p(_clean(line.get("cantidad"), "1"), estilos["td_center"]),
                _p(_money(line.get("precio_unitario")), estilos["td_right"]),
                _p(f"{_decimal(line.get('iva_porcentaje')):.0f}%", estilos["td_center"]),
                _p(_money(line.get("subtotal")), estilos["td_right"]),
            ]
        )
    if len(rows) == 1:
        rows.append([_p("Sin lineas de factura", estilos["td"]), "", "", "", ""])

    table = Table(
        rows,
        colWidths=[PAGE_WIDTH * 0.50, PAGE_WIDTH * 0.08, PAGE_WIDTH * 0.15, PAGE_WIDTH * 0.09, PAGE_WIDTH * 0.18],
        repeatRows=1,
    )
    table.setStyle(_table_style())
    story.extend([table, Spacer(1, 4 * mm)])

    totals_rows = [
        [_p("Subtotal:", estilos["dato"]), _p(_money(subtotal), estilos["dato_bold"])],
        [_p("IVA:", estilos["dato"]), _p(_money(iva_total), estilos["dato_bold"])],
        [_p("TOTAL:", estilos["dato_bold"]), _p(_money(total), estilos["dato_bold"])],
    ]
    totals_table = Table(totals_rows, colWidths=[38 * mm, 34 * mm], hAlign="RIGHT")
    totals_table.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("LINEABOVE", (0, 2), (-1, 2), 1, AZUL),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    story.append(totals_table)

    if cobros:
        story.append(_p("COBROS REGISTRADOS", estilos["seccion"]))
        cobro_rows = [[_p("Fecha", estilos["th"]), _p("Forma", estilos["th"]), _p("Importe", estilos["th"])]]
        for cobro in cobros:
            cobro_rows.append(
                [
                    _p(_format_date(cobro.get("fecha")), estilos["td"]),
                    _p(cobro.get("forma_pago"), estilos["td"]),
                    _p(_money(cobro.get("importe")), estilos["td_right"]),
                ]
            )
        cobro_table = Table(cobro_rows, colWidths=[PAGE_WIDTH * 0.22, PAGE_WIDTH * 0.48, PAGE_WIDTH * 0.30], repeatRows=1)
        cobro_table.setStyle(_table_style())
        story.append(cobro_table)

    if identificador_fiscal or leyenda_fiscal or estado_remision:
        story.append(_p("TRAZABILIDAD FISCAL", estilos["seccion"]))
        if identificador_fiscal:
            story.append(_p(f"Identificador SIF: {identificador_fiscal}", estilos["dato"]))
        if estado_remision:
            story.append(_p(f"Estado de remision: {estado_remision}", estilos["dato"]))
        if leyenda_fiscal:
            story.extend(_paragraphs_from_text(leyenda_fiscal, estilos["dato"]))

    if observaciones:
        story.append(_p("OBSERVACIONES", estilos["seccion"]))
        story.extend(_paragraphs_from_text(observaciones, estilos["dato"]))

    story.extend(
        [
            Spacer(1, 4 * mm),
            HRFlowable(width="100%", thickness=0.5, color=BORDE),
            _p(pie_pagina or "Gracias por confiar en nosotros.", estilos["pie"]),
        ]
    )
    return _build_pdf(story, title=f"Factura {serie}-{numero:04d}")


def generar_presupuesto_pdf(
    *,
    numero: int,
    fecha: date,
    estado: str,
    paciente_nombre: str,
    paciente_apellidos: str,
    paciente_num_historial: int,
    doctor_nombre: str | None,
    lineas: list[dict[str, Any]],
    total: Decimal,
    total_aceptado: Decimal,
    pie_pagina: str | None = None,
) -> bytes:
    estilos = _estilos()
    story: list[Any] = []
    story.extend(_header_doc("Presupuesto", f"N. {int(numero):04d}", fecha, estado))
    story.append(_p("PACIENTE", estilos["seccion"]))
    story.append(_p(f"{_clean(paciente_apellidos)}, {_clean(paciente_nombre)} - Hx {paciente_num_historial}", estilos["dato_bold"]))
    if doctor_nombre:
        story.append(_p(f"Doctor/a: {doctor_nombre}", estilos["dato"]))
    story.append(Spacer(1, 4 * mm))

    story.append(_p("TRATAMIENTOS PRESUPUESTADOS", estilos["seccion"]))
    rows: list[list[Any]] = [
        [
            _p("Tratamiento", estilos["th"]),
            _p("Pieza", estilos["th"]),
            _p("Caras", estilos["th"]),
            _p("Precio", estilos["th"]),
            _p("Dto.", estilos["th"]),
            _p("Importe", estilos["th"]),
            _p("Acept.", estilos["th"]),
        ]
    ]
    for line in lineas:
        rows.append(
            [
                _p(line.get("tratamiento_nombre"), estilos["td"]),
                _p(line.get("pieza_dental") or "-", estilos["td_center"]),
                _p(line.get("caras") or "-", estilos["td_center"]),
                _p(_money(line.get("precio_unitario")), estilos["td_right"]),
                _p(f"{_decimal(line.get('descuento_porcentaje')):.0f}%" if line.get("descuento_porcentaje") else "-", estilos["td_center"]),
                _p(_money(line.get("importe_neto")), estilos["td_right"]),
                _p("Si" if line.get("aceptado") else "No", estilos["td_center"]),
            ]
        )
    if len(rows) == 1:
        rows.append([_p("Sin tratamientos presupuestados", estilos["td"]), "", "", "", "", "", ""])

    table = Table(
        rows,
        colWidths=[
            PAGE_WIDTH * 0.38,
            PAGE_WIDTH * 0.08,
            PAGE_WIDTH * 0.08,
            PAGE_WIDTH * 0.13,
            PAGE_WIDTH * 0.08,
            PAGE_WIDTH * 0.15,
            PAGE_WIDTH * 0.10,
        ],
        repeatRows=1,
    )
    table.setStyle(_table_style())
    accepted_styles = [
        ("TEXTCOLOR", (6, index + 1), (6, index + 1), VERDE if line.get("aceptado") else ROJO)
        for index, line in enumerate(lineas)
    ]
    if accepted_styles:
        table.setStyle(TableStyle(accepted_styles))
    story.extend([table, Spacer(1, 4 * mm)])

    totals_table = Table(
        [
            [_p("Total presupuesto:", estilos["dato"]), _p(_money(total), estilos["dato_bold"])],
            [_p("Total aceptado:", estilos["dato_bold"]), _p(_money(total_aceptado), estilos["dato_bold"])],
        ],
        colWidths=[46 * mm, 34 * mm],
        hAlign="RIGHT",
    )
    totals_table.setStyle(TableStyle([("LINEABOVE", (0, 1), (-1, 1), 1, AZUL), ("ALIGN", (1, 0), (1, -1), "RIGHT")]))
    story.append(totals_table)
    story.extend(
        [
            Spacer(1, 5 * mm),
            _p(
                "Este presupuesto tiene una validez orientativa de 30 dias desde la fecha de emision, salvo indicacion expresa de la clinica.",
                estilos["pie"],
            ),
            Spacer(1, 3 * mm),
            HRFlowable(width="100%", thickness=0.5, color=BORDE),
            _p(pie_pagina or _datos_clinica()["nombre"], estilos["pie"]),
        ]
    )
    return _build_pdf(story, title=f"Presupuesto {numero:04d}")


def generar_documento_clinico_pdf(
    *,
    titulo: str,
    contenido: str,
    paciente_nombre: str | None = None,
    fecha_documento: date | None = None,
    firma_data_url: str | None = None,
) -> bytes:
    estilos = _estilos()
    fecha_doc = fecha_documento or date.today()
    story: list[Any] = []
    story.extend(_header_doc(titulo or "Documento clinico", "Documento clinico", fecha_doc))
    if paciente_nombre:
        story.append(_p(f"Paciente: {paciente_nombre}", estilos["dato_bold"]))
        story.append(Spacer(1, 3 * mm))
    story.extend(_paragraphs_from_text(contenido, estilos["dato"]))

    firma = _firma_png_bytes(firma_data_url)
    if firma:
        story.extend([Spacer(1, 7 * mm), _p("Firma del paciente", estilos["seccion"])])
        image = Image(io.BytesIO(firma), width=70 * mm, height=28 * mm)
        image.hAlign = "LEFT"
        story.append(image)
        story.append(_p("Documento firmado digitalmente en la ficha del paciente.", estilos["pie"]))
    return _build_pdf(story, title=_clean(titulo, "Documento clinico"))


def generar_receta_clinica_pdf(
    *,
    paciente_nombre: str,
    paciente_dni: str | None,
    paciente_fecha_nacimiento: date | None,
    doctor_nombre: str,
    fecha_prescripcion: date,
    fecha_dispensacion: date | None,
    medicamento: str,
    principio_activo: str | None,
    forma_farmaceutica: str | None,
    via_administracion: str | None,
    unidades: str | None,
    duracion: str | None,
    posologia: str,
    pauta: str | None,
    diagnostico: str | None,
    instrucciones_paciente: str | None,
    instrucciones_farmacia: str | None,
    firma_data_url: str | None,
    receta_id: str,
) -> bytes:
    """PDF de receta clínica autónoma (RecetaClinica)."""
    estilos = _estilos()
    story: list[Any] = []
    story.extend(_header_doc("Receta clinica", f"RC-{receta_id[:8]}", fecha_prescripcion))
    story.append(
        _p(
            "Formato interno DentCore. Validar integracion oficial antes de uso sanitario real.",
            estilos["pie"],
        )
    )
    story.append(Spacer(1, 4 * mm))

    paciente_detalle = paciente_nombre
    if paciente_dni:
        paciente_detalle += f"  ·  NIF {paciente_dni}"
    if paciente_fecha_nacimiento:
        paciente_detalle += f"  ·  Nac. {_format_date(paciente_fecha_nacimiento)}"
    story.append(_p(f"Paciente: {paciente_detalle}", estilos["dato_bold"]))
    story.append(_p(f"Doctor prescriptor: {doctor_nombre}", estilos["dato"]))
    if fecha_dispensacion:
        story.append(_p(f"Fecha dispensacion: {_format_date(fecha_dispensacion)}", estilos["dato"]))
    story.append(Spacer(1, 4 * mm))

    story.append(_p("Medicamento", estilos["seccion"]))
    story.append(_p(medicamento, estilos["dato_bold"]))
    detalles: list[str] = []
    if principio_activo:
        detalles.append(f"Principio activo: {principio_activo}")
    if forma_farmaceutica:
        detalles.append(f"Forma farmaceutica: {forma_farmaceutica}")
    if via_administracion:
        detalles.append(f"Via: {via_administracion}")
    if unidades:
        detalles.append(f"Unidades: {unidades}")
    if duracion:
        detalles.append(f"Duracion: {duracion}")
    for linea in detalles:
        story.append(_p(linea, estilos["dato"]))
    story.append(Spacer(1, 3 * mm))

    story.append(_p("Posologia", estilos["seccion"]))
    story.extend(_paragraphs_from_text(posologia, estilos["dato"]))
    if pauta:
        story.append(_p(f"Pauta: {pauta}", estilos["dato"]))

    if diagnostico:
        story.append(Spacer(1, 3 * mm))
        story.append(_p("Diagnostico", estilos["seccion"]))
        story.extend(_paragraphs_from_text(diagnostico, estilos["dato"]))

    if instrucciones_paciente:
        story.append(Spacer(1, 3 * mm))
        story.append(_p("Instrucciones al paciente", estilos["seccion"]))
        story.extend(_paragraphs_from_text(instrucciones_paciente, estilos["dato"]))

    if instrucciones_farmacia:
        story.append(Spacer(1, 3 * mm))
        story.append(_p("Instrucciones a farmacia", estilos["seccion"]))
        story.extend(_paragraphs_from_text(instrucciones_farmacia, estilos["dato"]))

    firma = _firma_png_bytes(firma_data_url)
    if firma:
        story.extend([Spacer(1, 8 * mm), _p("Firma del doctor", estilos["seccion"])])
        image = Image(io.BytesIO(firma), width=70 * mm, height=28 * mm)
        image.hAlign = "LEFT"
        story.append(image)

    return _build_pdf(story, title=f"Receta clinica {receta_id[:8]}")


DEFAULT_RECETA_TEMPLATE_FIELDS = {
    "paciente": {"x": 22 * mm, "y": 245 * mm, "font_size": 9, "max_chars": 58},
    "paciente_dni": {"x": 22 * mm, "y": 237 * mm, "font_size": 8, "max_chars": 34},
    "paciente_fecha_nacimiento": {"x": 92 * mm, "y": 237 * mm, "font_size": 8, "max_chars": 24},
    "medicamento": {"x": 22 * mm, "y": 214 * mm, "font_size": 10, "max_chars": 68},
    "principio_activo": {"x": 22 * mm, "y": 203 * mm, "font_size": 8, "max_chars": 70},
    "forma_farmaceutica": {"x": 22 * mm, "y": 194 * mm, "font_size": 8, "max_chars": 32},
    "via_administracion": {"x": 90 * mm, "y": 194 * mm, "font_size": 8, "max_chars": 32},
    "unidades": {"x": 150 * mm, "y": 194 * mm, "font_size": 8, "max_chars": 22},
    "posologia": {"x": 22 * mm, "y": 176 * mm, "font_size": 8, "max_chars": 82, "line_height": 10},
    "duracion": {"x": 22 * mm, "y": 144 * mm, "font_size": 8, "max_chars": 40},
    "diagnostico": {"x": 22 * mm, "y": 132 * mm, "font_size": 7, "max_chars": 95},
    "fecha_prescripcion": {"x": 22 * mm, "y": 108 * mm, "font_size": 8, "max_chars": 30},
    "doctor": {"x": 22 * mm, "y": 88 * mm, "font_size": 8, "max_chars": 55},
    "num_colegiado": {"x": 22 * mm, "y": 80 * mm, "font_size": 8, "max_chars": 35},
    "colegio": {"x": 82 * mm, "y": 80 * mm, "font_size": 8, "max_chars": 55},
    "especialidad": {"x": 22 * mm, "y": 72 * mm, "font_size": 7, "max_chars": 55},
    "codigo_verificacion": {"x": 22 * mm, "y": 54 * mm, "font_size": 7, "max_chars": 70},
}


def _draw_wrapped_canvas_text(c, text: str, *, x: float, y: float, font_size: int, max_chars: int, line_height: int | None = None) -> None:
    cleaned = _clean(text, "-")
    words = cleaned.replace("\r\n", "\n").split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > max_chars and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    if not lines:
        lines = ["-"]
    c.setFont("Helvetica", font_size)
    for index, line in enumerate(lines[:4]):
        c.drawString(x, y - index * (line_height or font_size + 2), line)


def _merge_receta_overlay_with_pdf_template(template_path: Path, overlay_bytes: bytes) -> bytes:
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        return overlay_bytes

    try:
        template_reader = PdfReader(str(template_path))
        overlay_reader = PdfReader(io.BytesIO(overlay_bytes))
        if not template_reader.pages or not overlay_reader.pages:
            return overlay_bytes
        page = template_reader.pages[0]
        page.merge_page(overlay_reader.pages[0])
        writer = PdfWriter()
        writer.add_page(page)
        output = io.BytesIO()
        writer.write(output)
        merged = output.getvalue()
        validate_pdf_bytes(merged)
        return merged
    except Exception:
        return overlay_bytes


def generar_receta_local_desde_plantilla_pdf(
    *,
    plantilla_path: str | Path | None,
    plantilla_mime: str | None,
    campos_config: dict[str, Any] | None,
    data: dict[str, Any],
) -> bytes:
    """Genera una receta local sobre plantilla importada, sin certificar."""
    buffer = io.BytesIO()
    c = pdf_canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    template_path = Path(plantilla_path) if plantilla_path else None
    is_pdf_template = bool(template_path and template_path.exists() and plantilla_mime == "application/pdf")

    if template_path and template_path.exists() and (plantilla_mime or "").startswith("image/"):
        try:
            c.drawImage(ImageReader(str(template_path)), 0, 0, width=width, height=height, preserveAspectRatio=True, anchor="c")
        except Exception:
            c.setFillColor(GRIS_CLARO)
            c.rect(0, 0, width, height, fill=1, stroke=0)
    elif is_pdf_template:
        pass
    else:
        c.setFillColor(GRIS_CLARO)
        c.rect(0, 0, width, height, fill=1, stroke=0)
        c.setFillColor(GRIS)
        c.setFont("Helvetica", 8)
        template_name = template_path.name if template_path else "sin plantilla"
        c.drawString(18 * mm, 276 * mm, f"Plantilla registrada: {template_name}")

    c.setFillColor(ROJO)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(18 * mm, 286 * mm, "RECETA LOCAL NO CERTIFICADA")
    c.setFont("Helvetica", 7)
    c.drawString(18 * mm, 281 * mm, "Documento interno generado sin validacion colegial/proveedor real.")
    c.setFillColor(NEGRO)

    fields = {**DEFAULT_RECETA_TEMPLATE_FIELDS, **(campos_config or {})}
    values = {
        "paciente": data.get("paciente_nombre"),
        "paciente_dni": f"DNI/NIE: {_clean(data.get('paciente_dni'), '-')}",
        "paciente_fecha_nacimiento": f"Nac.: {_format_date(data.get('paciente_fecha_nacimiento'))}",
        "medicamento": data.get("medicamento"),
        "principio_activo": f"Principio activo: {_clean(data.get('principio_activo'), '-')}",
        "forma_farmaceutica": f"Forma: {_clean(data.get('forma_farmaceutica'), '-')}",
        "via_administracion": f"Via: {_clean(data.get('via_administracion'), '-')}",
        "unidades": f"Envases: {_clean(data.get('unidades'), '-')}",
        "posologia": data.get("posologia"),
        "duracion": f"Duracion: {_clean(data.get('duracion'), '-')}",
        "diagnostico": f"Diagnostico/instr.: {_clean(data.get('diagnostico') or data.get('instrucciones_paciente'), '-')}",
        "fecha_prescripcion": f"Fecha prescripcion: {_format_date(data.get('fecha_prescripcion'))}",
        "doctor": f"Prescriptor: {_clean(data.get('doctor_nombre'), '-')}",
        "num_colegiado": f"Col. num.: {_clean(data.get('num_colegiado'), '-')}",
        "colegio": f"{_clean(data.get('colegio'), '-')}/{_clean(data.get('provincia'), '-')}",
        "especialidad": f"Especialidad: {_clean(data.get('especialidad'), '-')}",
        "codigo_verificacion": f"Codigo interno: {_clean(data.get('verification_code'), '-')}",
    }
    for key, value in values.items():
        cfg = fields.get(key, {})
        _draw_wrapped_canvas_text(
            c,
            _clean(value, "-"),
            x=float(cfg.get("x", 20 * mm)),
            y=float(cfg.get("y", 200 * mm)),
            font_size=int(cfg.get("font_size", 8)),
            max_chars=int(cfg.get("max_chars", 80)),
            line_height=int(cfg["line_height"]) if cfg.get("line_height") else None,
        )

    c.setFillColor(GRIS)
    c.setFont("Helvetica", 6)
    c.drawRightString(width - 15 * mm, 11 * mm, f"ID interno receta: {_clean(data.get('receta_id'), '-')}")
    c.showPage()
    c.save()
    pdf_bytes = buffer.getvalue()
    if is_pdf_template and template_path:
        pdf_bytes = _merge_receta_overlay_with_pdf_template(template_path, pdf_bytes)
    validate_pdf_bytes(pdf_bytes)
    return pdf_bytes


def generar_receta_pdf(
    *,
    paciente_nombre: str,
    factura_codigo: str,
    fecha: date,
    lineas: list[dict[str, Any]],
    usuario: str,
) -> bytes:
    estilos = _estilos()
    story: list[Any] = []
    story.extend(_header_doc("Receta electronica", factura_codigo, fecha))
    story.append(
        _p(
            "Formato interno DentCore. Validar integracion oficial antes de uso sanitario real.",
            estilos["dato"],
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(_p(f"Paciente: {paciente_nombre}", estilos["dato_bold"]))
    story.append(_p("Indicaciones / tratamientos asociados", estilos["seccion"]))
    rows: list[list[Any]] = [[_p("Concepto", estilos["th"]), _p("Cantidad", estilos["th"])]]
    for line in lineas:
        rows.append([_p(line.get("concepto"), estilos["td"]), _p(line.get("cantidad", 1), estilos["td_center"])])
    if len(rows) == 1:
        rows.append([_p("Sin conceptos asociados", estilos["td"]), _p("-", estilos["td_center"])])
    table = Table(rows, colWidths=[PAGE_WIDTH * 0.82, PAGE_WIDTH * 0.18], repeatRows=1)
    table.setStyle(_table_style())
    story.extend([table, Spacer(1, 6 * mm), _p(f"Emitida por usuario: {usuario}", estilos["pie"])])
    return _build_pdf(story, title=f"Receta {factura_codigo}")


def generar_recibo_pdf(
    *,
    numero_recibo: str,
    fecha: datetime | date,
    paciente_nombre: str,
    factura_codigo: str,
    importe: Decimal,
    forma_pago: str,
    usuario: str | None = None,
    notas: str | None = None,
    anulado: bool = False,
) -> bytes:
    estilos = _estilos()
    story: list[Any] = []
    estado = "anulado" if anulado else "cobrado"
    story.extend(_header_doc("Recibo", numero_recibo, fecha.date() if isinstance(fecha, datetime) else fecha, estado))
    rows = [
        [_p("Paciente", estilos["dato_bold"]), _p(paciente_nombre, estilos["dato"])],
        [_p("Factura", estilos["dato_bold"]), _p(factura_codigo, estilos["dato"])],
        [_p("Fecha cobro", estilos["dato_bold"]), _p(_format_date(fecha), estilos["dato"])],
        [_p("Forma de pago", estilos["dato_bold"]), _p(forma_pago or "-", estilos["dato"])],
        [_p("Importe", estilos["dato_bold"]), _p(_money(importe), estilos["dato_bold"])],
    ]
    if usuario:
        rows.append([_p("Usuario", estilos["dato_bold"]), _p(usuario, estilos["dato"])])
    table = Table(rows, colWidths=[PAGE_WIDTH * 0.28, PAGE_WIDTH * 0.72])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.5, BORDE),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDE),
                ("BACKGROUND", (0, 0), (0, -1), GRIS_CLARO),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(table)
    if notas:
        story.append(_p("NOTAS", estilos["seccion"]))
        story.extend(_paragraphs_from_text(notas, estilos["dato"]))
    if anulado:
        story.append(_p("Este recibo corresponde a un cobro anulado.", estilos["pie"]))
    story.extend([Spacer(1, 8 * mm), HRFlowable(width="100%", thickness=0.5, color=BORDE), _p(_datos_clinica()["nombre"], estilos["pie"])])
    return _build_pdf(story, title=f"Recibo {numero_recibo}")
