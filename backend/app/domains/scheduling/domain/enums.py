from enum import StrEnum


class EstadoCita(StrEnum):
    programada = "programada"
    confirmada = "confirmada"
    en_clinica = "en_clinica"
    en_atencion = "en_atencion"
    atendida = "atendida"
    falta = "falta"
    anulada = "anulada"
    pending_confirmation = "pending_confirmation"
    confirmed = "confirmed"
    reminder_sent = "reminder_sent"
    reschedule_requested = "reschedule_requested"
    cancelled_by_patient = "cancelled_by_patient"
    pending_manual_review = "pending_manual_review"
    rescheduled = "rescheduled"
