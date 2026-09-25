"""Explicit professional confirmation is enforced by the caller; clinical authority stays here."""

from datetime import datetime

from fastapi import HTTPException

from app.core.audit_log import write_audit_log
from app.core.permissions import ensure_clinic_access
from app.domains.clinical.application.patient_context import (
    current_user_doctor_id,
    get_history_patient_or_404,
)
from app.domains.clinical.persistence.historial import NotaDental
from app.domains.scheduling.application.clinic_time import clinic_datetime
from app.domains.scheduling.persistence.cita import Cita


async def save_note(db, user, request, patient_id, appointment_id, text, tooth):
    if user.rol not in {"admin", "doctor"}:
        raise HTTPException(403, "La nota requiere un profesional autorizado.")
    patient = await get_history_patient_or_404(db, patient_id)
    ensure_clinic_access(user, patient.clinica_id)
    if appointment_id:
        appointment = await db.get(Cita, appointment_id)
        if not appointment or appointment.paciente_id != patient.id:
            raise HTTPException(404, "La cita no corresponde a este paciente.")
        ensure_clinic_access(user, appointment.clinica_id)
    if not text.strip() or len(text) > 4000:
        raise HTTPException(422, "Revisa el texto de la nota.")
    note = NotaDental(
        paciente_id=patient.id,
        doctor_id=await current_user_doctor_id(db, user),
        cita_id=appointment_id,
        pieza_dental=int(tooth) if tooth else None,
        texto=text.strip(),
        fecha=clinic_datetime(datetime.now().astimezone()).date(),
        origen="asistente_confirmado",
    )
    db.add(note)
    await db.flush()
    await write_audit_log(
        db,
        user=user,
        action="CLINICAL_NOTE_CREATED",
        entity_type="nota_dental",
        entity_id=note.id,
        clinica_id=patient.clinica_id,
        new_values={"patient_id": str(patient.id), "origin": "asistente_confirmado"},
        request=request,
    )
    return note.id
