"""
Script de datos de demostración completos.
Crea doctores, usuario doctor de prueba, paciente con historial rico,
citas de esta semana, presupuesto y factura de ejemplo.

Ejecutar desde backend/:
    python scripts/seed_demo.py

Credenciales de prueba:
    Admin:   admin / admin1234
    Doctor:  doctor / doctor123
"""
import asyncio
import sys
import io
from pathlib import Path
from datetime import date, datetime, timedelta, timezone

# Windows: forzar stdout a UTF-8
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.core.security import hash_password
from app.core.crypto import cifrar_campos_paciente
from app.models.usuario import Usuario
from app.models.doctor import Doctor
from app.models.gabinete import Gabinete
from app.models.paciente import Paciente
from app.models.cita import Cita, CitaTelefonear
from app.models.historial import HistorialClinico
from app.models.tratamiento import FamiliaTratamiento, TratamientoCatalogo
from app.models.presupuesto import Presupuesto, PresupuestoLinea
from app.models.factura import Factura, FacturaLinea


def dt(d: date, h: int, m: int = 0) -> datetime:
    return datetime(d.year, d.month, d.day, h, m, tzinfo=timezone.utc)


async def get_or_create(session: AsyncSession, model, filter_kwargs: dict, create_kwargs: dict):
    """Obtiene o crea un registro. Devuelve (objeto, creado)."""
    stmt = select(model)
    for k, v in filter_kwargs.items():
        stmt = stmt.where(getattr(model, k) == v)
    result = await session.execute(stmt)
    obj = result.scalar_one_or_none()
    if obj:
        return obj, False
    obj = model(**{**filter_kwargs, **create_kwargs})
    session.add(obj)
    await session.flush()
    return obj, True


