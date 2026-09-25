"""SQL-only read models over canonical tables, without copied records or side effects.

All sources share a fixed internal shape so activity and files can use UNION ALL.
Only the columns declared in the role-aware catalog leave the application layer.
"""
from sqlalchemy import DateTime, Numeric, String, case, cast, func, literal, null, select, union_all

from app.config import get_settings
from app.core.crypto import decrypt_sql_expr
from app.core.permissions import BILLING_ROLES, CLINICAL_DATA_ROLES, TokenData
from app.core.persistence.audit_log import AuditLog
from app.domains.billing.persistence.account_queries import account_totals, invoice_paid
from app.domains.billing.persistence.factura import (
    Cobro,
    Factura,
    FacturaLinea,
    FormaPago,
    PagoAnticipadoPaciente,
)
from app.domains.clinical.domain.document_access import (
    ADMIN_DOCUMENT_TYPES,
    FINANCIAL_DOCUMENT_TYPES,
)
from app.domains.clinical.persistence.consentimiento import Consentimiento
from app.domains.clinical.persistence.documento import DocumentoPaciente
from app.domains.clinical.persistence.historial import HistorialClinico
from app.domains.clinical.persistence.receta import RecetaClinica
from app.domains.clinical.persistence.tratamiento import TratamientoCatalogo
from app.domains.identity.persistence.clinica import Clinica
from app.domains.identity.persistence.doctor import Doctor
from app.domains.identity.persistence.usuario import Usuario
from app.domains.inventory.persistence.inventario import Producto
from app.domains.laboratory.persistence.laboratorio import TrabajoLaboratorio
from app.domains.patients.persistence.paciente import Paciente
from app.domains.scheduling.persistence.cita import Cita
from app.domains.treatment_plans.persistence.presupuesto import (
    Presupuesto,
    PresupuestoLinea,
    TrabajoPendiente,
)

KEYS = (
    "id", "kind", "patient_id", "clinic_id", "doctor_id", "treatment_id", "fecha", "instant",
    "paciente", "historia", "clinica", "profesional", "concepto", "tipo", "estado",
    "importe", "saldo", "numero", "pieza", "stock", "minimo", "facturado", "cobrado", "search",
)
NUMERIC_KEYS = {"importe", "saldo", "pieza", "stock", "minimo", "historia", "facturado", "cobrado"}


def normalized_columns(values):
    """Stable SQL types across branches; bindings never contain arbitrary SQL."""
    return [cast(values.get(key, null()), Numeric if key in NUMERIC_KEYS else String).label(key) for key in KEYS]


def local_timestamp(column):
    return func.timezone(get_settings().clinic_timezone, column)


def patient_name():
    return func.concat(Paciente.apellidos, ", ", Paciente.nombre)


def _scope(stmt, user, clinic_column, requested_clinic=None):
    # Cross-patient consultation is stricter than legacy single-record access:
    # unassigned historic records need an administrator, never a global fallback.
    if user.rol != "admin":
        stmt = stmt.where(clinic_column == user.clinica_id) if user.clinica_id else stmt.where(literal(False))
    if requested_clinic is not None:
        stmt = stmt.where(clinic_column == requested_clinic)
    return stmt


def _patient_source(model, user, values, *, joins=(), where=(), own_clinic=None, requested_clinic=None):
    defaults = {
        "id": model.id, "patient_id": Paciente.id, "clinic_id": Paciente.clinica_id,
        "paciente": patient_name(), "historia": Paciente.num_historial,
        "clinica": Clinica.nombre,
    }
    defaults.update(values)
    search_parts = [Paciente.nombre, Paciente.apellidos, Paciente.codigo, cast(Paciente.num_historial, String)]
    search_parts += [values[key] for key in ("concepto", "numero", "profesional", "tipo", "fecha") if key in values]
    if "_search_extra" in values:
        search_parts.append(values["_search_extra"])
    # DNI is available to staff in the patient API, but is not included in the
    # listing or exports. Decryption is only requested for DNI-shaped searches.
    if values.pop("_search_dni", False):
        search_parts.append(decrypt_sql_expr(Paciente.dni_nie))
    defaults["search"] = func.concat_ws(" ", *search_parts)
    stmt = select(*normalized_columns(defaults)).select_from(model)
    if model is not Paciente:
        stmt = stmt.join(Paciente, Paciente.id == model.paciente_id)
    stmt = stmt.outerjoin(Clinica, Clinica.id == Paciente.clinica_id)
    for target, condition in joins:
        stmt = stmt.outerjoin(target, condition)
    stmt = stmt.where(*where)
    stmt = _scope(stmt, user, Paciente.clinica_id, requested_clinic)
    if own_clinic is not None and user.rol != "admin":
        stmt = stmt.where((own_clinic == user.clinica_id) | own_clinic.is_(None))
    return stmt


