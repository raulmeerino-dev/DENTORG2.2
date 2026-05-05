"""agenda avanzada: historial de cambios de cita

Revision ID: 0019
Revises: 0018
Create Date: 2026-04-29
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cita_cambios",
        sa.Column("cita_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("accion", sa.String(length=80), nullable=False),
        sa.Column("estado_anterior", sa.String(length=30), nullable=True),
        sa.Column("estado_nuevo", sa.String(length=30), nullable=True),
        sa.Column("fecha_anterior", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fecha_nueva", sa.DateTime(timezone=True), nullable=True),
        sa.Column("doctor_anterior_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("doctor_nuevo_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("datos", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.ForeignKeyConstraint(["cita_id"], ["citas.id"]),
        sa.ForeignKeyConstraint(["doctor_anterior_id"], ["doctores.id"]),
        sa.ForeignKeyConstraint(["doctor_nuevo_id"], ["doctores.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cita_cambios_accion", "cita_cambios", ["accion"])
    op.create_index("ix_cita_cambios_cita_id", "cita_cambios", ["cita_id"])
    op.create_index("ix_cita_cambios_usuario_id", "cita_cambios", ["usuario_id"])


def downgrade() -> None:
    op.drop_index("ix_cita_cambios_usuario_id", table_name="cita_cambios")
    op.drop_index("ix_cita_cambios_cita_id", table_name="cita_cambios")
    op.drop_index("ix_cita_cambios_accion", table_name="cita_cambios")
    op.drop_table("cita_cambios")
