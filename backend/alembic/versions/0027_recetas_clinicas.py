"""recetas clinicas

Revision ID: 0027
Revises: 0026
Create Date: 2026-05-18

Crea la tabla `recetas_clinicas` para recetas medicas autónomas (no atadas a factura).
Coexiste con la tabla legacy `recetas` (cache de PDF emitido desde factura).
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recetas_clinicas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("paciente_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pacientes.id"), nullable=False),
        sa.Column("doctor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("doctores.id"), nullable=False),
        sa.Column("clinica_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clinicas.id"), nullable=True),
        sa.Column("medicamento", sa.Text(), nullable=False),
        sa.Column("principio_activo", sa.String(length=200), nullable=True),
        sa.Column("forma_farmaceutica", sa.String(length=100), nullable=True),
        sa.Column("via_administracion", sa.String(length=100), nullable=True),
        sa.Column("unidades", sa.String(length=100), nullable=True),
        sa.Column("duracion", sa.String(length=100), nullable=True),
        sa.Column("posologia", sa.Text(), nullable=False),
        sa.Column("pauta", sa.String(length=200), nullable=True),
        sa.Column("diagnostico", sa.Text(), nullable=True),
        sa.Column("instrucciones_paciente", sa.Text(), nullable=True),
        sa.Column("instrucciones_farmacia", sa.Text(), nullable=True),
        sa.Column("fecha_prescripcion", sa.Date(), nullable=False),
        sa.Column("fecha_dispensacion", sa.Date(), nullable=True),
        sa.Column("firma_data_url", sa.Text(), nullable=True),
        sa.Column("pdf_generado_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_recetas_clinicas_paciente_id", "recetas_clinicas", ["paciente_id"])
    op.create_index("ix_recetas_clinicas_doctor_id", "recetas_clinicas", ["doctor_id"])
    op.create_index("ix_recetas_clinicas_clinica_id", "recetas_clinicas", ["clinica_id"])
    op.create_index(
        "ix_recetas_clinicas_fecha_prescripcion",
        "recetas_clinicas",
        ["fecha_prescripcion"],
    )


def downgrade() -> None:
    op.drop_index("ix_recetas_clinicas_fecha_prescripcion", table_name="recetas_clinicas")
    op.drop_index("ix_recetas_clinicas_clinica_id", table_name="recetas_clinicas")
    op.drop_index("ix_recetas_clinicas_doctor_id", table_name="recetas_clinicas")
    op.drop_index("ix_recetas_clinicas_paciente_id", table_name="recetas_clinicas")
    op.drop_table("recetas_clinicas")
