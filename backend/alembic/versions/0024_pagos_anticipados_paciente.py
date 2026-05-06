"""pagos anticipados paciente

Revision ID: 0024
Revises: 0023
Create Date: 2026-05-06
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pagos_anticipados_paciente",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("paciente_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.Column("importe", sa.Numeric(10, 2), nullable=False),
        sa.Column("forma_pago_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("usuario_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("concepto", sa.String(length=120), nullable=False, server_default="Pago anticipado"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("anulado_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("anulado_por_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("motivo_anulacion", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["anulado_por_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["clinica_id"], ["clinicas.id"]),
        sa.ForeignKeyConstraint(["forma_pago_id"], ["formas_pago.id"]),
        sa.ForeignKeyConstraint(["paciente_id"], ["pacientes.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pagos_anticipados_paciente_paciente_id", "pagos_anticipados_paciente", ["paciente_id"])
    op.create_index("ix_pagos_anticipados_paciente_clinica_id", "pagos_anticipados_paciente", ["clinica_id"])


def downgrade() -> None:
    op.drop_index("ix_pagos_anticipados_paciente_clinica_id", table_name="pagos_anticipados_paciente")
    op.drop_index("ix_pagos_anticipados_paciente_paciente_id", table_name="pagos_anticipados_paciente")
    op.drop_table("pagos_anticipados_paciente")
