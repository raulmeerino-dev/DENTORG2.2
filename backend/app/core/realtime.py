"""WebSocket transport over a transactional PostgreSQL outbox + LISTEN/NOTIFY.

Notifications only wake readers; the durable outbox is the source of truth.
Delivery sequences are assigned AFTER commit under a short dispatcher lock. A
transaction allocating an ID and committing late therefore cannot be skipped.
"""
import asyncio
import contextlib
import logging
import time
from datetime import UTC, datetime
from uuid import UUID

import asyncpg
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url

from app.config import get_settings
from app.core.permissions import BILLING_ROLES, CLINICAL_DATA_ROLES, STAFF_ROLES
from app.core.persistence.realtime import RealtimeEvent
from app.core.security import verify_access_token
from app.database import AsyncSessionLocal
from app.domains.identity.persistence.auth_session import AuthSession
from app.domains.identity.persistence.usuario import Usuario

log = logging.getLogger(__name__)
router = APIRouter()


class RealtimeHub:
    def __init__(self):
        self.listeners: set[asyncio.Event] = set()
        self.task: asyncio.Task | None = None

    async def start(self):
        self.task = asyncio.create_task(self._listen(), name="realtime-outbox")

    async def stop(self):
        if self.task:
            self.task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.task

    async def dispatch(self):
        async with AsyncSessionLocal.begin() as db:
            await db.execute(text("SELECT pg_advisory_xact_lock(50825001)"))
            await db.execute(text("""
                UPDATE realtime_events SET sequence = nextval('realtime_delivery_seq')
                WHERE sequence IS NULL
            """))

    async def _listen(self):
        while True:
            connection = None
            try:
                wake = asyncio.Event()
                dsn = make_url(get_settings().database_url).set(drivername="postgresql").render_as_string(hide_password=False)
                connection = await asyncpg.connect(dsn, timeout=10)
                await connection.add_listener("dentcore_changes", lambda *_, signal=wake: signal.set())
                connection.add_termination_listener(lambda *_, signal=wake: signal.set())
                while not connection.is_closed():
                    wake.clear()
                    await self.dispatch()
                    for listener in tuple(self.listeners):
                        listener.set()
                    # Recovery only: covers a broken listener or lost notification.
                    with contextlib.suppress(TimeoutError):
                        await asyncio.wait_for(wake.wait(), timeout=30)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Realtime listener reconnecting")
                await asyncio.sleep(2)
            finally:
                if connection and not connection.is_closed():
                    await connection.close()


hub = RealtimeHub()


async def authenticated_user(payload: dict) -> Usuario | None:
    try:
        user_id = UUID(payload["sub"])
        session_id = UUID(payload["sid"])
    except (KeyError, ValueError, TypeError):
        return None
    async with AsyncSessionLocal() as db:
        user = await db.get(Usuario, user_id)
        session = await db.get(AuthSession, session_id)
        if (not user or not user.activo or user.rol not in STAFF_ROLES or not session
                or session.usuario_id != user_id or session.revoked_at
                or session.expires_at <= datetime.now(UTC)
                or user.rol != payload.get("rol")
                or str(user.clinica_id or "") != str(payload.get("clinica_id") or "")):
            return None
        return user


def visible_to(event: RealtimeEvent, user: Usuario) -> bool:
    # Match HTTP's legacy-null tenant policy and cross-clinic administrator access.
    if user.rol != "admin" and event.clinica_id is not None and event.clinica_id != user.clinica_id:
        return False
    if event.audience == "doctor":
        return user.rol == "doctor" and event.doctor_id == user.doctor_id
    roles = {"staff": STAFF_ROLES, "clinical": CLINICAL_DATA_ROLES,
             "billing": BILLING_ROLES, "admin": {"admin"}}
    return user.rol in roles.get(event.audience, ())


@router.websocket("/ws")
async def realtime_socket(socket: WebSocket):
    # Browser tokens travel in the first frame, never in URLs/access logs.
    if socket.headers.get("origin") not in get_settings().cors_allowed_origins:
        await socket.close(code=4403)
        return
    await socket.accept()
    wake = asyncio.Event()
    try:
        hello = await asyncio.wait_for(socket.receive_json(), timeout=5)
        if not isinstance(hello, dict) or not isinstance(hello.get("token"), str):
            await socket.close(code=4400)
            return
        payload = verify_access_token(hello.get("token", ""))
        user = await authenticated_user(payload) if payload else None
        if not user:
            await socket.close(code=4401)
            return
        cursor = hello.get("cursor")
        if cursor is not None and (type(cursor) is not int or cursor < 0):
            await socket.close(code=4400)
            return
        hub.listeners.add(wake)
        await hub.dispatch()
        while True:
            wake.clear()
            if time.time() >= payload["exp"] or not (user := await authenticated_user(payload)):
                await socket.close(code=4401)
                return
            async with AsyncSessionLocal() as db:
                high = await db.scalar(select(func.max(RealtimeEvent.sequence))) or 0
                low = await db.scalar(select(func.min(RealtimeEvent.sequence))) or 0
                if cursor is None or cursor > high or (low and cursor < low - 1):
                    cursor = high
                    await socket.send_json({"type": "resync", "cursor": cursor})
                events = (await db.scalars(select(RealtimeEvent).where(
                    RealtimeEvent.sequence > cursor,
                ).order_by(RealtimeEvent.sequence).limit(501))).all()
            if len(events) > 500:
                cursor = high
                await socket.send_json({"type": "resync", "cursor": cursor})
            else:
                for event in events:
                    if visible_to(event, user):
                        await socket.send_json({
                            "type": "change", "cursor": event.sequence,
                            "event": event.event_type, "entity": event.entity_type,
                            "id": str(event.entity_id),
                            "patientId": str(event.paciente_id) if event.paciente_id else None,
                            "doctorId": str(event.doctor_id) if event.doctor_id else None,
                        })
                    cursor = event.sequence
            await socket.send_json({"type": "ready", "cursor": cursor})
            # Bidirectional heartbeat detects disconnected clients and proxies;
            # no database transaction remains open while waiting on a computer.
            incoming = asyncio.create_task(socket.receive_json())
            changed = asyncio.create_task(wake.wait())
            try:
                done, _ = await asyncio.wait({incoming, changed}, timeout=25, return_when=asyncio.FIRST_COMPLETED)
                if incoming in done:
                    message = incoming.result()
                    if not isinstance(message, dict) or message.get("type") != "ping":
                        await socket.close(code=4400)
                        return
            finally:
                for task in (incoming, changed):
                    task.cancel()
                await asyncio.gather(incoming, changed, return_exceptions=True)
    except (WebSocketDisconnect, TimeoutError, ValueError, TypeError):
        pass
    finally:
        hub.listeners.discard(wake)
