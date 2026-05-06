from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from app.config import DEFAULT_DB_ENCRYPTION_KEY, DEFAULT_FRONTEND_URL, DEFAULT_JWT_SECRET_KEY, Settings


CheckStatus = str


def _check(status: CheckStatus, area: str, titulo: str, detalle: str, accion: str) -> dict[str, str]:
    return {
        "status": status,
        "area": area,
        "titulo": titulo,
        "detalle": detalle,
        "accion_recomendada": accion,
    }


def _is_placeholder_tax_id(value: str | None) -> bool:
    normalized = (value or "").strip().upper()
    return not normalized or normalized in {"B00000000", "A00000000", "00000000T", "X0000000T"}


def build_production_readiness_report(
    settings: Settings,
    *,
    audit_events: int,
    last_backup: dict[str, Any] | None,
    rf_count: int,
    sif_event_count: int,
) -> dict[str, Any]:
    checks: list[dict[str, str]] = []

    if settings.environment == "production":
        checks.append(_check("ok", "entorno", "Modo produccion", "La API arranca en modo produccion.", "Mantener docs publicas desactivadas y despliegue versionado."))
    else:
        checks.append(_check("warn", "entorno", "Modo desarrollo", "El entorno actual no es produccion.", "Usar ENVIRONMENT=production en el despliegue comercial."))

    if settings.jwt_secret_key == DEFAULT_JWT_SECRET_KEY or len(settings.jwt_secret_key) < 32:
        checks.append(_check("fail", "seguridad", "JWT secret debil", "El secreto JWT es el valor de desarrollo o demasiado corto.", "Configurar JWT_SECRET_KEY unico, aleatorio y de al menos 32 caracteres."))
    else:
        checks.append(_check("ok", "seguridad", "JWT secret", "Se usa un secreto JWT no trivial.", "Rotarlo de forma controlada si hay sospecha de exposicion."))

    if settings.db_encryption_key == DEFAULT_DB_ENCRYPTION_KEY or len(settings.db_encryption_key) < 32:
        checks.append(_check("fail", "seguridad", "Clave de cifrado debil", "La clave de cifrado de datos coincide con desarrollo o es demasiado corta.", "Configurar DB_ENCRYPTION_KEY unico y custodiarlo fuera del repositorio."))
    else:
        checks.append(_check("ok", "seguridad", "Cifrado de datos", "La clave configurada no parece ser la de desarrollo.", "Documentar rotacion y recuperacion de claves."))

    if "*" in settings.allowed_hosts_list or not settings.allowed_hosts_list:
        checks.append(_check("fail", "red", "Hosts permitidos abiertos", "ALLOWED_HOSTS no restringe hosts explicitos.", "Definir solo dominios/IPs reales de la instalacion."))
    else:
        checks.append(_check("ok", "red", "Hosts permitidos", "ALLOWED_HOSTS esta acotado.", "Revisarlo al anadir nuevas sedes o dominios."))

    if settings.frontend_url == DEFAULT_FRONTEND_URL:
        checks.append(_check("warn", "red", "Frontend local", "FRONTEND_URL apunta al entorno local.", "Configurar la URL HTTPS real de produccion."))
    elif not settings.frontend_url.startswith("https://") and settings.environment == "production":
        checks.append(_check("fail", "red", "Frontend sin HTTPS", "En produccion el frontend debe servirse con TLS.", "Usar HTTPS/TLS con certificado valido."))
    else:
        checks.append(_check("ok", "red", "CORS frontend", "El origen frontend esta definido.", "Evitar comodines y revisar cambios de dominio."))

    if settings.environment == "production" and not settings.auth_cookie_secure:
        checks.append(_check("fail", "auth", "Cookie no segura", "AUTH_COOKIE_SECURE esta desactivado en produccion.", "Activar AUTH_COOKIE_SECURE=true con HTTPS."))
    elif settings.auth_cookie_samesite == "none" and not settings.auth_cookie_secure:
        checks.append(_check("fail", "auth", "SameSite none sin Secure", "Las cookies SameSite=None requieren Secure.", "Usar Secure o cambiar SameSite a lax/strict."))
    else:
        checks.append(_check("ok", "auth", "Cookies de sesion", "La configuracion de cookie es coherente para el entorno actual.", "Endurecer a secure/strict si el flujo lo permite."))

    if audit_events <= 0:
        checks.append(_check("warn", "auditoria", "Auditoria sin eventos", "No hay eventos de auditoria registrados todavia.", "Verificar accesos a historia clinica, documentos, facturacion y cambios de agenda."))
    else:
        checks.append(_check("ok", "auditoria", "Auditoria activa", f"Hay {audit_events} eventos de auditoria.", "Revisar retencion, exportacion y alertas periodicas."))

    if not last_backup:
        checks.append(_check("fail", "backups", "Sin backups registrados", "No consta ninguna copia de seguridad.", "Crear backup cifrado y probar restauracion antes de produccion."))
    else:
        last_started = last_backup.get("started_at")
        last_status = str(last_backup.get("estado") or "")
        if isinstance(last_started, datetime) and last_started.tzinfo is None:
            last_started = last_started.replace(tzinfo=UTC)
        is_recent = isinstance(last_started, datetime) and last_started >= datetime.now(UTC) - timedelta(days=2)
        if last_status != "correcto":
            checks.append(_check("fail", "backups", "Ultimo backup incorrecto", f"El ultimo backup tiene estado {last_status or 'desconocido'}.", "Resolver el error y repetir/verificar copia."))
        elif not last_backup.get("cifrado"):
            checks.append(_check("fail", "backups", "Backup sin cifrar", "El ultimo backup no consta como cifrado.", "Usar backups cifrados y proteger clave fuera del servidor."))
        elif not is_recent:
            checks.append(_check("warn", "backups", "Backup antiguo", "El ultimo backup correcto no es reciente.", "Activar y vigilar backup automatico diario."))
        else:
            checks.append(_check("ok", "backups", "Backup reciente", "Existe un backup correcto, cifrado y reciente.", "Mantener prueba de restauracion periodica."))

    if settings.verifactu_mode != "verifactu":
        checks.append(_check("fail", "fiscal", "VERI*FACTU no activo", "La modalidad SIF no esta en verifactu.", "Mantener VERIFACTU_MODE=verifactu salvo validacion fiscal expresa."))
    elif _is_placeholder_tax_id(settings.sif_productor_nif) or _is_placeholder_tax_id(settings.nif_emisor):
        checks.append(_check("warn", "fiscal", "NIF fiscal placeholder", "El productor o emisor fiscal parece de prueba.", "Configurar NIF real, productor y version antes de declarar el SIF."))
    elif rf_count <= 0:
        checks.append(_check("warn", "fiscal", "Sin registros RF", "No hay registros de facturacion sellados todavia.", "Probar facturas emitidas, anulaciones y export SIF con datos de ensayo."))
    else:
        checks.append(_check("ok", "fiscal", "Cadena RF", f"Hay {rf_count} registros de facturacion.", "Validar cadena, QR, PDFs y export con asesor fiscal."))

    if sif_event_count <= 0:
        checks.append(_check("warn", "fiscal", "Sin eventos SIF", "No hay eventos tecnicos SIF registrados.", "Registrar eventos de emision, anulacion, remision y exportacion."))
    else:
        checks.append(_check("ok", "fiscal", "Eventos SIF", f"Hay {sif_event_count} eventos SIF.", "Conservarlos con la misma politica de inalterabilidad."))

    totals = {
        "ok": sum(1 for item in checks if item["status"] == "ok"),
        "warn": sum(1 for item in checks if item["status"] == "warn"),
        "fail": sum(1 for item in checks if item["status"] == "fail"),
    }
    overall = "fail" if totals["fail"] else "warn" if totals["warn"] else "ok"

    return {
        "overall": overall,
        "generated_at": datetime.now(UTC).isoformat(),
        "totals": totals,
        "checks": checks,
        "next_steps": [
            "Validacion juridica RGPD/LOPDGDD y contrato de encargado.",
            "Validacion fiscal VERI*FACTU/SIF con asesor especializado.",
            "Prueba de restauracion de backup y plan de continuidad.",
            "Pentest o revision OWASP antes de venta comercial.",
            "Manual de usuario, terminos SaaS, soporte y SLA.",
        ],
    }
