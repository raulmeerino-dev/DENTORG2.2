"""
Script para poblar la BD con datos de demostración realistas.
Ejecutar desde backend/:
    python scripts/seed_data.py

Crea: 3 gabinetes, 5 pacientes adicionales, citas esta semana,
historial clínico, presupuesto con líneas, entrada en telefonear.
"""
import asyncio
import sys
from pathlib import Path
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.core.crypto import cifrar_campos_paciente
from app.models.gabinete import Gabinete
from app.models.paciente import Paciente
from app.models.cita import Cita, CitaTelefonear
from app.models.historial import HistorialClinico
from app.models.presupuesto import Presupuesto, PresupuestoLinea
from app.models.doctor import Doctor
from app.models.tratamiento import TratamientoCatalogo


async def seed():
    async with AsyncSessionLocal() as session:

        # ── Doctores ─────────────────────────────────────────────────────────
        result = await session.execute(select(Doctor).where(Doctor.activo == True))
        doctores = result.scalars().all()
        if len(doctores) < 3:
            print("ERROR: Se necesitan al menos 3 doctores.")
            return
        doc1, doc2, doc3 = doctores[0], doctores[1], doctores[2]
        print(f"Doctores: {doc1.nombre} | {doc2.nombre} | {doc3.nombre}")

        # ── Tratamientos ─────────────────────────────────────────────────────
        result = await session.execute(
            select(TratamientoCatalogo).where(TratamientoCatalogo.activo == True)
        )
        tratamientos = result.scalars().all()
        trat1 = tratamientos[0] if tratamientos else None
        trat2 = tratamientos[1] if len(tratamientos) > 1 else trat1

        # ── Gabinetes ─────────────────────────────────────────────────────────
        result = await session.execute(select(Gabinete))
        if not result.scalars().all():
            session.add_all([
                Gabinete(nombre="Gabinete 1", activo=True),
                Gabinete(nombre="Gabinete 2", activo=True),
                Gabinete(nombre="Gabinete 3", activo=True),
            ])
            await session.flush()
            print("Gabinetes 1-3 creados")
        else:
            print("Gabinetes ya existen")

        # ── Pacientes ─────────────────────────────────────────────────────────
        pacientes_raw = [
            dict(nombre="María",   apellidos="García López",       fecha_nacimiento=date(1975, 3, 22),
                 dni_nie="87654321B", telefono="698765432", email="maria@example.com",
                 ciudad="Madrid",    provincia="Madrid"),
            dict(nombre="Carlos",  apellidos="Rodríguez Martín",   fecha_nacimiento=date(1990, 11, 8),
                 dni_nie="11223344C", telefono="655443322", email="carlos@example.com",
                 ciudad="Madrid",    provincia="Madrid"),
            dict(nombre="Ana",     apellidos="Fernández Sánchez",  fecha_nacimiento=date(1965, 7, 14),
                 dni_nie="44332211D", telefono="677889900",
                 ciudad="Madrid",    provincia="Madrid"),
            dict(nombre="Pedro",   apellidos="López Torres",       fecha_nacimiento=date(1988, 1, 30),
                 dni_nie="55667788E", telefono="612998877",
                 ciudad="Alcalá de Henares", provincia="Madrid"),
            dict(nombre="Elena",   apellidos="Martínez Cruz",      fecha_nacimiento=date(2000, 9, 5),
                 dni_nie="99887766F", telefono="634567890",
                 ciudad="Móstoles", provincia="Madrid"),
        ]

        todos_pacientes: list[Paciente] = []
        # Incluir pacientes ya existentes
        result = await session.execute(select(Paciente).where(Paciente.activo == True))
        todos_pacientes.extend(result.scalars().all())

        for pd in pacientes_raw:
            result = await session.execute(
                select(Paciente).where(
                    Paciente.nombre == pd["nombre"],
                    Paciente.apellidos == pd["apellidos"],
                )
            )
            if result.scalar_one_or_none():
                continue

            # Cifrar campos sensibles
            campos_cifrados = await cifrar_campos_paciente(
                session,
                {
                    "dni_nie":   pd.pop("dni_nie", None),
                    "telefono":  pd.pop("telefono", None),
                    "telefono2": pd.pop("telefono2", None),
                    "email":     pd.pop("email", None),
                },
            )
            p = Paciente(**pd, **campos_cifrados, activo=True)
            session.add(p)
            await session.flush()
            todos_pacientes.append(p)
            print(f"  + Paciente: {p.apellidos}, {p.nombre}")

        # Actualizar lista con todos los activos
        result = await session.execute(select(Paciente).where(Paciente.activo == True))
        todos_pacientes = result.scalars().all()
        print(f"Total pacientes activos: {len(todos_pacientes)}")

        # ── Citas ─────────────────────────────────────────────────────────────
        hoy = date.today()
        lunes = hoy - timedelta(days=hoy.weekday())

        def dt(d: date, h: int, m: int) -> datetime:
            return datetime(d.year, d.month, d.day, h, m, tzinfo=timezone.utc)

        p = todos_pacientes  # alias corto

        citas_def = [
            # Hoy (lunes de esta semana)
            dict(paciente_id=p[0].id, doctor_id=doc1.id, fecha_hora=dt(lunes, 9, 0),
                 duracion_min=30, estado="confirmada",  motivo="Revisión general"),
            dict(paciente_id=p[1 % len(p)].id, doctor_id=doc1.id, fecha_hora=dt(lunes, 9, 30),
                 duracion_min=20, estado="programada",  motivo="Extracción"),
            dict(paciente_id=p[2 % len(p)].id, doctor_id=doc2.id, fecha_hora=dt(lunes, 10, 0),
                 duracion_min=40, estado="en_clinica",  motivo="Ortodoncia control"),
            dict(paciente_id=p[3 % len(p)].id, doctor_id=doc2.id, fecha_hora=dt(lunes, 11, 0),
                 duracion_min=20, estado="programada",  motivo="Limpieza"),
            dict(paciente_id=p[4 % len(p)].id, doctor_id=doc3.id, fecha_hora=dt(lunes, 9, 0),
                 duracion_min=50, estado="programada",  motivo="Empaste"),
            dict(paciente_id=p[4 % len(p)].id, doctor_id=doc1.id, fecha_hora=dt(lunes, 12, 30),
                 duracion_min=20, estado="programada",  motivo="Dolor muela", es_urgencia=True),
            # Martes
            dict(paciente_id=p[0].id, doctor_id=doc1.id, fecha_hora=dt(lunes + timedelta(1), 10, 0),
                 duracion_min=30, estado="programada",  motivo="Endodoncia"),
            dict(paciente_id=p[1 % len(p)].id, doctor_id=doc3.id, fecha_hora=dt(lunes + timedelta(1), 11, 30),
                 duracion_min=20, estado="programada",  motivo="Revisión"),
            # Miércoles
            dict(paciente_id=p[2 % len(p)].id, doctor_id=doc2.id, fecha_hora=dt(lunes + timedelta(2), 9, 0),
                 duracion_min=60, estado="programada",  motivo="Implante"),
            dict(paciente_id=p[3 % len(p)].id, doctor_id=doc3.id, fecha_hora=dt(lunes + timedelta(2), 10, 0),
                 duracion_min=20, estado="programada",  motivo="Consulta"),
            # Jueves
            dict(paciente_id=p[0].id, doctor_id=doc2.id, fecha_hora=dt(lunes + timedelta(3), 9, 30),
                 duracion_min=30, estado="programada",  motivo="Revisión ortodoncia"),
            # Cita pasada atendida
            dict(paciente_id=p[0].id, doctor_id=doc1.id,
                 fecha_hora=dt(hoy - timedelta(3), 9, 0),
                 duracion_min=30, estado="atendida",    motivo="Empaste completado"),
            # Cita pasada con falta
            dict(paciente_id=p[3 % len(p)].id, doctor_id=doc1.id,
                 fecha_hora=dt(hoy - timedelta(7), 10, 0),
                 duracion_min=20, estado="falta",       motivo="Limpieza"),
        ]

        citas_nuevas = []
        for cd in citas_def:
            result = await session.execute(
                select(Cita).where(
                    Cita.paciente_id == cd["paciente_id"],
                    Cita.doctor_id  == cd["doctor_id"],
                    Cita.fecha_hora == cd["fecha_hora"],
                )
            )
            if not result.scalar_one_or_none():
                cita = Cita(**cd)
                session.add(cita)
                citas_nuevas.append(cita)

        await session.flush()
        print(f"Citas nuevas creadas: {len(citas_nuevas)}")

        # ── Historial clínico ─────────────────────────────────────────────────
        if trat1 and len(todos_pacientes) >= 1:
            result = await session.execute(
                select(HistorialClinico).where(HistorialClinico.paciente_id == todos_pacientes[0].id)
            )
            if not result.scalars().all():
                entradas = [
                    HistorialClinico(
                        paciente_id=todos_pacientes[0].id,
                        tratamiento_id=trat1.id, doctor_id=doc1.id,
                        pieza_dental=16, caras="MOD",
                        fecha=hoy - timedelta(30),
                        observaciones="Obturación clase II",
                    ),
                    HistorialClinico(
                        paciente_id=todos_pacientes[0].id,
                        tratamiento_id=(trat2 or trat1).id, doctor_id=doc1.id,
                        pieza_dental=26,
                        fecha=hoy - timedelta(10),
                        observaciones="Extracción sin complicaciones",
                    ),
                ]
                if len(todos_pacientes) > 1:
                    entradas.append(HistorialClinico(
                        paciente_id=todos_pacientes[1].id,
                        tratamiento_id=trat1.id, doctor_id=doc2.id,
                        pieza_dental=46, caras="O",
                        fecha=hoy - timedelta(5),
                    ))
                session.add_all(entradas)
                print(f"Historial clínico: {len(entradas)} entradas")

        # ── Cola Telefonear ───────────────────────────────────────────────────
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
                    motivo="No acudió — " + cita_falta.fecha_hora.strftime("%d/%m/%Y"),
                    reubicada=False,
                ))
                print("Entrada en telefonear creada")

        # ── Presupuesto con líneas ────────────────────────────────────────────
        if trat1 and len(todos_pacientes) > 1:
            pac2 = todos_pacientes[1]
            result = await session.execute(
                select(Presupuesto).where(Presupuesto.paciente_id == pac2.id)
            )
            if not result.scalar_one_or_none():
                pres = Presupuesto(
                    paciente_id=pac2.id,
                    fecha=date.today(),
                    estado="presentado",
                    doctor_id=doc2.id,
                )
                session.add(pres)
                await session.flush()
                session.add_all([
                    PresupuestoLinea(
                        presupuesto_id=pres.id, tratamiento_id=trat1.id,
                        pieza_dental=36, precio_unitario=trat1.precio, aceptado=True,
                    ),
                    PresupuestoLinea(
                        presupuesto_id=pres.id,
                        tratamiento_id=(trat2 or trat1).id,
                        pieza_dental=46, precio_unitario=(trat2 or trat1).precio, aceptado=False,
                    ),
                ])
                print("Presupuesto con 2 líneas creado")

        await session.commit()
        print("\nSeed completado correctamente")


if __name__ == "__main__":
    asyncio.run(seed())
