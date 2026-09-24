"""Idempotent synthetic volume for Registros/Archivos, only on local *_test DBs.

Run with backend Python from backend/: python ../frontend/e2e/fixtures/seed_records.py
This constructs test fixtures, including explicitly synthetic economic records;
it does not emit legal invoices or test the invoice issuance workflow.
"""

import asyncio
import json
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.core import model_registry  # noqa: E402,F401
from app.core.crypto import cifrar_campos_paciente  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.domains.billing.persistence.factura import (  # noqa: E402
    Cobro,
    Factura,
    FacturaLinea,
    FormaPago,
)
from app.domains.clinical.persistence.documento import DocumentoPaciente  # noqa: E402
from app.domains.clinical.persistence.historial import HistorialClinico  # noqa: E402
from app.domains.clinical.persistence.tratamiento import TratamientoCatalogo  # noqa: E402
from app.domains.identity.persistence.clinica import Clinica  # noqa: E402
from app.domains.identity.persistence.doctor import Doctor  # noqa: E402
from app.domains.identity.persistence.usuario import Usuario  # noqa: E402
from app.domains.inventory.persistence.inventario import Producto  # noqa: E402
from app.domains.laboratory.persistence.laboratorio import (  # noqa: E402
    Laboratorio,
    TrabajoLaboratorio,
)
from app.domains.patients.persistence.paciente import Paciente  # noqa: E402
from app.domains.scheduling.persistence.cita import Cita  # noqa: E402
from app.domains.treatment_plans.persistence.presupuesto import (  # noqa: E402
    Presupuesto,
    PresupuestoLinea,
)


def fixture_id(key):
    return uuid5(NAMESPACE_URL, f"dentcore-registros-qa-v1/{key}")


def pdf_bytes(text):
    from io import BytesIO

    from reportlab.pdfgen.canvas import Canvas

    stream = BytesIO()
    canvas = Canvas(stream)
    canvas.drawString(40, 780, "DENTCORE - DOCUMENTO SINTETICO DE PRUEBA")
    canvas.drawString(40, 750, text)
    canvas.save()
    return stream.getvalue()


