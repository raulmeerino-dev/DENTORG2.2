"""ficha paciente ampliada

Revision ID: 0026
Revises: 0025
Create Date: 2026-05-18

Añade campos administrativos al paciente que estaban en Eurodent:
- sexo, profesion, pais
- doctor_habitual_id (FK a doctores)
- num_poliza (la mutua/entidad ya existe via entidad_id)
- pagador_distinto + datos del pagador (cuando difiere del paciente)

fecha_primera_visita y fecha_ultima_visita se calculan desde historial_clinico
y no se persisten aquí — los expone el serializer.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("pacientes", sa.Column("sexo", sa.String(length=10), nullable=True))
    op.add_column("pacientes", sa.Column("profesion", sa.String(length=100), nullable=True))
    op.add_column("pacientes", sa.Column("pais", sa.String(length=100), nullable=True))
    op.add_column(
        "pacientes",
        sa.Column("doctor_habitual_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("pacientes", sa.Column("num_poliza", sa.String(length=80), nullable=True))
    op.add_column(
        "pacientes",
        sa.Column("pagador_distinto", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("pacientes", sa.Column("pagador_nombre", sa.String(length=200), nullable=True))
    op.add_column("pacientes", sa.Column("pagador_dni", sa.String(length=20), nullable=True))
    op.add_column("pacientes", sa.Column("pagador_direccion", sa.Text(), nullable=True))

    op.create_foreign_key(
        "fk_pacientes_doctor_habitual",
        "pacientes",
        "doctores",
        ["doctor_habitual_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Quitamos el server_default que solo era para evitar nulls al rellenar filas existentes
    op.alter_column("pacientes", "pagador_distinto", server_default=None)


def downgrade() -> None:
    op.drop_constraint("fk_pacientes_doctor_habitual", "pacientes", type_="foreignkey")
    op.drop_column("pacientes", "pagador_direccion")
    op.drop_column("pacientes", "pagador_dni")
    op.drop_column("pacientes", "pagador_nombre")
    op.drop_column("pacientes", "pagador_distinto")
    op.drop_column("pacientes", "num_poliza")
    op.drop_column("pacientes", "doctor_habitual_id")
    op.drop_column("pacientes", "pais")
    op.drop_column("pacientes", "profesion")
    op.drop_column("pacientes", "sexo")