def pacientes(user, requested_clinic=None, search_dni=False):
    return _patient_source(Paciente, user, {
        "kind": literal("paciente"), "fecha": local_timestamp(Paciente.created_at),
        "instant": Paciente.created_at,
        "doctor_id": Paciente.doctor_habitual_id, "profesional": Doctor.nombre,
        "estado": case((Paciente.activo, "activo"), else_="inactivo"),
        "concepto": literal("Alta de paciente"), "tipo": literal("paciente"), "_search_dni": search_dni,
    }, joins=[(Doctor, Doctor.id == Paciente.doctor_habitual_id)], requested_clinic=requested_clinic)


def citas(user, requested_clinic=None, search_dni=False):
    return _patient_source(Cita, user, {
        "kind": literal("cita"), "fecha": local_timestamp(Cita.fecha_hora),
        "instant": Cita.fecha_hora,
        "doctor_id": Cita.doctor_id, "profesional": Doctor.nombre,
        "concepto": func.coalesce(Cita.motivo, "Cita"), "estado": Cita.estado,
        "tipo": literal("cita"), "treatment_id": PresupuestoLinea.tratamiento_id,
        "_search_dni": search_dni,
    }, joins=[(Doctor, Doctor.id == Cita.doctor_id), (PresupuestoLinea, PresupuestoLinea.id == Cita.presupuesto_linea_id)], own_clinic=Cita.clinica_id, requested_clinic=requested_clinic)


def planes(user, requested_clinic=None, search_dni=False):
    total = select(func.coalesce(func.sum(PresupuestoLinea.precio_unitario * (1 - PresupuestoLinea.descuento_porcentaje / 100)), 0)).where(PresupuestoLinea.presupuesto_id == Presupuesto.id).correlate(Presupuesto).scalar_subquery()
    treatments = select(func.string_agg(TratamientoCatalogo.nombre, " ")).select_from(PresupuestoLinea).join(TratamientoCatalogo, TratamientoCatalogo.id == PresupuestoLinea.tratamiento_id).where(PresupuestoLinea.presupuesto_id == Presupuesto.id).correlate(Presupuesto).scalar_subquery()
    return _patient_source(Presupuesto, user, {
        "kind": literal("plan"), "fecha": Presupuesto.fecha, "doctor_id": Presupuesto.doctor_id,
        "profesional": Doctor.nombre, "numero": Presupuesto.numero, "estado": Presupuesto.estado,
        "concepto": func.concat("Presupuesto ", Presupuesto.numero), "tipo": literal("plan"),
        "importe": total if user.rol in BILLING_ROLES else null(), "_search_dni": search_dni, "_search_extra": treatments,
    }, joins=[(Doctor, Doctor.id == Presupuesto.doctor_id)], own_clinic=Presupuesto.clinica_id, requested_clinic=requested_clinic)


def tratamientos(user, requested_clinic=None, search_dni=False):
    return _patient_source(TrabajoPendiente, user, {
        "kind": literal("tratamiento"), "fecha": local_timestamp(TrabajoPendiente.created_at),
        "instant": TrabajoPendiente.created_at,
        "doctor_id": Presupuesto.doctor_id, "profesional": Doctor.nombre,
        "concepto": TratamientoCatalogo.nombre, "tipo": literal("tratamiento"),
        "treatment_id": TrabajoPendiente.tratamiento_id, "pieza": TrabajoPendiente.pieza_dental,
        "estado": case((TrabajoPendiente.realizado, "realizado"), else_="pendiente"), "_search_dni": search_dni,
    }, joins=[(TratamientoCatalogo, TratamientoCatalogo.id == TrabajoPendiente.tratamiento_id), (PresupuestoLinea, PresupuestoLinea.id == TrabajoPendiente.presupuesto_linea_id), (Presupuesto, Presupuesto.id == PresupuestoLinea.presupuesto_id), (Doctor, Doctor.id == Presupuesto.doctor_id)], requested_clinic=requested_clinic)


