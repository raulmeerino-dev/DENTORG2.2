"""Registro de copias de seguridad.

Revision ID: 0016
Revises: 0015
Create Date: 2026-04-28
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "backup_registros",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tipo", sa.String(length=30), nullable=False, server_default="manual"),
        sa.Column("estado", sa.String(length=30), nullable=False, server_default="pendiente"),
        sa.Column("ruta", sa.Text(), nullable=True),
        sa.Column("ubicacion", sa.String(length=120), nullable=True),
        sa.Column("hash_sha256", sa.String(length=64), nullable=True),
        sa.Column("tamano_bytes", sa.BigInteger(), nullable=True),
        sa.Column("cifrado", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_backup_registros_hash_sha256", "backup_registros", ["hash_sha256"])


def downgrade() -> None:
    op.drop_index("ix_backup_registros_hash_sha256", table_name="backup_registros")
    op.drop_table("backup_registros")
