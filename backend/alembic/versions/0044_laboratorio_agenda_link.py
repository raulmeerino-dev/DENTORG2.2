"""link lab work with agenda appointments

Revision ID: 0044
Revises: 0043
Create Date: 2026-06-29
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0044"
down_revision: str | None = "0043"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "trabajos_laboratorio",
        sa.Column("cita_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_trabajos_lab_cita",
        "trabajos_laboratorio",
        "citas",
        ["cita_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_trabajos_laboratorio_cita_id", "trabajos_laboratorio", ["cita_id"])
    op.add_column("trabajos_laboratorio", sa.Column("fecha_revision", sa.Date(), nullable=True))
    op.add_column("trabajos_laboratorio", sa.Column("ubicacion_clinica", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("trabajos_laboratorio", "ubicacion_clinica")
    op.drop_column("trabajos_laboratorio", "fecha_revision")
    op.drop_index("ix_trabajos_laboratorio_cita_id", table_name="trabajos_laboratorio")
    op.drop_constraint("fk_trabajos_lab_cita", "trabajos_laboratorio", type_="foreignkey")
    op.drop_column("trabajos_laboratorio", "cita_id")
