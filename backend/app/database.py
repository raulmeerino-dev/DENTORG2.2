from collections.abc import AsyncGenerator
from contextvars import ContextVar

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.sql_echo,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

class RequestSession(AsyncSession):
    """A retryable HTTP mutation commits its receipt and writes together."""
    defer_commit = False

    async def commit(self):
        if self.defer_commit:
            await self.flush()
        else:
            await super().commit()


request_session: ContextVar[RequestSession | None] = ContextVar("request_session", default=None)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=RequestSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependencia de FastAPI para obtener sesión de BD."""
    active = request_session.get()
    if active is not None:
        yield active
        return
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
