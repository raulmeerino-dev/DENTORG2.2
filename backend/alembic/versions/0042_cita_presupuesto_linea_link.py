"""link citas to presupuesto lineas

Revision ID: 0042
Revises: 0041
Create Date: 2026-06-25
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0042"
down_revision: str | None = "0041"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "citas",
        sa.Column("presupuesto_linea_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_citas_presupuesto_linea_id", "citas", ["presupuesto_linea_id"])
    op.create_foreign_key(
        "fk_citas_presupuesto_linea_id",
        "citas",
        "presupuesto_lineas",
        ["presupuesto_linea_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_citas_presupuesto_linea_id", "citas", type_="foreignkey")
    op.drop_index("ix_citas_presupuesto_linea_id", table_name="citas")
    op.drop_column("citas", "presupuesto_linea_id")
