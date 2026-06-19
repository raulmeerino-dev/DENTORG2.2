"""drop unused teleconsultas table

Revision ID: 0037
Revises: 0036
Create Date: 2026-06-19
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0037"
down_revision: str | None = "0036"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS teleconsultas CASCADE")


def downgrade() -> None:
    op.create_table(
        "teleconsultas",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("cita_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("estado", sa.String(length=30), nullable=False, server_default="iniciada"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["cita_id"], ["citas.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cita_id"),
    )
    op.create_index("ix_teleconsultas_cita_id", "teleconsultas", ["cita_id"])
