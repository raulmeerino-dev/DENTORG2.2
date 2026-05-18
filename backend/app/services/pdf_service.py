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
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from html import escape
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
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


def _firma_png_bytes(data_url: str | None) -> bytes | None:
    if not data_url:
        return None
    prefix = "data:image/png;base64,"
    if not data_url.startswith(prefix):
        return None
    try:
        return base64.b64decode(data_url[len(prefix):], validate=True)
    except (ValueError, binascii.Error):
        return None


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


def pdf_response_headers(filename: str, *, inline: bool = True) -> dict[str, str]:
    disposition = "inline" if inline else "attachment"
    safe_filename = _clean(filename, "documento.pdf").replace('"', "")
    return {
        "Content-Disposition": f'{disposition}; filename="{safe_filename}"',
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
            "Formato interno DentOrg2. Validar integracion oficial antes de uso sanitario real.",
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
            "Formato interno DentOrg2. Validar integracion oficial antes de uso sanitario real.",
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
