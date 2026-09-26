"""Atomic HTTP receipts for JSON commands, shared by every application service.

The same principal/key serializes on PostgreSQL, not on one worker's memory.
An interrupted response can be replayed after commit; an interrupted transaction
rolls back BOTH the command and its receipt. Only encrypted responses are stored.
"""
import base64
import hashlib
import json
import re
from contextlib import suppress
from uuid import UUID

from fastapi import HTTPException
from fastapi import Request as HTTPRequest
from sqlalchemy import text
from sqlalchemy.orm.exc import StaleDataError
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.crypto import cifrar_json, descifrar_json
from app.core.persistence.operation_receipt import OperationReceipt
from app.core.security import verify_access_token
from app.database import AsyncSessionLocal, request_session
from app.domains.identity.persistence.usuario import Usuario


async def require_operation_key(request: HTTPRequest):
    """A retryable command must identify its logical attempt."""
    if request.method != "POST" or request.headers.get("content-type", "").startswith("multipart/"):
        return
    path = request.url.path
    protected = (
        path == "/api/citas" or path.startswith(("/api/facturas", "/api/cuentas/", "/api/assistant/"))
        or "/pagos-anticipados" in path
        or path in {"/api/tratamientos/historial", "/api/tratamientos/historial/sesion-realizada", "/api/tratamientos/notas-dentales"}
        or path.endswith(("/sesion-items", "/convertir-a-factura", "/guardar-nota"))
    )
    if protected and not request.headers.get("Idempotency-Key"):
        raise HTTPException(428, "Falta la clave de operación. Reintenta desde el formulario conservando la misma operación.")


class IdempotencyMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH", "DELETE"}:
            return await self.app(scope, receive, send)
        request = Request(scope, receive)
        key = request.headers.get("Idempotency-Key")
        if not key or not request.url.path.startswith("/api/") or request.url.path.startswith(("/api/auth/", "/api/portal/", "/api/whatsapp/webhook")):
            return await self.app(scope, receive, send)
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{8,128}", key):
            return await JSONResponse({"detail": "Clave de operación inválida."}, 422)(scope, receive, send)
        payload = verify_access_token(request.headers.get("authorization", "").removeprefix("Bearer "))
        if not payload or not payload.get("sub"):
            return await self.app(scope, receive, send)
        # Streams/uploads use their domain-specific identifiers; JSON and empty
        # commands cover financial, clinical, agenda and assistant mutations.
        if request.headers.get("content-type", "").startswith("multipart/"):
            return await self.app(scope, receive, send)
        body = await request.body()
        canonical_body = body
        if request.headers.get("content-type", "").startswith("application/json"):
            # Normal request validation handles malformed JSON.
            with suppress(ValueError, UnicodeDecodeError):
                canonical_body = json.dumps(json.loads(body), sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
        fingerprint = hashlib.sha256(b"\0".join([
            scope["method"].encode(), scope["path"].encode(), scope["query_string"],
            str(payload.get("rol")).encode(), str(payload.get("clinica_id")).encode(), canonical_body,
        ])).hexdigest()
        async with AsyncSessionLocal() as db:
            user = await db.get(Usuario, UUID(payload["sub"]))
            if not user or not user.activo or user.rol != payload.get("rol") or str(user.clinica_id or "") != str(payload.get("clinica_id") or ""):
                return await JSONResponse({"detail": "La sesión ha cambiado. Vuelve a iniciar sesión."}, 401)(scope, receive, send)
            await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": f"operation:{user.id}:{key}"})
            existing = await db.get(OperationReceipt, (user.id, key))
            if existing:
                if existing.fingerprint != fingerprint:
                    return await JSONResponse({"detail": "Esta clave ya se usó para una operación diferente."}, 409)(scope, receive, send)
                receipt = await descifrar_json(db, existing.response_encrypted)
                return await Response(base64.b64decode(receipt["body"]), status_code=receipt["status"], headers={**receipt["headers"], "Idempotency-Replayed": "true"})(scope, receive, send)
            messages = []
            delivered = False

            async def replay_body():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": body, "more_body": False}
                return await receive()

            async def buffer(message):
                messages.append(message)

            db.defer_commit = True
            token = request_session.set(db)
            try:
                await self.app(scope, replay_body, buffer)
                start = next(m for m in messages if m["type"] == "http.response.start")
                if 200 <= start["status"] < 300:
                    response_body = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
                    headers = {k.decode(): v.decode() for k, v in start["headers"] if k.lower() == b"content-type"}
                    receipt = {"status": start["status"], "headers": headers, "body": base64.b64encode(response_body).decode()}
                    db.add(OperationReceipt(owner_id=user.id, key=key, fingerprint=fingerprint, response_encrypted=await cifrar_json(db, receipt)))
                    db.defer_commit = False
                    await db.commit()
                else:
                    await db.rollback()
            except StaleDataError:
                await db.rollback()
                return await JSONResponse({"detail": "Esta información cambió mientras la estabas editando. Revisa la versión actual; tu borrador se conserva."}, 409)(scope, receive, send)
            except BaseException:
                await db.rollback()
                raise
            finally:
                request_session.reset(token)
            for message in messages:
                await send(message)
