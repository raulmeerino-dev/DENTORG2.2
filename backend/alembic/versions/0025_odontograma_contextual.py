"""odontograma contextual

Revision ID: 0025
Revises: 0024
Create Date: 2026-05-14
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "odontogramas",
        sa.Column("denticion", sa.String(length=20), nullable=False, server_default="adulta"),
    )
    op.add_column("odontograma_piezas", sa.Column("movilidad", sa.String(length=40), nullable=True))
    op.add_column("odontograma_piezas", sa.Column("pronostico", sa.String(length=40), nullable=True))
    op.add_column(
        "odontograma_superficies",
        sa.Column("presupuesto_linea_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_odontograma_superficies_presupuesto_linea_id",
        "odontograma_superficies",
        ["presupuesto_linea_id"],
    )
    op.create_foreign_key(
        "fk_odontograma_superficies_presupuesto_linea",
        "odontograma_superficies",
        "presupuesto_lineas",
        ["presupuesto_linea_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_odontograma_superficies_presupuesto_linea",
        "odontograma_superficies",
        type_="foreignkey",
    )
    op.drop_index("ix_odontograma_superficies_presupuesto_linea_id", table_name="odontograma_superficies")
    op.drop_column("odontograma_superficies", "presupuesto_linea_id")
    op.drop_column("odontograma_piezas", "pronostico")
    op.drop_column("odontograma_piezas", "movilidad")
    op.drop_column("odontogramas", "denticion")
