"""Human appointment states, independently of messaging delivery flags."""

PRE_VISIT_STATES = frozenset(
    {
        "programada",
        "confirmada",
        "pending_confirmation",
        "confirmed",
        "reminder_sent",
        "reschedule_requested",
        "pending_manual_review",
        "rescheduled",
    }
)
BLOCKING_STATES = (*PRE_VISIT_STATES, "en_clinica", "en_atencion")


def operational_state(estado: str, *, confirmed: bool = False) -> str:
    return {
        "confirmada": "confirmada",
        "confirmed": "confirmada",
        "en_clinica": "en_sala",
        "en_atencion": "en_atencion",
        "atendida": "finalizada",
        "anulada": "cancelada",
        "cancelled_by_patient": "cancelada",
        "falta": "no_presentado",
    }.get(estado, "confirmada" if confirmed and estado in PRE_VISIT_STATES else "programada")
