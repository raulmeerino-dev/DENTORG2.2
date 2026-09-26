"""HTTP preconditions for edits. Reads never take edit locks."""
import re
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from sqlalchemy import event, inspect, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.permissions import ensure_clinic_access, get_current_user
from app.database import get_db

UUID_PATTERN = r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"
# Stable HTTP adapter -> persistence resource mapping. Only explicit edit routes;
# state-machine actions validate their own transitions under transaction locks.
EDIT_RESOURCES = [
    (rf"/api/pacientes/{UUID_PATTERN}", "pacientes", "id"),
    (rf"/api/citas/{UUID_PATTERN}(?:/reprogramar|/estado)?", "citas", "paciente_id"),
    (rf"/api/tratamientos/historial/{UUID_PATTERN}", "historial_clinico", "paciente_id"),
    (rf"/api/tratamientos/pacientes/{UUID_PATTERN}/sesion-items/{UUID_PATTERN}", "sesion_clinica_items", "paciente_id"),
    (rf"/api/presupuestos/{UUID_PATTERN}", "presupuestos", "paciente_id"),
    (rf"/api/presupuestos/{UUID_PATTERN}/lineas/{UUID_PATTERN}", "presupuesto_lineas", None),
    (rf"/api/facturas/{UUID_PATTERN}", "facturas", "paciente_id"),
    (rf"/api/pacientes/{UUID_PATTERN}/pagos-anticipados/{UUID_PATTERN}", "pagos_anticipados_paciente", "paciente_id"),
    (rf"/api/laboratorio/trabajos/{UUID_PATTERN}", "trabajos_laboratorio", "paciente_id"),
    (rf"/api/inventario/{UUID_PATTERN}", "productos", None),
]

CONFLICT = "Esta información cambió mientras la estabas editando. Revisa la versión actual; tu borrador se conserva."


@event.listens_for(Session, "before_flush")
def verify_loaded_revision(session, _context, _instances):
    # Check the actual ORM instance too: a writer could commit between the HTTP
    # precondition read and the service's SELECT. Subsequent races are handled by
    # SQLAlchemy's version_id_col predicate. No extra row-lock ordering is added.
    expected = session.info.get("edit_revisions", {})
    for obj in session.dirty:
        state = inspect(obj)
        key = (state.mapper.local_table.name, str(getattr(obj, "id", "")))
        if key in expected:
            if obj.revision != expected[key]:
                raise HTTPException(409, CONFLICT)
            expected.pop(key)


@event.listens_for(Session, "after_commit")
@event.listens_for(Session, "after_rollback")
def clear_revision_preconditions(session):
    session.info.pop("edit_revisions", None)


async def require_edit_revision(request: Request, db: Annotated[AsyncSession, Depends(get_db)]):
    if request.method not in {"PATCH", "PUT"}:
        return
    resource = next(((m, table, patient_column) for pattern, table, patient_column in EDIT_RESOURCES
                     if (m := re.fullmatch(pattern, request.url.path))), None)
    if resource is None:
        return
    # Authenticate before revealing the existence/revision of a resource.
    from fastapi.security import HTTPAuthorizationCredentials
    auth = request.headers.get("authorization", "")
    user = await get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth.removeprefix("Bearer ")))
    match, table, patient_column = resource
    resource_id = str(UUID(match.groups()[-1]))
    # The names below come exclusively from the static allowlist, never the URL.
    row = (await db.execute(text(f"SELECT to_jsonb(r) FROM {table} r WHERE id = CAST(:id AS uuid)"), {"id": resource_id})).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Registro no encontrado")
    clinic = row.get("clinica_id")
    ensure_clinic_access(user, UUID(str(clinic)) if clinic else None)
    if patient_column:
        clinic = await db.scalar(text("SELECT clinica_id FROM pacientes WHERE id = CAST(:id AS uuid)"), {"id": row[patient_column]})
    elif table == "presupuesto_lineas":
        clinic = await db.scalar(text("SELECT clinica_id FROM presupuestos WHERE id = CAST(:id AS uuid)"), {"id": row["presupuesto_id"]})
    ensure_clinic_access(user, UUID(str(clinic)) if clinic else None)
    data = await request.json()
    expected = request.headers.get("If-Match", "").strip('"') or data.get("revision")
    if expected is None or expected == "":
        raise HTTPException(428, "Actualiza el registro antes de editarlo: falta su revisión.")
    if str(expected) != str(row["revision"]):
        raise HTTPException(409, CONFLICT)
    db.info.setdefault("edit_revisions", {})[(table, resource_id)] = row["revision"]
