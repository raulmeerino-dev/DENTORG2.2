"""
Servicio de generación de PDFs — Facturas y Presupuestos.
Usa ReportLab para generar el documento y qrcode para el QR Verifactu.

Diseño fiel al estilo Eurodent 2000:
- Cabecera con datos clínica
- Datos paciente / entidad
- Tabla de líneas
- Totales (subtotal, IVA, total)
- QR Verifactu + huella (solo facturas)
- Pie de página configurable
"""
import io
from datetime import date
from decimal import Decimal
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT

# ─── Colores corporativos ─────────────────────────────────────────────────────
AZUL = colors.HexColor("#1e40af")
AZUL_CLARO = colors.HexColor("#dbeafe")
GRIS = colors.HexColor("#6b7280")
GRIS_CLARO = colors.HexColor("#f9fafb")
NEGRO = colors.HexColor("#111827")
ROJO = colors.HexColor("#dc2626")


# ─── Helpers QR ───────────────────────────────────────────────────────────────

def _generar_qr_image(url: str) -> Optional[object]:
    """Genera imagen QR como objeto ReportLab. Devuelve None si falla."""
    try:
        import qrcode
        from reportlab.platypus import Image as RLImage
        qr = qrcode.make(url)
        buf = io.BytesIO()
        qr.save(buf, format="PNG")
        buf.seek(0)
        return RLImage(buf, width=25 * mm, height=25 * mm)
    except Exception:
        return None


# ─── Datos de la clínica (desde settings o valores por defecto) ────────────────

def _datos_clinica() -> dict:
    try:
        from app.config import get_settings
        s = get_settings()
        return {
            "nombre": getattr(s, "clinica_nombre", "Clínica Dental Eurodent"),
            "direccion": getattr(s, "clinica_direccion", ""),
            "ciudad": getattr(s, "clinica_ciudad", ""),
            "telefono": getattr(s, "clinica_telefono", ""),
            "email": getattr(s, "clinica_email", ""),
            "nif": getattr(s, "nif_emisor", ""),
        }
    except Exception:
        return {
            "nombre": "Clínica Dental",
            "direccion": "",
            "ciudad": "",
            "telefono": "",
            "email": "",
            "nif": "",
        }


# ─── Estilos ──────────────────────────────────────────────────────────────────

def _estilos():
    base = getSampleStyleSheet()
    return {
        "clinica": ParagraphStyle("clinica", fontSize=14, fontName="Helvetica-Bold", textColor=AZUL, spaceAfter=2),
        "clinica_sub": ParagraphStyle("clinica_sub", fontSize=8, fontName="Helvetica", textColor=GRIS, spaceAfter=1),
        "titulo_doc": ParagraphStyle("titulo_doc", fontSize=16, fontName="Helvetica-Bold", textColor=AZUL, alignment=TA_RIGHT),
        "num_doc": ParagraphStyle("num_doc", fontSize=10, fontName="Helvetica", textColor=GRIS, alignment=TA_RIGHT),
        "seccion": ParagraphStyle("seccion", fontSize=8, fontName="Helvetica-Bold", textColor=AZUL, spaceAfter=3, spaceBefore=6),
        "dato": ParagraphStyle("dato", fontSize=8, fontName="Helvetica", textColor=NEGRO, spaceAfter=1),
        "pie": ParagraphStyle("pie", fontSize=7, fontName="Helvetica", textColor=GRIS, alignment=TA_CENTER),
        "qr_label": ParagraphStyle("qr_label", fontSize=6, fontName="Helvetica", textColor=GRIS, alignment=TA_CENTER, wordWrap="LTR"),
    }


# ─── Factura PDF ──────────────────────────────────────────────────────────────

