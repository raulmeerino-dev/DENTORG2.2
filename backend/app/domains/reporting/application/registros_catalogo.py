"""Semantic catalog: a closed vocabulary, never model-generated SQL."""
from fastapi import HTTPException

from app.core.permissions import BILLING_ROLES, CLINICAL_DATA_ROLES, STAFF_ROLES, TokenData
from app.domains.clinical.domain.document_access import (
    ADMIN_DOCUMENT_TYPES,
    FINANCIAL_DOCUMENT_TYPES,
)
from app.domains.laboratory.persistence.laboratorio import ESTADOS_TRABAJO_LAB
from app.domains.reporting.schemas.registros import (
    RegistroColumn,
    RegistroOption,
    RegistroSort,
    RegistroView,
)

PATIENT = ["paciente_id", "doctor_id", "clinica_id"]
DATES = ["fecha_desde", "fecha_hasta"]
MONEY = ["importe_min", "importe_max"]
BALANCE = ["saldo_min", "saldo_max"]

LABELS = {
    "fecha": ("Fecha", "date"), "paciente": ("Paciente", "text"),
    "historia": ("Historia", "number"), "clinica": ("Clínica", "text"),
    "profesional": ("Profesional / origen", "text"), "concepto": ("Concepto", "text"),
    "tipo": ("Tipo", "text"), "estado": ("Estado", "status"),
    "importe": ("Importe", "money"), "saldo": ("Saldo", "money"),
    "numero": ("Referencia", "text"), "pieza": ("Pieza", "number"),
    "stock": ("Existencias", "number"), "minimo": ("Mínimo", "number"),
    "facturado": ("Facturado", "money"), "cobrado": ("Cobrado y anticipos", "money"),
}


def _options(values):
    return [RegistroOption(value=value, label=label) for value, label in values]


def _view(id, label, columns, filters, states=(), types=(), **kwargs):
    return RegistroView(
        id=id, label=label,
        columns=[RegistroColumn(key=key, label=LABELS[key][0], type=LABELS[key][1]) for key in columns.split()],
        filters=["q", *filters], states=_options(states), types=_options(types),
        default_sort=RegistroSort(by="fecha" if "fecha" in columns.split() else "paciente"), **kwargs,
    )


ACTIVE = [("activo", "Activo"), ("inactivo", "Inactivo")]
CITAS = [("programada", "Programada"), ("confirmada", "Confirmada"), ("en_clinica", "En sala"), ("en_atencion", "En atención"), ("atendida", "Finalizada"), ("falta", "No presentado"), ("anulada", "Anulada"), ("pending_confirmation", "Pendiente de confirmar"), ("confirmed", "Confirmada por paciente"), ("reminder_sent", "Recordatorio enviado"), ("reschedule_requested", "Cambio solicitado"), ("cancelled_by_patient", "Cancelada por paciente"), ("pending_manual_review", "Revisión manual"), ("rescheduled", "Reprogramada")]
DOC_TYPES = [("historia_medica", "Historia médica"), ("radiografia", "Radiografía"), ("cbct", "CBCT"), ("escaner", "Escáner"), ("fotografia_intraoral", "Fotografía intraoral"), ("fotografia_extraoral", "Fotografía extraoral"), ("informe", "Informe"), ("circular", "Circular"), ("implante", "Implante"), ("consentimiento", "Consentimiento"), ("presupuesto", "Presupuesto"), ("factura", "Factura"), ("receta", "Receta"), ("otro", "Otro")]
LAB_STATE_LABELS = {
    "pending_to_send": "Pendiente de envío", "sent_to_lab": "Enviado al laboratorio",
    "in_progress_at_lab": "En fabricación", "ready_at_lab": "Listo en laboratorio",
    "received_in_clinic": "Recibido en clínica", "checked_in_clinic": "Revisado en clínica",
    "tried_in_patient": "Probado en paciente", "delivered_or_placed": "Entregado o colocado",
    "returned_to_lab": "Devuelto al laboratorio", "remake_required": "Requiere repetición",
    "delayed": "Retrasado", "cancelled": "Cancelado",
}