def realizados(user, requested_clinic=None, search_dni=False):
    return _patient_source(HistorialClinico, user, {
        "kind": literal("realizado"), "fecha": HistorialClinico.fecha,
        "doctor_id": HistorialClinico.doctor_id, "profesional": Doctor.nombre,
        "concepto": TratamientoCatalogo.nombre, "tipo": literal("realizado"),
        "treatment_id": HistorialClinico.tratamiento_id, "pieza": HistorialClinico.pieza_dental,
        "estado": HistorialClinico.estado, "_search_dni": search_dni,
    }, joins=[(TratamientoCatalogo, TratamientoCatalogo.id == HistorialClinico.tratamiento_id), (Doctor, Doctor.id == HistorialClinico.doctor_id)], requested_clinic=requested_clinic)


def facturas(user, requested_clinic=None, search_dni=False):
    paid = invoice_paid()
    concepts = select(func.string_agg(FacturaLinea.concepto, " ")).where(FacturaLinea.factura_id == Factura.id).correlate(Factura).scalar_subquery()
    return _patient_source(Factura, user, {
        "kind": literal("factura"), "fecha": Factura.fecha, "estado": Factura.estado,
        "numero": func.concat(Factura.serie, "-", Factura.numero),
        "concepto": func.concat("Factura ", Factura.serie, "-", Factura.numero),
        "tipo": Factura.tipo, "importe": Factura.total,
        "saldo": case((Factura.estado == "anulada", 0), else_=Factura.total - paid), "_search_dni": search_dni, "_search_extra": concepts,
    }, own_clinic=Factura.clinica_id, requested_clinic=requested_clinic)


def _payment(user, model, kind, requested_clinic=None, search_dni=False):
    patient = model.paciente_id if model is PagoAnticipadoPaciente else func.coalesce(Cobro.paciente_id, Factura.paciente_id)
    values = {
        "id": model.id, "kind": literal(kind), "patient_id": patient,
        "clinic_id": Paciente.clinica_id, "paciente": patient_name(), "historia": Paciente.num_historial,
        "clinica": Clinica.nombre, "fecha": local_timestamp(model.fecha), "importe": model.importe,
        "instant": model.fecha,
        "tipo": literal(kind), "estado": case((model.anulado_at.is_(None), "vigente"), else_="anulado"),
        "profesional": Usuario.nombre, "concepto": FormaPago.nombre,
        "numero": case((Factura.id.is_(None), "Pago de cuenta"), else_=func.concat(Factura.serie, "-", Factura.numero)) if kind == "cobro" else literal("Anticipo"),
    }
    parts = [patient_name(), cast(Paciente.num_historial, String), values["numero"], FormaPago.nombre, Usuario.nombre]
    if search_dni:
        parts.append(decrypt_sql_expr(Paciente.dni_nie))
    values["search"] = func.concat_ws(" ", *parts)
    stmt = select(*normalized_columns(values)).select_from(model)
    if kind == "cobro":
        stmt = stmt.outerjoin(Factura, Factura.id == Cobro.factura_id)
    stmt = stmt.join(Paciente, Paciente.id == patient).outerjoin(Clinica, Clinica.id == Paciente.clinica_id).outerjoin(Usuario, Usuario.id == model.usuario_id).outerjoin(FormaPago, FormaPago.id == model.forma_pago_id)
    stmt = _scope(stmt, user, Paciente.clinica_id, requested_clinic)
    clinic_col = func.coalesce(Cobro.clinica_id, Factura.clinica_id) if kind == "cobro" else model.clinica_id
    if user.rol != "admin":
        stmt = stmt.where((clinic_col == user.clinica_id) | clinic_col.is_(None))
    return stmt