async def seed():
    hoy = date.today()
    lunes = hoy - timedelta(days=hoy.weekday())

    async with AsyncSessionLocal() as session:
        print("=" * 60)
        print("EURODENT 2.0 — Seed de demostración")
        print("=" * 60)

        # ── Usuario admin ────────────────────────────────────────────
        admin, creado = await get_or_create(
            session, Usuario,
            {"username": "admin"},
            {"password_hash": hash_password("admin1234"), "nombre": "Administrador", "rol": "admin", "activo": True},
        )
        print(f"{'✓ Admin creado' if creado else '· Admin ya existe'}: admin / admin1234")

        # ── Doctores ─────────────────────────────────────────────────
        doctores_def = [
            {"nombre": "Dr. García Ruiz",    "especialidad": "Odontología General",  "color_agenda": "#2563EB", "porcentaje": 40.0},
            {"nombre": "Dra. López Herrera", "especialidad": "Ortodoncia",            "color_agenda": "#16A34A", "porcentaje": 40.0},
            {"nombre": "Dr. Martín Torres",  "especialidad": "Implantología",         "color_agenda": "#DC2626", "porcentaje": 35.0},
            {"nombre": "Dra. Sánchez Vega",  "especialidad": "Endodoncia",            "color_agenda": "#9333EA", "porcentaje": 38.0},
        ]
        doctores = []
        for dd in doctores_def:
            doc, creado = await get_or_create(
                session, Doctor,
                {"nombre": dd["nombre"]},
                {**dd, "es_auxiliar": False, "activo": True},
            )
            doctores.append(doc)
            print(f"{'✓' if creado else '·'} Doctor: {doc.nombre}")

        doc1, doc2, doc3, doc4 = doctores[0], doctores[1], doctores[2], doctores[3]

        # ── Usuario doctor de prueba ──────────────────────────────────
        doc_usuario, creado = await get_or_create(
            session, Usuario,
            {"username": "doctor"},
            {
                "password_hash": hash_password("doctor123"),
                "nombre": "Dr. García Ruiz",
                "rol": "doctor",
                "doctor_id": doc1.id,
                "activo": True,
            },
        )
        print(f"{'✓ Usuario doctor creado' if creado else '· Usuario doctor ya existe'}: doctor / doctor123")

        # Usuario recepción
        rec, creado = await get_or_create(
            session, Usuario,
            {"username": "recepcion"},
            {
                "password_hash": hash_password("recep123"),
                "nombre": "María Recepción",
                "rol": "recepcion",
                "activo": True,
            },
        )
        print(f"{'✓' if creado else '·'} Usuario recepción: recepcion / recep123")

        # ── Gabinetes ─────────────────────────────────────────────────
        for i in range(1, 4):
            gab, creado = await get_or_create(
                session, Gabinete,
                {"nombre": f"Gabinete {i}"},
                {"activo": True},
            )
            if creado:
                print(f"✓ Gabinete {i} creado")

        # ── Catálogo de tratamientos ──────────────────────────────────
        familias_def = [
            {"nombre": "Odontología General", "icono": "🦷", "orden": 1},
            {"nombre": "Endodoncia",           "icono": "🔧", "orden": 2},
            {"nombre": "Cirugía",              "icono": "💉", "orden": 3},
            {"nombre": "Ortodoncia",           "icono": "✨", "orden": 4},
            {"nombre": "Implantología",        "icono": "🔩", "orden": 5},
            {"nombre": "Periodoncia",          "icono": "🩺", "orden": 6},
            {"nombre": "Estética Dental",      "icono": "⭐", "orden": 7},
            {"nombre": "Prótesis",             "icono": "🦷", "orden": 8},
        ]
        familias = {}
        for fd in familias_def:
            fam, creado = await get_or_create(
                session, FamiliaTratamiento,
                {"nombre": fd["nombre"]},
                {"icono": fd["icono"], "orden": fd["orden"], "activo": True},
            )
            familias[fd["nombre"]] = fam
            if creado:
                print(f"  ✓ Familia: {fam.nombre}")

        tratamientos_def = [
            # General
            {"codigo": "RV01", "nombre": "Revisión y diagnóstico",         "familia": "Odontología General", "precio": 30.00,  "iva": 0,    "req_pieza": False},
            {"codigo": "LI01", "nombre": "Limpieza bucal",                  "familia": "Odontología General", "precio": 60.00,  "iva": 0,    "req_pieza": False},
            {"codigo": "EM01", "nombre": "Empaste composite 1 cara",        "familia": "Odontología General", "precio": 70.00,  "iva": 0,    "req_pieza": True, "req_caras": True},
            {"codigo": "EM02", "nombre": "Empaste composite 2 caras",       "familia": "Odontología General", "precio": 90.00,  "iva": 0,    "req_pieza": True, "req_caras": True},
            {"codigo": "EM03", "nombre": "Empaste composite 3+ caras",      "familia": "Odontología General", "precio": 110.00, "iva": 0,    "req_pieza": True, "req_caras": True},
            {"codigo": "XRAY", "nombre": "Radiografía periapical",          "familia": "Odontología General", "precio": 20.00,  "iva": 21,   "req_pieza": True},
            {"codigo": "PANO", "nombre": "Ortopantomografía",               "familia": "Odontología General", "precio": 50.00,  "iva": 21,   "req_pieza": False},
            # Endodoncia
            {"codigo": "EN01", "nombre": "Endodoncia unirradicular",        "familia": "Endodoncia",          "precio": 220.00, "iva": 0,    "req_pieza": True},
            {"codigo": "EN02", "nombre": "Endodoncia birradicular",         "familia": "Endodoncia",          "precio": 280.00, "iva": 0,    "req_pieza": True},
            {"codigo": "EN03", "nombre": "Endodoncia multirradicular",      "familia": "Endodoncia",          "precio": 330.00, "iva": 0,    "req_pieza": True},
            # Cirugía
            {"codigo": "EX01", "nombre": "Extracción simple",              "familia": "Cirugía",             "precio": 60.00,  "iva": 0,    "req_pieza": True},
            {"codigo": "EX02", "nombre": "Extracción quirúrgica",          "familia": "Cirugía",             "precio": 120.00, "iva": 0,    "req_pieza": True},
            {"codigo": "EX03", "nombre": "Extracción cordal",              "familia": "Cirugía",             "precio": 180.00, "iva": 0,    "req_pieza": True},
            # Ortodoncia
            {"codigo": "OR01", "nombre": "Estudio ortodóncico",            "familia": "Ortodoncia",          "precio": 80.00,  "iva": 0,    "req_pieza": False},
            {"codigo": "OR02", "nombre": "Brackets metálicos (arcada)",    "familia": "Ortodoncia",          "precio": 800.00, "iva": 0,    "req_pieza": False},
            {"codigo": "OR03", "nombre": "Control mensual ortodoncia",     "familia": "Ortodoncia",          "precio": 40.00,  "iva": 0,    "req_pieza": False},
            {"codigo": "OR04", "nombre": "Retenedor fijo",                 "familia": "Ortodoncia",          "precio": 120.00, "iva": 0,    "req_pieza": False},
            # Implantología
            {"codigo": "IM01", "nombre": "Implante dental (colocación)",   "familia": "Implantología",       "precio": 950.00, "iva": 21,   "req_pieza": True},
            {"codigo": "IM02", "nombre": "Corona sobre implante",          "familia": "Implantología",       "precio": 600.00, "iva": 21,   "req_pieza": True},
            # Periodoncia
            {"codigo": "PE01", "nombre": "Raspado y alisado radicular",    "familia": "Periodoncia",         "precio": 150.00, "iva": 0,    "req_pieza": False},
            {"codigo": "PE02", "nombre": "Sondaje periodontal",            "familia": "Periodoncia",         "precio": 40.00,  "iva": 0,    "req_pieza": False},
            # Estética
            {"codigo": "BL01", "nombre": "Blanqueamiento profesional",     "familia": "Estética Dental",     "precio": 350.00, "iva": 21,   "req_pieza": False},
            {"codigo": "CA01", "nombre": "Carilla de porcelana",           "familia": "Estética Dental",     "precio": 450.00, "iva": 21,   "req_pieza": True},
            # Prótesis
            {"codigo": "PR01", "nombre": "Corona de porcelana",            "familia": "Prótesis",            "precio": 420.00, "iva": 21,   "req_pieza": True},
            {"codigo": "PR02", "nombre": "Puente 3 piezas porcelana",      "familia": "Prótesis",            "precio": 1100.00,"iva": 21,   "req_pieza": True},
            {"codigo": "PR03", "nombre": "Prótesis removible completa",    "familia": "Prótesis",            "precio": 700.00, "iva": 21,   "req_pieza": False},
        ]

        tratas = {}
        for td in tratamientos_def:
            fam = familias.get(td["familia"])
            if not fam:
                continue
            trat, creado = await get_or_create(
                session, TratamientoCatalogo,
                {"codigo": td["codigo"]},
                {
                    "nombre": td["nombre"],
                    "familia_id": fam.id,
                    "precio": td["precio"],
                    "iva_porcentaje": td["iva"],
                    "requiere_pieza": td.get("req_pieza", False),
                    "requiere_caras": td.get("req_caras", False),
                    "activo": True,
                },
            )
            tratas[td["codigo"]] = trat
            if creado:
                print(f"  ✓ Tratamiento: {trat.codigo} {trat.nombre}")

        if not tratas:
            print("ERROR: No se pudieron crear tratamientos")
            return

        # ── Paciente de prueba completo ───────────────────────────────
        result = await session.execute(
            select(Paciente).where(Paciente.nombre == "Juan", Paciente.apellidos == "Pérez Méndez")
        )
        pac_demo = result.scalar_one_or_none()
        if not pac_demo:
            campos_enc = await cifrar_campos_paciente(
                session,
                {"dni_nie": "12345678A", "telefono": "666555444", "telefono2": "912345678", "email": "juan.perez@ejemplo.com"},
            )
            pac_demo = Paciente(
                nombre="Juan",
                apellidos="Pérez Méndez",
                fecha_nacimiento=date(1978, 6, 15),
                direccion="Calle Mayor, 42, 3º B",
                codigo_postal="28013",
                ciudad="Madrid",
                provincia="Madrid",
                observaciones="Paciente con antecedentes de bruxismo. Alérgico a la penicilina.",
                activo=True,
                **campos_enc,
            )
            session.add(pac_demo)
            await session.flush()
            print(f"✓ Paciente demo: {pac_demo.apellidos}, {pac_demo.nombre} (Hx{pac_demo.num_historial})")
        else:
            print(f"· Paciente demo ya existe: Hx{pac_demo.num_historial}")

        # Segundo paciente para variedad
        result = await session.execute(
            select(Paciente).where(Paciente.nombre == "Carmen", Paciente.apellidos == "Ruiz Blanco")
        )
        pac2 = result.scalar_one_or_none()
        if not pac2:
            campos2 = await cifrar_campos_paciente(
                session,
                {"dni_nie": "87654321B", "telefono": "655443322", "email": "carmen@ejemplo.com"},
            )
            pac2 = Paciente(
                nombre="Carmen",
                apellidos="Ruiz Blanco",
                fecha_nacimiento=date(1990, 3, 22),
                ciudad="Madrid", provincia="Madrid",
                activo=True,
                **campos2,
            )
            session.add(pac2)
            await session.flush()
            print(f"✓ Paciente 2: {pac2.apellidos}, {pac2.nombre}")

        # ── Historial clínico rico del paciente demo ──────────────────
        result = await session.execute(
            select(HistorialClinico).where(HistorialClinico.paciente_id == pac_demo.id)
        )
        hist_existente = result.scalars().all()

        if not hist_existente:
            historial_entries = [
                # Hace 2 años
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["RV01"].id,
                    doctor_id=doc1.id, fecha=hoy - timedelta(days=730),
                    observaciones="Primera visita. Exploración completa."),
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["PANO"].id,
                    doctor_id=doc1.id, fecha=hoy - timedelta(days=729),
                    observaciones="Panorámica inicial. Bruxismo moderado."),
                # Hace 18 meses — Ortodoncia
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["OR01"].id,
                    doctor_id=doc2.id, fecha=hoy - timedelta(days=545),
                    observaciones="Estudio ortodóncico completo. Indicación de tratamiento."),
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["OR02"].id,
                    doctor_id=doc2.id, fecha=hoy - timedelta(days=500),
                    observaciones="Colocación de brackets. Arcada superior e inferior."),
                # Controles mensuales ortodoncia
                *[HistorialClinico(
                    paciente_id=pac_demo.id, tratamiento_id=tratas["OR03"].id,
                    doctor_id=doc2.id, fecha=hoy - timedelta(days=500 - i*30),
                    observaciones=f"Control mensual ortodoncia. Mes {i+1}. Progreso correcto.")
                  for i in range(12)],
                # Hace 1 año — Empastes
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["EM02"].id,
                    doctor_id=doc1.id, pieza_dental=16, caras="MO",
                    fecha=hoy - timedelta(days=365),
                    observaciones="Caries interproximal. Empaste composite clase II."),
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["EM01"].id,
                    doctor_id=doc1.id, pieza_dental=26, caras="O",
                    fecha=hoy - timedelta(days=360),
                    observaciones="Pequeña caries oclusal. Empaste preventivo."),
                # Endodoncia
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["XRAY"].id,
                    doctor_id=doc1.id, pieza_dental=36,
                    fecha=hoy - timedelta(days=280),
                    observaciones="Radiografía diagnóstica. Lesión periapical evidente."),
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["EN02"].id,
                    doctor_id=doc1.id, pieza_dental=36,
                    fecha=hoy - timedelta(days=275),
                    observaciones="Endodoncia birradicular. Conductometría: 22mm / 21mm. Condensación lateral."),
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["PR01"].id,
                    doctor_id=doc1.id, pieza_dental=36,
                    fecha=hoy - timedelta(days=260),
                    observaciones="Corona de porcelana sobre diente endodonciado."),
                # Periodoncia
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["PE02"].id,
                    doctor_id=doc1.id, fecha=hoy - timedelta(days=180),
                    observaciones="Sondaje completo. Bolsas 3-4mm sector anterior. Índice de placa elevado."),
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["LI01"].id,
                    doctor_id=doc1.id, fecha=hoy - timedelta(days=175),
                    observaciones="Limpieza profunda con ultrasonidos. Instrucciones de higiene."),
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["PE01"].id,
                    doctor_id=doc1.id, fecha=hoy - timedelta(days=170),
                    observaciones="Raspado y alisado radicular cuadrante inferior derecho."),
                # Cirugía — extracción cordal
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["EX03"].id,
                    doctor_id=doc3.id, pieza_dental=18,
                    fecha=hoy - timedelta(days=90),
                    observaciones="Extracción cordal superior derecho. Semierupcionado. Sutura 3 puntos."),
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["EX03"].id,
                    doctor_id=doc3.id, pieza_dental=28,
                    fecha=hoy - timedelta(days=87),
                    observaciones="Extracción cordal superior izquierdo. Sin complicaciones."),
                # Reciente
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["OR03"].id,
                    doctor_id=doc2.id, fecha=hoy - timedelta(days=30),
                    observaciones="Control mes 13. Fase de acabado. Resultado excelente."),
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["OR04"].id,
                    doctor_id=doc2.id, fecha=hoy - timedelta(days=7),
                    observaciones="Retenedor fijo superior. Instrucciones de mantenimiento."),
                HistorialClinico(paciente_id=pac_demo.id, tratamiento_id=tratas["RV01"].id,
                    doctor_id=doc1.id, fecha=hoy - timedelta(days=3),
                    observaciones="Revisión de mantenimiento. Todo correcto."),
            ]
            session.add_all(historial_entries)
            print(f"✓ Historial clínico: {len(historial_entries)} entradas")
        else:
            print(f"· Historial ya existe: {len(hist_existente)} entradas")

        # ── Citas esta semana ─────────────────────────────────────────
        citas_def = [
            # Lunes
            dict(paciente_id=pac_demo.id, doctor_id=doc1.id,
                 fecha_hora=dt(lunes, 9, 0), duracion_min=30, estado="confirmada", motivo="Revisión semestral"),
            dict(paciente_id=pac2.id, doctor_id=doc1.id,
                 fecha_hora=dt(lunes, 9, 30), duracion_min=60, estado="programada", motivo="Empaste molar"),
            dict(paciente_id=pac_demo.id, doctor_id=doc2.id,
                 fecha_hora=dt(lunes, 10, 0), duracion_min=30, estado="en_clinica", motivo="Control ortodoncia"),
            dict(paciente_id=pac2.id, doctor_id=doc3.id,
                 fecha_hora=dt(lunes, 11, 0), duracion_min=60, estado="programada", motivo="Valoración implante"),
            dict(paciente_id=pac_demo.id, doctor_id=doc4.id,
                 fecha_hora=dt(lunes, 9, 0), duracion_min=40, estado="programada", motivo="Revisión endodoncia 36"),
            # Lunes urgencia
            dict(paciente_id=pac2.id, doctor_id=doc1.id,
                 fecha_hora=dt(lunes, 14, 0), duracion_min=20, estado="programada",
                 motivo="Dolor agudo", es_urgencia=True),
            # Martes
            dict(paciente_id=pac_demo.id, doctor_id=doc1.id,
                 fecha_hora=dt(lunes + timedelta(1), 10, 0), duracion_min=30, estado="programada",
                 motivo="Limpieza"),
            dict(paciente_id=pac2.id, doctor_id=doc2.id,
                 fecha_hora=dt(lunes + timedelta(1), 11, 0), duracion_min=30, estado="programada",
                 motivo="Brackets revisión"),
            dict(paciente_id=pac_demo.id, doctor_id=doc3.id,
                 fecha_hora=dt(lunes + timedelta(1), 9, 0), duracion_min=90, estado="programada",
                 motivo="Colocación implante 46"),
            # Miércoles
            dict(paciente_id=pac2.id, doctor_id=doc1.id,
                 fecha_hora=dt(lunes + timedelta(2), 9, 0), duracion_min=30, estado="programada",
                 motivo="Control postoperatorio"),
            dict(paciente_id=pac_demo.id, doctor_id=doc4.id,
                 fecha_hora=dt(lunes + timedelta(2), 10, 30), duracion_min=60, estado="programada",
                 motivo="Endodoncia molar"),
            # Jueves
            dict(paciente_id=pac_demo.id, doctor_id=doc2.id,
                 fecha_hora=dt(lunes + timedelta(3), 9, 0), duracion_min=30, estado="programada",
                 motivo="Control final ortodoncia"),
            # Pasadas
            dict(paciente_id=pac_demo.id, doctor_id=doc1.id,
                 fecha_hora=dt(hoy - timedelta(3), 9, 0), duracion_min=30, estado="atendida",
                 motivo="Revisión general"),
            dict(paciente_id=pac2.id, doctor_id=doc1.id,
                 fecha_hora=dt(hoy - timedelta(7), 10, 0), duracion_min=20, estado="falta",
                 motivo="Limpieza — no acudió"),
        ]

        citas_creadas = 0
        for cd in citas_def:
            result = await session.execute(
                select(Cita).where(
                    Cita.paciente_id == cd["paciente_id"],
                    Cita.doctor_id == cd["doctor_id"],
                    Cita.fecha_hora == cd["fecha_hora"],
                )
            )
            if not result.scalar_one_or_none():
                session.add(Cita(**cd))
                citas_creadas += 1

        await session.flush()
        print(f"✓ Citas esta semana: {citas_creadas} nuevas")

        # ── Cola Telefonear ───────────────────────────────────────────
        result = await session.execute(select(Cita).where(Cita.estado == "falta").limit(1))
        cita_falta = result.scalar_one_or_none()
        if cita_falta:
            result = await session.execute(
                select(CitaTelefonear).where(CitaTelefonear.cita_original_id == cita_falta.id)
            )
            if not result.scalar_one_or_none():
                session.add(CitaTelefonear(
                    cita_original_id=cita_falta.id,
                    paciente_id=cita_falta.paciente_id,
                    doctor_id=cita_falta.doctor_id,
                    motivo="Falta — " + cita_falta.fecha_hora.strftime("%d/%m/%Y %H:%M"),
                    reubicada=False,
                ))
                print("✓ Entrada en lista Telefonear")

        # ── Presupuesto rico ──────────────────────────────────────────
        result = await session.execute(
            select(Presupuesto).where(Presupuesto.paciente_id == pac_demo.id)
        )
        if not result.scalar_one_or_none():
            pres = Presupuesto(
                paciente_id=pac_demo.id,
                fecha=hoy - timedelta(60),
                estado="aceptado",
                doctor_id=doc3.id,
                pie_pagina="Presupuesto válido 3 meses. Precios sin financiación.",
            )
            session.add(pres)
            await session.flush()

            lineas = [
                PresupuestoLinea(presupuesto_id=pres.id, tratamiento_id=tratas["IM01"].id,
                    pieza_dental=46, precio_unitario=950.00, aceptado=True),
                PresupuestoLinea(presupuesto_id=pres.id, tratamiento_id=tratas["IM02"].id,
                    pieza_dental=46, precio_unitario=600.00, aceptado=True),
                PresupuestoLinea(presupuesto_id=pres.id, tratamiento_id=tratas["EX01"].id,
                    pieza_dental=47, precio_unitario=60.00, aceptado=False),
            ]
            session.add_all(lineas)
            print("✓ Presupuesto de implante con 3 líneas")

        await session.commit()
        print()
        print("=" * 60)
        print("Seed completado correctamente")
        print()
        print("Credenciales:")
        print("  Admin:     admin / admin1234")
        print("  Doctor:    doctor / doctor123")
        print("  Recepción: recepcion / recep123")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed())
