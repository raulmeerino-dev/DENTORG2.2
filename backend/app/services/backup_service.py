import gzip
import hashlib
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import Base
from app.models.backup import BackupRegistro


BACKUP_DIR = Path(__file__).resolve().parents[2] / "backups"


def _backup_key() -> bytes:
    settings = get_settings()
    return hashlib.sha256(f"{settings.db_encryption_key}:dentorg2-backup".encode("utf-8")).digest()


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


def _safe_table_name(table_name: str) -> str:
    return '"' + table_name.replace('"', '""') + '"'


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
    return {
        "version": 1,
        "created_at": datetime.now(UTC).isoformat(),
        "tables": tables,
    }


async def crear_backup_cifrado(
    db: AsyncSession,
    *,
    created_by_id: UUID | None,
    tipo: str = "manual",
) -> BackupRegistro:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    registro = BackupRegistro(tipo=tipo, estado="en_proceso", created_by_id=created_by_id, ubicacion="local")
    db.add(registro)
    await db.flush()
    try:
        snapshot = await _snapshot_database(db)
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
    except Exception as exc:
        registro.estado = "error"
        registro.error = str(exc)[:2000]
        registro.finished_at = datetime.now(UTC)
    await db.flush()
    return registro


def verificar_backup_archivo(registro: BackupRegistro) -> dict:
    if not registro.ruta:
        return {"ok": False, "motivo": "Backup sin ruta de archivo"}
    path = Path(registro.ruta)
    if not path.exists():
        return {"ok": False, "motivo": "Archivo no encontrado"}
    raw = path.read_bytes()
    actual_hash = hashlib.sha256(raw).hexdigest()
    if registro.hash_sha256 and actual_hash != registro.hash_sha256:
        return {"ok": False, "motivo": "Hash no coincide", "hash_actual": actual_hash}
    try:
        decompressed = gzip.decompress(_decrypt(raw))
        payload = json.loads(decompressed.decode("utf-8"))
    except Exception as exc:
        return {"ok": False, "motivo": f"No se pudo descifrar o leer: {exc}"}
    table_count = len(payload.get("tables", {}))
    return {
        "ok": True,
        "hash_actual": actual_hash,
        "tamano_bytes": len(raw),
        "tablas": table_count,
        "created_at": payload.get("created_at"),
    }
