"""Bound read/preview turns, including time spent waiting for database locks."""

import asyncio

from fastapi import HTTPException


async def await_turn(work, request, db, *, timeout_seconds=90):
    # Confirmation writes deliberately do not use this disconnect policy.
    async def disconnected():
        # FastAPI has already consumed the body. Await the disconnect event;
        # non-blocking is_disconnected polls can miss it behind ASGI middleware.
        while True:
            message = await request.receive()
            if message["type"] == "http.disconnect":
                return

    worker = asyncio.create_task(work)
    watcher = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait(
            {worker, watcher}, timeout=timeout_seconds, return_when=asyncio.FIRST_COMPLETED
        )
        if worker in done:
            return await worker
        if watcher in done:
            await watcher
            raise HTTPException(499, "Consulta detenida.")
        raise HTTPException(504, "La consulta tardó demasiado. Puedes reintentar; no se guardaron cambios.")
    finally:
        watcher.cancel()
        worker.cancel()
        # Wait for provider/SQL cancellation before releasing this connection.
        await asyncio.gather(watcher, worker, return_exceptions=True)
        if worker.cancelled():
            await db.rollback()
