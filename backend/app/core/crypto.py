"""
Cifrado simétrico de campos sensibles con pgcrypto (pgp_sym_encrypt / pgp_sym_decrypt).

Se usa en INSERT/UPDATE para escribir y en SELECT para leer campos BYTEA cifrados.
La clave viene de settings.db_encryption_key, NUNCA en el código.

Uso en queries:
    encrypt_expr(value, key)   → expresión SQL para insertar/actualizar
    decrypt_expr(column, key)  → expresión SQL para leer
"""
import json

from sqlalchemy import func, text
from sqlalchemy.sql.elements import ColumnElement

from app.config import get_settings

_settings = get_settings()


def _key() -> str:
    return _settings.db_encryption_key


def encrypt_value(plain: str) -> bytes:
    """
    Versión Python-side: cifra un string con pgcrypto usando una llamada SQL directa.
    Se usa en el servicio para precalcular el valor BYTEA.
    La mayor parte del tiempo conviene usar encrypt_sql_expr() directamente en la query.
    """
    raise NotImplementedError(
        "Use encrypt_sql_expr() in SQLAlchemy queries instead of this function."
    )


def encrypt_sql_expr(value: str) -> ColumnElement:
    """Devuelve una expresión SQLAlchemy: pgp_sym_encrypt(:value, :key)"""
    return func.pgp_sym_encrypt(value, _key())


def decrypt_sql_expr(column: ColumnElement) -> ColumnElement:
    """Devuelve una expresión SQLAlchemy: pgp_sym_decrypt(column, :key)"""
    return func.pgp_sym_decrypt(column, _key())


# ─── Helpers para el router ───────────────────────────────────────────────────

async def cifrar_campos_paciente(
    db,  # AsyncSession
    campos: dict[str, str | None],
) -> dict[str, bytes | None]:
    """
    Recibe un dict {campo: valor_en_claro} y devuelve {campo: bytes_cifrados}.
    Si el valor es None devuelve None sin cifrar.
    Hace una sola query para cifrar todos los campos en PostgreSQL.
    """
    result: dict[str, bytes | None] = {}
    for campo, valor in campos.items():
        if valor is None:
            result[campo] = None
        else:
            row = await db.execute(
                text("SELECT pgp_sym_encrypt(:v, :k)"),
                {"v": valor, "k": _key()},
            )
            result[campo] = row.scalar_one()
    return result


async def descifrar_bytes(db, valor: bytes | None) -> str | None:
    """Descifra un BYTEA cifrado con pgp_sym_encrypt. Retorna str o None."""
    if valor is None:
        return None
    row = await db.execute(
        text("SELECT pgp_sym_decrypt(:v, :k)"),
        {"v": valor, "k": _key()},
    )
    return row.scalar_one()


async def cifrar_json(db, payload: dict | None) -> bytes | None:
    """Cifra un dict como JSON canonico para almacenarlo como BYTEA."""
    if payload is None:
        return None
    data = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    row = await db.execute(
        text("SELECT pgp_sym_encrypt(:v, :k)"),
        {"v": data, "k": _key()},
    )
    return row.scalar_one()


async def descifrar_json(db, valor: bytes | None) -> dict | None:
    """Descifra un JSON almacenado como BYTEA y devuelve un dict."""
    plain = await descifrar_bytes(db, valor)
    if plain is None:
        return None
    parsed = json.loads(plain)
    return parsed if isinstance(parsed, dict) else None


async def descifrar_paciente(db, paciente) -> dict:
    """
    Descifra todos los campos sensibles de un objeto Paciente ORM
    y devuelve un dict listo para construir PacienteResponse.
    """
    campos_sensibles = {
        "dni_nie": paciente.dni_nie,
        "telefono": paciente.telefono,
        "telefono2": paciente.telefono2,
        "email": paciente.email,
    }
    descifrados: dict[str, str | None] = {}
    for campo, valor in campos_sensibles.items():
        descifrados[campo] = await descifrar_bytes(db, valor)
    datos_salud = await descifrar_json(db, getattr(paciente, "datos_salud_cifrado", None))
    if datos_salud is None and getattr(paciente, "datos_salud", None):
        legacy = paciente.datos_salud
        datos_salud = legacy if isinstance(legacy, dict) else None
    descifrados["datos_salud"] = datos_salud
    return descifrados
