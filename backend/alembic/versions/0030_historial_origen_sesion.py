"""historial origen sesion clinica

Revision ID: 0030
Revises: 0029
Create Date: 2026-05-20
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0030"
down_revision: str | None = "0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("historial_clinico", sa.Column("origen", sa.String(length=30), nullable=True))
    op.add_column(
        "historial_clinico",
        sa.Column("presupuesto_linea_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "historial_clinico",
        sa.Column("cita_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_historial_clinico_origen", "historial_clinico", ["origen"])
    op.create_index("ix_historial_clinico_presupuesto_linea_id", "historial_clinico", ["presupuesto_linea_id"])
    op.create_index("ix_historial_clinico_cita_id", "historial_clinico", ["cita_id"])
    op.create_foreign_key(
        "fk_historial_clinico_presupuesto_linea_id",
        "historial_clinico",
        "presupuesto_lineas",
        ["presupuesto_linea_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_historial_clinico_cita_id",
        "historial_clinico",
        "citas",
        ["cita_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_historial_clinico_cita_id", "historial_clinico", type_="foreignkey")
    op.drop_constraint("fk_historial_clinico_presupuesto_linea_id", "historial_clinico", type_="foreignkey")
    op.drop_index("ix_historial_clinico_cita_id", table_name="historial_clinico")
    op.drop_index("ix_historial_clinico_presupuesto_linea_id", table_name="historial_clinico")
    op.drop_index("ix_historial_clinico_origen", table_name="historial_clinico")
    op.drop_column("historial_clinico", "cita_id")
    op.drop_column("historial_clinico", "presupuesto_linea_id")
    op.drop_column("historial_clinico", "origen")
