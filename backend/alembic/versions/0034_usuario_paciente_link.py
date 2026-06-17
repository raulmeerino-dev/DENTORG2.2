"""usuario paciente link for patient portal

Revision ID: 0034
Revises: 0033
Create Date: 2026-06-17
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0034"
down_revision: str | None = "0033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "usuarios",
        sa.Column("paciente_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_usuarios_paciente_id", "usuarios", ["paciente_id"])
    op.create_foreign_key(
        "fk_usuarios_paciente_id_pacientes",
        "usuarios",
        "pacientes",
        ["paciente_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_usuarios_paciente_id_pacientes", "usuarios", type_="foreignkey")
    op.drop_index("ix_usuarios_paciente_id", table_name="usuarios")
    op.drop_column("usuarios", "paciente_id")
