from datetime import UTC, datetime

from app.config import Settings
from app.services.production_readiness import build_production_readiness_report


def _strong_production_settings(**overrides) -> Settings:
    values = {
        "environment": "production",
        "jwt_secret_key": "jwt-" + "x" * 48,
        "db_encryption_key": "db-" + "y" * 48,
        "backup_encryption_key": "bak-" + "z" * 48,
        "backup_external_copy_dir": "/mnt/dentcore-backups",
        "allowed_hosts": "clinic.example.com",
        "frontend_url": "https://clinic.example.com",
        "auth_cookie_secure": True,
        "verifactu_mode": "verifactu",
        "sif_codigo": "DENTCORE-SIF",
        "sif_productor_nif": "B12345678",
        "nif_emisor": "B87654321",
        "whatsapp_webhook_token": "whatsapp-" + "t" * 48,
    }
    values.update(overrides)
    return Settings(**values)


def _last_backup(**overrides) -> dict:
    values = {
        "estado": "restauracion_probada",
        "started_at": datetime.now(UTC),
        "cifrado": True,
        "hash_sha256": "a" * 64,
        "incluye_bd": True,
        "incluye_uploads": True,
        "destino_externo": "NAS cifrado",
        "retention_days": 180,
        "retention_expires_at": datetime.now(UTC),
        "restauracion_resultado": "ok",
        "restauracion_probada_at": datetime.now(UTC),
    }
    values.update(overrides)
    return values


def _report(settings: Settings, **overrides) -> dict:
    values = {
        "audit_events": 10,
        "rf_count": 3,
        "sif_event_count": 3,
        "patient_portal_users": 1,
        "patient_portal_unlinked_users": 0,
        "admin_users": 1,
        "admin_without_2fa": 0,
        "backup_restore_test": {"ok": True},
        "backup_directory": "/var/lib/dentcore/backups",
        "active_portal_invitations": 1,
        "last_backup": _last_backup(),
    }
    values.update(overrides)
    return build_production_readiness_report(settings, **values)


def test_preflight_ok_checks_con_configuracion_fuerte() -> None:
    report = _report(_strong_production_settings())
    ok_titles = {check["titulo"] for check in report["checks"] if check["status"] == "ok"}

    assert "Modo produccion" in ok_titles
    assert "CORS limitado" in ok_titles
    assert "Backup reciente" in ok_titles
    assert "Restauracion real registrada" in ok_titles


def test_preflight_warn_si_falta_validacion_legal_fiscal_externa() -> None:
    report = _report(_strong_production_settings())

    assert report["overall"] == "warn"
    assert any(
        check["status"] == "warn" and check["titulo"] == "Validacion externa pendiente"
        for check in report["checks"]
    )


def test_preflight_fail_si_cors_o_backups_no_son_comerciales() -> None:
    report = _report(
        _strong_production_settings(
            cors_allowed_methods="*",
        ),
        last_backup=None,
        backup_restore_test=None,
    )

    assert report["overall"] == "fail"
    assert any(
        check["status"] == "fail" and check["titulo"] == "CORS demasiado permisivo"
        for check in report["checks"]
    )
    assert any(
        check["status"] == "fail" and check["titulo"] == "Sin backups registrados"
        for check in report["checks"]
    )
