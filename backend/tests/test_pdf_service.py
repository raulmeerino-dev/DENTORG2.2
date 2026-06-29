from datetime import date, datetime, timezone
from decimal import Decimal

from app.services.pdf_service import (
    generar_documento_clinico_pdf,
    generar_factura_pdf,
    generar_presupuesto_pdf,
    generar_receta_pdf,
    generar_recibo_pdf,
    pdf_response_headers,
    validate_pdf_bytes,
)


def test_generar_factura_pdf_con_texto_largo_y_qr():
    pdf = generar_factura_pdf(
        serie="A",
        numero=381,
        fecha=date(2026, 5, 8),
        subtotal=Decimal("210.00"),
        iva_total=Decimal("0.00"),
        total=Decimal("210.00"),
        estado="emitida",
        observaciones="Paciente con observacion larga <control> & seguimiento.\n\nNo debe romper el PDF.",
        paciente_nombre="Cesar",
        paciente_apellidos="Gutierrez Velez",
        paciente_num_historial=91312,
        paciente_dni="13778916F",
        paciente_direccion="Barrio Palacio 139",
        lineas=[
            {
                "concepto": "Endodoncia unirradicular con descripcion muy larga para probar salto de linea",
                "concepto_ficticio": None,
                "cantidad": 1,
                "precio_unitario": Decimal("150.00"),
                "iva_porcentaje": Decimal("0.00"),
                "subtotal": Decimal("150.00"),
            },
            {
                "concepto": "Limpieza, profilaxis y topicacion",
                "concepto_ficticio": None,
                "cantidad": 1,
                "precio_unitario": Decimal("60.00"),
                "iva_porcentaje": Decimal("0.00"),
                "subtotal": Decimal("60.00"),
            },
        ],
        cobros=[
            {"fecha": datetime(2026, 5, 8, 10, 30, tzinfo=timezone.utc), "importe": Decimal("50.00"), "forma_pago": "Tarjeta"}
        ],
        huella="a" * 64,
        url_qr="https://example.test/verificar?num=381&total=210",
        identificador_fiscal="SIF-A-381",
        leyenda_fiscal="Documento fiscal archivado.",
        estado_remision="pendiente",
    )

    validate_pdf_bytes(pdf)


def test_generar_presupuesto_pdf_multipagina():
    lineas = [
        {
            "tratamiento_nombre": f"Tratamiento dental planificado numero {index} con texto largo",
            "pieza_dental": 11 + (index % 8),
            "caras": "MO",
            "precio_unitario": Decimal("50.00"),
            "descuento_porcentaje": Decimal("0.00"),
            "importe_neto": Decimal("50.00"),
            "aceptado": index % 2 == 0,
        }
        for index in range(45)
    ]

    pdf = generar_presupuesto_pdf(
        numero=42,
        fecha=date(2026, 5, 8),
        estado="presentado",
        paciente_nombre="Pilar",
        paciente_apellidos="Ojeda Calvo",
        paciente_num_historial=3485,
        doctor_nombre="Dra. Portilla",
        lineas=lineas,
        total=Decimal("2250.00"),
        total_aceptado=Decimal("1150.00"),
    )

    validate_pdf_bytes(pdf)


def test_generar_documento_clinico_y_receta_pdf():
    documento = generar_documento_clinico_pdf(
        titulo="Circular personalizada",
        contenido="Se informa que el paciente puede reincorporarse.\n\nTexto <seguro> & escapado.",
        paciente_nombre="Ana Dental",
        fecha_documento=date(2026, 5, 8),
    )
    receta = generar_receta_pdf(
        paciente_nombre="Ana Dental",
        factura_codigo="A-381",
        fecha=date(2026, 5, 8),
        lineas=[{"concepto": "Amoxicilina 500mg", "cantidad": 1}],
        usuario="admin",
    )

    validate_pdf_bytes(documento)
    validate_pdf_bytes(receta)


def test_generar_recibo_pdf():
    recibo = generar_recibo_pdf(
        numero_recibo="rec-001",
        fecha=datetime(2026, 5, 8, 10, 30, tzinfo=timezone.utc),
        paciente_nombre="Ana Dental",
        factura_codigo="A-381",
        importe=Decimal("50.00"),
        forma_pago="Tarjeta",
        usuario="admin",
        notas="Pago parcial",
    )

    validate_pdf_bytes(recibo)


def test_pdf_response_headers_son_seguras():
    headers = pdf_response_headers('factura-"381".pdf')
    assert headers["Content-Disposition"].startswith('inline; filename="factura-381.pdf"')
    assert "filename*=UTF-8''factura-381.pdf" in headers["Content-Disposition"]
    assert headers["Cache-Control"] == "no-store"
    assert headers["X-Content-Type-Options"] == "nosniff"
