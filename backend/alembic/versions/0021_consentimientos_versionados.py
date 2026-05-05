"""consentimientos versionados con firma

Revision ID: 0021
Revises: 0020
Create Date: 2026-04-30
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "consentimiento_plantillas",
        sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("codigo", sa.String(length=80), nullable=False),
        sa.Column("nombre", sa.String(length=150), nullable=False),
        sa.Column("tipo_tratamiento", sa.String(length=100), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("contenido", sa.Text(), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.ForeignKeyConstraint(["clinica_id"], ["clinicas.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_consentimiento_plantillas_clinica_id", "consentimiento_plantillas", ["clinica_id"])
    op.create_index("ix_consentimiento_plantillas_codigo", "consentimiento_plantillas", ["codigo"])
    op.create_index("ix_consentimiento_plantillas_tipo_tratamiento", "consentimiento_plantillas", ["tipo_tratamiento"])

    op.add_column("consentimientos", sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("consentimientos", sa.Column("plantilla_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("consentimientos", sa.Column("version_plantilla", sa.Integer(), nullable=True))
    op.add_column("consentimientos", sa.Column("firma_paciente_base64", sa.Text(), nullable=True))
    op.add_column("consentimientos", sa.Column("firma_doctor_base64", sa.Text(), nullable=True))
    op.add_column("consentimientos", sa.Column("hash_documento", sa.String(length=64), nullable=True))
    op.add_column("consentimientos", sa.Column("ip_firma", sa.String(length=80), nullable=True))
    op.add_column("consentimientos", sa.Column("user_agent_firma", sa.String(length=500), nullable=True))
    op.add_column("consentimientos", sa.Column("motivo_revocacion", sa.Text(), nullable=True))
    op.create_index("ix_consentimientos_clinica_id", "consentimientos", ["clinica_id"])
    op.create_index("ix_consentimientos_plantilla_id", "consentimientos", ["plantilla_id"])
    op.create_foreign_key("fk_consentimientos_clinica_id", "consentimientos", "clinicas", ["clinica_id"], ["id"])
    op.create_foreign_key("fk_consentimientos_plantilla_id", "consentimientos", "consentimiento_plantillas", ["plantilla_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_consentimientos_plantilla_id", "consentimientos", type_="foreignkey")
    op.drop_constraint("fk_consentimientos_clinica_id", "consentimientos", type_="foreignkey")
    op.drop_index("ix_consentimientos_plantilla_id", table_name="consentimientos")
    op.drop_index("ix_consentimientos_clinica_id", table_name="consentimientos")
    op.drop_column("consentimientos", "motivo_revocacion")
    op.drop_column("consentimientos", "user_agent_firma")
    op.drop_column("consentimientos", "ip_firma")
    op.drop_column("consentimientos", "hash_documento")
    op.drop_column("consentimientos", "firma_doctor_base64")
    op.drop_column("consentimientos", "firma_paciente_base64")
    op.drop_column("consentimientos", "version_plantilla")
    op.drop_column("consentimientos", "plantilla_id")
    op.drop_column("consentimientos", "clinica_id")

    op.drop_index("ix_consentimiento_plantillas_tipo_tratamiento", table_name="consentimiento_plantillas")
    op.drop_index("ix_consentimiento_plantillas_codigo", table_name="consentimiento_plantillas")
    op.drop_index("ix_consentimiento_plantillas_clinica_id", table_name="consentimiento_plantillas")
    op.drop_table("consentimiento_plantillas")
