"""Append assessments without rewriting the first visit or generating economic history."""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_log import write_audit_log
from app.core.concurrency import CONFLICT
from app.core.crypto import cifrar_json
from app.core.permissions import TokenData, can_view_health_data, ensure_clinic_access
from app.domains.clinical.schemas.valoracion import ValoracionCreate
from app.domains.patients.application.pacientes import (
    _build_response,
    _get_paciente_or_404,
    _leer_datos_salud,
)
from app.domains.patients.schemas.paciente import PacienteResponse


async def registrar_valoracion(
    paciente_id: UUID, data: ValoracionCreate, request: Request,
    db: AsyncSession, current_user: TokenData,
) -> PacienteResponse:
    if not can_view_health_data(current_user):
        raise HTTPException(403, "No tiene acceso a datos clínicos.")
    paciente = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    salud = await _leer_datos_salud(db, paciente)
    posteriores = salud.get("valoraciones", [])
    if not isinstance(posteriores, list):
        raise HTTPException(409, "Las valoraciones existentes requieren revisión; no se han modificado.")
    inicial = salud.get("primera_visita")
    existing = next((item for item in [inicial, *posteriores]
                     if isinstance(item, dict) and item.get("id") == str(data.id)), None)
    if existing:
        if (existing.get("tipo") == data.tipo
                and all(existing.get(key) == value for key, value in data.datos.model_dump(mode="json").items())):
            return await _build_response(db, paciente, include_health=True)
        raise HTTPException(409, "Esta valoración ya se registró. Consulta el registro antes de continuar.")
    if paciente.revision != data.revision:
        raise HTTPException(409, CONFLICT)
    if data.tipo == "inicial" and inicial is not None:
        raise HTTPException(409, "La primera visita ya está registrada. Registra una valoración posterior.")
    record = {
        **data.datos.model_dump(mode="json"),
        "id": str(data.id), "tipo": data.tipo,
        "registrada_at": datetime.now(timezone.utc).isoformat(),
        "usuario_id": str(current_user.user_id),
        "autor": current_user.username,
    }
    if data.tipo == "inicial":
        salud["primera_visita"] = record
    else:
        salud["valoraciones"] = [*posteriores, record]
    paciente.datos_salud_cifrado = await cifrar_json(db, salud)
    paciente.datos_salud = None
    await write_audit_log(
        db, user=current_user, action="valoracion_registrada", entity_type="pacientes",
        entity_id=paciente.id, clinica_id=paciente.clinica_id, request=request,
        new_values={"valoracion_id": str(data.id), "tipo": data.tipo},
    )
    await db.commit()
    return await _build_response(db, paciente, include_health=True)
