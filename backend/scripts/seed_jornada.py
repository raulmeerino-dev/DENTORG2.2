"""Dense, repeatable Jornada fixture for an explicitly isolated local test DB.

Run ``python -m scripts.seed_demo`` first, then ``python -m scripts.seed_jornada``.
No messages, invoices or external providers are invoked. Existing rows are kept.
"""

import asyncio
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.config import get_settings
from app.core import model_registry  # noqa: F401
from app.core.crypto import cifrar_campos_paciente
from app.database import AsyncSessionLocal
from app.domains.identity.persistence.doctor import Doctor
from app.domains.patients.persistence.paciente import Paciente
from app.domains.scheduling.persistence.cita import Cita, CitaCambio
from app.domains.scheduling.persistence.gabinete import Gabinete
from app.domains.scheduling.persistence.horario import HorarioDoctor


async def seed() -> None:
    settings = get_settings()
    target = make_url(settings.database_url)
    if settings.environment != "development" or target.host not in {"localhost", "127.0.0.1"} or not (target.database or "").endswith("_test"):
        raise ValueError("La demo densa solo admite una BD local de desarrollo con sufijo _test")

    clinic_zone = ZoneInfo(settings.clinic_timezone)
    today = datetime.now(clinic_zone).date()
    start = datetime.combine(today, time(9), tzinfo=clinic_zone)
    now = datetime.now(timezone.utc)
    names = ["Lucía", "Hugo", "María José", "Álvaro", "Carmen", "Gabriel", "Inés", "Pablo", "Ana María", "Daniel", "Valentina", "Mateo"]
    surnames = ["Fernández de la Torre", "García López", "Sánchez Martín", "Rodríguez Hernández"]
    created = 0
    async with AsyncSessionLocal() as session:
        doctors = list((await session.scalars(select(Doctor).where(Doctor.activo.is_(True)).order_by(Doctor.nombre))).all())
        cabinets = list((await session.scalars(select(Gabinete).where(Gabinete.activo.is_(True)).order_by(Gabinete.nombre))).all())
        if not doctors:
            raise ValueError("Ejecuta primero scripts.seed_demo")
        for doctor in doctors:
            for weekday in range(7):
                existing = await session.scalar(select(HorarioDoctor).where(HorarioDoctor.doctor_id == doctor.id, HorarioDoctor.dia_semana == weekday))
                if existing is None:
                    session.add(HorarioDoctor(doctor_id=doctor.id, dia_semana=weekday, bloques=[{"inicio": "09:00", "fin": "20:00"}], intervalo_min=10))
        for index in range(48):
            doctor = doctors[index % len(doctors)]
            marker = f"Jornada demo {index + 1:02d}"
            patient = await session.scalar(select(Paciente).where(Paciente.observaciones == marker))
            if patient is None:
                encrypted = await cifrar_campos_paciente(session, {"telefono": f"60088{index:04d}"})
                patient = Paciente(nombre=names[index % len(names)], apellidos=surnames[index // 12], observaciones=marker, clinica_id=doctor.clinica_id, activo=True, **encrypted)
                session.add(patient)
                await session.flush()
            scheduled = start + timedelta(minutes=45 * (index // len(doctors)))
            if index == len(doctors):
                scheduled = start + timedelta(minutes=15)
            day_start = start.replace(hour=0)
            appointment = await session.scalar(select(Cita).where(
                Cita.paciente_id == patient.id,
                Cita.fecha_hora >= day_start,
                Cita.fecha_hora < day_start + timedelta(days=1),
            ))
            if appointment is None:
                appointment = Cita(
                    paciente_id=patient.id, doctor_id=doctor.id, clinica_id=doctor.clinica_id,
                    gabinete_id=cabinets[index % len(doctors)].id if index % len(doctors) < len(cabinets) else None,
                    fecha_hora=scheduled, duracion_min=30, estado="programada",
                    motivo=["Revisión y seguimiento periodontal", "Reconstrucción molar 36", "Control de ortodoncia", "Valoración de prótesis y ajuste"][index % 4],
                    es_urgencia=index == len(doctors), solape_urgencia=index == len(doctors),
                )
                if index < 5:
                    appointment.estado = "en_clinica"
                    appointment.llegada_at = now - timedelta(minutes=5 + index * 7)
                elif index < 9:
                    appointment.estado = "en_atencion"
                    appointment.llegada_at = now - timedelta(minutes=55)
                    appointment.atencion_iniciada_at = now - timedelta(minutes=45)
                elif index < 12:
                    appointment.estado = "atendida"
                    appointment.llegada_at = now - timedelta(minutes=75)
                    appointment.atencion_iniciada_at = now - timedelta(minutes=65)
                    appointment.finalizada_at = now - timedelta(minutes=10)
                elif index == 12:
                    appointment.estado = "anulada"
                elif index == 13:
                    appointment.estado = "falta"
                elif index % 4 == 0:
                    appointment.estado = "confirmada"
                session.add(appointment)
                await session.flush()
                session.add(CitaCambio(
                    cita_id=appointment.id, accion="seed_jornada", estado_nuevo=appointment.estado,
                    motivo="Datos sintéticos para revisión visual en una base aislada.",
                    datos={"fixture": marker, "solape_urgencia": appointment.solape_urgencia},
                ))
                created += 1
        await session.commit()
    print(f"Jornada densa preparada: 48 pacientes, {created} citas nuevas para {today}")


if __name__ == "__main__":
    asyncio.run(seed())
