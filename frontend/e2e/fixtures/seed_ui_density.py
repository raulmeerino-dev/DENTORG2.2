"""Add one synthetic, dense UI patient to the isolated Registros QA runtime."""

import asyncio
from datetime import date, timedelta
from decimal import Decimal
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import func

from seed_records import (
    ROOT,
    AsyncSessionLocal,
    DocumentoPaciente,
    HistorialClinico,
    Paciente,
    Presupuesto,
    PresupuestoLinea,
    TratamientoCatalogo,
    fixture_id,
    get_settings,
    make_url,
    pdf_bytes,
    select,
)


def ui_id(key):
    return uuid5(NAMESPACE_URL, f"dentcore-ui-density-v1/{key}")


async def seed():
    settings = get_settings()
    url = make_url(settings.database_url)
    if (
        url.host not in {"127.0.0.1", "localhost", "::1"}
        or not (url.database or "").endswith("_test")
        or settings.environment not in {"development", "test"}
    ):
        raise SystemExit(
            "UI fixtures require a local development/test database ending in _test"
        )
    async with AsyncSessionLocal() as db:
        if await db.get(Paciente, ui_id("patient")):
            print("UIQA patient already present; existing data preserved.")
            return
        if not await db.get(Paciente, fixture_id("patient-0")):
            raise SystemExit("Run seed_records.py first")
        treatments = list(
            (
                await db.scalars(
                    select(TratamientoCatalogo)
                    .where(TratamientoCatalogo.activo.is_(True))
                    .limit(24)
                )
            ).all()
        )
        patient = Paciente(
            id=ui_id("patient"),
            nombre="UIQA María de los Ángeles",
            apellidos="Fernández de la Torre y Sánchez de la Vega",
            codigo="UIQA-DENSE",
            clinica_id=fixture_id("clinic-a"),
            fecha_nacimiento=date(1980, 5, 19),
        )
        db.add(patient)
        await db.flush()
        plan = Presupuesto(
            id=ui_id("plan"),
            paciente_id=patient.id,
            numero=int(await db.scalar(select(func.max(Presupuesto.numero))) or 0) + 1,
            clinica_id=fixture_id("clinic-a"),
            doctor_id=fixture_id("doctor-a"),
            fecha=date(2026, 9, 26),
            estado="borrador",
            pie_pagina="UIQA · Propuesta sintética para validar densidad visual.",
        )
        db.add(plan)
        await db.flush()
        teeth = [
            18,
            17,
            16,
            15,
            14,
            13,
            12,
            11,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28,
            48,
            47,
            46,
            45,
            44,
            43,
            42,
            41,
        ]
        for i, tooth in enumerate(teeth):
            treatment = treatments[i % len(treatments)]
            db.add(
                PresupuestoLinea(
                    id=ui_id(f"line-{i}"),
                    presupuesto_id=plan.id,
                    tratamiento_id=treatment.id,
                    pieza_dental=tooth,
                    precio_unitario=Decimal(75 + i * 10),
                )
            )
        for i in range(60):
            db.add(
                HistorialClinico(
                    id=ui_id(f"history-{i}"),
                    paciente_id=patient.id,
                    tratamiento_id=treatments[i % len(treatments)].id,
                    doctor_id=fixture_id("doctor-a"),
                    fecha=date(2026, 1, 1) + timedelta(days=i * 3),
                    pieza_dental=teeth[i % len(teeth)],
                    estado="realizado",
                    diagnostico="UIQA · Exploración de control y seguimiento periodontal con descripción extensa para comprobar lectura completa.",
                    procedimiento="Revisión sintética sin acto económico. Observación larga, conservación de notas y recomendaciones de seguimiento en la próxima consulta.",
                    importe=Decimal(0),
                )
            )
        folder = ROOT / "backend" / "uploads" / "pacientes" / str(patient.id)
        folder.mkdir(parents=True, exist_ok=True)
        for i in range(16):
            name = f"UIQA informe de seguimiento y valoración clínica completa {i + 1:02d}.pdf"
            stored = f"{ui_id(f'doc-{i}')}.pdf"
            data = pdf_bytes("UIQA · Documento sintetico sin informacion clinica real")
            (folder / stored).write_bytes(data)
            db.add(
                DocumentoPaciente(
                    id=ui_id(f"doc-{i}"),
                    paciente_id=patient.id,
                    nombre_original=name,
                    nombre_guardado=stored,
                    ruta=f"pacientes/{patient.id}/{stored}",
                    mime_type="application/pdf",
                    tamano_bytes=len(data),
                    categoria="informe",
                    fecha_documento=date(2026, 8, 1) + timedelta(days=i),
                )
            )
        await db.commit()
        print(
            f"UIQA patient: {patient.id}; 60 history entries, 24 budget lines, 16 PDFs"
        )


if __name__ == "__main__":
    asyncio.run(seed())
