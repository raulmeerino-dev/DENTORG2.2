from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cita import Cita
from app.models.notificacion import DoctorNotification
from app.models.paciente import Paciente

PATIENT_WAITING_NOTIFICATION = "patient_waiting_room"


def patient_full_name(paciente: Paciente | None) -> str:
    if not paciente:
        return "Paciente"
    return f"{paciente.nombre} {paciente.apellidos}".strip()


async def create_patient_waiting_notification(
    db: AsyncSession,
    cita: Cita,
) -> DoctorNotification | None:
    existing = await db.execute(
        select(DoctorNotification).where(
            DoctorNotification.recipient_doctor_id == cita.doctor_id,
            DoctorNotification.appointment_id == cita.id,
            DoctorNotification.type == PATIENT_WAITING_NOTIFICATION,
        )
    )
    if existing.scalar_one_or_none():
        return None

    paciente = cita.paciente or await db.get(Paciente, cita.paciente_id)
    nombre_paciente = patient_full_name(paciente)
    notification = DoctorNotification(
        recipient_doctor_id=cita.doctor_id,
        appointment_id=cita.id,
        patient_id=cita.paciente_id,
        clinica_id=cita.clinica_id,
        title="Paciente en sala de espera",
        message=f"El paciente {nombre_paciente} ya está en sala de espera.",
        type=PATIENT_WAITING_NOTIFICATION,
    )
    db.add(notification)
    return notification
