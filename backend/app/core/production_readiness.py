from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from app.config import (
    DEFAULT_DB_ENCRYPTION_KEY,
    DEFAULT_FRONTEND_URL,
    DEFAULT_JWT_SECRET_KEY,
    Settings,
)

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
    patient_portal_users: int = 0,
    patient_portal_unlinked_users: int = 0,
    admin_users: int = 0,
    admin_without_2fa: int = 0,
    backup_restore_test: dict[str, Any] | None = None,
    backup_directory: str | None = None,
    active_portal_invitations: int = 0,
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

    if not settings.backup_encryption_key or len(settings.backup_encryption_key) < 32:
        checks.append(_check("fail", "backups", "Clave de backup no dedicada", "BACKUP_ENCRYPTION_KEY no esta definida o es demasiado corta.", "Configurar una clave dedicada, larga y custodiada fuera del servidor."))
    else:
        checks.append(_check("ok", "backups", "Clave de backup dedicada", "Hay una clave especifica para cifrar backups.", "Custodiarla fuera del servidor y probar recuperacion."))

    if not settings.backup_external_copy_dir.strip():
        status = "fail" if settings.environment == "production" else "warn"
        checks.append(_check(status, "backups", "Destino externo no configurado", "No hay directorio/volumen externo para copiar backups automaticamente.", "Configurar BACKUP_EXTERNAL_COPY_DIR con un volumen externo, NAS o montaje cifrado."))
    else:
        checks.append(_check("ok", "backups", "Destino externo configurado", "Hay un destino privado configurado para copia externa automatica.", "Verificar permisos, cifrado del soporte y monitorizacion de espacio."))

    if "*" in settings.allowed_hosts_list or not settings.allowed_hosts_list:
        checks.append(_check("fail", "red", "Hosts permitidos abiertos", "ALLOWED_HOSTS no restringe hosts explicitos.", "Definir solo dominios/IPs reales de la instalacion."))
    elif settings.environment == "production" and any(host in {"localhost", "127.0.0.1", "::1", "test"} for host in settings.allowed_hosts_list):
        checks.append(_check("fail", "red", "Hosts locales en produccion", "ALLOWED_HOSTS contiene hosts de desarrollo.", "Dejar solo dominios/IPs reales de produccion."))
    else:
        checks.append(_check("ok", "red", "Hosts permitidos", "ALLOWED_HOSTS esta acotado.", "Revisarlo al anadir nuevas sedes o dominios."))

    if settings.frontend_url == DEFAULT_FRONTEND_URL:
        checks.append(_check("warn", "red", "Frontend local", "FRONTEND_URL apunta al entorno local.", "Configurar la URL HTTPS real de produccion."))
    elif not settings.frontend_url.startswith("https://") and settings.environment == "production":
        checks.append(_check("fail", "red", "Frontend sin HTTPS", "En produccion el frontend debe servirse con TLS.", "Usar HTTPS/TLS con certificado valido."))
    else:
        checks.append(_check("ok", "red", "CORS frontend", "El origen frontend esta definido.", "Evitar comodines y revisar cambios de dominio."))

    cors_methods = settings.cors_allowed_methods_list
    cors_headers = settings.cors_allowed_headers_list
    cors_origins = settings.cors_allowed_origins
    if "*" in cors_methods or "*" in cors_headers or "*" in cors_origins:
        checks.append(_check("fail", "red", "CORS demasiado permisivo", "La configuracion CORS contiene comodines.", "Definir origenes, metodos y cabeceras explicitos para la instalacion."))
    elif settings.environment == "production" and any(origin.startswith("http://") for origin in cors_origins):
        checks.append(_check("fail", "red", "CORS sin HTTPS", "Un origen CORS de produccion usa HTTP.", "Servir frontend y API mediante HTTPS/TLS antes de abrir una clinica real."))
    else:
        checks.append(_check("ok", "red", "CORS limitado", "CORS usa origen, metodos y cabeceras acotados.", "Revisar esta lista al anadir integraciones o dominios."))

    if settings.environment == "production" and not settings.auth_cookie_secure:
        checks.append(_check("fail", "auth", "Cookie no segura", "AUTH_COOKIE_SECURE esta desactivado en produccion.", "Activar AUTH_COOKIE_SECURE=true con HTTPS."))
    elif settings.auth_cookie_samesite == "none" and not settings.auth_cookie_secure:
        checks.append(_check("fail", "auth", "SameSite none sin Secure", "Las cookies SameSite=None requieren Secure.", "Usar Secure o cambiar SameSite a lax/strict."))
    else:
        checks.append(_check("ok", "auth", "Cookies de sesion", "La configuracion de cookie es coherente para el entorno actual.", "Endurecer a secure/strict si el flujo lo permite."))

    if settings.environment == "production" and settings.sql_echo:
        checks.append(_check("fail", "logs", "SQL echo activo", "SQL_ECHO puede volcar datos sensibles en logs.", "Desactivar SQL_ECHO en produccion y revisar retencion de logs."))
    elif settings.sql_echo:
        checks.append(_check("warn", "logs", "SQL echo activo en desarrollo", "Las consultas pueden incluir datos personales en logs locales.", "Usarlo solo para depuracion puntual."))
    else:
        checks.append(_check("ok", "logs", "SQL echo desactivado", "No se imprimen consultas SQL por configuracion.", "Mantener logs sanitizados y con retencion definida."))

    if admin_users <= 0:
        checks.append(_check("fail", "auth", "Sin usuarios admin", "No hay administradores configurados.", "Crear al menos un admin nominal con credenciales fuertes y 2FA."))
    elif admin_without_2fa > 0:
        checks.append(_check("fail", "auth", "Admins sin 2FA", f"Hay {admin_without_2fa} administrador(es) sin segundo factor.", "Activar 2FA para todos los administradores antes de produccion."))
    else:
        checks.append(_check("ok", "auth", "2FA admin", "Los administradores tienen 2FA activado.", "Extender 2FA a roles clinicos si el despliegue lo permite."))

    if active_portal_invitations > 0:
        checks.append(_check(
            "ok",
            "portal paciente",
            "Invitaciones de portal activas",
            f"Hay {active_portal_invitations} invitacion(es) activas con token.",
            "Usar expiracion corta, revocar enlaces no utilizados y evitar enviar datos por canales inseguros.",
        ))
    elif patient_portal_unlinked_users > 0:
        checks.append(_check(
            "fail",
            "portal paciente",
            "Usuarios paciente sin ficha",
            f"Hay {patient_portal_unlinked_users} usuario(s) paciente sin paciente_id vinculado.",
            "Vincular cada usuario paciente a su ficha antes de activar el portal en produccion.",
        ))
    elif patient_portal_users > 0:
        checks.append(_check(
            "ok",
            "portal paciente",
            "Usuarios paciente vinculados",
            f"Hay {patient_portal_users} usuario(s) paciente vinculados a ficha.",
            "Mantener altas del portal mediante invitacion controlada o vinculacion explicita.",
        ))
    else:
        checks.append(_check(
            "warn",
            "portal paciente",
            "Portal sin usuarios paciente",
            "No hay usuarios con rol paciente configurados.",
            "Crear usuarios paciente solo cuando exista flujo seguro de invitacion y vinculacion.",
        ))

    if settings.environment == "production" and not settings.whatsapp_webhook_token.strip():
        checks.append(_check("fail", "integraciones", "Webhook WhatsApp sin token", "El endpoint de webhook existe y no hay token configurado.", "Configurar WHATSAPP_WEBHOOK_TOKEN largo y aleatorio o bloquear la ruta en el proxy."))
    elif not settings.whatsapp_webhook_token.strip():
        checks.append(_check("warn", "integraciones", "Webhook WhatsApp sin token", "En desarrollo se permite, pero en produccion quedara bloqueado.", "Definir token antes de probar integraciones reales."))
    else:
        checks.append(_check("ok", "integraciones", "Webhook WhatsApp protegido", "Hay token configurado para validar el webhook.", "Rotarlo si se expone y evitar tokens en query string."))

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
        if last_status not in {"correcto", "verificado", "restauracion_probada"}:
            checks.append(_check("fail", "backups", "Ultimo backup incorrecto", f"El ultimo backup tiene estado {last_status or 'desconocido'}.", "Resolver el error y repetir/verificar copia."))
        elif not last_backup.get("cifrado"):
            checks.append(_check("fail", "backups", "Backup sin cifrar", "El ultimo backup no consta como cifrado.", "Usar backups cifrados y proteger clave fuera del servidor."))
        elif not (last_backup.get("incluye_bd") and last_backup.get("incluye_uploads")):
            checks.append(_check("fail", "backups", "Backup no completo", "El ultimo backup no incluye base de datos y uploads/documentos a la vez.", "Crear backups de alcance full para entorno comercial."))
        elif not is_recent:
            checks.append(_check("warn", "backups", "Backup antiguo", "El ultimo backup correcto no es reciente.", "Activar y vigilar backup automatico diario."))
        else:
            checks.append(_check("ok", "backups", "Backup reciente", "Existe un backup correcto, cifrado y reciente.", "Mantener prueba de restauracion periodica."))

        if not last_backup.get("destino_externo"):
            status = "fail" if settings.environment == "production" else "warn"
            checks.append(_check(status, "backups", "Sin copia externa verificada", "El ultimo backup no consta como copiado a destino externo.", "Configurar BACKUP_EXTERNAL_COPY_DIR, repetir backup y verificar hash de la copia."))
        else:
            checks.append(_check("ok", "backups", "Copia externa verificada", "El ultimo backup fue copiado a un destino externo con hash coincidente.", "Verificar permisos, retencion y recuperacion desde esa custodia."))

        if not last_backup.get("retention_days") or not last_backup.get("retention_expires_at"):
            checks.append(_check("fail", "backups", "Retencion no definida", "El backup no tiene caducidad/retencion registrada.", "Definir retencion minima y calendario de purga segura."))
        else:
            checks.append(_check("ok", "backups", "Retencion registrada", f"Retencion de {last_backup.get('retention_days')} dias registrada.", "Revisar politica segun contrato y normativa aplicable."))

    if not backup_restore_test:
        checks.append(_check("fail", "backups", "Restauracion no simulada", "No hay resultado de prueba de restauracion.", "Ejecutar la simulacion y una restauracion real en entorno aislado."))
    elif not backup_restore_test.get("ok"):
        checks.append(_check("fail", "backups", "Restauracion simulada con incidencias", str(backup_restore_test.get("motivo") or "La simulacion no fue correcta."), "Corregir estructura/clave/fichero y repetir la prueba."))
    else:
        checks.append(_check("ok", "backups", "Restauracion simulada", "El ultimo backup se descifra y valida en modo dry-run.", "Programar restauracion real periodica en una BD aislada."))

    if last_backup and last_backup.get("restauracion_resultado") == "ok" and last_backup.get("restauracion_probada_at"):
        checks.append(_check("ok", "backups", "Restauracion real registrada", "Hay una prueba de restauracion marcada como correcta.", "Repetir la prueba de forma periodica y conservar evidencias."))
    else:
        checks.append(_check("fail", "backups", "Sin restauracion real registrada", "No consta una restauracion probada en entorno aislado.", "Restaurar un backup en una BD de prueba y registrar el resultado."))

    public_backup_dir = False
    normalized_backup_dir = (backup_directory or "").replace("\\", "/").lower()
    if normalized_backup_dir:
        public_backup_dir = any(part in normalized_backup_dir for part in {"/uploads/", "/public/", "/static/", "/dist/"})
    if public_backup_dir:
        checks.append(_check("fail", "backups", "Directorio de backups publico", "La ruta de backups parece estar bajo un directorio servible.", "Mover backups fuera de static/uploads/public y servirlos solo por endpoint admin."))
    else:
        checks.append(_check("ok", "backups", "Directorio de backups no publico", "La ruta configurada no parece estar bajo static/uploads/public.", "Confirmar permisos de filesystem y bloqueo en proxy."))

    checks.append(_check("ok", "documentos", "Baja logica documental", "Los documentos de paciente se ocultan mediante baja logica y conservan trazabilidad.", "Definir plazos de conservacion y procedimiento de bloqueo/borrado validado externamente."))

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

    checks.append(_check(
        "warn",
        "legal/fiscal",
        "Validacion externa pendiente",
        "DentCore puede comprobar configuracion tecnica, pero no acredita por si solo cumplimiento RGPD/LOPDGDD ni VERI*FACTU.",
        "Obtener validacion juridica y fiscal externa antes de marcar la instalacion como apta comercial.",
    ))

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