def cobros(user, requested_clinic=None, search_dni=False):
    return union_all(_payment(user, Cobro, "cobro", requested_clinic, search_dni), _payment(user, PagoAnticipadoPaciente, "anticipo", requested_clinic, search_dni))


def saldos(user, requested_clinic=None, search_dni=False):
    # Same formula as the patient's canonical account, including advances and
    # excluding cancelled invoices/payments. Subqueries aggregate in PostgreSQL.
    invoice_scope = [] if user.rol == "admin" else [(Factura.clinica_id == user.clinica_id) | Factura.clinica_id.is_(None)]
    billed = select(func.coalesce(func.sum(Factura.total), 0)).where(Factura.paciente_id == Paciente.id, Factura.estado != "anulada", *invoice_scope).correlate(Paciente).scalar_subquery()
    charges, paid = account_totals(user)
    balance = charges - paid
    return _patient_source(Paciente, user, {
        "kind": literal("paciente"), "doctor_id": Paciente.doctor_habitual_id,
        "profesional": Doctor.nombre, "facturado": billed, "cobrado": paid,
        "saldo": balance, "estado": case((balance > 0, "deuda"), (balance < 0, "a_favor"), else_="saldado"),
        "tipo": literal("saldo"), "_search_dni": search_dni,
    }, joins=[(Doctor, Doctor.id == Paciente.doctor_habitual_id)], requested_clinic=requested_clinic)


def documentos(user, requested_clinic=None, search_dni=False):
    clinical = user.rol in CLINICAL_DATA_ROLES
    doc_where = [DocumentoPaciente.deleted_at.is_(None)]
    # Generated PDFs belong to the original task; don't list each one twice.
    doc_where.extend([
        ~select(Consentimiento.id).where(Consentimiento.documento_id == DocumentoPaciente.id).exists(),
        ~select(RecetaClinica.id).where(RecetaClinica.pdf_documento_id == DocumentoPaciente.id).exists(),
    ])
    if not clinical:
        doc_where.append(DocumentoPaciente.categoria.in_(ADMIN_DOCUMENT_TYPES))
    if user.rol not in BILLING_ROLES:
        doc_where.append(DocumentoPaciente.categoria.not_in(FINANCIAL_DOCUMENT_TYPES))
    branches = [_patient_source(DocumentoPaciente, user, {
        "kind": literal("documento"), "fecha": func.coalesce(cast(DocumentoPaciente.fecha_documento, DateTime), local_timestamp(DocumentoPaciente.created_at)),
        "instant": case((DocumentoPaciente.fecha_documento.is_(None), DocumentoPaciente.created_at), else_=null()),
        "doctor_id": DocumentoPaciente.doctor_id, "profesional": Doctor.nombre,
        "concepto": DocumentoPaciente.nombre_original, "tipo": DocumentoPaciente.categoria,
        "treatment_id": DocumentoPaciente.tratamiento_id, "estado": literal("disponible"), "_search_dni": search_dni,
    }, joins=[(Doctor, Doctor.id == DocumentoPaciente.doctor_id)], where=doc_where, requested_clinic=requested_clinic)]
    if clinical:
        branches.append(_patient_source(Consentimiento, user, {
            "kind": literal("consentimiento"), "fecha": local_timestamp(Consentimiento.created_at),
            "instant": Consentimiento.created_at,
            "doctor_id": Consentimiento.doctor_id, "profesional": Doctor.nombre,
            "concepto": Consentimiento.tipo, "tipo": literal("consentimiento"),
            "treatment_id": Consentimiento.tratamiento_id,
            "estado": case((Consentimiento.revocado, "revocado"), else_=Consentimiento.estado), "_search_dni": search_dni,
        }, joins=[(Doctor, Doctor.id == Consentimiento.doctor_id)], own_clinic=Consentimiento.clinica_id, requested_clinic=requested_clinic))
        branches.append(_patient_source(RecetaClinica, user, {
            "kind": literal("receta"), "fecha": RecetaClinica.fecha_prescripcion,
            "doctor_id": RecetaClinica.doctor_id, "profesional": Doctor.nombre,
            "concepto": RecetaClinica.medicamento, "tipo": literal("receta"),
            "estado": RecetaClinica.estado, "_search_dni": search_dni,
        }, joins=[(Doctor, Doctor.id == RecetaClinica.doctor_id)], where=[RecetaClinica.activo.is_(True)], own_clinic=RecetaClinica.clinica_id, requested_clinic=requested_clinic))
    return union_all(*branches) if len(branches) > 1 else branches[0]


