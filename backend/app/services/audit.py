from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import TokenData
from app.core.tamper_chain import build_chain_hash
from app.models.audit_log import AuditLog


def _client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else None


async def write_audit_log(
    db: AsyncSession,
    *,
    user: TokenData | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None = None,
    old_values: dict[str, Any] | None = None,
    new_values: dict[str, Any] | None = None,
    clinica_id: UUID | None = None,
    request: Request | None = None,
) -> AuditLog:
    """
    Inserta una entrada auditada y encadenada.

    Se reutiliza la tabla existente (`accion`, `tabla`, `registro_id`) pero se
    expone semánticamente como action/entity_type/entity_id desde los endpoints.
    """
    resolved_clinica_id = clinica_id or (user.clinica_id if user else None)
    payload = {
        "action": action,
        "entity_type": entity_type,
        "entity_id": str(entity_id) if entity_id else None,
        "user_id": str(user.user_id) if user else None,
        "clinica_id": str(resolved_clinica_id) if resolved_clinica_id else None,
        "old_values": old_values,
        "new_values": new_values,
        "ip": _client_ip(request),
    }
    previous_hash = await db.scalar(select(AuditLog.event_hash).order_by(AuditLog.id.desc()).limit(1))
    entry = AuditLog(
        usuario_id=user.user_id if user else None,
        clinica_id=resolved_clinica_id,
        accion=action[:80],
        tabla=entity_type[:80],
        registro_id=entity_id,
        datos_antes=old_values,
        datos_despues=payload,
        ip=_client_ip(request),
        user_agent=request.headers.get("User-Agent")[:500] if request and request.headers.get("User-Agent") else None,
        previous_hash=previous_hash,
        event_hash=build_chain_hash(previous_hash=previous_hash, payload=payload),
    )
    db.add(entry)
    await db.flush()
    return entry
