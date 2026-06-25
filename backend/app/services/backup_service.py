import gzip
import hashlib
import json
import os
import shutil
from base64 import b64decode, b64encode
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import Base
from app.models.backup import BackupRegistro

BACKUP_DIR = Path(__file__).resolve().parents[2] / "backups"
UPLOADS_DIR = Path("uploads")
BACKUP_SCOPES = {"database", "uploads", "full"}


def _backup_key() -> bytes:
    settings = get_settings()
    key_source = settings.backup_encryption_key or settings.db_encryption_key
    if settings.backup_encryption_key and len(settings.backup_encryption_key) < 32:
        raise ValueError("BACKUP_ENCRYPTION_KEY debe tener al menos 32 caracteres")
    if settings.environment == "production" and len(key_source) < 32:
        raise ValueError("Clave de backup insegura para produccion")
    return hashlib.sha256(f"{key_source}:dentorg2-backup".encode()).digest()


def _encrypt(raw: bytes) -> bytes:
    nonce = os.urandom(12)
    encrypted = AESGCM(_backup_key()).encrypt(nonce, raw, None)
    return b"DENTORG2BAK1" + nonce + encrypted


def _decrypt(raw: bytes) -> bytes:
    prefix = b"DENTORG2BAK1"
    if not raw.startswith(prefix):
        raise ValueError("Formato de backup no reconocido")
    nonce = raw[len(prefix):len(prefix) + 12]
    payload = raw[len(prefix) + 12:]
    return AESGCM(_backup_key()).decrypt(nonce, payload, None)


def _validate_backup_payload(payload: dict) -> None:
    if not isinstance(payload, dict):
        raise ValueError("Payload de backup invalido")
    includes = payload.get("includes") if isinstance(payload.get("includes"), dict) else {}
    includes_db = bool(includes.get("database", "database" in payload or "tables" in payload))
    if includes_db and not _payload_tables(payload):
        raise ValueError("Payload de backup sin tablas de base de datos")
    if includes.get("uploads") and "uploads" not in payload:
        raise ValueError("Payload de backup sin manifest de uploads")


def _load_backup_payload_from_path(path: Path, expected_hash: str | None = None) -> tuple[dict, str, int]:
    if not path.exists():
        raise FileNotFoundError("Archivo no encontrado")
    raw = path.read_bytes()
    actual_hash = hashlib.sha256(raw).hexdigest()
    if expected_hash and actual_hash != expected_hash:
        raise ValueError("Hash no coincide")
    decompressed = gzip.decompress(_decrypt(raw))
    payload = json.loads(decompressed.decode("utf-8"))
    _validate_backup_payload(payload)
    return payload, actual_hash, len(raw)


def _load_backup_payload(registro: BackupRegistro) -> tuple[dict, str, int]:
    if not registro.ruta:
        raise ValueError("Backup sin ruta de archivo")
    return _load_backup_payload_from_path(Path(registro.ruta), registro.hash_sha256)


def _safe_table_name(table_name: str) -> str:
    return '"' + table_name.replace('"', '""') + '"'


def _is_relative_to(path: Path, base: Path) -> bool:
    try:
        path.relative_to(base)
        return True
    except ValueError:
        return False


