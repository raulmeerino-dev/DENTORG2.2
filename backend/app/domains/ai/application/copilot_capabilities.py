"""Progressive tool disclosure chosen by the model, never by keyword routing."""

BASE_TOOLS = frozenset({"navigate", "search_patients", "search_professionals", "discover_tools"})
TOOL_GROUPS = {
    "agenda": ("Consultar citas, buscar huecos, preparar citas y gestionar llegada/atención/salida", {
        "get_schedule", "find_available_slots", "create_appointment", "reschedule_appointment",
        "cancel_appointment", "mark_arrival", "start_attention", "finish_visit",
    }),
    "clinica": ("Resumir paciente, preparar notas dictadas y registrar tratamientos realizados", {
        "patient_summary", "clinical_note", "search_treatments", "record_performed_treatment",
    }),
    "presupuestos": ("Consultar catálogo y preparar presupuestos con precios reales", {
        "search_treatments", "create_budget",
    }),
    "economia": ("Consultar saldo y preparar cobro de una factura existente", {
        "patient_balance", "payment_methods", "register_payment",
    }),
    "registros": ("Consultar datos, listados, documentos, laboratorio e inventario según permisos", {
        "records_catalog", "search_records",
    }),
}


def groups_for(user, registry):
    return {
        group: {"description": description, "tools": sorted(name for name in names if user.rol in registry[name].roles)}
        for group, (description, names) in TOOL_GROUPS.items()
        if any(user.rol in registry[name].roles for name in names)
    }
