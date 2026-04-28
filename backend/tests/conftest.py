"""
Fixtures de pytest para tests del backend.

Usa una BD de test separada y prepara extensiones/secuencias necesarias
para que el metadata del proyecto pueda crearse en limpio.
"""
import os
from collections.abc import AsyncGenerator

import pytest_asyncio
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import get_db
from app.main import app


TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://eurodent:eurodent_dev_pass@postgres:5432/eurodent2_test",
)

_test_url = make_url(TEST_DATABASE_URL)
ADMIN_DATABASE_URL = _test_url.set(database="postgres").render_as_string(hide_password=False)
TEST_DATABASE_NAME = _test_url.database or "eurodent2_test"

admin_engine = create_async_engine(ADMIN_DATABASE_URL, echo=False, isolation_level="AUTOCOMMIT")
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_test_database() -> AsyncGenerator[None, None]:
    async with admin_engine.connect() as conn:
        exists = await conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :db_name"),
            {"db_name": TEST_DATABASE_NAME},
        )
        if not exists:
            await conn.execute(text(f'CREATE DATABASE "{TEST_DATABASE_NAME}"'))
    yield
    await admin_engine.dispose()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_tables(create_test_database: None) -> AsyncGenerator[None, None]:
    async with test_engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "pgcrypto"'))

    previous_database_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
    alembic_cfg = Config("/app/alembic.ini")
    command.upgrade(alembic_cfg, "head")
    yield
    async with test_engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))

    if previous_database_url is None:
        os.environ.pop("DATABASE_URL", None)
    else:
        os.environ["DATABASE_URL"] = previous_database_url
    await test_engine.dispose()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
