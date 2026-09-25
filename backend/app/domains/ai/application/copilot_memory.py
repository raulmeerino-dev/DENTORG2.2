"""Bounded references for follow-ups, without replaying clinical tool payloads."""

REFERENCE_FIELDS = {
    "patients": ("id", "name", "history_number"),
    "professionals": ("id", "label", "name"),
    "treatments": ("id", "nombre", "codigo"),
    "appointments": ("id", "paciente_id", "patient", "doctor_id", "professional", "fecha_hora", "motivo"),
}


def remember_references(state, result):
    references = state.setdefault("references", {})
    for kind, fields in REFERENCE_FIELDS.items():
        rows = result.get(kind)
        if not isinstance(rows, list):
            continue
        # Preserve result order for explicit follow-ups such as "el segundo".
        references[kind] = [
            {key: row[key][:160] if isinstance(row[key], str) else row[key]
             for key in fields if key in row and isinstance(row[key], (str, int))}
            for row in rows[:8] if isinstance(row, dict) and row.get("id")
        ]
    state["references"] = references


def prompt_references(state):
    # Data, not authority: every subsequent tool still checks role, clinic and record.
    known = set(state["known"])
    return {
        kind: [row for row in rows if row.get("id") in known]
        for kind, rows in state.get("references", {}).items()
        if kind in REFERENCE_FIELDS
    }
