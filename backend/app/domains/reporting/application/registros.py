"""Allowlisted query planning, SQL pagination and role-aware serialization."""
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.config import get_settings
from app.core.permissions import STAFF_ROLES, TokenData
from app.core.persistence.audit_log import AuditLog
from app.domains.clinical.persistence.tratamiento import TratamientoCatalogo
from app.domains.identity.persistence.clinica import Clinica
from app.domains.identity.persistence.doctor import Doctor
from app.domains.identity.schemas.admin import AuditLogResponse
from app.domains.patients.persistence.paciente import Paciente
from app.domains.reporting.application.registros_catalogo import view_for_user
from app.domains.reporting.application.registros_sources import SOURCES, _scope, patient_name
from app.domains.reporting.schemas.registros import (
    RegistroColumn,
    RegistroFilters,
    RegistroLookup,
    RegistroResult,
    RegistroRow,
    RegistroTarget,
    RegistroView,
)
from app.domains.treatment_plans.persistence.presupuesto import PresupuestoLinea


@dataclass(frozen=True)
class QuerySpec:
    stmt: Select
    columns: list[RegistroColumn]
    metadata: RegistroView


def _fold_text(value: str) -> str:
    # Match Spanish accents/case and arbitrary spacing without requiring a DB
    # extension or a migration. Wildcards remain literal user input.
    return "".join(char for char in unicodedata.normalize("NFD", value.lower()) if not unicodedata.combining(char))


def text_matches(column, value: str):
    # Include uppercase accents: PostgreSQL clusters using the C locale do not
    # necessarily lowercase accented letters through lower().
    accents = "áéíóúüñàèìòùâêîôûäëïöç"
    plain = "aeiouunaeiouaeiouaeioc"
    normalized = func.translate(func.lower(func.coalesce(cast(column, String), "")), accents + accents.upper(), plain + plain)
    tokens = _fold_text(value).split()
    return [normalized.contains(token, autoescape=True) for token in tokens]


def _validate_clinic(user, filters):
    if user.rol != "admin" and filters.clinica_id is not None and filters.clinica_id != user.clinica_id:
        raise HTTPException(403, "No tiene acceso a datos de otra clínica")


def build_query(vista: str, filters: RegistroFilters, user: TokenData) -> QuerySpec:
    """Return the complete filtered, ordered statement, without pagination.

    Exports and future typed AI tools use exactly this function. Role/tenant
    checks live here, not in the HTTP adapter or browser.
    """
    metadata = view_for_user(vista, user)
    _validate_clinic(user, filters)
    for key, value in filters.model_dump().items():
        if key not in {"offset", "limit", "sort_by", "sort_dir"} and value is not None and key not in metadata.filters:
            raise HTTPException(422, f"El filtro {key} no está disponible en esta vista")
    search_dni = bool(filters.q and re.fullmatch(r"[a-zA-Z0-9 -]{8,14}", filters.q.strip()) and any(c.isdigit() for c in filters.q))
    source = SOURCES[vista](user, filters.clinica_id, search_dni).subquery("registros")
    # Do not fetch the search document or unrelated source expressions. This
    # also lets PostgreSQL prune correlated aggregates from UNION branches when
    # the view does not show them (for example monetary totals in Activity).
    projected = dict.fromkeys(["id", "kind", "patient_id", "fecha", "instant", "doctor_id", *[column.key for column in metadata.columns]])
    stmt = select(*(source.c[key] for key in projected))
    for param, key in [("paciente_id", "patient_id"), ("doctor_id", "doctor_id"), ("clinica_id", "clinic_id"), ("tipo", "tipo"), ("estado", "estado")]:
        value = getattr(filters, param)
        if value is not None:
            stmt = stmt.where(source.c[key] == str(value))
    if filters.tratamiento_id:
        plan_ids = select(cast(PresupuestoLinea.presupuesto_id, String)).where(PresupuestoLinea.tratamiento_id == filters.tratamiento_id)
        stmt = stmt.where(or_(source.c.treatment_id == str(filters.tratamiento_id), (source.c.kind == "plan") & source.c.id.in_(plan_ids)))
    if filters.fecha_desde:
        stmt = stmt.where(source.c.fecha >= filters.fecha_desde.isoformat())
    if filters.fecha_hasta:
        # Compare calendar dates after source-level conversion to clinic time;
        # the inclusive final date therefore includes all of its appointments.
        stmt = stmt.where(func.substr(source.c.fecha, 1, 10) <= filters.fecha_hasta.isoformat())
    for param, key, minimum in [("importe_min", "importe", True), ("importe_max", "importe", False), ("saldo_min", "saldo", True), ("saldo_max", "saldo", False)]:
        value = getattr(filters, param)
        if value is not None:
            stmt = stmt.where(source.c[key] >= value if minimum else source.c[key] <= value)
    if filters.q and filters.q.strip():
        stmt = stmt.where(*text_matches(source.c.search, filters.q))
    sort_by = filters.sort_by or metadata.default_sort.by
    if sort_by not in {column.key for column in metadata.columns if column.sortable}:
        raise HTTPException(422, "La columna de ordenación no está disponible")
    order = source.c[sort_by].asc() if filters.sort_dir == "asc" else source.c[sort_by].desc()
    # Stable tie breaker is essential for pagination and repeatable exports.
    stmt = stmt.order_by(order.nulls_last(), source.c.kind, source.c.id)
    return QuerySpec(stmt=stmt, columns=metadata.columns, metadata=metadata)


