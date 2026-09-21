"""Import a verified restore kit into an empty, explicitly isolated PostgreSQL DB.

This rehearsal never creates, drops or overwrites a database. The target must
already exist, be local, have a dedicated name and contain no user tables.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from pathlib import Path

from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from app.config import get_settings


def validate_target(database_url: str) -> str:
    url = make_url(database_url)
    if url.drivername != "postgresql+asyncpg":
        raise ValueError("El destino debe usar postgresql+asyncpg")
    if url.host not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("La restauracion de ensayo solo admite PostgreSQL local")
    if not re.fullmatch(r"dentcore_restore_[a-z0-9_]+_test", url.database or ""):
        raise ValueError("El destino debe llamarse dentcore_restore_<identificador>_test")
    source = make_url(get_settings().database_url)
    local_hosts = {"127.0.0.1", "localhost", "::1"}
    source_host = "loopback" if source.host in local_hosts else source.host
    if (source_host, source.port or 5432, source.database) == ("loopback", url.port or 5432, url.database):
        raise ValueError("La base de restauracion no puede ser la base configurada de la aplicacion")
    return url.database


def _quoted(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


async def _assert_empty(database_url: str) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
            count = await connection.scalar(text(
                "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')"
            ))
            if count:
                raise ValueError("El destino ya contiene tablas; se rechaza modificarlo")
    finally:
        await engine.dispose()


async def _import_tables(database_url: str, tables: dict) -> dict[str, int]:
    # The registry is the only supported table allowlist, not backup-provided SQL.
    from app.core import model_registry  # noqa: F401
    from app.database import Base

    known = {table.name for table in Base.metadata.tables.values()}
    if set(tables) != known:
        raise ValueError("Las tablas del backup no corresponden al esquema actual; requiere migracion controlada")
    engine = create_async_engine(database_url)
    counts: dict[str, int] = {}
    try:
        async with engine.begin() as connection:
            # Only migration seed rows in this previously empty target are removed.
            await connection.execute(text("TRUNCATE " + ", ".join(_quoted(name) for name in sorted(known)) + " CASCADE"))
            constraints = (await connection.execute(text(
                "SELECT c.conname, t.relname, c.condeferrable, c.condeferred "
                "FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid "
                "JOIN pg_namespace n ON n.oid=t.relnamespace "
                "WHERE c.contype='f' AND n.nspname='public'"
            ))).all()
            # Preserve FK verification even for cyclic patient/invoice references.
            for name, table, _, _ in constraints:
                await connection.execute(text(
                    f"ALTER TABLE {_quoted(table)} ALTER CONSTRAINT {_quoted(name)} DEFERRABLE INITIALLY DEFERRED"
                ))
            for name in sorted(known):
                rows = tables[name]
                if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
                    raise ValueError(f"Filas invalidas: {name}")
                allowed_columns = set(Base.metadata.tables[name].columns.keys())
                if any(set(row) != allowed_columns for row in rows):
                    raise ValueError(f"Columnas incompatibles: {name}")
                if rows:
                    await connection.execute(text(
                        f"INSERT INTO {_quoted(name)} SELECT * FROM json_populate_recordset(NULL::{_quoted(name)}, CAST(:rows AS json))"
                    ), {"rows": json.dumps(rows, ensure_ascii=False)})
                counts[name] = await connection.scalar(text(f"SELECT count(*) FROM {_quoted(name)}"))
                if counts[name] != len(rows):
                    raise ValueError(f"Conteo de restauracion no coincide: {name}")
                # Compare every restored value, not just row counts.
                equal = await connection.scalar(text(
                    f"SELECT NOT EXISTS ((SELECT to_jsonb(t) AS row FROM {_quoted(name)} t "
                    "EXCEPT ALL SELECT value FROM jsonb_array_elements(CAST(:rows AS jsonb))) "
                    "UNION ALL (SELECT value FROM jsonb_array_elements(CAST(:rows AS jsonb)) "
                    f"EXCEPT ALL SELECT to_jsonb(t) FROM {_quoted(name)} t))"
                ), {"rows": json.dumps(rows, ensure_ascii=False)})
                if not equal:
                    raise ValueError(f"Contenido restaurado no coincide: {name}")
            await connection.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
            for name, table, deferrable, deferred in constraints:
                state = ("DEFERRABLE INITIALLY DEFERRED" if deferred else "DEFERRABLE INITIALLY IMMEDIATE") if deferrable else "NOT DEFERRABLE"
                await connection.execute(text(
                    f"ALTER TABLE {_quoted(table)} ALTER CONSTRAINT {_quoted(name)} {state}"
                ))
            defaults = (await connection.execute(text(
                "SELECT table_name,column_name,column_default FROM information_schema.columns "
                "WHERE table_schema='public' AND column_default LIKE 'nextval(%'"
            ))).all()
            for table, column, default in defaults:
                sequence = re.search(r"nextval\('([^']+)'::regclass\)", default)
                if not sequence or table not in known:
                    continue
                await connection.execute(text(
                    f"SELECT setval(CAST(:sequence AS regclass), COALESCE(MAX({_quoted(column)}), 1), count(*) > 0) FROM {_quoted(table)}"
                ), {"sequence": sequence.group(1)})
    finally:
        await engine.dispose()
    return counts


def restore_kit(database_url: str, output_dir: Path) -> dict:
    database_name = validate_target(database_url)
    tables = json.loads((output_dir / "database.json").read_text(encoding="utf-8"))
    if not isinstance(tables, dict):
        raise ValueError("database.json debe contener un objeto de tablas")
    asyncio.run(_assert_empty(database_url))
    previous = os.environ.get("DATABASE_URL")
    try:
        os.environ["DATABASE_URL"] = database_url
        get_settings.cache_clear()
        cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        command.upgrade(cfg, "head")
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous
        get_settings.cache_clear()
    counts = asyncio.run(_import_tables(database_url, tables))
    return {"database": database_name, "filas_por_tabla": counts, "foreign_keys_verified": True, "values_verified": True}
