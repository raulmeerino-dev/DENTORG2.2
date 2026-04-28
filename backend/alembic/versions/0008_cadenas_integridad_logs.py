"""Anade cadenas de integridad a audit_log y registro_eventos_sif.

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-14
"""
from __future__ import annotations

import hashlib
import json

from alembic import op
import sqlalchemy as sa


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def _hash(previous_hash: str | None, payload: dict) -> str:
    base = previous_hash or ("0" * 64)
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(f"{base}|{canonical}".encode("utf-8")).hexdigest()


def upgrade() -> None:
    op.add_column("audit_log", sa.Column("previous_hash", sa.String(length=64), nullable=True))
    op.add_column("audit_log", sa.Column("event_hash", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_audit_log_event_hash"), "audit_log", ["event_hash"], unique=False)

    op.add_column("registro_eventos_sif", sa.Column("previous_hash", sa.String(length=64), nullable=True))
    op.add_column("registro_eventos_sif", sa.Column("event_hash", sa.String(length=64), nullable=True))
    op.create_index(
        op.f("ix_registro_eventos_sif_event_hash"),
        "registro_eventos_sif",
        ["event_hash"],
        unique=False,
    )

    bind = op.get_bind()

    audit_rows = bind.execute(
        sa.text(
            """
            SELECT id, usuario_id, accion, tabla, registro_id, datos_despues, ip
            FROM audit_log
            ORDER BY id
            """
        )
    ).mappings()

    previous_hash = None
    for row in audit_rows:
        payload = {
            "path": (row["datos_despues"] or {}).get("path"),
            "method": (row["datos_despues"] or {}).get("method"),
            "status_code": (row["datos_despues"] or {}).get("status_code"),
            "accion": row["accion"],
            "tabla": row["tabla"],
            "registro_id": str(row["registro_id"]) if row["registro_id"] else None,
            "ip": row["ip"],
            "usuario_id": str(row["usuario_id"]) if row["usuario_id"] else None,
        }
        event_hash = _hash(previous_hash, payload)
        bind.execute(
            sa.text(
                """
                UPDATE audit_log
                SET previous_hash = :previous_hash,
                    event_hash = :event_hash
                WHERE id = :id
                """
            ),
            {
                "id": row["id"],
                "previous_hash": previous_hash,
                "event_hash": event_hash,
            },
        )
        previous_hash = event_hash

    sif_rows = bind.execute(
        sa.text(
            """
            SELECT id, tipo_evento, factura_id, usuario_id, sistema_codigo, sistema_version, detalles
            FROM registro_eventos_sif
            ORDER BY created_at, id
            """
        )
    ).mappings()

    previous_hash = None
    for row in sif_rows:
        payload = {
            "tipo_evento": row["tipo_evento"],
            "factura_id": str(row["factura_id"]) if row["factura_id"] else None,
            "usuario_id": str(row["usuario_id"]) if row["usuario_id"] else None,
            "sistema_codigo": row["sistema_codigo"],
            "sistema_version": row["sistema_version"],
            "detalles": row["detalles"] or {},
        }
        event_hash = _hash(previous_hash, payload)
        bind.execute(
            sa.text(
                """
                UPDATE registro_eventos_sif
                SET previous_hash = :previous_hash,
                    event_hash = :event_hash
                WHERE id = :id
                """
            ),
            {
                "id": row["id"],
                "previous_hash": previous_hash,
                "event_hash": event_hash,
            },
        )
        previous_hash = event_hash


def downgrade() -> None:
    op.drop_index(op.f("ix_registro_eventos_sif_event_hash"), table_name="registro_eventos_sif")
    op.drop_column("registro_eventos_sif", "event_hash")
    op.drop_column("registro_eventos_sif", "previous_hash")

    op.drop_index(op.f("ix_audit_log_event_hash"), table_name="audit_log")
    op.drop_column("audit_log", "event_hash")
    op.drop_column("audit_log", "previous_hash")
