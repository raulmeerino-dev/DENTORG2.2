"""dictado clinico

Revision ID: 0041
Revises: 0040
Create Date: 2026-06-24
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0041"
down_revision: str | None = "0040"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("notas_dentales", "pieza_dental", existing_type=sa.SmallInteger(), nullable=True)
    op.add_column("notas_dentales", sa.Column("origen", sa.String(length=40), nullable=True))
    op.create_index("ix_notas_dentales_origen", "notas_dentales", ["origen"])

    op.create_table(
        "dictados_clinicos",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paciente_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("doctor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("nota_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("contexto", sa.String(length=40), nullable=True),
        sa.Column("proveedor", sa.String(length=80), nullable=True),
        sa.Column("transcripcion_raw", sa.Text(), nullable=True),
        sa.Column("transcripcion_editada", sa.Text(), nullable=True),
        sa.Column("estado", sa.String(length=30), server_default="recibido", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("audio_conservado", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=True),
        sa.Column("audio_size_bytes", sa.Integer(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["clinica_id"], ["clinicas.id"]),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctores.id"]),
        sa.ForeignKeyConstraint(["nota_id"], ["notas_dentales.id"]),
        sa.ForeignKeyConstraint(["paciente_id"], ["pacientes.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dictados_clinicos_clinica_id", "dictados_clinicos", ["clinica_id"])
    op.create_index("ix_dictados_clinicos_doctor_id", "dictados_clinicos", ["doctor_id"])
    op.create_index("ix_dictados_clinicos_estado", "dictados_clinicos", ["estado"])
    op.create_index("ix_dictados_clinicos_nota_id", "dictados_clinicos", ["nota_id"])
    op.create_index("ix_dictados_clinicos_paciente_id", "dictados_clinicos", ["paciente_id"])
    op.create_index("ix_dictados_clinicos_usuario_id", "dictados_clinicos", ["usuario_id"])


def downgrade() -> None:
    op.drop_index("ix_dictados_clinicos_usuario_id", table_name="dictados_clinicos")
    op.drop_index("ix_dictados_clinicos_paciente_id", table_name="dictados_clinicos")
    op.drop_index("ix_dictados_clinicos_nota_id", table_name="dictados_clinicos")
    op.drop_index("ix_dictados_clinicos_estado", table_name="dictados_clinicos")
    op.drop_index("ix_dictados_clinicos_doctor_id", table_name="dictados_clinicos")
    op.drop_index("ix_dictados_clinicos_clinica_id", table_name="dictados_clinicos")
    op.drop_table("dictados_clinicos")

    op.drop_index("ix_notas_dentales_origen", table_name="notas_dentales")
    op.drop_column("notas_dentales", "origen")
    op.alter_column("notas_dentales", "pieza_dental", existing_type=sa.SmallInteger(), nullable=False)
