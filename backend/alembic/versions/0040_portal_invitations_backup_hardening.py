"""portal invitations and backup hardening

Revision ID: 0040
Revises: 0039
Create Date: 2026-06-23
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0040"
down_revision: str | None = "0039"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("backup_registros", sa.Column("alcance", sa.String(length=30), server_default="full", nullable=False))
    op.add_column("backup_registros", sa.Column("destino_externo", sa.String(length=120), nullable=True))
    op.add_column("backup_registros", sa.Column("incluye_bd", sa.Boolean(), server_default=sa.text("true"), nullable=False))
    op.add_column("backup_registros", sa.Column("incluye_uploads", sa.Boolean(), server_default=sa.text("true"), nullable=False))
    op.add_column("backup_registros", sa.Column("verificado_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("backup_registros", sa.Column("verificado_por_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("backup_registros", sa.Column("restauracion_probada_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("backup_registros", sa.Column("restauracion_probada_por_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("backup_registros", sa.Column("restauracion_resultado", sa.String(length=30), nullable=True))
    op.add_column("backup_registros", sa.Column("restauracion_notas", sa.Text(), nullable=True))
    op.add_column("backup_registros", sa.Column("retention_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("backup_registros", sa.Column("retention_days", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_backup_registros_verificado_por", "backup_registros", "usuarios", ["verificado_por_id"], ["id"])
    op.create_foreign_key("fk_backup_registros_restauracion_por", "backup_registros", "usuarios", ["restauracion_probada_por_id"], ["id"])

    op.create_table(
        "portal_invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paciente_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("proposito", sa.String(length=50), server_default="portal_access", nullable=False),
        sa.Column("estado", sa.String(length=30), server_default="activa", nullable=False),
        sa.Column("uso_unico", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("last_access_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("access_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["clinica_id"], ["clinicas.id"]),
        sa.ForeignKeyConstraint(["created_by_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["paciente_id"], ["pacientes.id"]),
        sa.ForeignKeyConstraint(["revoked_by_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_portal_invitations_clinica_id", "portal_invitations", ["clinica_id"])
    op.create_index("ix_portal_invitations_estado", "portal_invitations", ["estado"])
    op.create_index("ix_portal_invitations_expires_at", "portal_invitations", ["expires_at"])
    op.create_index("ix_portal_invitations_paciente_id", "portal_invitations", ["paciente_id"])
    op.create_index("ix_portal_invitations_token_hash", "portal_invitations", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_portal_invitations_token_hash", table_name="portal_invitations")
    op.drop_index("ix_portal_invitations_paciente_id", table_name="portal_invitations")
    op.drop_index("ix_portal_invitations_expires_at", table_name="portal_invitations")
    op.drop_index("ix_portal_invitations_estado", table_name="portal_invitations")
    op.drop_index("ix_portal_invitations_clinica_id", table_name="portal_invitations")
    op.drop_table("portal_invitations")

    op.drop_constraint("fk_backup_registros_restauracion_por", "backup_registros", type_="foreignkey")
    op.drop_constraint("fk_backup_registros_verificado_por", "backup_registros", type_="foreignkey")
    op.drop_column("backup_registros", "retention_days")
    op.drop_column("backup_registros", "retention_expires_at")
    op.drop_column("backup_registros", "restauracion_notas")
    op.drop_column("backup_registros", "restauracion_resultado")
    op.drop_column("backup_registros", "restauracion_probada_por_id")
    op.drop_column("backup_registros", "restauracion_probada_at")
    op.drop_column("backup_registros", "verificado_por_id")
    op.drop_column("backup_registros", "verificado_at")
    op.drop_column("backup_registros", "incluye_uploads")
    op.drop_column("backup_registros", "incluye_bd")
    op.drop_column("backup_registros", "destino_externo")
    op.drop_column("backup_registros", "alcance")