def _validate_external_copy_dir(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    backup_root = BACKUP_DIR.resolve()
    if resolved == backup_root or _is_relative_to(resolved, backup_root):
        raise ValueError("BACKUP_EXTERNAL_COPY_DIR no puede estar dentro del directorio local de backups")

    normalized = resolved.as_posix().lower()
    public_markers = ("/uploads/", "/public/", "/static/", "/dist/")
    if any(marker in normalized for marker in public_markers):
        raise ValueError("BACKUP_EXTERNAL_COPY_DIR parece estar dentro de un directorio publico")
    return resolved


def copiar_backup_a_destino_externo(path: Path, expected_hash: str) -> str | None:
    settings = get_settings()
    raw_destination = settings.backup_external_copy_dir.strip()
    if not raw_destination:
        return None

    destination_dir = _validate_external_copy_dir(Path(raw_destination))
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / path.name
    shutil.copy2(path, destination)
    copied_hash = hashlib.sha256(destination.read_bytes()).hexdigest()
    if copied_hash != expected_hash:
        try:
            destination.unlink()
        finally:
            raise ValueError("Hash de copia externa no coincide")
    return settings.backup_external_location.strip() or "filesystem externo configurado"


async def _snapshot_database(db: AsyncSession) -> dict:
    tables: dict[str, object] = {}
    for table in Base.metadata.sorted_tables:
        table_name = table.name
        quoted = _safe_table_name(table_name)
        result = await db.execute(
            text(f"SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT * FROM {quoted}) t")
        )
        rows = result.scalar_one()
        tables[table_name] = rows
    return tables


def _snapshot_uploads() -> dict:
    files: list[dict[str, object]] = []
    if not UPLOADS_DIR.exists():
        return {"root": "uploads", "files": files}

    root = UPLOADS_DIR.resolve()
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        try:
            resolved = path.resolve()
            relative = resolved.relative_to(root).as_posix()
        except ValueError:
            continue
        raw = resolved.read_bytes()
        files.append({
            "path": relative,
            "size": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "content_b64": b64encode(raw).decode("ascii"),
        })
    return {"root": "uploads", "files": files}


async def _build_backup_payload(db: AsyncSession, alcance: str) -> dict:
    if alcance not in BACKUP_SCOPES:
        raise ValueError("Alcance de backup no valido")

    includes_db = alcance in {"database", "full"}
    includes_uploads = alcance in {"uploads", "full"}
    payload: dict[str, object] = {
        "version": 2,
        "created_at": datetime.now(UTC).isoformat(),
        "scope": alcance,
        "includes": {
            "database": includes_db,
            "uploads": includes_uploads,
            "env_files": False,
            "secrets": False,
        },
    }
    if includes_db:
        tables = await _snapshot_database(db)
        payload["database"] = {"tables": tables}
        payload["tables"] = tables
    if includes_uploads:
        payload["uploads"] = _snapshot_uploads()
    return payload


def _payload_tables(payload: dict) -> dict:
    database = payload.get("database")
    if isinstance(database, dict) and isinstance(database.get("tables"), dict):
        return database["tables"]
    tables = payload.get("tables")
    return tables if isinstance(tables, dict) else {}


def _payload_upload_files(payload: dict) -> list[dict]:
    uploads = payload.get("uploads")
    if not isinstance(uploads, dict):
        return []
    files = uploads.get("files")
    return files if isinstance(files, list) else []


def inspeccionar_backup_file(path: Path, expected_hash: str | None = None) -> dict:
    payload, actual_hash, raw_size = _load_backup_payload_from_path(path, expected_hash)
    tables = _payload_tables(payload)
    upload_files = _payload_upload_files(payload)
    return {
        "ok": True,
        "hash_actual": actual_hash,
        "tamano_bytes": raw_size,
        "version": payload.get("version"),
        "created_at": payload.get("created_at"),
        "alcance": payload.get("scope"),
        "tablas": len(tables),
        "uploads": len(upload_files),
        "incluye_bd": bool(payload.get("includes", {}).get("database")) if isinstance(payload.get("includes"), dict) else bool(tables),
        "incluye_uploads": bool(payload.get("includes", {}).get("uploads")) if isinstance(payload.get("includes"), dict) else bool(upload_files),
    }


def extraer_backup_file(path: Path, output_dir: Path, expected_hash: str | None = None) -> dict:
    payload, actual_hash, raw_size = _load_backup_payload_from_path(path, expected_hash)
    output = output_dir.expanduser().resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError("El directorio de salida debe estar vacio para evitar mezclar restauraciones")
    output.mkdir(parents=True, exist_ok=True)

    tables = _payload_tables(payload)
    if tables:
        (output / "database.json").write_text(
            json.dumps(tables, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )

    upload_root = output / "uploads"
    extracted_uploads = 0
    for item in _payload_upload_files(payload):
        relative_path = str(item.get("path", ""))
        if not relative_path or relative_path.startswith("/") or ".." in Path(relative_path).parts:
            raise ValueError(f"Ruta insegura en manifest de uploads: {relative_path or '<vacia>'}")
        content = b64decode(str(item.get("content_b64", "")), validate=True)
        if hashlib.sha256(content).hexdigest() != item.get("sha256"):
            raise ValueError(f"Hash de upload no coincide: {relative_path}")
        destination = (upload_root / relative_path).resolve()
        if not _is_relative_to(destination, upload_root.resolve()):
            raise ValueError(f"Ruta de salida insegura: {relative_path}")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
        extracted_uploads += 1

    manifest = {
        "ok": True,
        "hash_actual": actual_hash,
        "tamano_bytes": raw_size,
        "created_at": payload.get("created_at"),
        "version": payload.get("version"),
        "alcance": payload.get("scope"),
        "tablas": len(tables),
        "uploads": extracted_uploads,
        "output_dir": str(output),
    }
    (output / "restore-summary.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    return manifest


async def crear_backup_cifrado(
    db: AsyncSession,
    *,
    created_by_id: UUID | None,
    tipo: str = "manual",
    alcance: str = "full",
    retention_days: int | None = None,
) -> BackupRegistro:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    settings = get_settings()
    retention = retention_days if retention_days is not None else settings.backup_retention_days
    registro = BackupRegistro(
        tipo=tipo,
        alcance=alcance,
        estado="en_proceso",
        created_by_id=created_by_id,
        ubicacion="local",
        destino_externo=None,
        incluye_bd=alcance in {"database", "full"},
        incluye_uploads=alcance in {"uploads", "full"},
        retention_days=retention,
        retention_expires_at=datetime.now(UTC) + timedelta(days=retention) if retention else None,
    )
    db.add(registro)
    await db.flush()
    try:
        snapshot = await _build_backup_payload(db, alcance)
        raw = json.dumps(snapshot, ensure_ascii=False, default=str, separators=(",", ":")).encode("utf-8")
        compressed = gzip.compress(raw, compresslevel=6)
        encrypted = _encrypt(compressed)
        backup_hash = hashlib.sha256(encrypted).hexdigest()
        filename = f"dentorg2-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}-{registro.id}.dentorg2bak"
        path = BACKUP_DIR / filename
        path.write_bytes(encrypted)

        registro.estado = "correcto"
        registro.ruta = str(path)
        registro.hash_sha256 = backup_hash
        registro.tamano_bytes = len(encrypted)
        registro.cifrado = True
        registro.finished_at = datetime.now(UTC)
        try:
            external_label = copiar_backup_a_destino_externo(path, backup_hash)
        except Exception as external_exc:
            registro.error = f"Backup local correcto, copia externa fallida: {external_exc}"[:2000]
        else:
            if external_label:
                registro.ubicacion = "local+external"
                registro.destino_externo = external_label
                registro.error = None
    except Exception as exc:
        registro.estado = "error"
        registro.error = str(exc)[:2000]
        registro.finished_at = datetime.now(UTC)
    await db.flush()
    return registro


def verificar_backup_archivo(registro: BackupRegistro) -> dict:
    try:
        payload, actual_hash, raw_size = _load_backup_payload(registro)
    except Exception as exc:
        registro.estado = "fallido"
        registro.error = str(exc)[:2000]
        return {"ok": False, "motivo": f"No se pudo descifrar o leer: {exc}"}
    tables = _payload_tables(payload)
    upload_files = _payload_upload_files(payload)
    for item in upload_files:
        try:
            content = b64decode(str(item.get("content_b64", "")), validate=True)
        except Exception as exc:
            registro.estado = "fallido"
            registro.error = f"Upload corrupto en backup: {exc}"[:2000]
            return {"ok": False, "motivo": f"Upload corrupto en backup: {exc}"}
        if hashlib.sha256(content).hexdigest() != item.get("sha256"):
            registro.estado = "fallido"
            registro.error = "Hash de upload no coincide"
            return {"ok": False, "motivo": "Hash de upload no coincide"}

    registro.estado = "verificado" if registro.estado != "restauracion_probada" else registro.estado
    registro.verificado_at = datetime.now(UTC)
    registro.error = None
    return {
        "ok": True,
        "hash_actual": actual_hash,
        "tamano_bytes": raw_size,
        "alcance": payload.get("scope") or registro.alcance,
        "tablas": len(tables),
        "uploads": len(upload_files),
        "created_at": payload.get("created_at"),
    }


def simular_restauracion_backup(registro: BackupRegistro) -> dict:
    """
    Valida que el backup podria alimentar una restauracion sin escribir en la BD.

    Esta prueba no sustituye a una restauracion real en entorno aislado, pero
    confirma descifrado, integridad, formato y presencia de tablas criticas.
    """
    required_tables = {"usuarios", "pacientes", "audit_log", "facturas", "registros_facturacion"}
    try:
        payload, actual_hash, raw_size = _load_backup_payload(registro)
    except Exception as exc:
        return {"ok": False, "motivo": f"No se pudo preparar restauracion: {exc}"}

    tables = _payload_tables(payload)
    upload_files = _payload_upload_files(payload)
    includes = payload.get("includes") if isinstance(payload.get("includes"), dict) else {}
    includes_db = bool(includes.get("database", registro.incluye_bd))
    includes_uploads = bool(includes.get("uploads", registro.incluye_uploads))
    missing = sorted(required_tables - set(tables)) if includes_db else []
    row_counts = {
        table_name: len(rows) if isinstance(rows, list) else 0
        for table_name, rows in tables.items()
    }
    warnings: list[str] = []
    for table_name, rows in tables.items():
        if not isinstance(rows, list):
            warnings.append(f"{table_name}: contenido no es una lista de filas")
    if includes_uploads and not upload_files:
        warnings.append("uploads: backup sin ficheros de uploads")
    for item in upload_files:
        path = str(item.get("path", ""))
        if not path or path.startswith("/") or ".." in Path(path).parts:
            warnings.append(f"uploads: ruta insegura en manifest {path or '<vacia>'}")
            continue
        try:
            content = b64decode(str(item.get("content_b64", "")), validate=True)
        except Exception:
            warnings.append(f"uploads: contenido base64 invalido en {path}")
            continue
        if hashlib.sha256(content).hexdigest() != item.get("sha256"):
            warnings.append(f"uploads: hash no coincide en {path}")

    ok = not missing and not warnings
    return {
        "ok": ok,
        "dry_run": True,
        "motivo": None if ok else "Backup legible con incidencias de estructura",
        "hash_actual": actual_hash,
        "tamano_bytes": raw_size,
        "created_at": payload.get("created_at"),
        "version": payload.get("version"),
        "alcance": payload.get("scope") or registro.alcance,
        "tablas": len(tables),
        "uploads": len(upload_files),
        "filas_por_tabla": row_counts,
        "tablas_obligatorias_faltantes": missing,
        "advertencias": warnings,
    }


def registrar_prueba_restauracion_backup(
    registro: BackupRegistro,
    *,
    usuario_id: UUID | None,
    resultado: str,
    notas: str | None,
) -> BackupRegistro:
    registro.restauracion_probada_at = datetime.now(UTC)
    registro.restauracion_probada_por_id = usuario_id
    registro.restauracion_resultado = resultado
    registro.restauracion_notas = notas
    if resultado == "ok":
        registro.estado = "restauracion_probada"
        registro.error = None
    else:
        registro.estado = "fallido"
        registro.error = (notas or "Prueba de restauracion fallida")[:2000]
    return registro
