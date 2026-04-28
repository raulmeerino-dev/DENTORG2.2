"""
Middleware de audit log RGPD.

Registra en audit_log cada acceso a endpoints que manejan datos de pacientes.
La tabla es append-only y cada entrada queda encadenada con hash.
"""
import logging
from uuid import UUID

from fastapi import Request, Response
from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.security import verify_access_token
from app.core.tamper_chain import build_chain_hash

logger = logging.getLogger(__name__)

AUDITED_PREFIXES = (
    "/api/pacientes",
    "/api/citas",
    "/api/historial",
    "/api/presupuestos",
    "/api/facturas",
    "/api/consentimientos",
)

METHOD_ACTION_MAP = {
    "GET": "READ",
    "POST": "CREATE",
    "PUT": "UPDATE",
    "PATCH": "UPDATE",
    "DELETE": "DELETE",
}


class AuditLogMiddleware(BaseHTTPMiddleware):
    """Intercepta requests a rutas auditadas y registra el acceso."""

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        path = request.url.path
        if not any(path.startswith(prefix) for prefix in AUDITED_PREFIXES):
            return response

        if not ((200 <= response.status_code < 300) or response.status_code in {401, 403}):
            return response

        try:
            await self._write_audit_entry(request, response)
        except Exception as exc:
            logger.error("Error escribiendo audit_log: %s", exc)

        return response

    async def _write_audit_entry(self, request: Request, response: Response) -> None:
        from app.database import AsyncSessionLocal
        from app.models.audit_log import AuditLog

        user_id: UUID | None = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            payload = verify_access_token(token)
            if payload and payload.get("sub"):
                try:
                    user_id = UUID(payload["sub"])
                except ValueError:
                    pass

        accion = (
            "DENY"
            if response.status_code in {401, 403}
            else METHOD_ACTION_MAP.get(request.method, request.method)
        )
        tabla = _extract_tabla_from_path(request.url.path)
        registro_id = _extract_registro_id_from_path(request.url.path)
        ip = _get_client_ip(request)
        detalles = {
            "path": request.url.path,
            "method": request.method,
            "status_code": response.status_code,
            "accion": accion,
            "tabla": tabla,
            "registro_id": str(registro_id) if registro_id else None,
            "ip": ip,
            "usuario_id": str(user_id) if user_id else None,
        }

        async with AsyncSessionLocal() as session:
            previous_hash = await session.scalar(
                select(AuditLog.event_hash).order_by(AuditLog.id.desc()).limit(1)
            )
            entry = AuditLog(
                usuario_id=user_id,
                accion=accion,
                tabla=tabla,
                registro_id=registro_id,
                datos_despues=detalles,
                ip=ip,
                previous_hash=previous_hash,
                event_hash=build_chain_hash(previous_hash=previous_hash, payload=detalles),
            )
            session.add(entry)
            await session.commit()


def _extract_tabla_from_path(path: str) -> str:
    parts = [p for p in path.split("/") if p]
    return parts[1] if len(parts) > 1 else "desconocido"


def _extract_registro_id_from_path(path: str) -> UUID | None:
    parts = [p for p in path.split("/") if p]
    if len(parts) > 2:
        try:
            return UUID(parts[2])
        except ValueError:
            pass
    return None


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "desconocida"