VIEWS = {
    view.id: view for view in [
        _view("actividad", "Actividad", "fecha paciente historia tipo concepto profesional estado clinica", [*DATES, *PATIENT, "tipo", "estado", "tratamiento_id"], types=[("cita", "Cita"), ("plan", "Plan"), ("realizado", "Tratamiento realizado"), ("factura", "Factura"), ("cobro", "Cobro"), ("anticipo", "Anticipo"), ("documento", "Documento"), ("consentimiento", "Consentimiento"), ("receta", "Receta"), ("laboratorio", "Laboratorio")]),
        _view("pacientes", "Pacientes", "historia paciente profesional fecha estado clinica", [*DATES, *PATIENT, "estado"], states=ACTIVE, date_label="Fecha de alta"),
        _view("citas", "Citas", "fecha paciente historia concepto profesional estado clinica", [*DATES, *PATIENT, "estado", "tratamiento_id"], states=CITAS, date_label="Fecha de cita"),
        _view("tratamientos", "Tratamientos pendientes", "fecha paciente historia concepto pieza profesional estado clinica", [*DATES, *PATIENT, "estado", "tratamiento_id"], states=[("pendiente", "Pendiente"), ("realizado", "Realizado")], date_label="Incorporación al trabajo pendiente"),
        _view("planes", "Planes y presupuestos", "numero fecha paciente historia profesional estado clinica", [*DATES, *PATIENT, "estado", "tratamiento_id"], states=[(v, v.capitalize()) for v in ["borrador", "presentado", "aceptado", "parcial", "rechazado", "caducado", "facturado"]]),
        _view("realizados", "Tratamientos realizados", "fecha paciente historia concepto pieza profesional estado clinica", [*DATES, *PATIENT, "estado", "tratamiento_id"], states=[("realizado", "Realizado"), ("anulado", "Anulado")]),
        _view("facturas", "Facturación", "numero fecha paciente historia tipo estado importe saldo clinica", [*DATES, "paciente_id", "clinica_id", "tipo", "estado", *MONEY, *BALANCE], states=[(v,v.capitalize()) for v in ["borrador", "emitida", "parcial", "cobrada", "pagada", "anulada"]], types=[("paciente", "Paciente"), ("iguala", "Iguala"), ("entidad", "Entidad")]),
        _view("cobros", "Cobros y anticipos", "fecha paciente historia numero concepto profesional tipo estado importe clinica", [*DATES, "paciente_id", "clinica_id", "tipo", "estado", *MONEY], states=[("vigente", "Vigente"), ("anulado", "Anulado")], types=[("cobro", "Cobro de factura"), ("anticipo", "Anticipo")]),
        _view("saldos", "Saldos y deudas", "historia paciente profesional facturado cobrado saldo estado clinica", [*PATIENT, "estado", *BALANCE], states=[("deuda", "Con deuda"), ("a_favor", "A favor"), ("saldado", "Saldado")], date_label="Saldo actual"),
        _view("documentos", "Archivos del paciente", "fecha paciente historia tipo concepto profesional estado clinica", [*DATES, *PATIENT, "tipo", "estado", "tratamiento_id"], states=[(v, v.replace("_", " ").capitalize()) for v in ["disponible", "pendiente_firma", "firmado", "revocado", "borrador", "emitida_local", "enviada_proveedor", "certificada", "rechazada", "anulada", "dispensada"]], types=DOC_TYPES, group="files", date_label="Fecha del documento"),
        _view("laboratorio", "Laboratorio", "numero fecha paciente historia concepto profesional estado clinica", [*DATES, *PATIENT, "tipo", "estado", "tratamiento_id"], states=[(state, LAB_STATE_LABELS.get(state, state.replace("_", " ").capitalize())) for state in ESTADOS_TRABAJO_LAB], date_label="Fecha de alta del encargo"),
        _view("inventario", "Inventario", "numero concepto tipo stock minimo importe estado clinica", ["clinica_id", "tipo", "estado", *MONEY], states=[("bajo_minimo", "Necesita pedir"), ("correcto", "Correcto"), ("inactivo", "Inactivo")], date_label="Existencias actuales"),
        _view("auditoria", "Auditoría", "fecha profesional tipo concepto estado clinica", [*DATES, "clinica_id", "tipo", "estado"], date_label="Fecha del evento"),
    ]
}
VIEWS["inventario"].default_sort.by = "concepto"


def view_for_user(view_id: str, user: TokenData) -> RegistroView:
    if user.rol not in STAFF_ROLES:
        raise HTTPException(403, "Acceso reservado al personal de la clínica")
    if view_id not in VIEWS:
        raise HTTPException(404, "Vista de registros no encontrada")
    if (view_id in {"facturas", "cobros", "saldos"} and user.rol not in BILLING_ROLES
        or view_id in {"tratamientos", "realizados", "laboratorio"} and user.rol not in CLINICAL_DATA_ROLES
        or view_id in {"inventario", "auditoria"} and user.rol != "admin"):
        raise HTTPException(403, "Su rol no permite consultar esta vista")
    view = VIEWS[view_id].model_copy(deep=True)
    if view_id in {"actividad", "citas", "auditoria"}:
        next(column for column in view.columns if column.key == "fecha").type = "datetime"
    if view_id == "auditoria":
        next(column for column in view.columns if column.key == "estado").label = "Acción"
    if user.rol in BILLING_ROLES and view_id == "planes":
        view.columns.append(RegistroColumn(key="importe", label="Importe", type="money"))
        view.filters.extend(MONEY)
    if user.rol not in CLINICAL_DATA_ROLES:
        if view_id == "documentos":
            view.types = [opt for opt in view.types if opt.value in ADMIN_DOCUMENT_TYPES]
            view.states = _options([("disponible", "Disponible")])
            view.filters.remove("tratamiento_id")
        if view_id == "actividad":
            view.types = [opt for opt in view.types if opt.value in {"cita", "plan", "factura", "cobro", "anticipo", "documento"}]
    elif user.rol not in BILLING_ROLES and view_id == "actividad":
        view.types = [opt for opt in view.types if opt.value not in {"factura", "cobro", "anticipo"}]
    if view_id == "documentos" and user.rol not in BILLING_ROLES:
        view.types = [opt for opt in view.types if opt.value not in FINANCIAL_DOCUMENT_TYPES]
    if view_id == "actividad":
        sources = ["citas", "planes", "documentos"]
        if user.rol in CLINICAL_DATA_ROLES:
            sources += ["realizados", "laboratorio"]
        if user.rol in BILLING_ROLES:
            sources += ["facturas", "cobros"]
        states = {option.value: option for source in sources for option in view_for_user(source, user).states}
        view.states = list(states.values())
    return view


def catalog_for_user(user: TokenData) -> list[RegistroView]:
    views = []
    for view_id in VIEWS:
        try:
            views.append(view_for_user(view_id, user))
        except HTTPException as error:
            if error.status_code != 403:
                raise
    if not views:
        raise HTTPException(403, "No tiene acceso a registros")
    return views
