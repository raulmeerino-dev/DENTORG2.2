import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.domains.ai.application.copilot_lifecycle import await_turn


@pytest.mark.asyncio
@pytest.mark.parametrize("disconnect", [False, True])
async def test_stopped_turn_cancels_work_before_rollback(disconnect):
    stopped = asyncio.Event()

    async def receive():
        if not disconnect:
            await asyncio.Event().wait()
        return {"type": "http.disconnect"}

    request = SimpleNamespace(receive=receive)

    async def work():
        try:
            await asyncio.Event().wait()
        finally:
            stopped.set()

    async def rollback():
        assert stopped.is_set()

    db = SimpleNamespace(rollback=AsyncMock(side_effect=rollback))
    with pytest.raises(HTTPException) as error:
        await await_turn(work(), request, db, timeout_seconds=0.02)
    assert error.value.status_code == (499 if disconnect else 504)
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_completed_turn_keeps_its_result():
    request = SimpleNamespace(receive=asyncio.Event().wait)
    db = SimpleNamespace(rollback=AsyncMock())

    async def work():
        return {"message": "Respuesta"}

    assert await await_turn(work(), request, db) == {"message": "Respuesta"}
    db.rollback.assert_not_awaited()
