from types import SimpleNamespace

import pytest

from scripts import restore_isolated


@pytest.fixture
def isolated_source(monkeypatch):
    monkeypatch.setattr(
        restore_isolated,
        "get_settings",
        lambda: SimpleNamespace(database_url="postgresql+asyncpg://test@127.0.0.1:55434/dentcore_source_test"),
    )


@pytest.mark.parametrize("target", [
    "sqlite:///dentcore_restore_run_test",
    "postgresql+asyncpg://test@production/dentcore_restore_run_test",
    "postgresql+asyncpg://test@127.0.0.1/dentcore",
    "postgresql+asyncpg://test@127.0.0.1/dentcore_restore_test",
    "postgresql+asyncpg://test@127.0.0.1/dentcore_restore_RUN_test",
])
def test_restore_rejects_nonisolated_targets(isolated_source, target):
    with pytest.raises(ValueError):
        restore_isolated.validate_target(target)


def test_restore_rejects_application_database(monkeypatch):
    target = "postgresql+asyncpg://test@127.0.0.1:55434/dentcore_restore_run_test"
    monkeypatch.setattr(restore_isolated, "get_settings", lambda: SimpleNamespace(database_url=target))
    with pytest.raises(ValueError, match="base configurada"):
        restore_isolated.validate_target(target)


def test_restore_accepts_explicit_local_target(isolated_source):
    assert restore_isolated.validate_target(
        "postgresql+asyncpg://test@127.0.0.1:55434/dentcore_restore_run_test"
    ) == "dentcore_restore_run_test"


def test_restore_rejects_application_database_through_localhost_alias(monkeypatch):
    monkeypatch.setattr(restore_isolated, "get_settings", lambda: SimpleNamespace(
        database_url="postgresql+asyncpg://test@localhost/dentcore_restore_run_test"
    ))
    with pytest.raises(ValueError, match="base configurada"):
        restore_isolated.validate_target(
            "postgresql+asyncpg://test@127.0.0.1:5432/dentcore_restore_run_test"
        )


async def test_restore_rejects_unknown_schema_before_connecting(monkeypatch):
    def unexpected_connection(*args, **kwargs):
        raise AssertionError("No debe conectarse con un esquema incompatible")

    monkeypatch.setattr(restore_isolated, "create_async_engine", unexpected_connection)
    with pytest.raises(ValueError, match="esquema actual"):
        await restore_isolated._import_tables("unused", {"arbitrary_table": []})


def test_restore_existing_database_never_runs_migrations(isolated_source, tmp_path, monkeypatch):
    (tmp_path / "database.json").write_text("{}", encoding="utf-8")

    async def nonempty(*args):
        raise ValueError("El destino ya contiene tablas; se rechaza modificarlo")

    def unexpected_migration(*args):
        raise AssertionError("No debe migrar una base ocupada")

    monkeypatch.setattr(restore_isolated, "_assert_empty", nonempty)
    monkeypatch.setattr(restore_isolated.command, "upgrade", unexpected_migration)
    with pytest.raises(ValueError, match="ya contiene tablas"):
        restore_isolated.restore_kit(
            "postgresql+asyncpg://test@127.0.0.1:55434/dentcore_restore_run_test", tmp_path
        )