def generar_factura_pdf(
    *,
    # Datos de la factura
    serie: str,
    numero: int,
    fecha: date,
    subtotal: Decimal,
    iva_total: Decimal,
    total: Decimal,
    estado: str,
    observaciones: Optional[str],
    # Paciente
    paciente_nombre: str,
    paciente_apellidos: str,
    paciente_num_historial: int,
    paciente_dni: Optional[str],
    paciente_direccion: Optional[str],
    # Líneas
    lineas: list[dict],  # {concepto, concepto_ficticio, cantidad, precio_unitario, iva_porcentaje, subtotal}
    # Cobros
    cobros: list[dict],  # {fecha, importe, forma_pago}
    # Verifactu
    huella: Optional[str] = None,
    url_qr: Optional[str] = None,
    identificador_fiscal: Optional[str] = None,
    leyenda_fiscal: Optional[str] = None,
    estado_remision: Optional[str] = None,
    # Pie
    pie_pagina: Optional[str] = None,
) -> bytes:
    """Genera el PDF de una factura y devuelve los bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=20 * mm,
    )

    clinica = _datos_clinica()
    estilos = _estilos()
    story = []

    if url_qr:
        qr_img = _generar_qr_image(url_qr)
        qr_bloque = []
        if qr_img:
            qr_bloque.append(qr_img)
        qr_bloque.append(Paragraph("Codigo QR de verificacion fiscal", estilos["qr_label"]))
        qr_bloque.append(Paragraph(url_qr, estilos["qr_label"]))
        if identificador_fiscal:
            qr_bloque.append(Paragraph(f"ID SIF: {identificador_fiscal}", estilos["qr_label"]))
        if huella:
            qr_bloque.append(
                Paragraph(
                    f'<font size="5" color="grey">Huella: {huella[:32]}...</font>',
                    estilos["qr_label"],
                )
            )
        t_qr_inicio = Table([[qr_bloque]], colWidths=["100%"])
        t_qr_inicio.setStyle(TableStyle([
            ("BOX", (0, 0), (0, 0), 0.5, colors.HexColor("#d1d5db")),
            ("LEFTPADDING", (0, 0), (0, 0), 8),
            ("RIGHTPADDING", (0, 0), (0, 0), 8),
            ("TOPPADDING", (0, 0), (0, 0), 6),
            ("BOTTOMPADDING", (0, 0), (0, 0), 6),
            ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ]))
        story.append(t_qr_inicio)
        story.append(Spacer(1, 4 * mm))

    # ── Cabecera: clínica (izq) + título factura (der) ────────────────────────
    cabecera_data = [[
        [
            Paragraph(clinica["nombre"], estilos["clinica"]),
            Paragraph(clinica["direccion"], estilos["clinica_sub"]),
            Paragraph(f'{clinica["ciudad"]}  ·  Tel. {clinica["telefono"]}', estilos["clinica_sub"]),
            Paragraph(f'NIF: {clinica["nif"]}', estilos["clinica_sub"]),
        ],
        [
            Paragraph("FACTURA", estilos["titulo_doc"]),
            Paragraph(f'{serie}-{numero:04d}', estilos["num_doc"]),
            Paragraph(f'Fecha: {fecha.strftime("%d/%m/%Y")}', estilos["num_doc"]),
            Paragraph(f'Estado: {estado.upper()}', estilos["num_doc"]),
        ],
    ]]
    t_cab = Table(cabecera_data, colWidths=["55%", "45%"])
    t_cab.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(t_cab)
    story.append(HRFlowable(width="100%", thickness=1.5, color=AZUL, spaceAfter=6))

    # ── Datos paciente ────────────────────────────────────────────────────────
    story.append(Paragraph("CLIENTE", estilos["seccion"]))
    pac_data = [[
        [
            Paragraph(f'<b>{paciente_apellidos}, {paciente_nombre}</b>', estilos["dato"]),
            Paragraph(f'Nº Historial: {paciente_num_historial}', estilos["dato"]),
            *(
                [Paragraph(f'DNI/NIE: {paciente_dni}', estilos["dato"])]
                if paciente_dni else []
            ),
            *(
                [Paragraph(paciente_direccion, estilos["dato"])]
                if paciente_direccion else []
            ),
        ],
        [],
    ]]
    t_pac = Table(pac_data, colWidths=["60%", "40%"])
    t_pac.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), GRIS_CLARO),
        ("BOX", (0, 0), (0, 0), 0.5, colors.HexColor("#e5e7eb")),
        ("LEFTPADDING", (0, 0), (0, 0), 6),
        ("TOPPADDING", (0, 0), (0, 0), 4),
        ("BOTTOMPADDING", (0, 0), (0, 0), 4),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(t_pac)
    story.append(Spacer(1, 4 * mm))

    # ── Tabla de líneas ───────────────────────────────────────────────────────
    story.append(Paragraph("CONCEPTOS", estilos["seccion"]))

    tabla_header = [["Concepto", "Cant.", "P. Unit.", "IVA %", "Importe"]]
    tabla_lineas = []
    for l in lineas:
        concepto = l.get("concepto_ficticio") or l.get("concepto", "")
        tabla_lineas.append([
            concepto,
            str(l.get("cantidad", 1)),
            f'{float(l.get("precio_unitario", 0)):.2f} €',
            f'{float(l.get("iva_porcentaje", 0)):.0f}%',
            f'{float(l.get("subtotal", 0)):.2f} €',
        ])

    tabla_data = tabla_header + tabla_lineas
    col_widths = ["50%", "8%", "14%", "10%", "18%"]
    w_total = 180 * mm
    col_w = [w_total * float(c.rstrip("%")) / 100 for c in col_widths]

    t_lineas = Table(tabla_data, colWidths=col_w)
    t_lineas.setStyle(TableStyle([
        # Cabecera
        ("BACKGROUND", (0, 0), (-1, 0), AZUL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        # Filas alternas
        *[
            ("BACKGROUND", (0, i), (-1, i), GRIS_CLARO)
            for i in range(2, len(tabla_data), 2)
        ],
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRIS_CLARO]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t_lineas)
    story.append(Spacer(1, 4 * mm))

    # ── Totales + QR (lado a lado) ────────────────────────────────────────────
    totales_data = [
        ["Subtotal:", f"{float(subtotal):.2f} €"],
        ["IVA:", f"{float(iva_total):.2f} €"],
        ["TOTAL:", f"{float(total):.2f} €"],
    ]
    t_totales = Table(totales_data, colWidths=[35 * mm, 30 * mm])
    t_totales.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("FONTSIZE", (0, 2), (-1, 2), 10),
        ("LINEABOVE", (0, 2), (-1, 2), 1, AZUL),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    # Cobros registrados
    cobros_content = []
    if cobros:
        cobros_content.append(Paragraph("Cobros registrados:", estilos["seccion"]))
        for c in cobros:
            fecha_c = c.get("fecha", "")
            if hasattr(fecha_c, "strftime"):
                fecha_c = fecha_c.strftime("%d/%m/%Y")
            cobros_content.append(
                Paragraph(
                    f'{fecha_c}  ·  {c.get("forma_pago", "")}  ·  <b>{float(c.get("importe", 0)):.2f} €</b>',
                    estilos["dato"],
                )
            )

    # QR Verifactu
    qr_content = []
    if url_qr:
        qr_img = _generar_qr_image(url_qr)
        if qr_img:
            qr_content = [qr_img, Paragraph("Verificar en AEAT", estilos["qr_label"])]
        if huella:
            qr_content.append(
                Paragraph(
                    f'<font size="5" color="grey">Huella: {huella[:32]}…</font>',
                    estilos["qr_label"],
                )
            )

    bloque_der = [[t_totales]]
    if cobros_content:
        bloque_der[0].extend(cobros_content)

    fila_inferior = [[bloque_der[0]]]
    t_inferior = Table(fila_inferior, colWidths=["100%"])
    t_inferior.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(t_inferior)

    if identificador_fiscal or leyenda_fiscal or estado_remision:
        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph("TRAZABILIDAD FISCAL", estilos["seccion"]))
        if identificador_fiscal:
            story.append(Paragraph(f"Identificador SIF: <b>{identificador_fiscal}</b>", estilos["dato"]))
        if estado_remision:
            story.append(Paragraph(f"Estado de remision: <b>{estado_remision}</b>", estilos["dato"]))
        if leyenda_fiscal:
            story.append(Paragraph(leyenda_fiscal, estilos["dato"]))

    # ── Observaciones ─────────────────────────────────────────────────────────
    if observaciones:
        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph("Observaciones:", estilos["seccion"]))
        story.append(Paragraph(observaciones, estilos["dato"]))

    # ── Pie de página ─────────────────────────────────────────────────────────
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb")))
    pie = pie_pagina or "Gracias por confiar en nosotros."
    story.append(Paragraph(pie, estilos["pie"]))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ─── Presupuesto PDF ──────────────────────────────────────────────────────────

def generar_presupuesto_pdf(
    *,
    numero: int,
    fecha: date,
    estado: str,
    paciente_nombre: str,
    paciente_apellidos: str,
    paciente_num_historial: int,
    doctor_nombre: Optional[str],
    lineas: list[dict],  # {tratamiento_nombre, pieza_dental, caras, precio_unitario, descuento_porcentaje, importe_neto, aceptado}
    total: Decimal,
    total_aceptado: Decimal,
    pie_pagina: Optional[str] = None,
) -> bytes:
    """Genera el PDF de un presupuesto y devuelve los bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=20 * mm,
    )

    clinica = _datos_clinica()
    estilos = _estilos()
    story = []

    # Cabecera
    cabecera_data = [[
        [
            Paragraph(clinica["nombre"], estilos["clinica"]),
            Paragraph(clinica["direccion"], estilos["clinica_sub"]),
            Paragraph(f'{clinica["ciudad"]}  ·  Tel. {clinica["telefono"]}', estilos["clinica_sub"]),
        ],
        [
            Paragraph("PRESUPUESTO", estilos["titulo_doc"]),
            Paragraph(f'Nº {numero:04d}', estilos["num_doc"]),
            Paragraph(f'Fecha: {fecha.strftime("%d/%m/%Y")}', estilos["num_doc"]),
            Paragraph(f'Estado: {estado.upper()}', estilos["num_doc"]),
        ],
    ]]
    t_cab = Table(cabecera_data, colWidths=["55%", "45%"])
    t_cab.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(t_cab)
    story.append(HRFlowable(width="100%", thickness=1.5, color=AZUL, spaceAfter=6))

    # Paciente + doctor
    story.append(Paragraph("PACIENTE", estilos["seccion"]))
    story.append(Paragraph(f'<b>{paciente_apellidos}, {paciente_nombre}</b>  ·  Hx{paciente_num_historial}', estilos["dato"]))
    if doctor_nombre:
        story.append(Paragraph(f'Doctor/a: {doctor_nombre}', estilos["dato"]))
    story.append(Spacer(1, 4 * mm))

    # Tabla de tratamientos
    story.append(Paragraph("TRATAMIENTOS PRESUPUESTADOS", estilos["seccion"]))
    header = [["Tratamiento", "Pieza", "Caras", "Precio", "Dto.", "Importe", "Acept."]]
    rows = []
    for l in lineas:
        rows.append([
            l.get("tratamiento_nombre", ""),
            str(l.get("pieza_dental") or "—"),
            l.get("caras") or "—",
            f'{float(l.get("precio_unitario", 0)):.2f} €',
            f'{float(l.get("descuento_porcentaje", 0)):.0f}%' if l.get("descuento_porcentaje") else "—",
            f'{float(l.get("importe_neto", 0)):.2f} €',
            "Sí" if l.get("aceptado") else "No",
        ])

    w = 180 * mm
    col_w = [w * p for p in [0.34, 0.08, 0.08, 0.12, 0.08, 0.13, 0.08] ]
    t_rows = Table(header + rows, colWidths=col_w)
    t_rows.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), AZUL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRIS_CLARO]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        # Resaltar filas aceptadas
        *[
            ("TEXTCOLOR", (6, i + 1), (6, i + 1), colors.HexColor("#16a34a"))
            for i, l in enumerate(lineas)
            if l.get("aceptado")
        ],
    ]))
    story.append(t_rows)
    story.append(Spacer(1, 4 * mm))

    # Totales
    totales_data = [
        ["Total presupuesto:", f"{float(total):.2f} €"],
        ["Total aceptado:", f"{float(total_aceptado):.2f} €"],
    ]
    t_totales = Table(totales_data, colWidths=[50 * mm, 30 * mm])
    t_totales.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("LINEABOVE", (0, 1), (-1, 1), 1, AZUL),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(t_totales)

    # Nota legal
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        "Este presupuesto tiene una validez de 30 días desde la fecha de emisión. "
        "Los precios incluyen IVA según la legislación vigente.",
        estilos["pie"],
    ))

    # Pie
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb")))
    pie = pie_pagina or clinica["nombre"]
    story.append(Paragraph(pie, estilos["pie"]))

    doc.build(story)
    buf.seek(0)
    return buf.read()
