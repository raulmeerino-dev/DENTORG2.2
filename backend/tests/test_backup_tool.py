import gzip
import hashlib
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import get_settings
from app.services.backup_service import _backup_key, _encrypt
from scripts import backup_tool


def test_backup_tool_restore_check_valida_backup_cifrado(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.setenv("BACKUP_ENCRYPTION_KEY", "restore-check-key-" + "x" * 40)
    get_settings.cache_clear()
    payload = {
        "version": 2,
        "created_at": "2026-06-25T12:00:00+00:00",
        "scope": "full",
        "includes": {"database": True, "uploads": True, "env_files": False, "secrets": False},
        "database": {"tables": {"usuarios": [], "pacientes": []}},
        "tables": {"usuarios": [], "pacientes": []},
        "uploads": {"root": "uploads", "files": []},
    }
    raw = gzip.compress(json.dumps(payload).encode("utf-8"))
    encrypted = _encrypt(raw)
    backup_path = tmp_path / "backup.dentcorebak"
    backup_path.write_bytes(encrypted)
    expected_hash = hashlib.sha256(encrypted).hexdigest()

    try:
        exit_code = backup_tool.main([
            "restore-check",
            "--file",
            str(backup_path),
            "--expected-hash",
            expected_hash,
        ])
    finally:
        get_settings.cache_clear()

    assert exit_code == 0
    output = json.loads(capsys.readouterr().out)
    assert output["ok"] is True
    assert output["dry_run"] is True
    assert output["restore_ready"] is True
    assert output["tablas"] == 2
    assert output["kit_conservado"] is False


def test_backup_tool_restore_check_acepta_backup_legacy_dentcore(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.setenv("BACKUP_ENCRYPTION_KEY", "restore-check-key-" + "x" * 40)
    get_settings.cache_clear()
    payload = {
        "version": 2,
        "created_at": "2026-06-25T12:00:00+00:00",
        "scope": "database",
        "includes": {"database": True, "uploads": False, "env_files": False, "secrets": False},
        "database": {"tables": {"usuarios": []}},
        "tables": {"usuarios": []},
    }
    raw = gzip.compress(json.dumps(payload).encode("utf-8"))
    nonce = os.urandom(12)
    encrypted = b"DENTCOREBAK1" + nonce + AESGCM(_backup_key("dentcore-backup")).encrypt(nonce, raw, None)
    backup_path = tmp_path / "backup.dentcorebak"
    backup_path.write_bytes(encrypted)

    try:
        exit_code = backup_tool.main(["restore-check", "--file", str(backup_path)])
    finally:
        get_settings.cache_clear()

    assert exit_code == 0
    output = json.loads(capsys.readouterr().out)
    assert output["ok"] is True
    assert output["tablas"] == 1