def laboratorio(user, requested_clinic=None, search_dni=False):
    return _patient_source(TrabajoLaboratorio, user, {
        "kind": literal("laboratorio"), "fecha": local_timestamp(TrabajoLaboratorio.created_at),
        "instant": TrabajoLaboratorio.created_at,
        "doctor_id": TrabajoLaboratorio.doctor_id, "profesional": Doctor.nombre,
        "numero": TrabajoLaboratorio.numero_orden, "concepto": TrabajoLaboratorio.descripcion,
        "tipo": TrabajoLaboratorio.tipo_trabajo, "treatment_id": TrabajoLaboratorio.tratamiento_id,
        "estado": TrabajoLaboratorio.estado, "_search_dni": search_dni,
    }, joins=[(Doctor, Doctor.id == TrabajoLaboratorio.doctor_id)], requested_clinic=requested_clinic)


def inventario(user, requested_clinic=None, search_dni=False):
    values = {
        "id": Producto.id, "kind": literal("inventario"), "clinic_id": Producto.clinica_id,
        "clinica": Clinica.nombre, "concepto": Producto.nombre, "numero": Producto.sku,
        "tipo": Producto.categoria, "stock": Producto.stock_act, "minimo": Producto.stock_min,
        "importe": Producto.coste_unitario,
        "estado": case((Producto.activo.is_(False), "inactivo"), (Producto.stock_act < Producto.stock_min, "bajo_minimo"), else_="correcto"),
        "search": func.concat_ws(" ", Producto.nombre, Producto.sku, Producto.categoria),
    }
    stmt = select(*normalized_columns(values)).select_from(Producto).outerjoin(Clinica, Clinica.id == Producto.clinica_id)
    return _scope(stmt, user, Producto.clinica_id, requested_clinic)


def auditoria(user, requested_clinic=None, search_dni=False):
    values = {
        "id": AuditLog.id, "kind": literal("auditoria"), "clinic_id": AuditLog.clinica_id,
        "clinica": Clinica.nombre, "fecha": local_timestamp(AuditLog.timestamp),
        "instant": AuditLog.timestamp,
        "profesional": Usuario.nombre, "tipo": AuditLog.tabla, "estado": AuditLog.accion,
        "concepto": func.concat(AuditLog.accion, " · ", AuditLog.tabla, " · ", AuditLog.registro_id),
        "search": func.concat_ws(" ", Usuario.nombre, Usuario.username, AuditLog.tabla, AuditLog.accion, AuditLog.registro_id, AuditLog.id),
    }
    stmt = select(*normalized_columns(values)).select_from(AuditLog).outerjoin(Clinica, Clinica.id == AuditLog.clinica_id).outerjoin(Usuario, Usuario.id == AuditLog.usuario_id)
    return _scope(stmt, user, AuditLog.clinica_id, requested_clinic)


SOURCES = {fn.__name__: fn for fn in [pacientes, citas, planes, tratamientos, realizados, facturas, cobros, saldos, documentos, laboratorio, inventario, auditoria]}


def actividad(user: TokenData, requested_clinic=None, search_dni=False):
    allowed = ["citas", "planes", "documentos"]
    if user.rol in CLINICAL_DATA_ROLES:
        allowed.extend(["realizados", "laboratorio"])
    if user.rol in BILLING_ROLES:
        allowed.extend(["facturas", "cobros"])
    branches = []
    for source_name in allowed:
        source = SOURCES[source_name](user, requested_clinic, search_dni).subquery()
        # Activity type is the source kind rather than a document category or
        # payment method; the detail remains available through the same target.
        branches.append(select(*(source.c.kind.label("tipo") if key == "tipo" else source.c[key] for key in KEYS)))
    return union_all(*branches)


SOURCES["actividad"] = actividad
