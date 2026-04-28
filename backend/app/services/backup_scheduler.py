import asyncio
from datetime import UTC, datetime, time

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.backup import BackupRegistro
from app.services.backup_service import crear_backup_cifrado

_task: asyncio.Task | None = None


async def _crear_backup_diario_si_falta() -> None:
    await asyncio.sleep(5)
    async with AsyncSessionLocal() as db:
        today_start = datetime.combine(datetime.now(UTC).date(), time.min, tzinfo=UTC)
        result = await db.execute(
            select(BackupRegistro)
            .where(
                BackupRegistro.tipo == "automatico",
                BackupRegistro.started_at >= today_start,
                BackupRegistro.estado == "correcto",
            )
            .limit(1)
        )
        if result.scalar_one_or_none():
            return
        await crear_backup_cifrado(db, created_by_id=None, tipo="automatico")
        await db.commit()


def start_backup_scheduler() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_crear_backup_diario_si_falta())
