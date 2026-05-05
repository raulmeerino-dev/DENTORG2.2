"""facturacion flujo clinico

Revision ID: 0022
Revises: 0021
Create Date: 2026-04-30
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE estado_factura ADD VALUE IF NOT EXISTS 'borrador'")
    op.execute("ALTER TYPE estado_factura ADD VALUE IF NOT EXISTS 'pagada'")
    op.execute("ALTER TYPE estado_presupuesto ADD VALUE IF NOT EXISTS 'caducado'")

    op.add_column("presupuestos", sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_presupuestos_clinica_id", "presupuestos", ["clinica_id"])
    op.create_foreign_key("fk_presupuestos_clinica_id", "presupuestos", "clinicas", ["clinica_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_presupuestos_clinica_id", "presupuestos", type_="foreignkey")
    op.drop_index("ix_presupuestos_clinica_id", table_name="presupuestos")
    op.drop_column("presupuestos", "clinica_id")