async def seed():
    settings = get_settings()
    url = make_url(settings.database_url)
    if url.host not in {"localhost", "127.0.0.1", "::1"} or not (url.database or "").endswith(
        "_test"
    ):
        raise SystemExit("Refusing: Registros fixtures require a local database ending in _test")
    if settings.environment not in {"development", "test"}:
        raise SystemExit("Refusing: fixtures require a development/test environment")
    manifest = {
        "prefix": "REGQA",
        "from": "2026-01-01",
        "to": "2026-08-31",
        "clinic_a": str(fixture_id("clinic-a")),
        "clinic_b": str(fixture_id("clinic-b")),
        "doctor_a": str(fixture_id("doctor-a")),
        "doctor_b": str(fixture_id("doctor-b")),
        "patient_a": str(fixture_id("patient-0")),
        "patient_b": str(fixture_id("patient-1000")),
        "clinical_document": str(fixture_id("document-0-radiografia")),
        "admin_document": str(fixture_id("document-0-circular")),
        "users": ["records_admin", "records_recepcion", "records_doctor"],
        "patients": 1040,
        "appointments": 3120,
        "histories": 1040,
        "plans": 1040,
        "invoices": 520,
        "payments": 347,
        "documents": 208,
    }
    async with AsyncSessionLocal() as db:
        if await db.get(Paciente, fixture_id("patient-0")):
            print("REGQA fixtures already present; existing records preserved.")
        else:
            treatment = (
                await db.execute(
                    select(TratamientoCatalogo)
                    .where(TratamientoCatalogo.activo.is_(True))
                    .order_by(TratamientoCatalogo.nombre)
                    .limit(1)
                )
            ).scalar_one()
            budget_number = int((await db.scalar(select(func.max(Presupuesto.numero)))) or 0)
            db.add_all(
                [
                    Clinica(
                        id=fixture_id(f"clinic-{key}"), nombre=f"REGQA Clinica {label}", activa=True
                    )
                    for key, label in [("a", "Norte"), ("b", "Sur")]
                ]
            )
            await db.flush()
            db.add_all(
                [
                    Doctor(
                        id=fixture_id(f"doctor-{key}"),
                        nombre=f"REGQA Profesional {label}",
                        clinica_id=fixture_id(f"clinic-{key}"),
                        activo=True,
                        color_agenda="#2563EB",
                    )
                    for key, label in [("a", "Norte"), ("b", "Sur")]
                ]
            )
            await db.flush()
            for role in ["admin", "recepcion", "doctor"]:
                db.add(
                    Usuario(
                        id=fixture_id(f"user-{role}"),
                        username=f"records_{role}",
                        password_hash=hash_password("records1234"),
                        nombre=f"REGQA {role}",
                        rol=role,
                        clinica_id=fixture_id("clinic-a"),
                        doctor_id=fixture_id("doctor-a") if role == "doctor" else None,
                        activo=True,
                    )
                )
            db.add(
                FormaPago(
                    id=fixture_id("payment-method"), nombre="REGQA pago simulado", activo=True
                )
            )
            db.add(
                Laboratorio(id=fixture_id("lab"), nombre="REGQA Laboratorio sintetico", activo=True)
            )
            await db.flush()
            for index in range(1040):
                key = "a" if index < 1000 else "b"
                patient_id = fixture_id(f"patient-{index}")
                stamp = datetime(2026, 1, 1, 10, tzinfo=timezone.utc) + timedelta(days=index % 240)
                private = await cifrar_campos_paciente(
                    db, {"dni_nie": f"REGQA{index:06d}", "telefono": f"600{index:06d}"}
                )
                db.add(
                    Paciente(
                        id=patient_id,
                        codigo=f"REGQA{index:04d}",
                        nombre=f"REGQA{index:04d}",
                        apellidos="Garcia Fernandez de la Vega Rodriguez Nombre Extenso"
                        if index % 10 == 0
                        else "Paciente Sintetico",
                        clinica_id=fixture_id(f"clinic-{key}"),
                        doctor_habitual_id=fixture_id(f"doctor-{key}"),
                        fecha_nacimiento=date(1980, 1, 1),
                        created_at=stamp,
                        **private,
                    )
                )
            await db.flush()
            for index in range(1040):
                key = "a" if index < 1000 else "b"
                patient_id, doctor_id = fixture_id(f"patient-{index}"), fixture_id(f"doctor-{key}")
                clinic_id = fixture_id(f"clinic-{key}")
                day = date(2026, 1, 1) + timedelta(days=index % 240)
                stamp = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(
                    hours=10
                )
                amount = Decimal(50 + (index % 20) * 10)
                for visit in range(3):
                    db.add(
                        Cita(
                            id=fixture_id(f"appointment-{index}-{visit}"),
                            paciente_id=patient_id,
                            clinica_id=clinic_id,
                            doctor_id=doctor_id,
                            fecha_hora=stamp + timedelta(days=visit, minutes=(index % 16) * 30),
                            duracion_min=30,
                            estado=["programada", "confirmada", "atendida"][visit],
                            motivo=f"REGQA revision {index:04d}",
                            created_at=stamp,
                        )
                    )
                db.add(
                    HistorialClinico(
                        id=fixture_id(f"history-{index}"),
                        paciente_id=patient_id,
                        doctor_id=doctor_id,
                        tratamiento_id=treatment.id,
                        fecha=day,
                        pieza_dental=36,
                        estado="realizado",
                        diagnostico="SECRETO_CLINICO_QA_REGISTROS",
                        procedimiento="REGQA control sintetico",
                        importe=amount,
                        created_at=stamp,
                    )
                )
                db.add(
                    Presupuesto(
                        id=fixture_id(f"plan-{index}"),
                        numero=budget_number + index + 1,
                        paciente_id=patient_id,
                        doctor_id=doctor_id,
                        clinica_id=clinic_id,
                        fecha=day,
                        estado="presentado",
                        pie_pagina="REGQA propuesta sintetica",
                        created_at=stamp,
                    )
                )
                if index % 2 == 0:
                    paid = (
                        amount if index % 3 == 0 else amount / 2 if index % 3 == 1 else Decimal(0)
                    )
                    db.add(
                        Factura(
                            id=fixture_id(f"invoice-{index}"),
                            paciente_id=patient_id,
                            clinica_id=clinic_id,
                            serie="TSTQA",
                            numero=index + 1,
                            fecha=day,
                            subtotal=amount,
                            iva_total=0,
                            total=amount,
                            estado="cobrada"
                            if paid == amount
                            else "parcial"
                            if paid
                            else "emitida",
                            estado_verifactu="no_aplica",
                            observaciones="REGQA FIXTURE SINTETICO SIN VALIDEZ FISCAL",
                            created_at=stamp,
                        )
                    )
                if index % 10 == 0:
                    for category in ["radiografia", "circular"]:
                        doc_id = fixture_id(f"document-{index}-{category}")
                        name = f"REGQA-{index:04d}-{category}.pdf"
                        content = pdf_bytes(
                            "SECRETO_CLINICO_QA_REGISTROS"
                            if category == "radiografia"
                            else f"REGQA circular administrativa {index:04d}"
                        )
                        folder = ROOT / "backend" / "uploads" / "pacientes" / str(patient_id)
                        folder.mkdir(parents=True, exist_ok=True)
                        (folder / f"{doc_id}.pdf").write_bytes(content)
                        db.add(
                            DocumentoPaciente(
                                id=doc_id,
                                paciente_id=patient_id,
                                nombre_original=name,
                                nombre_guardado=f"{doc_id}.pdf",
                                ruta=f"pacientes/{patient_id}/{doc_id}.pdf",
                                mime_type="application/pdf",
                                tamano_bytes=len(content),
                                categoria=category,
                                descripcion="SECRETO_CLINICO_QA_REGISTROS"
                                if category == "radiografia"
                                else "REGQA informacion administrativa",
                                doctor_id=doctor_id,
                                fecha_documento=day,
                                created_at=stamp,
                            )
                        )
                    db.add(
                        TrabajoLaboratorio(
                            id=fixture_id(f"lab-{index}"),
                            paciente_id=patient_id,
                            doctor_id=doctor_id,
                            laboratorio_id=fixture_id("lab"),
                            descripcion=f"REGQA protesis {index:04d}",
                            fecha_salida=day,
                            fecha_entrega_prevista=day + timedelta(days=14),
                            estado="enviado",
                            created_at=stamp,
                        )
                    )
                    db.add(
                        Producto(
                            id=fixture_id(f"product-{index}"),
                            clinica_id=clinic_id,
                            nombre=f"REGQA Material {index:04d}",
                            stock_act=index % 30,
                            stock_min=10,
                            coste_unitario=5,
                        )
                    )
            await db.flush()
            for index in range(1040):
                amount = Decimal(50 + (index % 20) * 10)
                db.add(
                    PresupuestoLinea(
                        id=fixture_id(f"plan-line-{index}"),
                        presupuesto_id=fixture_id(f"plan-{index}"),
                        tratamiento_id=treatment.id,
                        precio_unitario=amount,
                        pieza_dental=36,
                    )
                )
                if index % 2 == 0:
                    db.add(
                        FacturaLinea(
                            id=fixture_id(f"invoice-line-{index}"),
                            factura_id=fixture_id(f"invoice-{index}"),
                            historial_id=fixture_id(f"history-{index}"),
                            concepto=f"REGQA tratamiento sintetico {index:04d}",
                            cantidad=1,
                            precio_unitario=amount,
                            iva_porcentaje=0,
                            subtotal=amount,
                        )
                    )
                    history = await db.get(HistorialClinico, fixture_id(f"history-{index}"))
                    history.factura_id = fixture_id(f"invoice-{index}")
                    if index % 3 != 2:
                        day = date(2026, 1, 1) + timedelta(days=index % 240)
                        db.add(
                            Cobro(
                                id=fixture_id(f"payment-{index}"),
                                factura_id=fixture_id(f"invoice-{index}"),
                                fecha=datetime.combine(
                                    day, datetime.min.time(), tzinfo=timezone.utc
                                )
                                + timedelta(hours=12),
                                importe=amount if index % 3 == 0 else amount / 2,
                                forma_pago_id=fixture_id("payment-method"),
                                usuario_id=fixture_id("user-recepcion"),
                                notas="REGQA cobro sintetico",
                            )
                        )
            await db.commit()
            print("REGQA fixtures created atomically.")
    manifest_path = ROOT / "tmp" / "runtime" / "records-fixtures.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    asyncio.run(seed())
