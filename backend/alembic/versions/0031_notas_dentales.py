"""notas dentales por pieza

Revision ID: 0031
Revises: 0030
Create Date: 2026-05-20
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notas_dentales",
        sa.Column("paciente_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("doctor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cita_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("historial_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("pieza_dental", sa.SmallInteger(), nullable=False),
        sa.Column("caras", sa.String(length=10), nullable=True),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["cita_id"], ["citas.id"]),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctores.id"]),
        sa.ForeignKeyConstraint(["historial_id"], ["historial_clinico.id"]),
        sa.ForeignKeyConstraint(["paciente_id"], ["pacientes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notas_dentales_cita_id", "notas_dentales", ["cita_id"])
    op.create_index("ix_notas_dentales_doctor_id", "notas_dentales", ["doctor_id"])
    op.create_index("ix_notas_dentales_fecha", "notas_dentales", ["fecha"])
    op.create_index("ix_notas_dentales_historial_id", "notas_dentales", ["historial_id"])
    op.create_index("ix_notas_dentales_paciente_id", "notas_dentales", ["paciente_id"])
    op.create_index("ix_notas_dentales_pieza_dental", "notas_dentales", ["pieza_dental"])


def downgrade() -> None:
    op.drop_index("ix_notas_dentales_pieza_dental", table_name="notas_dentales")
    op.drop_index("ix_notas_dentales_paciente_id", table_name="notas_dentales")
    op.drop_index("ix_notas_dentales_historial_id", table_name="notas_dentales")
    op.drop_index("ix_notas_dentales_fecha", table_name="notas_dentales")
    op.drop_index("ix_notas_dentales_doctor_id", table_name="notas_dentales")
    op.drop_index("ix_notas_dentales_cita_id", table_name="notas_dentales")
    op.drop_table("notas_dentales")