def serialize_row(row, columns: list[RegistroColumn]) -> RegistroRow:
    cells = {}
    for column in columns:
        value = row[column.key]
        if isinstance(value, Decimal):
            value = int(value) if column.type == "number" and value == value.to_integral() else float(value)
        if value and column.type == "datetime":
            # Sources use clinic wall time for filtering/sorting. Wire values
            # carry its offset so browsers in a different zone cannot reinterpret it.
            zone = ZoneInfo(get_settings().clinic_timezone)
            instant = datetime.fromisoformat(row["instant"] or value)
            value = (instant.astimezone(zone) if instant.tzinfo else instant.replace(tzinfo=zone)).isoformat()
        cells[column.key] = value
    return RegistroRow(
        id=f"{row['kind']}:{row['id']}", cells=cells,
        target=RegistroTarget(kind=row["kind"], id=row["id"], patient_id=row["patient_id"],
                              date=row["fecha"][:10] if row["fecha"] else None, doctor_id=row["doctor_id"]),
    )


async def consultar_registros(db: AsyncSession, user: TokenData, vista: str, filters: RegistroFilters) -> RegistroResult:
    query = build_query(vista, filters, user)
    count_stmt = select(func.count()).select_from(query.stmt.order_by(None).subquery())
    total = await db.scalar(count_stmt)
    result = await db.execute(query.stmt.offset(filters.offset).limit(filters.limit))
    return RegistroResult(columns=query.columns, rows=[serialize_row(row, query.columns) for row in result.mappings()], total=total or 0, offset=filters.offset, limit=filters.limit)


async def detalle_auditoria(db: AsyncSession, user: TokenData, record_id: int) -> AuditLogResponse:
    view_for_user("auditoria", user)
    entry = await db.get(AuditLog, record_id)
    if entry is None:
        raise HTTPException(404, "Registro de auditoría no encontrado")
    return AuditLogResponse(
        id=entry.id, timestamp=entry.timestamp, user_id=entry.usuario_id,
        clinica_id=entry.clinica_id, action=entry.accion, entity_type=entry.tabla,
        entity_id=entry.registro_id, old_values=entry.datos_antes, new_values=entry.datos_despues,
        ip_address=entry.ip, user_agent=entry.user_agent, event_hash=entry.event_hash,
    )


async def opciones(db: AsyncSession, user: TokenData, tipo: str, q: str = "", limit: int = 30) -> list[RegistroLookup]:
    if user.rol not in STAFF_ROLES:
        raise HTTPException(403, "No tiene acceso a registros")
    if tipo == "pacientes":
        model, label = Paciente, func.concat(patient_name(), " · #", Paciente.num_historial)
    elif tipo == "doctores":
        model, label = Doctor, Doctor.nombre
    elif tipo == "clinicas":
        model, label = Clinica, Clinica.nombre
    elif tipo == "tratamientos":
        model, label = TratamientoCatalogo, TratamientoCatalogo.nombre
    else:
        raise HTTPException(404, "Tipo de opciones no encontrado")
    stmt = select(model.id.label("id"), label.label("label"))
    if tipo == "clinicas":
        stmt = _scope(stmt, user, Clinica.id)
    elif hasattr(model, "clinica_id"):
        stmt = _scope(stmt, user, model.clinica_id)
    if q.strip():
        conditions = text_matches(label, q)
        from sqlalchemy import and_
        stmt = stmt.where(or_(cast(model.id, String) == q, and_(*conditions)))
    result = await db.execute(stmt.order_by(label, model.id).limit(limit))
    return [RegistroLookup(id=str(row.id), label=row.label) for row in result]
